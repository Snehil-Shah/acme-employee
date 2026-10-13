import { useState } from "react";
import type { PullStatus, WorkbenchState } from "../../shared/types.ts";
import { StatusTag, TypeTag, timeAgo } from "../components.tsx";

const TABS: { key: string; label: string; match: PullStatus[] }[] = [
	{ key: "open", label: "Awaiting you", match: ["open", "running"] },
	{ key: "merged", label: "Merged", match: ["merged", "reverted"] },
	{ key: "closed", label: "Not taken", match: ["closed", "no-change", "failed"] },
];

export function PullsView({ state }: { state: WorkbenchState }) {
	const [tab, setTab] = useState("open");
	const current = TABS.find((t) => t.key === tab)!;
	const rows = state.pulls.filter((p) => current.match.includes(p.status));

	return (
		<div className="page narrow">
			<div className="page-head">
				<div>
					<p className="eyebrow">Proposals</p>
					<h1 className="title">What the agents suggest</h1>
					<p className="lede">
						Every event becomes a branch with one commit per proposed change. What you decline stays on its branch, as
						the record of what {state.company} chose not to become.
					</p>
				</div>
			</div>

			<div className="tabs">
				{TABS.map((t) => (
					<button key={t.key} className={tab === t.key ? "on" : ""} onClick={() => setTab(t.key)}>
						{t.label} <span className="faint">{state.pulls.filter((p) => t.match.includes(p.status)).length}</span>
					</button>
				))}
			</div>

			{rows.length === 0 ? (
				<div className="empty">Nothing here.</div>
			) : (
				rows.map((p) => (
					<a className="list-row" key={p.sourceId} href={`#/pulls/${p.sourceId}`}>
						<div>
							<div className="row" style={{ gap: 10, marginBottom: 4 }}>
								<TypeTag type={p.type} />
								<span className="moment-title">{p.person}</span>
							</div>
							<div className="moment-meta">
								{p.role} · {p.changes.total} change{p.changes.total === 1 ? "" : "s"}
								{p.changes.flagged > 0 && ` · ${p.changes.flagged} flagged`} · {timeAgo(p.createdAt)}
							</div>
						</div>
						<StatusTag status={p.status} />
					</a>
				))
			)}
		</div>
	);
}
