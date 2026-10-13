import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./config.ts";
import type { CompanyEvent, NewEvent } from "../shared/types.ts";

const FILE = join(DATA, "events.json");

function load(): CompanyEvent[] {
	if (!existsSync(FILE)) return [];
	return JSON.parse(readFileSync(FILE, "utf-8"));
}

let events: CompanyEvent[] = load();

function save() {
	mkdirSync(DATA, { recursive: true });
	writeFileSync(FILE, JSON.stringify(events, null, 2));
}

export function allEvents(): CompanyEvent[] {
	return events;
}

export function getEvent(id: string): CompanyEvent | undefined {
	return events.find((e) => e.id === id);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);

// Source ids look like reject-2026-10-backend-engineer-02: readable in git,
// and they never contain the person's name.
function sourceId(e: NewEvent): string {
	const now = new Date();
	const prefix = `${e.type}-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${slug(e.role) || "role"}`;
	const n = events.filter((x) => x.id.startsWith(prefix)).length + 1;
	return `${prefix}-${String(n).padStart(2, "0")}`;
}

export function createEvent(input: NewEvent): CompanyEvent {
	const event: CompanyEvent = {
		...input,
		id: sourceId(input),
		createdAt: new Date().toISOString(),
		run: { status: "idle", steps: [] },
	};
	events = [event, ...events];
	save();
	return event;
}

export function updateEvent(id: string, patch: (e: CompanyEvent) => void) {
	const event = getEvent(id);
	if (!event) return;
	patch(event);
	save();
}
