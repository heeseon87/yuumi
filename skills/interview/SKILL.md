---
name: yuumi:interview
description: Use when a plan or spec needs pressure-testing before you build it — finds the holes through an in-depth interview rather than a passive review
version: 1.5.4
argument-hint: [plan]
---

Read the plan file `$1` and interview the user about it in depth: technical implementation, UI & UX, concerns, tradeoffs, edge cases — anything that materially shapes what gets built. If no file is given, interview about the plan under discussion in the conversation; if there is none, ask for the file path before starting.

The questions must not be obvious. A question earns its slot when the plan does not already answer it and the answer would change the work. Mine where plans usually stay silent:

- decisions the plan implies but never states (data shapes, ordering, ownership, naming)
- requirements that conflict once pushed against each other
- failure modes: an input missing, a step dying halfway, a dependency down
- operational reality: migration, rollback, monitoring, cost
- scope edges: what is deliberately *not* built, and whether the user agrees it isn't

Ask with a structured question tool (such as AskUserQuestion) when the agent provides one; where none exists, ask in plain text as a short numbered list. Either way: small rounds (2–4 questions), never re-ask what an earlier answer settled, and let each round build on the last.

Continue until the interview is genuinely complete: every major decision has an answer and a fresh round from a new angle (implementation, UX, failure, operations, scope) surfaces nothing new. Don't stop early because several rounds have passed; don't pad rounds to look thorough.

Then write the refined spec back **into the plan file itself** — that file remains the single source of truth the user builds from. Fold the answers into the document's own structure; do not append a Q&A transcript. Close by telling the user what materially changed.
