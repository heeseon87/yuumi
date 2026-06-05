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

Pull the change's **intent** from PR title/body, commit messages, and linked issues *first* — intent (the "why") is what code cannot tell you. If you cannot recover intent from those sources, **do not confabulate** — say "I can't tell the intent from the code alone — do you know why this was done?" and ask. A wrong root poisons the whole understanding.

## 1. Understand — top-down terminal dialogue

Understanding goes **high-level → low-level, always.** The fastest understanding is "anchor to what you already know, then extend" (advance organizer). Domain language is what the reader already knows; code lines are what they don't. Each step anchors to the one above it.

**Start with a summary.** One or two lines, in domain language, covering What (what changed) then Why (the intent). This is the root the whole ladder hangs from.

**Then descend, one splittable unit at a time.** For each unit, go **What → Why**: What is the observable fact (easy to anchor); Why is the author's intent built on top (needs the anchor first). Never lead with Why — a Why without its What is an unanchored abstraction. If the change is several independent clusters (multiple roots), run one ladder per cluster — don't force unrelated changes into a single tree.

**Two guardrails — these are the core-loop semantics. Violate either and the skill silently collapses into a passive explainer:**

- **(a) Your What/Why is a one-sentence anchor, NOT an explanation.** If you write a paragraph of What and a paragraph of Why per unit, the human is back to *reading passively* — the exact state that produces no understanding. Keep your scaffold to a single sentence; the cognitive work must come from the human's own prediction. **If you are writing paragraphs, you have already regressed to passive.**
- **(b) "Why" = author's intent (descriptive), NEVER correctness judgment (evaluative).** "Why did they write it this way" is descriptive and belongs here. "Why this is correct/wrong" is a review verdict — it leaks the judgment before the human reaches the leaf and destroys the anchoring block in §2. Save all correctness evaluation for §2.

**Pull prediction, but only once there's footing.** Once a scaffold exists, draw the human's own thinking out: "given that, how do you think they implemented the next part?" Do NOT force prediction at the very top — early on there's no anchor to predict from, and forcing it is friction, not learning. Predict from footing, not from nothing.

**Visualize only the stuck points.** When the human would have to *compute something in their head* — async ordering, how a variable mutates across a loop, branch combinations, blast radius — draw it. Prefer **ASCII** (it keeps the dialogue unbroken and its low fidelity reads as "let's work this out together," which fights anchoring). Escape to a small HTML fragment only for what ASCII genuinely can't render (spatial/graph structure). No decorative diagrams — each must remove a named burden.

**Let the human skip.** They drive depth: "this chunk's fine, move on" advances without forcing every unit. The human normally stops the ladder at the design/dependency level (the leaves are the agent's in §2); they drill into a leaf only when a design judgment needs it.

## 2. Review — split by level, design gate before detail

### Design & dependency (human-led + agent backstop)

These the human judges. Run an **anchoring-blocked loop** per point:

1. **The human judges first.** "How does this dependency / this design look to you?" Wait for their take. Do NOT lead with your verdict — if you speak first, they anchor to you and rubber-stamp, and their review muscle never grows.
2. **Then you compare.** Reveal your assessment/draft, contrast with theirs → human picks: accept / revise / reject.
3. **Backstop, after they're done.** When the human says "no more issues," YOU review the design once more (they may have missed something). Because this comes *after* their independent judgment, it doesn't anchor them — it's a safety net, not a lead. If you find an issue → surface it → human judges → repeat until convergence. Human + agent clean agreement = **design gate passed.**

### Detail implementation (agent, fully)

Only **after the design gate passes** (a shaky design means details get rewritten — reviewing them first is waste). You detect and judge implementation-level defects yourself and **report them into the map / comments** — do not ask the human to accept/reject each one. This is where scale lives: a big PR has many leaves, and you absorb them so the human's load tracks design-node count, not line count.

## 3. The map — parallel, cumulative, background

The understanding is the terminal dialogue; the **map is a demoted reference** — an HTML file that keeps you from getting lost and lets the human look back, NOT the thing that creates understanding.

After each section/unit closes, render/update the map **in a background subagent** (`Agent` tool, `run_in_background: true`) so the terminal dialogue never stalls and the heavy HTML render never pollutes this session's context. Borrow `pretty`'s visual language (`../pretty/assets/shell.html`, `../pretty/references/components.md`, `../pretty/references/svg-patterns.md`) — keep it map-scoped (change tree + blast radius + accumulated review comments), not an `explain`-grade essay. Pass the subagent the current understanding state + the existing map so it updates incrementally rather than re-rendering from scratch.

Accumulate accepted review comments (human's design verdicts + agent's detail findings) into the map too — it's the durable record, so terminal-only output never loses comments to scrollback. The human "looks back" by refreshing the HTML file in a browser; no session fork needed.

Update the map **one at a time**: if a render is still in flight, coalesce the next request into the next render rather than spawning a second background agent against the same file — concurrent writes clobber it.

## 4. Output

Terminal: a tidy list of accepted comments (with `file:line`). The map holds the same, cumulatively.

## Anti-patterns

- **Writing paragraphs in §1.** That's passive reading wearing an active costume. One-sentence anchors only.
- **Leaking "is this correct" into §1's Why.** Correctness lives in §2 only.
- **Speaking your verdict before the human judges (§2 design).** That's the anchoring you exist to prevent.
- **Asking the human to adjudicate detail-level findings.** Those are yours to report, not theirs to judge.
- **Reviewing details before the design gate passes.** Wasted work on a design that may change.
- **An `explain`-grade map.** The map is a demoted reference, not the deliverable. Heavy maps belong to `explain`.
- **Awaiting the map render.** It's background; the dialogue continues.
