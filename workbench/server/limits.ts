// Daily caps for the public demo, so an open URL can't run up the model bill.
// Counts reset at midnight UTC; set a cap to 0 to disable it.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DATA } from "./config.ts";

const CAPS = {
	runs: Number(process.env.DAILY_RUNS ?? 25),
	asks: Number(process.env.DAILY_ASKS ?? 150),
};
type Kind = keyof typeof CAPS;

const FILE = join(DATA, "limits.json");
const today = () => new Date().toISOString().slice(0, 10);

function load(): { day: string; used: Record<Kind, number> } {
	const fresh = { day: today(), used: { runs: 0, asks: 0 } };
	if (!existsSync(FILE)) return fresh;
	const saved = JSON.parse(readFileSync(FILE, "utf-8"));
	return saved.day === today() ? saved : fresh;
}

const NOUN: Record<Kind, string> = { runs: "agent runs", asks: "questions" };

// Returns an error message when the cap is reached; otherwise counts the use.
export function take(kind: Kind): string | null {
	if (!CAPS[kind]) return null;
	const state = load();
	if (state.used[kind] >= CAPS[kind]) {
		return `This public demo allows ${CAPS[kind]} ${NOUN[kind]} a day, and today's are used up. Try again tomorrow (UTC).`;
	}
	state.used[kind]++;
	mkdirSync(DATA, { recursive: true });
	writeFileSync(FILE, JSON.stringify(state));
	return null;
}

export function remaining(): Record<Kind, number | null> {
	const { used } = load();
	return {
		runs: CAPS.runs ? Math.max(0, CAPS.runs - used.runs) : null,
		asks: CAPS.asks ? Math.max(0, CAPS.asks - used.asks) : null,
	};
}
