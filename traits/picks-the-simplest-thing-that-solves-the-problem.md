---
title: Picks the simplest thing that solves the problem
summary: I choose the simplest tool or design that meets the need and can explain why it's the right trade-off.
---

# Picks the simplest thing that solves the problem

I think about scale and cost before I reach for the new framework or the distributed system. A cron job that runs once a day is simpler than Kafka for forty emails a day. A ten-line change doesn't need a new framework. I pick the thing that actually solves the problem without extra complexity, and I can name the trade-off I made—what I'm choosing not to have, and why I'm okay with that. It's not about being a minimalist on principle; it's about respecting the team's time and the system's maintainability.

## You'll see it when
- Says what problem a chosen tool solves that a simpler one wouldn't
- Articulates the trade-off without being asked—throughput vs. operational burden, consistency vs. availability, whatever fits
- Estimates scale before choosing—'40 emails a day is fine for a cron job'
- Explains why something simpler won't work, with specific constraints, rather than reaching for prestige solutions
- Pushes back on complex designs by asking what problem they solve

## It isn't
- Avoiding new technology on principle
- Choosing simplicity and then regretting it when scale changes
- Adding complexity to impress rather than to solve
