import { useCallback, useEffect, useState } from "react";
import { api } from "./api.ts";
import type { WorkbenchState } from "../shared/types.ts";
import { ActivityView } from "./views/Activity.tsx";
import { PullsView } from "./views/Pulls.tsx";
import { PullRequestView } from "./views/PullRequest.tsx";
import { IdealView } from "./views/Ideal.tsx";
import { NewEventDrawer } from "./views/NewEvent.tsx";

// Hash routes: #/activity, #/ask (the overview with the chat open), #/pulls, #/pulls/<source-id>, #/ideal
function useRoute(): string[] {
	const read = () => window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
	const [route, setRoute] = useState(read);
	useEffect(() => {
		const onChange = () => setRoute(read());
		window.addEventListener("hashchange", onChange);
		return () => window.removeEventListener("hashchange", onChange);
	}, []);
	return route;
}

export function go(path: string) {
	window.location.hash = `#/${path}`;
}

export function App() {
	const [state, setState] = useState<WorkbenchState | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [composing, setComposing] = useState(false);
	const [section = "activity", id] = useRoute();

	const refresh = useCallback(async () => {
		try {
			setState(await api.state());
			setError(null);
		} catch (err) {
			setError((err as Error).message);
		}
	}, []);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	// While any agent run is in progress, keep counts and statuses fresh.
	const running = state?.events.some((e) => e.run.status === "running");
	useEffect(() => {
		if (!running) return;
		const t = setInterval(refresh, 2500);
		return () => clearInterval(t);
	}, [running, refresh]);

	if (error && !state) {
		return (
			<div className="empty">
				<h3>The workbench can't reach the company repo</h3>
				<p>{error}</p>
			</div>
		);
	}
	if (!state) return <div className="empty">Loading…</div>;

	const waiting = state.pulls.filter((p) => p.status === "open").length;
	const nav = [
		{ key: "activity", label: "Overview" },
		{ key: "pulls", label: "Proposals", count: waiting },
		{ key: "ideal", label: "The ideal", count: state.traits.length },
	];
	const overview = section === "activity" || section === "ask";

	return (
		<div className="app">
			<aside className="sidebar">
				<div className="wordmark">
					<div className="wordmark-name">The Employee</div>
					<div className="wordmark-company">{state.company}</div>
				</div>
				<nav className="nav">
					{nav.map((n) => (
						<a key={n.key} href={`#/${n.key}`} className={section === n.key || (n.key === "activity" && overview) ? "active" : ""}>
							{n.label}
							{!!n.count && <span className="count">{n.count}</span>}
						</a>
					))}
				</nav>
				<button className="btn ink" onClick={() => setComposing(true)}>New event</button>
				<div className="sidebar-foot">
					<div className="status-line">
						<span className={`dot ${running ? "live" : state.hasApiKey ? "ok" : "bad"}`} />
						{running ? "Agents working" : state.hasApiKey ? "Agents ready" : "No model key"}
					</div>
					<div>Approving as {state.approver}</div>
					{state.remaining.runs !== null && (
						<div>
							Today: {state.remaining.runs} agent runs, {state.remaining.asks} questions left
						</div>
					)}
					{state.repoUrl && (
						<a href={state.repoUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
							The repo on GitHub ↗
						</a>
					)}
				</div>
			</aside>

			<main className="main">
				{!state.hasApiKey && (
					<div className="notice">
						The agents need a model key: add <code>ANTHROPIC_API_KEY</code> to <code>.env</code> and restart.
					</div>
				)}
				{/* One slot for both routes, so opening the chat doesn't remount the page. */}
				{overview && (
					<ActivityView
						state={state}
						chatting={section === "ask"}
						onChatChange={(open) => go(open ? "ask" : "activity")}
						onNew={() => setComposing(true)}
					/>
				)}
				{section === "pulls" && !id && <PullsView state={state} />}
				{section === "pulls" && id && <PullRequestView id={id} onChange={refresh} />}
				{section === "ideal" && <IdealView state={state} />}
			</main>

			{composing && (
				<NewEventDrawer
					onClose={() => setComposing(false)}
					onCreated={async (newId) => {
						setComposing(false);
						await refresh();
						go(`pulls/${newId}`);
					}}
				/>
			)}
		</div>
	);
}
