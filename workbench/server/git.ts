import { execFileSync } from "node:child_process";
import { REPO, type Person } from "./config.ts";

// Arguments go through argv, never a shell string.
export function git(args: string[], opts: { cwd?: string; input?: string; as?: Person } = {}): string {
	const env = { ...process.env };
	if (opts.as) {
		env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = opts.as.name;
		env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = opts.as.email;
	}
	return execFileSync("git", args, {
		cwd: opts.cwd ?? REPO,
		env,
		input: opts.input,
		encoding: "utf-8",
		stdio: ["pipe", "pipe", "pipe"],
		maxBuffer: 32 * 1024 * 1024,
	}).trimEnd();
}

export function tryGit(args: string[], opts?: Parameters<typeof git>[1]): string | null {
	try {
		return git(args, opts);
	} catch {
		return null;
	}
}

// The person approving decisions: whoever the company repo's git config says.
export function approver(): Person {
	return {
		name: tryGit(["config", "user.name"]) || "Head of People",
		email: tryGit(["config", "user.email"]) || "people@example.com",
	};
}

const SEP = "\x1f";
const END = "\x1e";

// One record per commit, fields split on unit separators so messages can
// contain anything.
export function logRecords(args: string[], fields: string[]): string[][] {
	const out = git(["log", `--format=${fields.join(SEP)}${END}`, ...args]);
	return out
		.split(END)
		.map((r) => r.replace(/^\n/, ""))
		.filter(Boolean)
		.map((r) => r.split(SEP));
}

export function trailerValues(raw: string): string[] {
	return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}
