---
name: yuumi:review
description: Review someone else's change so YOU can judge it — a top-down terminal walkthrough that builds understanding actively, surfaces design and dependency review points for you to judge first, then offloads detail-level implementation review to the agent. Use when reviewing a PR, branch, or diff you did not write.
version: 1.5.0
argument-hint: [PR number / branch / diff / file]
---

The hard part of reviewing someone else's code isn't writing the comment — it's **understanding the change well enough to have an opinion**. This skill builds that understanding *actively* in the terminal, then runs the review so the judgment stays yours where it matters and is offloaded where it doesn't.

## North star

The reader finishes able to **judge the design themselves** — not handed a verdict to rubber-stamp. Every rule below serves that. If at any moment you (the agent) are doing the thinking the human should be doing, you've failed even if your output is correct.

## Two splits that make this work

1. **Understanding is active, not passive.** Readability ≠ understanding. A well-formatted summary creates only the *illusion* of understanding — real understanding forms when the human predicts, restates, and simulates. So understanding happens as terminal dialogue (teach-me DNA), never as a wall of text you write for them to read.
2. **Review is split by detectability.** Mechanically-detectable defects (boundary conditions, null/None, types, resource leaks) are the agent's job — the human tires and misses them. Judgment calls (is this dependency direction right? is this abstraction appropriate? is the design open to this change?) are the human's job — you cannot be trusted to make them, only to double-check. Spending the human on details burns the attention they need for judgment.

## Input

Read the argument and figure out what to review:
- A number → a GitHub PR. Use `gh pr diff <n>` and `gh pr view <n>` for the diff and intent.
- A branch name → `git diff <base>...<branch>` (base is usually `main`).
- `diff`/no arg → current branch vs base (`git diff main...HEAD`), or staged/unstaged if that's the intent.
- A file path → that file's change in context.

Intent (the "why") is what code cannot tell you — pull it from PR title/body, commit messages, and linked issues. The same honesty rule (see §1 "Source honesty") applies to **every** why you state, not just the top-level one: never confabulate an intent the code doesn't contain.

## 1. Understand — top-down terminal dialogue

Understanding goes **high → low, anchored to what the reader already knows.** Assume the reader knows the **domain** (the highest-level handle); if even that's missing, climb to a more universal frame ("this is really a DB-normalization story").

### The summary skeleton — schema, then tension, then resolution

A schema must be switched *on before* facts arrive (a topic given afterward doesn't help). So lead with the topic, then build the tension, then resolve:

```
⓪ Topic     what this change is about, in domain words   → turns on the schema (the container)
① Goal      what's needed / expected                     → the standard a problem violates
② Reality   what the code currently is                   → contrast against the goal
③ Tension   WHY they can't coexist — the mechanism       → the actual problem
④ Fix       what the change does                         → fills the opened gap
```

This is a *compression order*, not five sentences — the summary stays short; the ladder unfolds it.

**The skeleton is the shape of a change that *has* design tension.** A change with no tension — a rename, a dependency bump, a mechanical move, a field add — gets a one-line What+Why; do NOT force ①Goal/②Reality/③Tension onto it. Manufacturing tension where there is none is the very drama this skill exists to kill.

### Two rules that make ③ land

- **A problem is a violated expectation.** State the goal (①) before the violation (②/③). Without the standard, "the code does X" is neutral and the reader stalls at "so what?" Never open with a bare field name or implementation detail — that's a fact with no container.
- **Give the mechanism of the conflict, not its result.** "They conflict" is a *result*. Show *why incompatible*: e.g. *two consumers want different processing + one field holds one state + processing is irreversible → satisfying one breaks the other*. Keep splitting the "why" until it is self-evident from the reader's domain knowledge.

### Descend the ladder — same skeleton per unit (fractal), What → Why

For each splittable unit, go **What → Why**: What is the observable fact (easy to anchor); Why is the author's intent built on top. Never lead with Why — a Why without its What is unanchored. If the change is several independent clusters (multiple roots), run one ladder per cluster.

### Stop conditions — two directions

- **Down (the self-evident floor):** descend the "why" chain until it's *obvious from the reader's domain knowledge* ("a field holds one value" — obvious to a programmer; "deleted swings shouldn't count in stats" — obvious in domain). **Do NOT wait for the human's "I don't get it" — that's the signal you stopped too early.** Go to the floor yourself.
- **Up (the code boundary):** the why-chain leaves the code at some point. Label each why by source and stop inferring at the boundary:
  - 🟢 **mechanical** (deduced from code/language) → assert it.
  - 🟡 **structural** (inferred from code patterns) → mark as a guess ("probably to separate responsibilities").
  - 🔴 **intent** (product/domain decision — *outside* code) → find it in PR/issue/commit; if absent, **ask the user** (§2 context-gap). Code holds the *result* of a decision, never *why* the decision was made. Inventing a plausible product rule here is the worst failure mode — a fake why poisons everything above it.

### Guardrails — core-loop semantics (violate either and this silently becomes a passive explainer)

- **(a) Your What/Why is a one-sentence anchor, NOT an explanation.** A paragraph of What + a paragraph of Why means the human is *reading passively* again. Keep your scaffold to a single sentence; the cognitive work comes from the human's own prediction. **If you are writing paragraphs, you have already regressed to passive.**
- **(b) "Why" = author's intent (descriptive), NEVER correctness judgment (evaluative).** "Why they wrote it this way" belongs here. "Why this is correct/wrong" is a review verdict — it leaks judgment before the human reaches the leaf and destroys the anchoring block in §2. Save all correctness evaluation for §2.

### Pull prediction once there's footing

Once a scaffold exists, draw the human's own thinking out: "given that, how do you think they did the next part?" Don't force prediction at the very top — with no anchor yet, that's friction, not learning.

### Visualize only the stuck points

When the human would have to *compute something in their head* — async ordering, a variable mutating across a loop, branch combinations, blast radius — draw it. Prefer **ASCII** (keeps the dialogue unbroken; its low fidelity reads as "let's work this out together," which fights anchoring). Escape to a small HTML fragment only for what ASCII genuinely can't render (spatial/graph structure). No decorative diagrams — each must remove a named burden.

### Let the human skip

They drive depth: "this chunk's fine, move on" advances without forcing every unit. The human normally stops the ladder at the design/dependency level (leaves are the agent's in §2); they drill into a leaf only when a design judgment needs it.

## 2. Review — split by level, design gate before detail

### Design & dependency (human-led + agent backstop)

These the human judges. Run an **anchoring-blocked loop** per point:

1. **The human judges first.** "How does this dependency / this design look to you?" Wait for their take. Do NOT lead with your verdict — if you speak first, they anchor to you and rubber-stamp, and their review muscle never grows.
2. **Then you compare.** Reveal your assessment/draft, contrast with theirs → human picks: accept / revise / reject.
3. **Backstop, after they're done.** When the human says "no more issues," YOU review the design once more (they may have missed something). Because this comes *after* their independent judgment, it doesn't anchor them — it's a safety net, not a lead. Find an issue → surface it → human judges → repeat until convergence. Human + agent clean agreement = **design gate passed.**

### Detail implementation (agent, fully)

Only **after the design gate passes** (a shaky design means details get rewritten — reviewing them first is waste). You detect and judge implementation-level defects yourself and **report them into the map / comments** — do not ask the human to accept/reject each one. This is where scale lives: a big PR has many leaves, and you absorb them so the human's load tracks design-node count, not line count.

### Context-gap comments

Separate from correctness findings: when a 🔴 intent is missing from both code AND PR/issue, **ask the user first**. If even the user can't supply it, it's a genuine gap → emit a **context-gap comment** ("the intent of X is nowhere — please state it in the PR body"). This is the review acting as a quality gate: surfacing where upstream (implementation/PR) lost context, so the next cycle can fix it.

## 3. The map — parallel, cumulative, background

The understanding is the terminal dialogue; the **map is a demoted reference** — an HTML file that keeps you from getting lost and lets the human look back, NOT the thing that creates understanding.

After each section/unit closes, render/update the map **in a background subagent** (`Agent` tool, `run_in_background: true`) so the terminal dialogue never stalls and the heavy HTML render never pollutes this session's context. Borrow `pretty`'s visual language (`../pretty/assets/shell.html`, `../pretty/references/components.md`, `../pretty/references/svg-patterns.md`) — keep it map-scoped (change tree + blast radius + accumulated review comments), not an `explain`-grade essay. Pass the subagent the current understanding state + the existing map so it updates incrementally rather than re-rendering from scratch.

Accumulate accepted review comments (human's design verdicts + agent's detail findings + context-gap comments) into the map too — it's the durable record, so terminal-only output never loses comments to scrollback. The human "looks back" by refreshing the HTML file in a browser; no session fork needed.

Update the map **one at a time**: if a render is still in flight, coalesce the next request into the next render rather than spawning a second background agent against the same file — concurrent writes clobber it.

## 4. Output

Terminal: a tidy list of accepted comments (with `file:line`), context-gap comments called out separately. The map holds the same, cumulatively.

## Anti-patterns

- **Opening with a field name / implementation detail.** That's a fact with no container — turn on the schema (⓪ topic) first.
- **Forcing the 5-beat skeleton onto a tension-free change** (rename, bump, mechanical move). One-line What+Why instead — manufactured drama is the thing this skill kills.
- **Stating the conflict's result, not its mechanism.** "They conflict" stalls the reader; show *why incompatible*, split until self-evident.
- **Waiting for "I don't get it" to go deeper.** That means you stopped too early — descend to the self-evident floor yourself.
- **Confabulating a 🔴 intent the code doesn't contain.** Past the code boundary, find it in PR/issue or ask — never invent.
- **Writing paragraphs in §1.** Passive reading in an active costume. One-sentence anchors only.
- **Leaking "is this correct" into §1's Why.** Correctness lives in §2 only.
- **Speaking your verdict before the human judges (§2 design).** That's the anchoring you exist to prevent.
- **Asking the human to adjudicate detail-level findings.** Those are yours to report, not theirs to judge.
- **Reviewing details before the design gate passes.** Wasted work on a design that may change.
- **An `explain`-grade map, or awaiting the map render.** The map is a demoted background reference, not the deliverable.
