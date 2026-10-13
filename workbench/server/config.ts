import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

// The company repo (created from the-employee template) that this workbench drives.
export const REPO = resolve(process.env.EMPLOYEE_REPO || "..");
export const COMPANY = process.env.COMPANY_NAME || "Acme";

// Workbench-only data: the event log with people's names and raw reviews.
// Never part of the company repo.
export const DATA = resolve(process.env.WORKBENCH_DATA || ".data");

if (!existsSync(join(REPO, "agent.yaml"))) {
	throw new Error(`No agent at ${REPO}. Set EMPLOYEE_REPO to a repo created from the-employee template.`);
}

// The company repo's own helpers (trait format, decisions). Using them, rather
// than re-implementing, keeps the workbench to the repo's conventions.
const lib = (name: string) => import(pathToFileURL(join(REPO, "lib", name)).href);

export const ideal: {
	parseTrait: (text: string) => Omit<import("../shared/types.ts").Trait, "slug">;
	listTraitsAt: (root: string, ref: string) => import("../shared/types.ts").Trait[];
} = await lib("ideal.mjs");

export const decide: {
	accept: (root: string, sourceId: string, approver: Person, title?: string) => string;
	revert: (root: string, sourceId: string, approver: Person, reason?: string) => string;
	acceptedAs: (root: string, sourceId: string) => string | null;
	acceptMessage: (root: string, sourceId: string, title?: string) => { title: string; body: string };
	catchUp: (root: string, sourceId: string, approver: Person) => boolean;
} = await lib("decide.mjs");

export interface Person {
	name: string;
	email: string;
}
