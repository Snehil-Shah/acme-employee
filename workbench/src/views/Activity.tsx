import { useEffect, useRef, useState } from "react";
import type { WorkbenchState } from "../../shared/types.ts";
import { StatusTag, TYPE_LABEL, timeAgo } from "../components.tsx";
import { Thread, useChat } from "../chat.tsx";

// The overview and the conversation with the ideal are one page. Focusing the
// ask bar folds the overview away and grows the thread above the bar, so the
// bar itself becomes the chat's composer without losing focus.
export function ActivityView({
	state,
	chatting,
	onChatChange,
	onNew,
}: {
	state: WorkbenchState;
	chatting: boolean;
	onChatChange: (open: boolean) => void;
	onNew: () => void;
}) {
	const { turns, busy, ask } = useChat();
	const [draft, setDraft] = useState("");
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!chatting) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onChatChange(false);
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [chatting, onChatChange]);

	const submit = (q: string) => {
		if (!q.trim() || busy) return;
		onChatChange(true);
		setDraft("");
		void ask(q);
		input.current?.focus();
	};

	const decisions = state.growth.filter((g) => g.kind === "accepted" || g.kind === "reverted").length;
	const waiting = state.pulls.filter((p) => p.status === "open").length;
	const figures = [
		{ value: state.traits.length, label: "traits in the ideal" },
		{ value: state.events.length, label: "hires, rejections & exits" },
		{ value: waiting, label: "proposals awaiting you" },
		{ value: decisions, label: "decisions made" },
	];
	const pullFor = (id: string) => state.pulls.find((p) => p.sourceId === id);

	return (
		<div className={`overview ${chatting ? "chatting" : ""}`}>
			<header className="ov-hero">
				<div className="ov-eyebrow">
					<button className="back-link" onClick={() => onChatChange(false)} tabIndex={chatting ? 0 : -1}>
						← Overview
					</button>
					<p className="eyebrow">{state.company}</p>
				</div>
				<h1 className="title ov-title" key={chatting ? "chat" : "home"}>
					{chatting ? (
						<>Ask {state.company}'s ideal employee</>
					) : (
						<>
							The ideal employee, <em>learned from every decision.</em>
						</>
					)}
				</h1>
				<div className="fold">
					<div>
						<p className="lede">
							Each hire, rejection and exit goes to the curator. It proposes how the ideal should change, a fairness
							reviewer checks it, and you decide what lands.
						</p>
					</div>
				</div>
			</header>

			<div className="ov-thread">
				<Thread turns={turns} onPick={submit} disabled={!state.hasApiKey || busy} />
			</div>

			<form
				className="askbar"
				onSubmit={(e) => {
					e.preventDefault();
					submit(draft);
				}}
			>
				<span className="avatar">E</span>
				<input
					ref={input}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onFocus={() => onChatChange(true)}
					placeholder={
						state.traits.length
							? `Ask ${state.company}'s ideal employee how they'd handle something…`
							: `Ask ${state.company}'s ideal employee anything. It's still unexplored.`
					}
					disabled={!state.hasApiKey}
				/>
				<button className="btn ink" disabled={!draft.trim() || busy || !state.hasApiKey}>Ask</button>
			</form>

			<div className="fold ov-rest">
				<div>
					<div className="figures">
						{figures.map((f) => (
							<div className="figure" key={f.label}>
								<div className="figure-value">{f.value}</div>
								<div className="figure-label">{f.label}</div>
							</div>
						))}
					</div>

					{state.events.length === 0 ? (
						<div className="empty">
							<h3>Nobody has explored the ideal yet</h3>
							<p>Add a hire, a rejection or an exit, and the curator will propose its first traits.</p>
							<button className="btn ink" onClick={onNew}>Add the first event</button>
						</div>
					) : (
						<>
							<p className="label">Timeline</p>
							<div className="timeline">
								{state.events.map((e) => {
									const pull = pullFor(e.id);
									return (
										<a className="moment" key={e.id} href={`#/pulls/${e.id}`}>
											<span className={`moment-dot ${e.type}`} />
											<div>
												<div className="moment-title">{e.person}</div>
												<div className="moment-meta">
													{TYPE_LABEL[e.type]} · {e.role} · {timeAgo(e.createdAt)}
													{pull && pull.changes.total > 0 && ` · ${pull.changes.total} proposed change${pull.changes.total === 1 ? "" : "s"}`}
												</div>
											</div>
											{pull && <StatusTag status={pull.status} />}
										</a>
									);
								})}
							</div>
						</>
					)}
				</div>
			</div>
		</div>
	);
}
