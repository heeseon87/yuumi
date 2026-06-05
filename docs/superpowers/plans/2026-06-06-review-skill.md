# `yuumi:review` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. NOTE: this repo has **no build/lint/test pipeline** (per CLAUDE.md) — the deliverable is a prompt (`SKILL.md`), so "tests" here are *discovery checks* + a *live smoke run*, not TDD. For authoring the prompt itself, consult `superpowers:writing-skills`.

**Goal:** Add a 9th skill, `yuumi:review`, that helps a human review someone else's change by building understanding actively (top-down terminal dialogue), surfacing design/dependency review points for the human to judge first, and offloading detail-level review to the agent.

**Architecture:** A single `skills/review/SKILL.md` prompt. It borrows visual assets from `pretty` (`../pretty/assets/`) for an optionally-rendered, background-updated HTML "map." The core loop lives in the prompt; secondary detail (anchoring phrasings, ASCII patterns, backstop prompt) stays inline unless it bloats the core loop. No new shared assets (visual source stays in `pretty`).

**Tech Stack:** Markdown prompt (`SKILL.md` with YAML frontmatter); the `skills` CLI for distribution; Claude Code `Agent` tool with `run_in_background` for the parallel map render.

**Spec:** `docs/superpowers/specs/2026-06-06-review-skill-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `skills/review/SKILL.md` | Create | The entire skill prompt: identity, input handling, understand loop, review loop (split + anchoring + backstop gate), map, fallbacks, anti-patterns |
| `.claude-plugin/plugin.json` | Modify | Version bump `1.4.1` → `1.5.0` |
| `skills/*/SKILL.md` (all 9) | Modify | `version:` frontmatter sync to `1.5.0` |
| `skills.sh.json` | Modify | Add `review` to "Yuumi workflow skills" group + refresh group description |

Visual assets are **referenced**, not copied: the prompt points at `../pretty/assets/shell.html`, `../pretty/references/components.md`, `../pretty/references/svg-patterns.md` (same pattern as `explain`). Do NOT create a `skills/review/assets/` duplicate.

---

## Task 1: Write `skills/review/SKILL.md`

**Files:**
- Create: `skills/review/SKILL.md`

This is one cohesive prompt (a prompt loses meaning when split arbitrarily), so it's one task. The full text to write follows. After writing, verify against the spec's §3 guardrails (Step 2).

- [ ] **Step 1: Write the prompt file**

Write `skills/review/SKILL.md` with exactly this content:

````markdown
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
````

- [ ] **Step 2: Verify the prompt against the spec's guardrails**

Re-read `skills/review/SKILL.md` and confirm every spec §3 principle is encoded (this is the "test"):

Check each, expected = present:
- §3.1 readability≠understanding, active dialogue → "Understanding is active" + North star
- §3.2 high→low, advance organizer → "§1 ... high-level → low-level, always"
- §3.3 What→Why per unit → "go What → Why"
- §3.4 anchoring block scoped to human-judged level → §2 "human judges first" + design-only
- §3.5 ASCII/balsamiq low-fidelity → "Prefer ASCII ... fights anchoring"
- §3.6 (a) one-sentence anchor (b) Why≠correctness → both guardrails verbatim in §1
- §3.7 split by detectability + backstop gate → §2 two subsections + backstop
- map background subagent → §3
- intent fallback / no confabulation → Input section

If any is missing or weakened, fix it inline now.

- [ ] **Step 3: Commit**

```bash
git add skills/review/SKILL.md
git commit -m "feat(review): add yuumi:review skill prompt"
```

---

## Task 2: Version bump — `plugin.json` + all 9 SKILL.md

**Files:**
- Modify: `.claude-plugin/plugin.json:3`
- Modify: `skills/{interview,edit,explain,implement,pretty,teach-me,statusline-setup,statusline-doctor,review}/SKILL.md` (the `version:` frontmatter line of each)

- [ ] **Step 1: Bump `plugin.json`**

Change line 3 from `"version": "1.4.1",` to `"version": "1.5.0",`. (Minor bump — a new skill is a feature, not a patch.)

- [ ] **Step 2: Sync every SKILL.md `version:`**

Set `version: 1.5.0` in the frontmatter of all nine skills (review is already `1.5.0` from Task 1; update the other eight from `1.4.1`).

Verify uniformity:

Run: `grep -rh '^version:' skills/*/SKILL.md | sort -u`
Expected: a single line — `version: 1.5.0`

Run: `grep '"version"' .claude-plugin/plugin.json`
Expected: `  "version": "1.5.0",`

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json skills/*/SKILL.md
git commit -m "chore: bump version to 1.5.0"
```

---

## Task 3: Register `review` in `skills.sh.json`

**Files:**
- Modify: `skills.sh.json:6-14`

- [ ] **Step 1: Add `review` to the workflow group and refresh its description**

In the "Yuumi workflow skills" grouping, add `"review"` to the `skills` array and update the group `description` to mention it. Replace the grouping's `description` and `skills` with:

```json
      "description": "Authoring, planning, and HTML-artifact skills that ride along on any agent: pressure-test a plan with a deep interview, edit drafts in place with inline {curly-brace} notes, render Anthropic-style HTML explainers, implement a spec with a running decision log, review someone else's change by building understanding actively so the judgment stays yours, and a teacher that won't stop until you actually understand the work.",
      "skills": [
        "interview",
        "edit",
        "explain",
        "implement",
        "pretty",
        "teach-me",
        "review"
      ]
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('skills.sh.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add skills.sh.json
git commit -m "docs(skills.sh): add review to workflow group"
```

---

## Task 4: Live smoke run — PRE-PUSH, via local copy (the real "test")

**Files:** none (manual behavioral verification)

A prompt skill is verified by running it and checking the output matches design intent — there is no unit test. The `skills` CLI installs only from a **GitHub remote** (no local-dir source form — verified via `npx skills add --help`), so to test before pushing, copy the skill into the personal skills dir by hand. The `skills` CLI's own install is just a copy into `~/.claude/skills/<dir>/`, and the install dir name is the sanitized frontmatter name (`yuumi:review` → `yuumi-review`).

- [ ] **Step 1: Install locally by copy**

Run:
```bash
cp -r skills/review ~/.claude/skills/yuumi-review
```
Expected: `~/.claude/skills/yuumi-review/SKILL.md` exists. Claude Code now exposes `/yuumi-review` as a personal skill (may require a new session to pick up).

- [ ] **Step 2: Run the skill on a small real change**

In a Claude Code session inside a repo with a small uncommitted/branch change, invoke `/yuumi-review` against a 1–2 file diff.

- [ ] **Step 3: Confirm the design-defining behaviors actually happen**

Watch for, expected = all present:
- Understanding starts with a **one-line domain summary**, then descends high→low.
- The agent's per-unit What/Why are **one sentence**, not paragraphs (guardrail a).
- §1 never states whether code is **correct** (guardrail b) — only what/why-authored.
- At a design point, the agent asks **the human's judgment first**, before giving its own verdict.
- After "no issues," the agent runs a **backstop** design review.
- Detail-level findings are **reported, not put to the human** for accept/reject.
- A background map render is **kicked off without stalling** the dialogue.

If any behavior is missing, the prompt under-specified it — return to Task 1, strengthen that section, re-run.

- [ ] **Step 4: Clean up the temp local copy + commit any prompt fixes**

```bash
rm -rf ~/.claude/skills/yuumi-review   # remove the hand-copied dev install
# only if Step 3 forced prompt fixes:
git add skills/review/SKILL.md
git commit -m "fix(review): tighten prompt after smoke run"
```

---

## Task 5: Discovery check — POST-PUSH

**Files:** none (verification only)

`npx skills add … --list` reads the **GitHub remote**, so this is a sanity check to run *after* the branch is merged/pushed to where the slug resolves (per CLAUDE.md: "After pushing main, sanity-check discovery"). It cannot pass before the change is on the remote.

- [ ] **Step 1: Confirm the CLI discovers 9 skills (after push)**

Run: `npx skills add heeseon87/yuumi --list`
Expected: lists **9** skills including `review` with its current description.

(If it still shows 8 after push, the most common cause is `skills/review/SKILL.md` missing frontmatter `name:` or a malformed YAML block — fix and re-run.)

---

## Notes for the executor

- **Branch first.** Current branch is `main`; create a feature branch before committing (the user controls when to push).
- **Language:** the prompt is English to match existing skills (explain/teach-me). If the user wants Korean, that overrides — confirm before mass-translating.
- **Do not** create `.claude-plugin/marketplace.json`, `plugins/yuumi/`, or `.agents/` — single-channel by design (CLAUDE.md).
- **Do not** duplicate `pretty` assets under `skills/review/` — reference them via `../pretty/`.
