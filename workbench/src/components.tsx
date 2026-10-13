import { diffWords } from "diff";
import { useState } from "react";
import type { AgentStep, Evidence, FairnessReview, PullStatus, SourceType, Trait } from "../shared/types.ts";

// ── Tags ───────────────────────────────────────────────────────────────

export const TYPE_LABEL: Record<SourceType, string> = { hire: "Hire", reject: "Rejection", exit: "Exit" };

export function TypeTag({ type }: { type: SourceType }) {
	return <span className={`tag ${type}`}>{TYPE_LABEL[type]}</span>;
}

const STATUS: Record<PullStatus, [string, string]> = {
	running: ["live", "Agents working"],
	failed: ["danger", "Run failed"],
	open: ["warn", "Awaiting you"],
	merged: ["ok", "Merged into the ideal"],
	reverted: ["warn", "Reverted"],
	closed: ["plain", "Declined"],
	"no-change": ["plain", "No change"],
};

export function StatusTag({ status }: { status: PullStatus }) {
	const [tone, label] = STATUS[status];
	return (
		<span className={`tag ${tone}`}>
			{status === "running" && <span className="dot live" />}
			{label}
		</span>
	);
}

export function timeAgo(iso: string): string {
	if (!iso) return "";
	const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
	if (s < 60) return "just now";
	if (s < 3600) return `${Math.round(s / 60)}m ago`;
	if (s < 86400) return `${Math.round(s / 3600)}h ago`;
	return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── A trait, as a document with tracked changes ────────────────────────

function Words({ before, after }: { before: string; after: string }) {
	if (before === after) return <>{after}</>;
	return (
		<>
			{diffWords(before, after).map((part, i) =>
				part.added ? (
					<ins key={i} className="w">{part.value}</ins>
				) : part.removed ? (
					<del key={i} className="w">{part.value}</del>
				) : (
					<span key={i}>{part.value}</span>
				),
			)}
		</>
	);
}

function Lines({ label, before, after }: { label: string; before: string[]; after: string[] }) {
	if (!before.length && !after.length) return null;
	return (
		<>
			<p className="doc-list-label">{label}</p>
			<ul>
				{after.map((l) => <li key={`a${l}`} className={before.includes(l) ? "" : "add"}>{l}</li>)}
				{before.filter((l) => !after.includes(l)).map((l) => <li key={`r${l}`} className="remove">{l}</li>)}
			</ul>
		</>
	);
}

export function TraitDoc({ before, after }: { before: Trait | null; after: Trait | null }) {
	// A new or removed trait reads as one block; only a refinement is redlined.
	const mode = !before ? "added" : !after ? "removed" : "changed";
	const shown = (after ?? before)!;
	const base = mode === "changed" ? before! : shown;
	return (
		<div className={`doc ${mode}`}>
			<h3 className="doc-title"><Words before={base.title} after={shown.title} /></h3>
			<p className="doc-summary"><Words before={base.summary} after={shown.summary} /></p>
			<p className="doc-meaning"><Words before={base.meaning} after={shown.meaning} /></p>
			<Lines label="You'll see it when" before={base.signals} after={shown.signals} />
			<Lines label="It isn't" before={base.not} after={shown.not} />
		</div>
	);
}

// ── Evidence and fairness ──────────────────────────────────────────────

export function Quotes({ evidence }: { evidence: Evidence[] }) {
	return (
		<div className="quotes">
			{evidence.map((e, i) => (
				<div className="quote" key={i}>
					<div className="quote-text">“{e.quote}”</div>
					<div className="quote-from">{e.from || "Source"}</div>
				</div>
			))}
		</div>
	);
}

export function Verdict({ review }: { review: FairnessReview | null }) {
	if (!review) {
		return (
			<div className="verdict pending">
				<span className="verdict-mark">…</span>
				<span className="muted">Fairness review pending</span>
			</div>
		);
	}
	const clear = review.verdict === "clear";
	return (
		<div className={`verdict ${review.verdict}`}>
			<span className="verdict-mark">{clear ? "✓" : "!"}</span>
			<div>
				<strong>{clear ? "No proxies found." : "Flagged by the fairness reviewer."}</strong>{" "}
				<span className="muted">{review.summary}</span>
				{review.concerns.map((c, i) => (
					<div className="concern" key={i}>
						<b>“{c.term}”</b> {c.why}
						<div className="muted" style={{ marginTop: 4 }}>Instead: {c.suggestion}</div>
					</div>
				))}
			</div>
		</div>
	);
}

// ── Agent activity ─────────────────────────────────────────────────────

// The agents explain themselves at length; show a preview and expand on click.
function StepText({ step }: { step: AgentStep }) {
	const [open, setOpen] = useState(false);
	const plain = step.text.replace(/[#*|`]/g, "").replace(/\n{2,}/g, "\n").trim();
	if (step.kind !== "message" || plain.length <= 160) return <div className="step-text">{plain}</div>;
	return (
		<div className="step-text" style={{ cursor: "pointer", whiteSpace: open ? "pre-wrap" : undefined }} onClick={() => setOpen(!open)}>
			{open ? plain : `${plain.slice(0, 160).trimEnd()}…`} <span className="faint">{open ? "less" : "more"}</span>
		</div>
	);
}

export function AgentActivity({ steps, live }: { steps: AgentStep[]; live: boolean }) {
	return (
		<aside className="activity">
			<div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
				<p className="label" style={{ margin: 0 }}>Agent activity</p>
				{live && <span className="tag live"><span className="dot live" />live</span>}
			</div>
			{steps.length === 0 ? (
				<p className="muted" style={{ margin: 0 }}>{live ? "Starting…" : "Nothing recorded."}</p>
			) : (
				<div className="steps">
					{steps.map((s, i) => (
						<div key={i} className={`step ${s.kind}`}>
							<span className={`step-dot ${s.kind === "error" ? "error" : s.agent}`} />
							<div>
								<div className="step-who">{s.agent === "curator" ? "Curator" : "Fairness reviewer"}</div>
								<StepText step={s} />
							</div>
						</div>
					))}
				</div>
			)}
		</aside>
	);
}
