// Runs the company repo's agents through the GitAgent SDK. The curator and
// fairness reviewer are run by this host, explicitly (delegation: explicit in
// the repo's agent.yaml); the ideal never starts them itself.
import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { readFile } from "node:fs/promises";
import { query, tool, type GCMessage } from "@open-gitagent/gitagent";
import { REPO } from "./config.ts";
import { tryGit } from "./git.ts";
import { getEvent, updateEvent } from "./store.ts";
import { pullRequest } from "./repo.ts";
import * as github from "./github.ts";

// Optional overrides of the model in the repo's agent.yaml files: AGENT_MODEL
// for the curator and fairness reviewer, CHAT_MODEL for talking to the ideal
// (visitors ask far more questions than they add events, so it can be cheaper).
const model = () => process.env.AGENT_MODEL || undefined;
const chatModel = () => process.env.CHAT_MODEL || process.env.AGENT_MODEL || undefined;
import type { AgentStep, CompanyEvent } from "../shared/types.ts";

type Listener = (step: AgentStep | { kind: "end" }) => void;
const listeners = new Map<string, Set<Listener>>();

export function subscribe(id: string, fn: Listener): () => void {
	const set = listeners.get(id) ?? new Set();
	set.add(fn);
	listeners.set(id, set);
	return () => set.delete(fn);
}

function emit(id: string, step: AgentStep) {
	updateEvent(id, (e) => e.run.steps.push(step));
	listeners.get(id)?.forEach((fn) => fn(step));
}

// GitAgent tells agents to load their skills with `read`, but its built-in
// read can open any file, so the built-ins are stripped and this one takes its
// place: it only reads inside the agent's own skills/ directory.
function skillReader(agentDir: string) {
	const skills = resolve(agentDir, "skills");
	return tool("read", "Read one of your skill files, e.g. skills/<name>/SKILL.md.", {
		properties: { path: { type: "string", description: "Path relative to your directory, inside skills/" } },
		required: ["path"],
	}, async ({ path }: { path: string }) => {
		const target = resolve(agentDir, path);
		const rel = relative(skills, target);
		if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw new Error("only files inside skills/ can be read");
		return readFile(target, "utf-8");
	});
}

// ── Prompts ────────────────────────────────────────────────────────────

// The source format from the repo's CONVENTIONS.md. Reviewers are labelled by
// position and focus; the person's name is never sent.
export function sourcePrompt(e: CompanyEvent): string {
	const head = `source_id: ${e.id}\nsource_type: ${e.type}\nrole: ${e.role}\n`;
	const body =
		e.type === "exit"
			? `\nExit notes\n${e.notes.trim()}\n`
			: e.reviews
					.map((r, i) => `\nInterviewer ${i + 1} (${r.focus}) — recommendation: ${r.recommendation}\n${r.assessment.trim()}\n`)
					.join("");
	return `${head}${body}\nCurate this source: propose changes to the ideal with propose_change, or explain in one short paragraph why nothing should change.`;
}

// ── Turning SDK messages into activity lines ───────────────────────────

function describeToolUse(name: string, args: Record<string, any>): string {
	switch (name) {
		case "read_ideal":
			return "Reading the current ideal";
		case "read":
			return `Loading its skill: ${String(args.path).replace(/^skills\//, "").replace(/\/SKILL\.md$/, "")}`;
		case "propose_change": {
			const verb = { add: "Proposing new trait", modify: "Proposing a refinement to", remove: "Proposing to remove" }[
				args.change as string
			] ?? "Proposing";
			const quotes = Array.isArray(args.evidence) ? args.evidence.length : 0;
			return `${verb} “${args.title || args.trait}” (${quotes} quote${quotes === 1 ? "" : "s"} as evidence)`;
		}
		case "read_proposal":
			return "Reading the proposed changes and their evidence";
		case "record_review":
			return args.verdict === "flagged"
				? `Flagged ${String(args.commit).slice(0, 7)}: ${args.summary}`
				: `Cleared ${String(args.commit).slice(0, 7)}: ${args.summary}`;
		default:
			return `Calling ${name}`;
	}
}

function toStep(agent: AgentStep["agent"], m: GCMessage): AgentStep | null {
	const at = new Date().toISOString();
	switch (m.type) {
		case "tool_use":
			return { agent, kind: "tool", tool: m.toolName, text: describeToolUse(m.toolName, m.args), at };
		case "tool_result":
			if (m.isError) return { agent, kind: "error", tool: m.toolName, text: m.content.trim(), at };
			return null;
		case "assistant":
			if (m.stopReason === "error") return { agent, kind: "error", text: m.errorMessage || "The model returned an error", at };
			return m.content.trim() ? { agent, kind: "message", text: m.content.trim(), at } : null;
		case "system":
			if (m.subtype === "hook_blocked") return { agent, kind: "status", text: `Blocked by guard: ${m.content}`, at };
			if (m.subtype === "error") return { agent, kind: "error", text: m.content, at };
			return null;
		default:
			return null;
	}
}

// Returns false when the run hit an error. GitAgent reports a failed model
// call as messages rather than by throwing.
async function runAgent(id: string, agent: AgentStep["agent"], prompt: string): Promise<boolean> {
	const dir = join(REPO, "agents", agent);
	const q = query({ prompt, dir, replaceBuiltinTools: true, tools: [skillReader(dir)], model: model() });
	let last: AgentStep | null = null;
	let ok = true;
	for await (const message of q) {
		const step = toStep(agent, message);
		// A failed model call arrives as both an assistant error and a system
		// error; show it once.
		if (!step || (step.kind === "error" && last?.kind === "error" && last.text === step.text)) continue;
		// A failed tool call is the model's to recover from; a failed model call is not.
		if (step.kind === "error" && !step.tool) ok = false;
		emit(id, step);
		last = step;
	}
	return ok;
}

// ── A full run: curator, then fairness if anything was proposed ────────

const running = new Set<string>();

export async function curate(id: string) {
	const event = getEvent(id);
	if (!event || running.has(id)) return;
	running.add(id);
	updateEvent(id, (e) => {
		e.run = { status: "running", steps: [] };
	});

	const at = () => new Date().toISOString();
	const finish = (status: "done" | "error", summary: string) =>
		updateEvent(id, (e) => {
			e.run.status = status;
			e.run.summary = summary;
		});
	try {
		emit(id, { agent: "curator", kind: "status", text: "Curator is reading the source", at: at() });
		if (!(await runAgent(id, "curator", sourcePrompt(event)))) return finish("error", "The curator run failed");

		const proposed = Number(tryGit(["rev-list", "--count", `main..proposal/${id}`]) ?? 0);
		if (proposed === 0) return finish("done", "No change proposed");

		emit(id, { agent: "fairness", kind: "status", text: `Fairness reviewer is checking ${proposed} change(s)`, at: at() });
		const reviewed = await runAgent(id, "fairness", `Review proposal ${id}`);
		finish(reviewed ? "done" : "error", reviewed ? `${proposed} change(s) proposed and reviewed` : "The fairness review failed");
	} catch (err) {
		emit(id, { agent: "curator", kind: "error", text: (err as Error).message, at: at() });
		updateEvent(id, (e) => {
			e.run.status = "error";
		});
	} finally {
		running.delete(id);
		listeners.get(id)?.forEach((fn) => fn({ kind: "end" }));
		void github.afterRun(id, () => pullRequest(id));
	}
}

// ── Talking to the ideal ───────────────────────────────────────────────

// Each question is one GitAgent run; earlier turns of the conversation are
// passed along so follow-ups make sense.
export async function* askIdeal(
	question: string,
	history: { role: string; text: string }[],
): AsyncGenerator<{ kind: "text" | "tool" | "error"; text: string }> {
	const earlier = history
		.slice(-6)
		.map((t) => `${t.role === "user" ? "They asked" : "You answered"}: ${String(t.text).slice(0, 2000)}`)
		.join("\n\n");
	const prompt = earlier ? `Earlier in this conversation:\n\n${earlier}\n\nNow they ask: ${question}` : question;
	const q = query({ prompt, dir: REPO, replaceBuiltinTools: true, model: chatModel() });
	for await (const m of q) {
		if (m.type === "delta" && m.deltaType === "text") yield { kind: "text", text: m.content };
		else if (m.type === "tool_use" && m.toolName === "read_trait") yield { kind: "tool", text: String(m.args.trait) };
		else if (m.type === "assistant" && m.stopReason === "error") yield { kind: "error", text: m.errorMessage || "The model returned an error" };
	}
}
