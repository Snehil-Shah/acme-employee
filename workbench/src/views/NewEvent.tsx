import { useState } from "react";
import { api } from "../api.ts";
import { PRESETS } from "../../shared/presets.ts";
import { RECOMMENDATIONS, type NewEvent, type Review, type SourceType } from "../../shared/types.ts";
import { TYPE_LABEL } from "../components.tsx";

const blankReview = (): Review => ({ focus: "", recommendation: "yes", assessment: "" });
const blank = (type: SourceType): NewEvent => ({
	type,
	person: "",
	role: "",
	notes: "",
	reviews: type === "exit" ? [] : [blankReview(), blankReview()],
});

export function NewEventDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
	const [form, setForm] = useState<NewEvent>(blank("hire"));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const set = (patch: Partial<NewEvent>) => setForm((f) => ({ ...f, ...patch }));
	const setReview = (i: number, patch: Partial<Review>) =>
		set({ reviews: form.reviews.map((r, j) => (j === i ? { ...r, ...patch } : r)) });

	const switchType = (type: SourceType) =>
		setForm((f) => ({
			...f,
			type,
			reviews: type === "exit" ? [] : f.reviews.length ? f.reviews : [blankReview(), blankReview()],
		}));

	const submit = async () => {
		setBusy(true);
		setError(null);
		try {
			const { event } = await api.createEvent(form);
			onCreated(event.id);
		} catch (err) {
			setError((err as Error).message);
			setBusy(false);
		}
	};

	return (
		<>
			<div className="scrim" onClick={onClose} />
			<div className="drawer" role="dialog" aria-label="New event">
				<div className="drawer-head">
					<div>
						<h2>New event</h2>
						<p className="muted" style={{ margin: "8px 0 0" }}>
							Names stay in this workbench. The curator only sees the role and what the interviewers wrote.
						</p>
					</div>
					<button className="btn quiet" onClick={onClose} aria-label="Close">✕</button>
				</div>

				<div className="drawer-body">
					<div>
						<p className="label">Start from an example</p>
						<div className="chips">
							{PRESETS.map((p) => (
								<button key={p.label} className="chip" onClick={() => setForm(structuredClone(p.event))}>
									{p.label}
									<small>{p.hint}</small>
								</button>
							))}
						</div>
					</div>

					<div className="segmented" role="tablist">
						{(["hire", "reject", "exit"] as SourceType[]).map((t) => (
							<button key={t} className={form.type === t ? "on" : ""} onClick={() => switchType(t)}>
								{TYPE_LABEL[t]}
							</button>
						))}
					</div>

					<div className="row" style={{ alignItems: "stretch" }}>
						<div className="field" style={{ flex: 1 }}>
							<label>{form.type === "exit" ? "Employee" : "Candidate"}</label>
							<input className="input" value={form.person} onChange={(e) => set({ person: e.target.value })} placeholder="Alice Chen" />
						</div>
						<div className="field" style={{ flex: 1 }}>
							<label>Role</label>
							<input className="input" value={form.role} onChange={(e) => set({ role: e.target.value })} placeholder="Engineering Manager" />
						</div>
					</div>

					{form.type === "exit" ? (
						<div className="field">
							<label>Exit notes (from HR or the manager)</label>
							<textarea
								className="textarea"
								style={{ minHeight: 180 }}
								value={form.notes}
								onChange={(e) => set({ notes: e.target.value })}
								placeholder="Why they're leaving, in their words where possible."
							/>
						</div>
					) : (
						<div className="stack">
							<p className="label" style={{ margin: 0 }}>Interviewer reviews</p>
							{form.reviews.map((r, i) => (
								<div className="card" key={i} style={{ padding: 14, background: "var(--paper)" }}>
									<div className="row" style={{ marginBottom: 10 }}>
										<span style={{ whiteSpace: "nowrap", font: "18px/1 var(--serif)" }}>Interviewer {i + 1}</span>
										<input
											className="input"
											value={r.focus}
											onChange={(e) => setReview(i, { focus: e.target.value })}
											placeholder="Focus, e.g. system design"
										/>
										<select
											className="select"
											style={{ width: 140 }}
											value={r.recommendation}
											onChange={(e) => setReview(i, { recommendation: e.target.value as Review["recommendation"] })}
										>
											{RECOMMENDATIONS.map((rec) => <option key={rec}>{rec}</option>)}
										</select>
										{form.reviews.length > 1 && (
											<button className="btn quiet sm" onClick={() => set({ reviews: form.reviews.filter((_, j) => j !== i) })} aria-label="Remove">
												✕
											</button>
										)}
									</div>
									<textarea
										className="textarea"
										value={r.assessment}
										onChange={(e) => setReview(i, { assessment: e.target.value })}
										placeholder="What they observed, in their own words."
									/>
								</div>
							))}
							<button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => set({ reviews: [...form.reviews, blankReview()] })}>
								+ Add interviewer
							</button>
							{form.type === "reject" && (
								<p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
									A rejection only changes the ideal when at least two interviewers point at the same behaviour.
								</p>
							)}
						</div>
					)}
				</div>

				<div className="drawer-foot">
					<span style={{ color: "var(--danger)", fontSize: 13 }}>{error}</span>
					<div className="row">
						<button className="btn" onClick={onClose}>Cancel</button>
						<button className="btn ink" disabled={busy} onClick={submit}>
							{busy ? "Sending…" : "Send to the curator"}
						</button>
					</div>
				</div>
			</div>
		</>
	);
}
