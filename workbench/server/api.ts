import type { IncomingMessage, ServerResponse } from "node:http";
import { COMPANY } from "./config.ts";
import { approver } from "./git.ts";
import { allEvents, createEvent, getEvent } from "./store.ts";
import { curate, subscribe, askIdeal } from "./agents.ts";
import {
	traitsAt, growth, pullSummaries, pullRequest, traitHistory,
	acceptProposal, declineProposal, revertProposal,
} from "./repo.ts";
import { RECOMMENDATIONS, type NewEvent, type WorkbenchState } from "../shared/types.ts";
import * as github from "./github.ts";
import { take, remaining } from "./limits.ts";

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, url: URL) => Promise<unknown>;

const routes: Array<[string, RegExp, Handler]> = [];
const route = (method: string, path: string, handler: Handler) =>
	routes.push([method, new RegExp(`^${path.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`), handler]);

function json(res: ServerResponse, status: number, body: unknown) {
	res.statusCode = status;
	res.setHeader("content-type", "application/json");
	res.end(JSON.stringify(body));
}

async function readBody<T>(req: IncomingMessage): Promise<T> {
	let raw = "";
	for await (const chunk of req) raw += chunk;
	return raw ? JSON.parse(raw) : ({} as T);
}

// Agent runs take minutes; a comment every 15s keeps proxies from closing a
// quiet stream.
function sse(res: ServerResponse) {
	res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
	const ping = setInterval(() => res.write(": ping\n\n"), 15_000);
	res.on("close", () => clearInterval(ping));
	return (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── State ──────────────────────────────────────────────────────────────

route("GET", "/api/state", async (_req, res) => {
	const state: WorkbenchState = {
		company: COMPANY,
		approver: approver().name,
		traits: traitsAt(),
		growth: growth(),
		pulls: pullSummaries(),
		events: allEvents(),
		hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
		repoUrl: github.repoUrl,
		remaining: remaining(),
	};
	json(res, 200, state);
});

// ── Events and agent runs ──────────────────────────────────────────────

function validate(input: NewEvent): string | null {
	if (!["hire", "reject", "exit"].includes(input.type)) return "Choose hire, rejection or exit.";
	if (!input.person?.trim()) return "Add the person's name (it stays in the workbench).";
	if (!input.role?.trim()) return "Add the role.";
	if (input.person.length > 80 || input.role.length > 80) return "Keep the name and role short.";
	if (input.type === "exit") {
		if (!input.notes?.trim()) return "Add the exit notes.";
		return input.notes.length > 3000 ? "Keep the exit notes under 3,000 characters." : null;
	}
	if (!input.reviews?.length) return "Add at least one interviewer review.";
	if (input.reviews.length > 5) return "Add at most five interviewer reviews.";
	for (const r of input.reviews) {
		if (!r.focus.trim() || !r.assessment.trim()) return "Every review needs a focus and an assessment.";
		if (r.focus.length > 60 || r.assessment.length > 1500) return "Keep each review's focus short and its assessment under 1,500 characters.";
		if (!RECOMMENDATIONS.includes(r.recommendation)) return "Pick a recommendation for every review.";
	}
	return null;
}

route("POST", "/api/events", async (req, res) => {
	const input = await readBody<NewEvent>(req);
	const problem = validate(input);
	if (problem) return json(res, 400, { error: problem });
	const capped = take("runs");
	if (capped) return json(res, 429, { error: capped });
	const event = createEvent({ ...input, reviews: input.type === "exit" ? [] : input.reviews, notes: input.type === "exit" ? input.notes : "" });
	void curate(event.id);
	json(res, 201, { event });
});

route("POST", "/api/events/:id/run", async (_req, res, { id }) => {
	if (!getEvent(id)) return json(res, 404, { error: "No such event" });
	const capped = take("runs");
	if (capped) return json(res, 429, { error: capped });
	void curate(id);
	json(res, 202, { ok: true });
});

route("GET", "/api/events/:id/stream", async (req, res, { id }) => {
	const event = getEvent(id);
	if (!event) return json(res, 404, { error: "No such event" });
	const send = sse(res);
	for (const step of event.run.steps) send(step);
	if (event.run.status !== "running") {
		send({ kind: "end" });
		return res.end();
	}
	const unsubscribe = subscribe(id, (step) => {
		send(step);
		if (step.kind === "end") res.end();
	});
	req.on("close", unsubscribe);
});

// ── Pull requests and decisions ────────────────────────────────────────

route("GET", "/api/pulls/:id", async (_req, res, { id }) => json(res, 200, pullRequest(id)));

// A proposal is decided as a whole: accept merges its branch into main.
const decision =
	(action: "accept" | "decline" | "revert", fn: (sourceId: string, reason: string) => unknown): Handler =>
	async (req, res, { id }) => {
		const { reason = "" } = await readBody<{ reason?: string }>(req);
		try {
			await fn(id, reason);
			json(res, 200, pullRequest(id));
			void github.afterDecision(id, () => pullRequest(id), action, reason);
		} catch (err) {
			json(res, 409, { error: (err as Error).message });
		}
	};

route("POST", "/api/pulls/:id/accept", decision("accept", (id) => acceptProposal(id)));
route("POST", "/api/pulls/:id/decline", decision("decline", (id) => declineProposal(id)));
route("POST", "/api/pulls/:id/revert", decision("revert", (id, reason) => revertProposal(id, reason)));

// ── The ideal ──────────────────────────────────────────────────────────

route("GET", "/api/traits/:slug/history", async (_req, res, { slug }) => json(res, 200, traitHistory(slug)));

route("POST", "/api/ask", async (req, res) => {
	const { question = "", history = [] } = await readBody<{ question?: string; history?: { role: string; text: string }[] }>(req);
	if (!question.trim() || question.length > 500) return json(res, 400, { error: "Ask a question under 500 characters." });
	const capped = take("asks");
	if (capped) return json(res, 429, { error: capped });
	const send = sse(res);
	// The request is done once its body is read; a disconnect shows on the response.
	let gone = false;
	res.on("close", () => (gone = true));
	try {
		for await (const chunk of askIdeal(question, history)) {
			if (gone) break;
			send(chunk);
		}
	} catch (err) {
		send({ kind: "error", text: (err as Error).message });
	}
	send({ kind: "end" });
	res.end();
});

// ── Dispatch ───────────────────────────────────────────────────────────

export async function handle(req: IncomingMessage, res: ServerResponse) {
	const url = new URL(req.url ?? "/", "http://localhost");
	for (const [method, pattern, handler] of routes) {
		const match = req.method === method && url.pathname.match(pattern);
		if (match) return handler(req, res, match.groups ?? {}, url);
	}
	json(res, 404, { error: "Not found" });
}
