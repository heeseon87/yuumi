---
name: claude-kit:implement
description: Implement a spec while keeping a running implementation-notes.html file — a living decision log in the Anthropic visual style — that captures design decisions, deviations from spec, tradeoffs, and open questions for the reviewer to scan before merging
argument-hint: [spec]
---

Implement $1. As you work, maintain a running `implementation-notes.html` file in the current working directory that captures what the reviewer needs to know to evaluate the result — design decisions, deviations from the spec, tradeoffs, and open questions.

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

A self-contained `implementation-notes.html` file using the same visual language as `claude-kit:explain` — cream background, coral accent, serif headings, sans-serif body. The visual identity is shared so the user sees a consistent look across our skills.

What's *not* shared with explain is the *content structure*. There's no fixed template for what comes first or what the section headings should be. Design the structure for this specific implementation: how many decisions there are, how clustered they are, whether they group naturally by domain, by file, by phase. **You decide.**

## How to design the structure (heuristics, not rules)

You're constructing a scan path for someone who hasn't been in your head. Some heuristics that tend to help:

- **Open questions belong at the top, visually distinct.** They are the only entries the reviewer must respond to. Hiding them in a list mid-page is a disservice. A `.callout` block with `Open questions` as the label is one way; a small dedicated section is another.
- **Cluster by what matters to the reviewer, not by chronology.** "I decided X at 10am, then Y at 11am" is rarely useful. "Decisions about auth / Decisions about data layer / Deviations" is more scannable. But if the implementation is genuinely phase-based (design phase → migration → cutover), chronological clusters can work.
- **Lead with the *consequential* entries.** One major deviation matters more than five minor decisions. Order by impact, not by when it happened.
- **The headline insight is your one-line summary of the whole change.** What's the *one thing* the reviewer should know if they only read the lede? That's the lede.
- **Brevity earns trust.** A reviewer who has to read 800 words about each decision will stop reading. Each entry should be readable in one breath.

These are heuristics. The right structure depends on the spec you're implementing — adapt them.

## Style assets

The visual language is provided as a palette of materials:

- **`assets/shell.html`** — the empty starting file. Copy this to `implementation-notes.html`, then write your content into the body container. Contains the design tokens, fonts, and every component's CSS, but no prescribed content sections.
- **`references/components.md`** — a catalog of what each visual component is *for*. Use this when you ask "I want to convey X — what fits?" — not to answer "what should come next?"
- **`references/svg-patterns.md`** — diagram patterns if a relationship is hard to express in prose (rare in implementation notes, but useful for architecture decisions or trade-off matrices).

Read these when you have a specific question, not as a checklist.

## Voice — a log, not an essay

The `claude-kit:explain` skill is essayist: engaging, literary, with analogies and pull quotes. Implement notes should be **terser and more direct**. The reviewer doesn't want to be charmed — they want to know what you did and why. Default to:

- Short sentences.
- Active voice, first-person plural ("we chose X") or imperative is fine.
- Code references in inline `<code>` rather than block excerpts (unless the code is the decision).
- Pull quotes (`<blockquote>`) sparingly, only when one sentence really captures the change.
- Drop caps (`.body-start`) usually skip — they're for essays, not logs.

The visual style is the same as explain; the *prose voice* is not.

## Anti-patterns

- **Don't write a polished essay.** This is a log. Half-finished sentences are fine if they're clear.
- **Don't include everything.** Filter ruthlessly to what the reviewer cares about.
- **Don't paste the diff into prose.** The reviewer can see the diff. Write what the diff *doesn't* show.
- **Don't follow a fixed section template.** Decide the structure for *this* implementation.
- **Don't batch entries to the end.** Append as you go. Stale notes mislead the user mid-review.
- **Don't bury open questions.** They need to be seen and answered.
- **Don't include decisions that match the spec exactly.** That's just noise — the spec is the record.

## When you're done

Tell the user: "Implementation done. Notes in `implementation-notes.html` — N open questions waiting for you." The notes file *is* the deliverable, alongside the code. Don't recap entries in chat — they're in the file.

If there are open questions, name how many. That's the one piece of state the user needs in chat to know if action is required from them.
