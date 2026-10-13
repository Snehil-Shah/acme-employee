// Shapes shared by the server and the browser.

export type SourceType = "hire" | "reject" | "exit";

export const RECOMMENDATIONS = ["strong yes", "yes", "lean yes", "lean no", "no", "strong no"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

export interface Review {
	focus: string;
	recommendation: Recommendation;
	assessment: string;
}

export type RunStatus = "idle" | "running" | "done" | "error";

export interface AgentStep {
	agent: "curator" | "fairness";
	kind: "status" | "tool" | "result" | "message" | "error";
	text: string;
	tool?: string;
	at: string;
}

// A hire, rejection or exit as the workbench records it. The person's name
// stays here, in the workbench's local data: the curator only ever sees the
// source id, the role and the reviews, and nothing in the company repo names
// anyone.
export interface CompanyEvent {
	id: string; // the source id, e.g. reject-2026-10-backend-engineer-02
	type: SourceType;
	person: string;
	role: string;
	reviews: Review[]; // hire and reject
	notes: string; // exit
	createdAt: string;
	run: { status: RunStatus; steps: AgentStep[]; summary?: string };
	pr?: { number: number; url: string }; // the event's pull request on GitHub, when synced
}

export interface NewEvent {
	type: SourceType;
	person: string;
	role: string;
	reviews: Review[];
	notes: string;
}

export interface Trait {
	slug: string;
	title: string;
	summary: string;
	meaning: string;
	signals: string[];
	not: string[];
}

export interface Evidence {
	from: string;
	quote: string;
}

export interface FairnessReview {
	verdict: "clear" | "flagged";
	summary: string;
	concerns: { term: string; why: string; suggestion: string }[];
}

export type DecisionStatus = "pending" | "accepted" | "declined" | "reverted";

// A proposal is decided as a whole: accepting merges its branch into main.
export interface Decision {
	status: DecisionStatus;
	by?: string;
	at?: string;
	commit?: string; // the merge (or revert) commit on main
}

export interface ProposedChange {
	commit: string;
	subject: string;
	rationale: string;
	change: "add" | "modify" | "remove";
	trait: string;
	evidence: Evidence[];
	before: Trait | null;
	after: Trait | null;
	fairness: FairnessReview | null;
}

export type PullStatus = "running" | "failed" | "open" | "merged" | "reverted" | "closed" | "no-change";

export interface PullSummary {
	sourceId: string;
	type: SourceType;
	title: string; // e.g. HIRED: Alice Chen (Engineering Manager)
	person: string;
	role: string;
	status: PullStatus;
	changes: { total: number; flagged: number };
	createdAt: string;
}

export interface PullRequest extends PullSummary {
	branch: string;
	decision: Decision;
	items: ProposedChange[];
	event: CompanyEvent | null;
}

// One commit on main: how the ideal got to where it is.
export interface GrowthPoint {
	commit: string;
	at: string;
	subject: string;
	author: string;
	approver: string;
	source: string | null;
	trait: string | null;
	change: string | null;
	kind: "init" | "accepted" | "reverted" | "other";
	traitCount: number;
	person: string | null;
}

export interface TraitHistoryEntry {
	commit: string;
	at: string;
	subject: string;
	rationale: string;
	source: string | null;
	person: string | null;
	evidence: Evidence[];
	approver: string;
}

export interface WorkbenchState {
	company: string;
	approver: string;
	traits: Trait[];
	growth: GrowthPoint[];
	pulls: PullSummary[];
	events: CompanyEvent[];
	hasApiKey: boolean;
	repoUrl: string | null; // the company repo on GitHub, when synced
	remaining: { runs: number | null; asks: number | null };
}
