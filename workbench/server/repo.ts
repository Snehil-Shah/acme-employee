// Reads the company repo and turns its git history into what the workbench
// shows: proposals become pull requests, main becomes a growth timeline. All
// state lives in git (branches, trailers, notes); the workbench adds nothing
// but people's names from its own event log.
import { REPO, ideal, decide } from "./config.ts";
import { git, tryGit, logRecords, trailerValues, approver } from "./git.ts";
import { allEvents, getEvent } from "./store.ts";
import * as github from "./github.ts";
import type {
	Trait, Evidence, FairnessReview, ProposedChange, PullRequest, PullSummary, PullStatus,
	GrowthPoint, TraitHistoryEntry, CompanyEvent, Decision,
} from "../shared/types.ts";

const MAIN = "main";
const DECISIONS = "decisions";

// ── Traits ────────────────────────────────────────────────────────────

export function traitsAt(ref = MAIN): Trait[] {
	return ideal.listTraitsAt(REPO, ref);
}

function traitAt(ref: string, slug: string): Trait | null {
	const text = tryGit(["show", `${ref}:traits/${slug}.md`]);
	return text ? { slug, ...ideal.parseTrait(text) } : null;
}

function traitCountAt(ref: string): number {
	const files = tryGit(["ls-tree", "--name-only", `${ref}:traits`]) ?? "";
	return files.split("\n").filter((f) => /^[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(f)).length;
}

// `Interviewer 2 (pairing): "quote"` → { from, quote }
function parseEvidence(raw: string): Evidence {
	const i = raw.indexOf(': "');
	if (i === -1) return { from: "", quote: raw.replace(/^"|"$/g, "") };
	return { from: raw.slice(0, i), quote: raw.slice(i + 3).replace(/"$/, "") };
}

function note<T>(ref: string, commit: string): T | null {
	const raw = tryGit(["notes", `--ref=${ref}`, "show", commit]);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

const personFor = (source: string | null) => (source ? getEvent(source)?.person ?? null : null);

// ── Pull requests (proposal branches) ──────────────────────────────────

function proposalBranches(): string[] {
	const out = git(["for-each-ref", "--format=%(refname:short)", "refs/heads/proposal/"]);
	return out ? out.split("\n") : [];
}

function changeAt(commit: string): ProposedChange {
	const [subject, body, change, trait, evidence] = logRecords(["-1", commit], [
		"%s",
		"%b",
		"%(trailers:key=Change,valueonly)",
		"%(trailers:key=Trait,valueonly)",
		"%(trailers:key=Evidence,valueonly,unfold)",
	])[0];
	const slug = trait.trim();
	return {
		commit,
		subject,
		rationale: body.split("\n\n")[0].trim(),
		change: change.trim() as ProposedChange["change"],
		trait: slug,
		evidence: trailerValues(evidence).map(parseEvidence),
		before: traitAt(`${commit}^`, slug),
		after: traitAt(commit, slug),
		fairness: note<FairnessReview>("fairness", commit),
	};
}

// The decision on a proposal, read from git: a merge commit on main means
// accepted, a later revert of it means reverted, and a note on the branch tip
// means declined (declining leaves nothing else behind).
function decisionFor(sourceId: string, tip: string | null): Decision {
	const merge = decide.acceptedAs(REPO, sourceId);
	if (merge) {
		const [by, at] = git(["log", "-1", "--format=%an%x1f%cI", merge]).split("\x1f");
		const undo = logRecords([MAIN, "--first-parent"], ["%H", "%an", "%cI", "%(trailers:key=Source,valueonly)", "%(trailers:key=Decision,valueonly)"])
			.find(([, , , source, decision]) => source.trim() === sourceId && decision.trim() === "reverted");
		if (undo) return { status: "reverted", by: undo[1], at: undo[2], commit: undo[0] };
		return { status: "accepted", by, at, commit: merge };
	}
	const recorded = tip ? note<Decision & { mainCommit?: string }>(DECISIONS, tip) : null;
	if (!recorded) return { status: "pending" };
	// Proposals decided before decisions were per proposal kept the commit as mainCommit.
	return { status: recorded.status, by: recorded.by, at: recorded.at, commit: recorded.commit ?? recorded.mainCommit };
}

function statusOf(items: ProposedChange[], decision: Decision, event: CompanyEvent | null): PullStatus {
	if (event?.run.status === "running") return "running";
	if (items.length === 0) return event?.run.status === "error" ? "failed" : "no-change";
	return ({ pending: "open", accepted: "merged", reverted: "reverted", declined: "closed" } as const)[decision.status];
}

// The proposal's title, used for its pull request and for the commit that
// accepts it: HIRED: Alice Chen (Engineering Manager)
function titleFor(event: CompanyEvent | null, sourceId: string): string {
	if (!event) return sourceId;
	const verb = { hire: "HIRED", reject: "REJECTED", exit: "EXIT" }[event.type];
	return `${verb}: ${event.person} (${event.role})`;
}

export function pullRequest(sourceId: string): PullRequest {
	const branch = `proposal/${sourceId}`;
	const event = getEvent(sourceId) ?? null;
	const tip = tryGit(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]);
	// Squashing leaves the proposal's own commits off main, so this lists them
	// before and after acceptance alike. --no-merges skips catch-up merges.
	const commits = tip ? tryGit(["rev-list", "--reverse", "--no-merges", `${MAIN}..${branch}`]) : null;
	const items = commits ? commits.split("\n").map(changeAt) : [];
	const decision = decisionFor(sourceId, tip);
	return {
		sourceId,
		branch,
		type: event?.type ?? (sourceId.split("-")[0] as CompanyEvent["type"]),
		title: titleFor(event, sourceId),
		person: event?.person ?? "",
		role: event?.role ?? "",
		status: statusOf(items, decision, event),
		createdAt: event?.createdAt ?? "",
		changes: { total: items.length, flagged: items.filter((c) => c.fairness?.verdict === "flagged").length },
		decision,
		items,
		event,
	};
}

export function pullSummaries(): PullSummary[] {
	const ids = new Set([...allEvents().map((e) => e.id), ...proposalBranches().map((b) => b.slice("proposal/".length))]);
	return [...ids]
		.map((id) => {
			const { items: _items, event: _event, branch: _branch, decision: _decision, ...summary } = pullRequest(id);
			return summary;
		})
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── Decisions (human only) ─────────────────────────────────────────────

function pending(sourceId: string): PullRequest {
	const pull = pullRequest(sourceId);
	if (pull.items.length === 0) throw new Error("there's no proposal to decide");
	if (pull.decision.status !== "pending") throw new Error(`this proposal is already ${pull.decision.status}`);
	return pull;
}

// Squashes the proposal onto main as one commit titled like its pull request.
// With GitHub sync on, GitHub does the squash-merge so the PR shows as merged
// (see github.ts); otherwise the repo's own lib/decide.mjs does it locally.
export async function acceptProposal(sourceId: string) {
	const pull = pending(sourceId);
	if (github.enabled && pull.event?.pr) await github.squashMerge(sourceId, pull.event.pr.number, pull.title);
	else decide.accept(REPO, sourceId, approver(), pull.title);
}

export function declineProposal(sourceId: string) {
	pending(sourceId);
	const tip = git(["rev-parse", `refs/heads/proposal/${sourceId}`]);
	const decision: Decision = { status: "declined", by: approver().name, at: new Date().toISOString() };
	git(["notes", `--ref=${DECISIONS}`, "add", "-f", "-F", "-", tip], { input: JSON.stringify(decision, null, 2), as: approver() });
}

export function revertProposal(sourceId: string, reason: string) {
	decide.revert(REPO, sourceId, approver(), reason);
}

// ── Growth of the ideal (main) ─────────────────────────────────────────

// First-parent history of main: one point per decision (a merge or a revert),
// plus the template and framework commits.
export function growth(): GrowthPoint[] {
	const records = logRecords(["--reverse", "--first-parent", MAIN], [
		"%H", "%cI", "%s", "%an", "%cn", "%P",
		"%(trailers:key=Source,valueonly)",
		"%(trailers:key=Decision,valueonly)",
	]);
	return records.map(([commit, at, subject, author, committer, parents, source, decision]) => {
		const src = source.trim() || null;
		const kind: GrowthPoint["kind"] = !parents.trim()
			? "init"
			: decision.trim() === "reverted" || subject.startsWith('Revert "')
				? "reverted"
				: src
					? "accepted"
					: "other";
		return {
			commit,
			at,
			subject,
			author,
			approver: committer,
			source: src,
			trait: null,
			change: null,
			kind,
			traitCount: traitCountAt(commit),
			person: personFor(src),
		};
	});
}

// Every decision on main that touched this trait, explained by the curator's
// own commit for it on the proposal branch (squashing keeps those off main).
export function traitHistory(slug: string): TraitHistoryEntry[] {
	const records = logRecords([MAIN, "--first-parent", "--", `traits/${slug}.md`], [
		"%H", "%cI", "%s", "%b", "%an",
		"%(trailers:key=Source,valueonly,separator=)",
		"%(trailers:key=Evidence,valueonly,unfold)",
	]);
	return records.map(([commit, at, subject, body, author, source, evidence]) => {
		const src = source.trim() || null;
		const change = src ? pullRequest(src).items.filter((c) => c.trait === slug).at(-1) : undefined;
		return {
			commit,
			at,
			subject: change ? `${change.subject} · ${subject}` : subject,
			rationale: change?.rationale ?? body.split("\n\n")[0].trim(),
			source: src,
			person: personFor(src),
			evidence: change?.evidence ?? trailerValues(evidence).map(parseEvidence),
			approver: author,
		};
	});
}
