---
name: implement
description: Implement a spec while keeping a running context-slugged HTML decision log that captures reviewer-facing decisions, tradeoffs, open questions, and cognitive-load-reducing visuals
version: 1.3.22
argument-hint: [spec]
---

Implement $1. As you work, maintain a running context-specific implementation notes file in the current working directory — `<topic-slug>-implementation-notes.html` — that captures what the reviewer needs to know to evaluate the result: design decisions, deviations from the spec, tradeoffs, and open questions.

The notes are a **decision log, not a polished essay**. Terser is fine. Honest is better than thorough.

## The North Star

**Before merging, the reviewer should be able to scan the notes in 30 seconds and understand every non-obvious choice you made.**

Anything that doesn't help that scan is friction. Anything that's already obvious from the diff is noise. The file's value is in surfacing what the diff alone *can't* show — the alternatives you considered, the ambiguity you resolved, the questions you couldn't answer alone.

## What goes in the file

Four kinds of entries. Use the kinds that fit; skip the ones that don't.

- **Design decisions** — choices you made where the spec was ambiguous or silent. Name the choice, name the reason.
- **Deviations** — places where you intentionally departed from the spec. State the spec's prescription, your departure, and the reason. The reviewer needs to know whether to push back.
- **Tradeoffs** — alternatives you seriously considered and the one you picked. Worth recording when the rejected option was nearly as good — the reviewer might prefer it.
- **Open questions** — items you want the user to confirm or revise. These deserve visual prominence; they're the only entries that demand a response.

Things that don't go in the file: changes that match the spec exactly, routine refactors, code style choices, anything the reviewer would not care about. Signal-to-noise is what separates a useful log from a paperweight.

## Cadence — this is what makes it a *running* file

The file is updated *as you work*, not at the end. The user may open it mid-implementation to check direction.

1. **Read the spec first.** Before writing any code, scan for ambiguities, missing requirements, contradictions. Any open questions surfaced from this pass go into the file *first*, before implementation begins. The user may want to answer some before you proceed.
2. **Initialize the file** with just the masthead and the empty entry buckets you anticipate. Re-save.
3. **As each decision arises during implementation, append immediately and re-save.** Don't batch entries to the end — by then you've forgotten the *why* and the file lies about the current state.
4. **Promote questions you can answer.** When the user clarifies an open question (or you find the answer in the code), move that entry from "open" to a closed decision or just remove it.
5. **At the end, do a sweep.** Re-read the file as a reviewer would. Remove anything that no longer matters. Promote anything still labeled "open" that you've since resolved.

## Output: Anthropic-style HTML artifact

A single-file `<topic-slug>-implementation-notes.html` file using the shared `yuumi:pretty` visual language — warm parchment background, clay accent, Hahmlet/serif editorial typography, JetBrains Mono for code, generous whitespace. The shell uses pinned PrismJS CDN scripts by default for marketplace scan-safety; inline them only if the user explicitly needs offline/self-contained delivery. The visual identity is centralized in `pretty` so explain, implement, and standalone design artifacts do not drift.

## File output

Save as `<topic-slug>-implementation-notes.html` in the current working directory. Use kebab-case slugs derived from what the implementation is actually about — the feature, bug, module, endpoint, migration, ticket, or touched subsystem — not from generic words in the user's phrasing like "implement", "fix", or "task".

Examples:

- `rate-limit-hud-implementation-notes.html`
- `auth-refresh-token-implementation-notes.html`
- `user-analysis-migration-implementation-notes.html`

If the work target is ambiguous at the start, infer the slug after the first investigation pass from the real files/spec being changed, then initialize the notes file. Do not fall back to the generic `implementation-notes.html` name for new work. If an old `implementation-notes.html` already exists, treat it as legacy input: read it if relevant, then migrate or continue in the new context-slugged file.

What's *not* shared with explain is the *content structure*. There's no fixed template for what comes first or what the section headings should be. Design the structure for this specific implementation: how many decisions there are, how clustered they are, whether they group naturally by domain, by file, by phase. **You decide.**

## How to design the structure (heuristics, not rules)

You're constructing a scan path for someone who hasn't been in your head. Some heuristics that tend to help:

- **Open questions belong at the top, visually distinct.** They are the only entries the reviewer must respond to. Hiding them in a list mid-page is a disservice. A `.callout` block with `Open questions` as the label is one way; a small dedicated section is another.
- **Cluster by what matters to the reviewer, not by chronology.** "I decided X at 10am, then Y at 11am" is rarely useful. "Decisions about auth / Decisions about data layer / Deviations" is more scannable. But if the implementation is genuinely phase-based (design phase → migration → cutover), chronological clusters can work.
- **Lead with the *consequential* entries.** One major deviation matters more than five minor decisions. Order by impact, not by when it happened.
- **The headline insight is your one-line summary of the whole change.** What's the *one thing* the reviewer should know if they only read the lede? That's the lede.
- **Brevity earns trust.** A reviewer who has to read 800 words about each decision will stop reading. Each entry should be readable in one breath.

These are heuristics. The right structure depends on the spec you're implementing — adapt them.

## Visualization discipline — remove reviewer mental stack

Use visuals only where they lower cognitive load. The test is simple: **what calculation, comparison, branch, timeline, or stack would the reviewer otherwise have to hold in their head?** If you cannot name that burden, don't add the visual.

Good implementation-note visuals:

- **Input → output contract strip** — when the reviewer needs to know which input shapes produce which artifacts or side effects.
- **Branch classifier** — when several partial states collapse into a smaller set of execution paths.
- **Verification ladder** — when evidence has layers: local repro, sample data, build result, production-like follow-up.
- **Before / after state map** — when a migration, fallback, or refactor changes ownership, storage, or responsibility.
- **Small sequence diagram** — only after verifying real function names and calls in code.

There is no fixed count and no ceiling — the number of figures is set by **how many genuine cognitive-load points the log has**, not by its length. Visualize every place the reader would otherwise have to compute something in their head (a branch to simulate, a state change to track, a before/after ownership shift); add no figure that does not clear such a burden, and cut decorative ones. A simple log may need none; a decision-dense one may need many. Put each figure next to the prose it replaces, not in a gallery. The caption must state the insight, not merely describe the drawing.

Do not draw decorative architecture. Do not invent nodes, domains, steps, or relationships to make a diagram look balanced. If the code does not call it, the diagram does not show it.

## Style assets

The visual language is provided as a palette of materials:

- **`../pretty/assets/shell.html`** — the empty starting file. Copy this to `<topic-slug>-implementation-notes.html`, then write your content into the body container. Contains the design tokens, fonts, and every component's CSS, but no prescribed content sections.
- **`../pretty/references/components.md`** — a catalog of what each visual component is *for*. Use this when you ask "I want to convey X — what fits?" — not to answer "what should come next?"
- **`../pretty/references/svg-patterns.md`** — line-art SVG patterns for relationships that would otherwise force the reviewer to hold branches, timelines, input/output contracts, verification state, or data mappings in their head.

Read these when you have a specific question, not as a checklist.

## Voice — a log, not an essay

The `yuumi:explain` skill is essayist: engaging, literary, with analogies and pull quotes. Implement notes should be **terser and more direct**. The reviewer doesn't want to be charmed — they want to know what you did and why. Default to:

- Short sentences.
- Split multi-step reasoning into several short paragraphs when that helps the reader scan; don't compress distinct reasons into one wall of text.
- Active voice, first-person plural ("we chose X") or imperative is fine.
- Code references in inline `<code>` rather than block excerpts unless the code itself is the decision. When a block is necessary, use the standard code block component from `pretty`.
- Pull quotes (`<blockquote>`) sparingly, only when one sentence really captures the change.
- Drop caps (`.body-start`) usually skip — they're for essays, not logs.

The visual style comes from `pretty`; the *prose voice* is still terse implementation logging, not explain's essay voice.

## Quality pass

After writing `<topic-slug>-implementation-notes.html`, verify the artifact instead of chasing a numeric style score:

- The file exists and opens in the browser.
- Browser console has no errors.
- The first screen tells the reviewer the status, scope, and most consequential decision.
- Every figure removes a real mental stack; no diagram is decorative filler.
- Visual structure follows code facts. Function lanes, data maps, and ownership arrows are verified against the actual code before being drawn.
- Korean/mixed-language notes keep `lang="ko"`, readable line breaks, and the pretty shell's CJK typography rules.

## Anti-patterns

- **Don't write a polished essay.** This is a log. Half-finished sentences are fine if they're clear.
- **Don't include everything.** Filter ruthlessly to what the reviewer cares about.
- **Don't paste the diff into prose.** The reviewer can see the diff. Write what the diff *doesn't* show.
- **Don't follow a fixed section template.** Decide the structure for *this* implementation.
- **Don't batch entries to the end.** Append as you go. Stale notes mislead the user mid-review.
- **Don't bury open questions.** They need to be seen and answered.
- **Don't include decisions that match the spec exactly.** That's just noise — the spec is the record.

## When you're done

Tell the user: "Implementation done. Notes in `<topic-slug>-implementation-notes.html` — N open questions waiting for you." The notes file *is* the deliverable, alongside the code. Don't recap entries in chat — they're in the file.

If there are open questions, name how many. That's the one piece of state the user needs in chat to know if action is required from them.
