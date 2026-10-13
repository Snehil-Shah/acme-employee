import { useCallback, useEffect, useState } from "react";
import { api, streamRun } from "../api.ts";
import type { AgentStep, ProposedChange, PullRequest } from "../../shared/types.ts";
import { AgentActivity, Quotes, StatusTag, TraitDoc, TypeTag, Verdict, timeAgo } from "../components.tsx";

const CHANGE_LABEL = { add: "New trait", modify: "Refinement", remove: "Removal" } as const;
const CHANGE_TONE = { add: "ok", modify: "live", remove: "danger" } as const;

export function PullRequestView({ id, onChange }: { id: string; onChange: () => void }) {
	const [pull, setPull] = useState<PullRequest | null>(null);
	const [steps, setSteps] = useState<AgentStep[]>([]);
	const [live, setLive] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [deciding, setDeciding] = useState(false);

	const load = useCallback(async () => {
		try {
			setPull(await api.pull(id));
		} catch (err) {
			setError((err as Error).message);
		}
	}, [id]);

	// Replay the run so far, then follow it live until the agents finish.
	useEffect(() => {
		setSteps([]);
		setLive(true);
		void load();
		return streamRun(
			id,
			(s) => {
				setSteps((prev) => [...prev, s]);
				if (s.kind === "tool" && (s.tool === "propose_change" || s.tool === "record_review")) void load();
			},
			() => {
				setLive(false);
				void load();
				onChange();
			},
		);
	}, [id, load, onChange]);

	if (error) return <div className="page"><div className="empty">{error}</div></div>;
	if (!pull) return <div className="page"><div className="empty">Loading…</div></div>;

	const decide = async (action: "accept" | "decline" | "revert") => {
		let reason: string | undefined;
		if (action === "revert") {
			reason = prompt("Why revert this decision? It goes in the commit message.") ?? undefined;
			if (reason === undefined) return;
		}
		setDeciding(true);
		try {
			setPull(await api.decide(id, action, reason));
			onChange();
		} catch (err) {
			alert((err as Error).message);
		}
		setDeciding(false);
	};

	const rerun = async () => {
		await api.rerun(id);
		window.location.reload();
	};

	const status = live ? "running" : pull.status;

	return (
		<div className="page">
			<a href="#/pulls" className="back">← Proposals</a>
			<div className="page-head">
				<div>
					<div className="row" style={{ gap: 8, marginBottom: 14 }}>
						<TypeTag type={pull.type} />
						<StatusTag status={status} />
					</div>
					<h1 className="title">{pull.person}</h1>
					<p className="lede">{pull.role} · {timeAgo(pull.createdAt)}</p>
					<div className="row" style={{ marginTop: 6, gap: 14 }}>
						<code className="faint">{pull.branch}</code>
						{pull.event?.pr && (
							<a href={pull.event.pr.url} target="_blank" rel="noreferrer" className="muted" style={{ fontSize: 13, textDecoration: "underline", textUnderlineOffset: 3 }}>
								Pull request #{pull.event.pr.number} on GitHub ↗
							</a>
						)}
					</div>
				</div>
				{!live && (pull.status === "no-change" || pull.status === "failed") && (
					<button className="btn" onClick={rerun}>Run the curator again</button>
				)}
			</div>

			<div className="pr-grid">
				<div className="stack" style={{ gap: 20 }}>
					{pull.items.length === 0 && (
						<div className="card empty">
							{live ? (
								<>
									<h3>Reading the reviews…</h3>
									<p>Proposed changes appear here as the curator commits them.</p>
								</>
							) : pull.status === "failed" ? (
								<>
									<h3>The agents couldn't finish</h3>
									<p>The error is in the activity log. Fix it, then run the curator again.</p>
								</>
							) : (
								<>
									<h3>Nothing should change</h3>
									<p>The curator decided this shouldn't shape the ideal. Its reasoning is in the activity log.</p>
								</>
							)}
						</div>
					)}
					{pull.items.map((c) => <Proposal key={c.commit} change={c} />)}
					{pull.items.length > 0 && !live && <DecisionBar pull={pull} busy={deciding} onDecide={decide} />}
					{pull.event && <Source pull={pull} />}
				</div>
				<AgentActivity steps={steps} live={live} />
			</div>
		</div>
	);
}

function Proposal({ change: c }: { change: ProposedChange }) {
	return (
		<article className="card proposal">
			<div className="proposal-head">
				<span className={`tag ${CHANGE_TONE[c.change]}`}>{CHANGE_LABEL[c.change]}</span>
				<code className="faint">{c.commit.slice(0, 7)}</code>
			</div>
			<TraitDoc before={c.before} after={c.after} />
			<div className="reasoning">
				<p className="why">{c.rationale}</p>
				<Quotes evidence={c.evidence} />
				<Verdict review={c.fairness} />
			</div>
		</article>
	);
}

// The proposal is decided as a whole: accepting squash-merges it into the ideal.
function DecisionBar({ pull, busy, onDecide }: { pull: PullRequest; busy: boolean; onDecide: (action: "accept" | "decline" | "revert") => void }) {
	const d = pull.decision;
	const n = pull.changes.total;
	if (d.status === "pending") {
		return (
			<div className="card decision">
				<div>
					<div className="decision-title">Accept {pull.type === "hire" ? "this hire" : pull.type === "exit" ? "this exit" : "this rejection"} into the ideal?</div>
					<div className="muted" style={{ fontSize: 13 }}>
						Squash-merges all {n} change{n === 1 ? "" : "s"} as one commit on main: <code>{pull.title}</code>
						{pull.changes.flagged > 0 && <span style={{ color: "var(--danger)" }}> · {pull.changes.flagged} flagged by the fairness reviewer</span>}
					</div>
				</div>
				<div className="row">
					<button className="btn" disabled={busy} onClick={() => onDecide("decline")}>Decline</button>
					<button className="btn go" disabled={busy} onClick={() => onDecide("accept")}>{busy ? "Merging…" : "Accept & merge"}</button>
				</div>
			</div>
		);
	}
	const label = { accepted: "Merged into the ideal", reverted: "Reverted", declined: "Declined", pending: "" }[d.status];
	return (
		<div className="card decision">
			<span className="row" style={{ fontSize: 13, gap: 8 }}>
				<span className={`tag ${d.status === "accepted" ? "ok" : d.status === "reverted" ? "warn" : "plain"}`}>{label}</span>
				<span className="muted">
					{d.by} · {timeAgo(d.at ?? "")}
					{d.commit && <> · <code>main@{d.commit.slice(0, 7)}</code></>}
				</span>
			</span>
			{d.status === "accepted" && <button className="btn sm quiet" disabled={busy} onClick={() => onDecide("revert")}>Revert</button>}
		</div>
	);
}

function Source({ pull }: { pull: PullRequest }) {
	const e = pull.event!;
	return (
		<details className="card" style={{ padding: "16px 20px" }}>
			<summary style={{ cursor: "pointer", fontWeight: 500 }}>
				What the {e.type === "exit" ? "exit notes" : "interviewers"} said
			</summary>
			<div className="quotes" style={{ marginTop: 16 }}>
				{e.type === "exit" ? (
					<div className="quote"><div className="quote-text">{e.notes}</div><div className="quote-from">Exit notes</div></div>
				) : (
					e.reviews.map((r, i) => (
						<div className="quote" key={i}>
							<div className="quote-text">{r.assessment}</div>
							<div className="quote-from">Interviewer {i + 1} ({r.focus}) · {r.recommendation}</div>
						</div>
					))
				)}
			</div>
		</details>
	);
}
