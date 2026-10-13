// Mirrors the company repo to GitHub: after every agent run and decision it
// pushes main, the proposal branches and the notes, and keeps one pull request
// per event up to date. Off unless GITHUB_REPO, GITHUB_APP_ID and the app's
// private key are set.
//
// Decisions land on main as individual cherry-picks, so a proposal's PR is
// closed with a summary once every change is decided, rather than merged.
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { git, approver } from "./git.ts";
import { REPO as COMPANY_REPO, decide } from "./config.ts";
import { getEvent, updateEvent } from "./store.ts";
import type { ProposedChange, PullRequest } from "../shared/types.ts";

// Acts as a GitHub App, so pushes and pull requests show as the app's bot
// rather than a person. The private key comes from GITHUB_APP_PRIVATE_KEY (the
// PEM itself, as a Fly secret) or GITHUB_APP_PRIVATE_KEY_FILE (a path, locally).
const REPO = process.env.GITHUB_REPO; // owner/name
const APP_ID = process.env.GITHUB_APP_ID;
const KEY = process.env.GITHUB_APP_PRIVATE_KEY
	?? (process.env.GITHUB_APP_PRIVATE_KEY_FILE ? readFileSync(process.env.GITHUB_APP_PRIVATE_KEY_FILE, "utf-8") : undefined);
export const enabled = Boolean(REPO && APP_ID && KEY);
export const repoUrl = REPO ? `https://github.com/${REPO}` : null;
const SITE = process.env.PUBLIC_URL;

const GITHUB = "https://api.github.com";
const HEADERS = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28" };
const b64url = (data: string | Buffer) => Buffer.from(data).toString("base64url");

// A 9-minute JWT signed with the app's key, used only to get installation tokens.
function appJwt(): string {
	const now = Math.floor(Date.now() / 1000);
	const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: APP_ID }))}`;
	const signature = createSign("RSA-SHA256").update(unsigned).sign(KEY!);
	return `${unsigned}.${b64url(signature)}`;
}

async function asApp(path: string, method = "GET") {
	const res = await fetch(`${GITHUB}${path}`, { method, headers: { ...HEADERS, authorization: `Bearer ${appJwt()}` } });
	if (!res.ok) throw new Error(`GitHub app ${method} ${path}: ${res.status} ${await res.text()}`);
	return res.json();
}

// Installation tokens last an hour; reuse one until it's within 5 minutes of expiring.
let cached: { token: string; expires: number } | null = null;
async function token(): Promise<string> {
	if (cached && cached.expires - Date.now() > 5 * 60_000) return cached.token;
	const installation = (await asApp(`/repos/${REPO}/installation`)) as { id: number };
	const { token, expires_at } = (await asApp(`/app/installations/${installation.id}/access_tokens`, "POST")) as {
		token: string;
		expires_at: string;
	};
	cached = { token, expires: new Date(expires_at).getTime() };
	return token;
}

// The token goes in a per-command header, never into .git/config on the volume.
async function authed(args: string[]) {
	const basic = Buffer.from(`x-access-token:${await token()}`).toString("base64");
	return ["-c", `http.extraHeader=Authorization: Basic ${basic}`, ...args];
}

async function api(method: string, path: string, body?: unknown) {
	const res = await fetch(`${GITHUB}/repos/${REPO}${path}`, {
		method,
		headers: {
			...HEADERS,
			authorization: `Bearer ${await token()}`,
			...(body ? { "content-type": "application/json" } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!res.ok) throw new Error(`GitHub ${method} ${path}: ${res.status} ${await res.text()}`);
	return res.status === 204 ? null : res.json();
}

// Checks the app can reach the repo, without changing anything.
export async function check(): Promise<string> {
	const repo = (await api("GET", "")) as { full_name: string; permissions?: Record<string, boolean> };
	return repo.full_name;
}

// Pushes run one at a time; a push that arrives while one is running waits.
let queue: Promise<unknown> = Promise.resolve();

// Resolves once every sync queued so far (pushes, opening PRs) has finished.
export function settled(): Promise<unknown> {
	return queue;
}

function serial<T>(fn: () => Promise<T>): Promise<T> {
	const next = queue.then(fn, fn);
	queue = next.catch(() => {});
	return next;
}

// Nothing here rewrites history, so a plain push is enough. Commits made on
// GitHub (a README edit, a framework update) are fast-forwarded in first; if
// main has really diverged, the push fails and is logged rather than
// overwriting anything.
async function push() {
	try {
		git(await authed(["fetch", "origin", "main"]));
		git(["merge", "--ff-only", "origin/main"]);
	} catch {
		// Not a fast-forward; the push below will say so.
	}
	git(await authed([
		"push", "origin",
		"refs/heads/main:refs/heads/main",
		"refs/heads/proposal/*:refs/heads/proposal/*",
		"refs/notes/*:refs/notes/*",
	]));
}

// ── Pull request text ──────────────────────────────────────────────────

const CHANGE = { add: "New trait", modify: "Refinement", remove: "Removal" } as const;

function decisionLine(pull: PullRequest): string {
	const d = pull.decision;
	if (d.status === "accepted") return `✅ **Accepted** by ${d.by}: merged into the ideal as \`${d.commit?.slice(0, 7)}\`.`;
	if (d.status === "reverted") return `↩️ **Accepted, later reverted** by ${d.by} in \`${d.commit?.slice(0, 7)}\`.`;
	if (d.status === "declined") return `✖️ **Declined** by ${d.by}. This branch stays as a road not taken.`;
	return "⏳ **Awaiting a decision.**";
}

function fairnessLine(c: ProposedChange): string {
	const f = c.fairness;
	if (!f) return "Fairness review pending.";
	if (f.verdict === "clear") return `🟢 **Fairness: clear.** ${f.summary}`;
	const concerns = f.concerns.map((x) => `  - “${x.term}”: ${x.why} *Instead:* ${x.suggestion}`).join("\n");
	return `🔴 **Fairness: flagged.** ${f.summary}\n${concerns}`;
}

function body(pull: PullRequest): string {
	const kind = { hire: "a hire", reject: "a rejected candidate", exit: "an exit" }[pull.type];
	const changes = pull.items
		.map((c, i) => {
			const title = c.after?.title ?? c.before?.title ?? c.trait;
			const quotes = c.evidence.map((e) => `> “${e.quote}”\n> — ${e.from}`).join("\n>\n");
			return [
				`### ${i + 1}. ${CHANGE[c.change]}: ${title} · \`${c.commit.slice(0, 7)}\``,
				`*${c.rationale}*`,
				quotes,
				fairnessLine(c),
			].join("\n\n");
		})
		.join("\n\n---\n\n");
	return [
		`The curator read the interviewers' reviews of ${kind} (**${pull.title.replace(/^[^:]+: /, "")}**, source \`${pull.sourceId}\`) and proposes ${pull.items.length} change${pull.items.length === 1 ? "" : "s"} to the ideal employee. Each change is one commit on this branch.`,
		`A person accepts or declines the proposal as a whole in the workbench${SITE ? ` (${SITE}/#/pulls/${pull.sourceId})` : ""}. Accepting merges this pull request.`,
		decisionLine(pull),
		changes,
	].join("\n\n");
}

// ── Hooks called by the workbench ──────────────────────────────────────

export function afterRun(sourceId: string, getPull: () => PullRequest) {
	if (!enabled) return Promise.resolve();
	return serial(async () => {
		await push();
		const pull = getPull();
		if (pull.items.length === 0) return;
		const event = getEvent(sourceId);
		if (event?.pr) {
			await api("PATCH", `/pulls/${event.pr.number}`, { body: body(pull) });
			return;
		}
		const pr = (await api("POST", "/pulls", {
			title: pull.title,
			head: pull.branch,
			base: "main",
			body: body(pull),
		})) as { number: number; html_url: string };
		updateEvent(sourceId, (e) => {
			e.pr = { number: pr.number, url: pr.html_url };
		});
	}).catch((err) => console.error("GitHub sync failed:", err.message));
}

// Accepting pushes the merge commit, which GitHub recognises as merging the
// PR; declining closes it. Either way the description shows the decision.
async function syncPull(sourceId: string, pull: PullRequest) {
	const pr = getEvent(sourceId)?.pr;
	if (!pr) return;
	const current = (await api("GET", `/pulls/${pr.number}`)) as { state: string; merged: boolean };
	await api("PATCH", `/pulls/${pr.number}`, { title: pull.title, body: body(pull) });
	if (current.state !== "open") return;

	const d = pull.decision;
	if (d.status === "declined") {
		await api("PATCH", `/pulls/${pr.number}`, { state: "closed" });
	} else if (d.status === "accepted" || d.status === "reverted") {
		// Proposals accepted before decisions were per proposal were copied onto
		// main change by change, so their branch never merges; close those.
		const merged = (await api("GET", `/pulls/${pr.number}`)) as { merged: boolean };
		if (!merged.merged) {
			await api("POST", `/issues/${pr.number}/comments`, { body: "Accepted: its changes are on `main`." });
			await api("PATCH", `/pulls/${pr.number}`, { state: "closed" });
		}
	}
}

// Accepting: GitHub squash-merges the pull request, so it shows as merged and
// main gains one commit titled like the PR. A stale branch first catches up
// with main (index regenerated) so the squash can't conflict; afterwards the
// squash commit is fast-forwarded into the local main.
export function squashMerge(sourceId: string, number: number, title: string): Promise<void> {
	return serial(async () => {
		decide.catchUp(COMPANY_REPO, sourceId, approver());
		await push();
		const message = decide.acceptMessage(COMPANY_REPO, sourceId, title);
		const sha = git(["rev-parse", `refs/heads/proposal/${sourceId}`]);
		// GitHub works out whether a just-pushed PR can merge asynchronously.
		for (let attempt = 1; ; attempt++) {
			try {
				await api("PUT", `/pulls/${number}/merge`, {
					merge_method: "squash",
					commit_title: message.title,
					commit_message: message.body,
					sha,
				});
				break;
			} catch (err) {
				if (attempt >= 5 || !/: 40[59] /.test((err as Error).message)) throw err;
				await new Promise((r) => setTimeout(r, 1500 * attempt));
			}
		}
		git(await authed(["fetch", "origin", "main"]));
		git(["merge", "--ff-only", "origin/main"]);
	});
}

export function afterDecision(sourceId: string, getPull: () => PullRequest, action: "accept" | "decline" | "revert", reason = "") {
	if (!enabled) return Promise.resolve();
	return serial(async () => {
		await push();
		const pull = getPull();
		await syncPull(sourceId, pull);
		const pr = getEvent(sourceId)?.pr;
		if (pr && action === "revert") {
			await api("POST", `/issues/${pr.number}/comments`, {
				body: `Reverted on \`main\` in \`${pull.decision.commit?.slice(0, 7)}\`${reason ? `: ${reason}` : "."}`,
			});
		}
	}).catch((err) => console.error("GitHub sync failed:", err.message));
}

// On boot: push anything a restart interrupted, and bring every PR in line
// with git (description, merged or closed).
export function reconcile(events: { id: string; pr?: { number: number } }[], getPull: (id: string) => PullRequest) {
	if (!enabled) return Promise.resolve();
	return serial(async () => {
		await push();
		for (const e of events) if (e.pr) await syncPull(e.id, getPull(e.id));
	}).catch((err) => console.error("GitHub reconcile failed:", err.message));
}
