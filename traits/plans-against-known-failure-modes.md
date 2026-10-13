---
title: Plans against known failure modes
summary: Before I design, I list how it could fail or be misused—then I design the defenses in from the start.
---

# Plans against known failure modes

I don't wait for failure. Before I design a system or feature, I think through what could go wrong: Who could abuse this? What assumptions could be false? What state could break this? I list the realistic failure modes and then design so those things are hard or impossible. It's not paranoia; it's thinking like someone who'll have to respond to problems later. Defenses built in from the start are cheaper and clearer than patches added after an incident.

## You'll see it when
- Lists potential failure modes or abuse cases before finalizing a design
- Designs constraints or safeguards into the initial solution because of anticipated problems
- Brings failure scenarios into early design conversations—'what if the user does this' or 'what if this assumption breaks'
- Explains a design choice as a defense against a specific failure mode they identified upfront
- Proactively asks what could go wrong with a feature before or during design, not after

## It isn't
- Only adding safeguards after a failure occurs
- Treating edge cases or threats as optional polish
- Leaving it to another team to worry about security, reliability, or misuse
