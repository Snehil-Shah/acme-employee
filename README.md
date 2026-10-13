# Acme's ideal employee

> A demo company running [the-employee](https://github.com/Snehil-Shah/the-employee). This repo *is* the agent, and its history is how Acme's idea of "great" took shape.

Acme is fictional. Every hire, rejection and exit here comes from interviewers' written reviews, which a curator agent reads to propose how Acme's ideal employee should change. A fairness reviewer checks each proposal for demographic proxies, and a person decides what lands. Nothing in this repo names a candidate, an employee or an interviewer.

It started from the template's first commit with no traits at all. Everything on `main` after that is a decision.

## Reading this repo

**The ideal, right now.** `main`. Each trait is a file in [`traits/`](traits/), and [`SOUL.md`](SOUL.md) lists them.

**Why a trait is here.** Every accepted change is a commit authored by the curator and committed by whoever approved it, with the evidence in its trailers:

```sh
git log --format='%h %s%n  proposed by %an, approved by %cn%n%(trailers:key=Evidence)' -- traits/<slug>.md
```

**What was proposed.** One `proposal/<source>` branch per hire, rejection or exit, with one commit per proposed change, and a pull request describing each change, its evidence and its fairness verdict. Changes that weren't accepted stay on their branch as the roads not taken.

**Fairness verdicts and decisions.** These are git notes, which GitHub doesn't display. Fetch them to read them:

```sh
git fetch origin 'refs/notes/*:refs/notes/*'
git log --notes=fairness --notes=decisions proposal/<source>
```

## Talking to it

Requires Node 20+, git, [GitAgent](https://github.com/open-gitagent/gitagent) (`npm install -g @open-gitagent/gitagent`) and `ANTHROPIC_API_KEY`.

```sh
git clone https://github.com/Snehil-Shah/acme-employee && cd acme-employee
gitagent --dir . -p "It's 2am and production is down. What do you do?"
```

It answers from the traits on the commit you have checked out, so `git checkout <older commit>` lets you ask the ideal as it was.

## How it works

The curator, the fairness reviewer, their tools and the rules they follow come from the template; see [`CONVENTIONS.md`](CONVENTIONS.md) and [the-employee](https://github.com/Snehil-Shah/the-employee) for the details. `npm test` exercises every tool, hook and decision without a model or API key.
