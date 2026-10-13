# Employee Workbench

A workbench for [the-employee](https://github.com/Snehil-Shah/the-employee): add a hire, a rejection or an exit, watch the curator and fairness reviewer work, review their proposals as pull requests, and decide what becomes part of the ideal.

It lives in, and drives, a company repo created from the the-employee template (by default the repo it sits in, `..`). Everything the agents produce lives in that repo's git history: proposals are branches, evidence is commit trailers, fairness verdicts and your decisions are git notes, and the ideal is `main`. The workbench itself only keeps people's names and the raw reviews, locally in `.data/`.

## Run it

```sh
npm install
cp .env.example .env      # then set ANTHROPIC_API_KEY (and AGENT_MODEL for a cheaper model)
npm run dev               # http://localhost:4317
```

## Screens

- **Overview**: every hire, rejection and exit on a timeline, and where its proposal stands. The ask bar at the top opens a conversation with the ideal employee: click it and the overview folds away into a chat.
- **New event**: the type, the person (kept in the workbench only), the role, and each interviewer's focus, recommendation and assessment (or exit notes). Examples are one click away.
- **Proposals**: one per event (a `proposal/<source>` branch). Inside: the agents working live, then each proposed change as a redline of the trait, with the curator's rationale, the quoted evidence and the fairness verdict. Accept or decline each change; revert later if needed.
- **The ideal**: the traits on `main`, a growth chart of how they got there, and for any trait, its full history: which event shaped it, the evidence, who approved it.

## Demo script

The examples tell a short story. Add them in this order:

1. **Hire · Priya**: the curator proposes the first traits. Accept them.
2. **Rejection · complexity**: two interviewers saw the same behaviour, so it clears the two-reviewer bar and sharpens the ideal.
3. **Exit · Sam**: an exit corrects the ideal, and may conclude the fix belongs to the company instead.
4. **Rejection · biased reasons**: "accent", "culture fit", "low energy". Watch the agents refuse to learn from it, or the fairness reviewer flag it.
5. **Hire · Alice**: then ask the ideal, from the overview, how it handles disagreement.

## How it works

```
server/      API served by the Vite dev server
  agents.ts  runs the repo's curator and fairness agents via the GitAgent SDK, streams their steps
  repo.ts    reads proposals, decisions and the growth of main from git; accept/decline/revert
  store.ts   the local event log (names, raw reviews)
shared/      types and example events shared with the browser
src/         React UI
```

Decisions go through the company repo's own `lib/decide.mjs`, so the curator stays the author of every accepted change and you are its committer.
