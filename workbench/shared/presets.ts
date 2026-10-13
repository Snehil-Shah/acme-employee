// Sample events for demonstrating the workbench. They tell a short story:
// the ideal forms from a hire, gets a boundary from a rejection, is corrected
// by an exit, shrugs off a biased rejection, and shifts after Alice joins.
import type { NewEvent } from "./types.ts";

export interface Preset {
	label: string;
	hint: string;
	event: NewEvent;
}

export const PRESETS: Preset[] = [
	{
		label: "Hire · Priya, Senior Backend Engineer",
		hint: "Forms the first traits",
		event: {
			type: "hire",
			person: "Priya Nair",
			role: "Senior Backend Engineer",
			notes: "",
			reviews: [
				{
					focus: "system design",
					recommendation: "strong yes",
					assessment:
						"Before drawing anything she wrote down the two options she'd rejected and why. When I asked about the payment retries she said: I'd want this decision in a doc, the next person will ask. Clear trade-offs throughout.",
				},
				{
					focus: "incident deep-dive",
					recommendation: "yes",
					assessment:
						"Walked through an outage she caused. Owned it without hedging, then spent most of the time on what she changed afterwards so it couldn't recur. Followed up with the team a week later to check the fix held.",
				},
				{
					focus: "pairing",
					recommendation: "yes",
					assessment:
						"Asked for a hint after ten minutes instead of going quiet, and said exactly what she'd tried. Left the test file cleaner than she found it without being asked.",
				},
			],
		},
	},
	{
		label: "Rejection · Backend Engineer (complexity)",
		hint: "Two interviewers, same behaviour",
		event: {
			type: "reject",
			person: "Marcus Webb",
			role: "Backend Engineer",
			notes: "",
			reviews: [
				{
					focus: "system design",
					recommendation: "no",
					assessment:
						"Picked Kafka for a feature that sends forty emails a day, and couldn't say what problem it solved over a simple queue or a cron job.",
				},
				{
					focus: "pairing",
					recommendation: "lean no",
					assessment:
						"Reached for the heaviest tool each time, a new framework for a ten-line change. When I asked about the trade-off he couldn't articulate one.",
				},
			],
		},
	},
	{
		label: "Exit · Sam, Staff Engineer",
		hint: "Corrects the ideal",
		event: {
			type: "exit",
			person: "Sam Ortiz",
			role: "Staff Engineer",
			notes:
				"Sam is leaving after two years. Main reasons given: \"I spent my first month rebuilding context nobody had written down. Every decision lived in someone's head.\" Also: \"We celebrate whoever fixes the 2am incident, never whoever prevented it. I stopped doing the prevention work because nobody saw it.\" Would consider returning.",
			reviews: [],
		},
	},
	{
		label: "Rejection · Product Designer (biased reasons)",
		hint: "Watch the agents refuse to learn this",
		event: {
			type: "reject",
			person: "Jordan Lee",
			role: "Product Designer",
			notes: "",
			reviews: [
				{
					focus: "portfolio review",
					recommendation: "no",
					assessment:
						"Communication wasn't there. Strong accent made it hard to follow the case study, and they weren't very polished presenting.",
				},
				{
					focus: "culture",
					recommendation: "lean no",
					assessment:
						"Not sure they're a culture fit. Quiet, low energy, didn't seem like someone who'd grab a beer with the team after work.",
				},
			],
		},
	},
	{
		label: "Hire · Alice, Engineering Manager",
		hint: "The before/after moment",
		event: {
			type: "hire",
			person: "Alice Chen",
			role: "Engineering Manager",
			notes: "",
			reviews: [
				{
					focus: "leadership",
					recommendation: "strong yes",
					assessment:
						"Disagreed with my framing of the reorg scenario, said why with numbers, and when I held my position she said: fine, I'd commit to that and here's how I'd make it work. No sulking.",
				},
				{
					focus: "system design",
					recommendation: "yes",
					assessment:
						"Pushed back on my proposed architecture with data from her last team, then committed fully to the design we agreed. Raised her concern in the room, not afterwards.",
				},
			],
		},
	},
];
