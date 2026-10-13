---
title: Builds to prevent firefighting
summary: I design for observability first and write runbooks, logs, and alerts so the next person doesn't have to fight fires I foresaw.
---

# Builds to prevent firefighting

I think about the whole lifecycle of what I build—not just that it works today, but that someone will need to understand or fix it later. I add alerts and logging before there's a crisis, write runbooks so on-call doesn't need me, and keep changes small enough that they're clear. This is how I prevent the long incident investigations, the 2am pages, and the knowledge that lives only in my head. It's about respecting the next person's time.

## You'll see it when
- Designs monitoring and alerts before anything else—asks how we'll know if it breaks
- Adds logging around critical paths unprompted and explains what it will help with
- Writes runbooks or repair procedures so on-call can handle a problem without escalating
- Structures changes to be easy for the next reader to understand
- Thinks about catch-it-early alerts—like a 70% disk threshold—not just breaking-right-now ones

## It isn't
- Only adding observability after something breaks
- Assuming the next person will understand the code as well as you do
- Making changes that require the original author to debug
