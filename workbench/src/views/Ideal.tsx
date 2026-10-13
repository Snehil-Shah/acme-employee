import { useEffect, useState } from "react";
import { api } from "../api.ts";
import type { GrowthPoint, Trait, TraitHistoryEntry, WorkbenchState } from "../../shared/types.ts";
import { Quotes, timeAgo } from "../components.tsx";

export function IdealView({ state }: { state: WorkbenchState }) {
	const [open, setOpen] = useState<Trait | null>(null);

	return (
		<div className="page">
			<div className="page-head">
				<div>
					<p className="eyebrow">The ideal · main</p>
					<h1 className="title">What great looks like at {state.company}</h1>
					<p className="lede">Every trait got here through a decision you can trace. Open one to see why it exists.</p>
				</div>
				<a className="btn" href="#/ask">Ask the ideal →</a>
			</div>

			<Growth points={state.growth} />

			{state.traits.length === 0 ? (
				<div className="empty">
					<h3>Unexplored</h3>
					<p>The ideal has no traits yet. It knows it works at {state.company}, and nothing else.</p>
				</div>
			) : (
				<div className="traits">
					{state.traits.map((t) => (
						<div className="card trait" key={t.slug} onClick={() => setOpen(t)}>
							<h3>{t.title}</h3>
							<p>{t.summary}</p>
							<div className="trait-foot">Why is this here? →</div>
						</div>
					))}
				</div>
			)}

			{open && <TraitDrawer trait={open} onClose={() => setOpen(null)} />}
		</div>
	);
}

// The number of traits after each commit on main, as a step line.
function Growth({ points }: { points: GrowthPoint[] }) {
	const decisions = points.filter((p) => p.kind === "accepted" || p.kind === "reverted");
	const W = 1000;
	const H = 120;
	const pad = { l: 8, r: 8, t: 12, b: 12 };
	const max = Math.max(4, ...points.map((p) => p.traitCount));
	const x = (i: number) => pad.l + (points.length < 2 ? 0 : (i / (points.length - 1)) * (W - pad.l - pad.r));
	const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
	const line = points.map((p, i) => `${i ? "H" : "M"} ${x(i)} ${i ? `V ${y(p.traitCount)}` : y(p.traitCount)}`).join(" ");
	const area = `${line} V ${H - pad.b} H ${x(0)} Z`;
	const last = points.at(-1);

	return (
		<div className="card growth">
			<div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
				<div>
					<p className="label" style={{ margin: 0 }}>Growth</p>
				</div>
				<span className="muted" style={{ fontSize: 13 }}>
					{last?.traitCount ?? 0} traits · {decisions.length} decision{decisions.length === 1 ? "" : "s"}
				</span>
			</div>
			<svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Traits in the ideal over time">
				<line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" />
				{points.length > 1 && (
					<>
						<path d={area} fill="var(--ink)" opacity="0.05" />
						<path d={line} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
					</>
				)}
				{points.map((p, i) =>
					p.kind === "accepted" || p.kind === "reverted" ? (
						<circle key={p.commit} cx={x(i)} cy={y(p.traitCount)} r="5" fill={p.kind === "reverted" ? "var(--warn)" : "var(--ink)"} stroke="var(--surface)" strokeWidth="2.5">
							<title>{`${p.subject}${p.person ? ` · ${p.person}` : ""}`}</title>
						</circle>
					) : null,
				)}
			</svg>
		</div>
	);
}

function TraitDrawer({ trait, onClose }: { trait: Trait; onClose: () => void }) {
	const [history, setHistory] = useState<TraitHistoryEntry[] | null>(null);
	useEffect(() => {
		void api.traitHistory(trait.slug).then(setHistory);
	}, [trait.slug]);

	return (
		<>
			<div className="scrim" onClick={onClose} />
			<div className="drawer">
				<div className="drawer-head">
					<h2>{trait.title}</h2>
					<button className="btn quiet" onClick={onClose} aria-label="Close">✕</button>
				</div>
				<div className="drawer-body">
					<div className="doc" style={{ padding: 0 }}>
						<p className="doc-summary" style={{ marginTop: 0 }}>{trait.summary}</p>
						<p className="doc-meaning">{trait.meaning}</p>
						<p className="doc-list-label">You'll see it when</p>
						<ul>{trait.signals.map((s) => <li key={s}>{s}</li>)}</ul>
						{trait.not.length > 0 && (
							<>
								<p className="doc-list-label">It isn't</p>
								<ul>{trait.not.map((s) => <li key={s}>{s}</li>)}</ul>
							</>
						)}
					</div>
					<div>
						<p className="label">Why it's here</p>
						{!history && <span className="muted">Loading…</span>}
						{history?.map((h) => (
							<div className="history-item" key={h.commit}>
								<div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
									<strong>{h.subject}</strong>
									<code className="faint">{h.commit.slice(0, 7)}</code>
								</div>
								{h.rationale && <p className="why" style={{ fontSize: 16, marginBottom: 12 }}>{h.rationale}</p>}
								{h.evidence.length > 0 && <Quotes evidence={h.evidence} />}
								<div className="moment-meta" style={{ marginTop: 10 }}>
									{h.source && <>From <a href={`#/pulls/${h.source}`} onClick={onClose}><u>{h.person ?? h.source}</u></a> · </>}
									approved by {h.approver} · {timeAgo(h.at)}
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</>
	);
}
