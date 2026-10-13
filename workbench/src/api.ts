import type { NewEvent, PullRequest, TraitHistoryEntry, WorkbenchState, AgentStep } from "../shared/types.ts";

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
	const res = await fetch(url, {
		method,
		headers: body ? { "content-type": "application/json" } : undefined,
		body: body ? JSON.stringify(body) : undefined,
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
	return data as T;
}

export const api = {
	state: () => request<WorkbenchState>("GET", "/api/state"),
	createEvent: (e: NewEvent) => request<{ event: { id: string } }>("POST", "/api/events", e),
	rerun: (id: string) => request("POST", `/api/events/${id}/run`),
	pull: (id: string) => request<PullRequest>("GET", `/api/pulls/${id}`),
	decide: (id: string, action: "accept" | "decline" | "revert", reason?: string) =>
		request<PullRequest>("POST", `/api/pulls/${id}/${action}`, { reason }),
	traitHistory: (slug: string) => request<TraitHistoryEntry[]>("GET", `/api/traits/${slug}/history`),
};

// Live agent activity for one event. Replays what already happened, then
// streams the rest; calls onEnd once the run is over.
export function streamRun(id: string, onStep: (s: AgentStep) => void, onEnd: () => void): () => void {
	const source = new EventSource(`/api/events/${id}/stream`);
	source.onmessage = (m) => {
		const data = JSON.parse(m.data);
		if (data.kind === "end") {
			source.close();
			onEnd();
		} else onStep(data);
	};
	source.onerror = () => {
		source.close();
		onEnd();
	};
	return () => source.close();
}

export type AskChunk = { kind: "text" | "tool" | "error" | "end"; text?: string };

// Streams one answer from the ideal. History is the conversation so far.
export async function streamAsk(
	question: string,
	history: { role: "user" | "ideal"; text: string }[],
	onChunk: (c: AskChunk) => void,
	signal?: AbortSignal,
): Promise<void> {
	const res = await fetch("/api/ask", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ question, history }),
		signal,
	});
	if (!res.ok) {
		const { error } = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
		onChunk({ kind: "error", text: error });
		return;
	}
	const reader = res.body!.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		let i;
		while ((i = buffer.indexOf("\n\n")) !== -1) {
			const line = buffer.slice(0, i);
			buffer = buffer.slice(i + 2);
			// Skip anything that isn't data, such as the server's keepalive pings.
			if (line.startsWith("data: ")) onChunk(JSON.parse(line.slice(6)));
		}
	}
}
