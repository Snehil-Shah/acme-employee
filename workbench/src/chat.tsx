import { useEffect, useRef, useState } from "react";
import { streamAsk } from "./api.ts";

export const SUGGESTIONS = [
	"It's 2am and production is down. What do you do?",
	"You disagree with your manager's plan. What happens next?",
	"What would you push back on in your first month here?",
	"How do you decide what's worth writing down?",
];

export interface Turn {
	role: "user" | "ideal";
	text: string;
	read?: string[];
	pending?: boolean;
	error?: string;
}

// A conversation with the ideal: each question streams one answer, and the
// earlier turns go along as context.
export function useChat() {
	const [turns, setTurns] = useState<Turn[]>([]);
	const busy = turns.at(-1)?.pending ?? false;

	const updateLast = (patch: (t: Turn) => Turn) => setTurns((all) => [...all.slice(0, -1), patch(all.at(-1)!)]);

	const ask = async (question: string) => {
		if (!question.trim() || busy) return;
		const history = turns.filter((t) => !t.error).map(({ role, text }) => ({ role, text }));
		setTurns((all) => [...all, { role: "user", text: question }, { role: "ideal", text: "", read: [], pending: true }]);
		try {
			await streamAsk(question, history, (c) => {
				if (c.kind === "text") updateLast((t) => ({ ...t, text: t.text + (c.text ?? "") }));
				else if (c.kind === "tool") updateLast((t) => ({ ...t, read: [...(t.read ?? []), c.text ?? ""] }));
				else if (c.kind === "error") updateLast((t) => ({ ...t, error: c.text }));
			});
		} catch (err) {
			updateLast((t) => ({ ...t, error: (err as Error).message }));
		}
		updateLast((t) => ({ ...t, pending: false }));
	};

	return { turns, busy, ask };
}

export function Thread({ turns, onPick, disabled }: { turns: Turn[]; onPick: (q: string) => void; disabled: boolean }) {
	const end = useRef<HTMLDivElement>(null);
	useEffect(() => {
		end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
	}, [turns]);

	if (turns.length === 0) {
		return (
			<div className="thread-empty">
				<p className="label">Try asking</p>
				<div className="suggest">
					{SUGGESTIONS.map((s) => (
						<button key={s} className="chip" onClick={() => onPick(s)} disabled={disabled}>{s}</button>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="thread">
			{turns.map((t, i) =>
				t.role === "user" ? (
					<div className="msg user" key={i}><div className="bubble">{t.text}</div></div>
				) : (
					<div className="msg ideal" key={i}>
						<div className="avatar">E</div>
						<div className="bubble">
							{!!t.read?.length && (
								<div className="reads">
									{t.read.map((r, j) => <span key={j} className="tag plain">read {r.replace(/-/g, " ")}</span>)}
								</div>
							)}
							<span className={t.pending ? "typing" : ""}>{t.text.trim()}</span>
							{t.error && <div style={{ color: "var(--danger)" }}>{t.error}</div>}
						</div>
					</div>
				),
			)}
			<div ref={end} />
		</div>
	);
}
