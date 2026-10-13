# Acme's ideal employee

> A demo company running [the-employee](https://github.com/Snehil-Shah/the-employee). This repo *is* the agent, and its history is how Acme's idea of "great" took shape.

Acme is fictional. Every hire, rejection and exit here comes from interviewers' written reviews, which a curator agent reads to propose how Acme's ideal employee should change. A fairness reviewer checks each proposal for demographic proxies, and a person decides what lands. The git history never names a candidate, an employee or an interviewer; the pull request titles show the name entered in the demo, and every name in the demo's examples is made up.

It started from the template's first commit with no traits at all. Everything on `main` after that is a decision.

## Reading this repo

**The ideal, right now.** `main`. Each trait is a file in [`traits/`](traits/), and [`SOUL.md`](SOUL.md) lists them.

**How it grew.** Each accepted hire, rejection or exit is one squashed commit on `main`, titled like `HIRED: Alice (Engineering Manager)`, so `git log --oneline main` is the ideal's timeline.

**Why a trait is here.** Each decision's commit lists the changes it accepted and its `Source`. The curator's original commits, with each change's rationale in the message and the evidence in its trailers, are on that source's `proposal/<source>` branch:

```sh
git log --format='%h %s%n%(trailers:key=Evidence)' proposal/<source>
```

**What was proposed.** One `proposal/<source>` branch per hire, rejection or exit, with one commit per proposed change, and a pull request describing each change, its evidence and its fairness verdict. Accepting a proposal squash-merges its pull request; declined ones stay unmerged as the roads not taken.

**Fairness verdicts and decisions.** These are git notes, which GitHub doesn't display. Fetch them to read them:

```sh
git fetch origin 'refs/notes/*:refs/notes/*'
git log --notes=fairness --notes=decisions proposal/<source>
```

## The workbench

[`workbench/`](workbench/) is the web app that drives this repo, live at **https://the-employee.fly.dev**: add a hire, rejection or exit, watch the agents work, and accept or decline each proposal. It runs the agents with GitAgent and mirrors everything here as a GitHub App, so every proposal is a pull request and every accepted one is squash-merged. See its [README](workbench/README.md).

## Talking to it

Requires Node 20+, git, [GitAgent](https://github.com/open-gitagent/gitagent) (`npm install -g @open-gitagent/gitagent`) and `ANTHROPIC_API_KEY`.

```sh
git clone https://github.com/Snehil-Shah/acme-employee && cd acme-employee
gitagent --dir . -p "It's 2am and production is down. What do you do?"
```

It answers from the traits on the commit you have checked out, so `git checkout <older commit>` lets you ask the ideal as it was.

## How it works

The curator, the fairness reviewer, their tools and the rules they follow come from the template; see [`CONVENTIONS.md`](CONVENTIONS.md) and [the-employee](https://github.com/Snehil-Shah/the-employee) for the details. `npm test` exercises every tool, hook and decision without a model or API key.
