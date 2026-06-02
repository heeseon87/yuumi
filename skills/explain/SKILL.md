---
name: yuumi:explain
description: Render an Anthropic-style HTML explainer of the target — structure designed per-target with cognitive-load-focused visuals
version: 1.3.26
argument-hint: [target]
---

Explain the target — a file, endpoint, module, system, concept — in plain language. Cover the technical architecture, how parts are connected, the technologies used, the *why* behind decisions, and the lessons one can take away (bugs encountered and how they were fixed, pitfalls and how to avoid them, the way good engineers think, best practices).

It should be **engaging to read**, not boring documentation. Use analogies and anecdotes where they make abstract things stick. The goal: install an accurate mental model in the reader, not dump information.

## The North Star

**A reader should understand the target after reading once.** This is the only metric that matters. Every decision — what to include, what to leave out, what order to put things in, where to add a diagram, whether to use a callout or a code block — is in service of this single goal.

If a reader has to re-read a paragraph, you've already lost. If they get stuck at a name they don't recognize, lost. If they finish the page unsure what the headline insight was, lost. Build the explanation around the reader's likely mental trajectory, not around the structure of the code.

## What you do

1. **Investigate the target.** Read the code, trace dependencies, run greps, understand the architecture. If the target is named ambiguously ("the auth flow", "the analyses endpoint"), use Grep/Read to pinpoint actual files. Verify, don't speculate.

2. **Construct the reader's path.** Before writing a single line, decide:
   - What's the *one* headline insight the reader should leave with?
   - What does the reader *already* know coming in? What are they likely *not* to know? Where will they get stuck?
   - In what order should pieces arrive so each one explains the next? (This is rarely "the order the code is structured in.")
   - Where does an analogy save 200 words? Where does a diagram save a paragraph? What mental stack would the reader otherwise have to carry? Where would either be a distraction?

3. **Design the page structure yourself.** Do NOT follow a fixed template. The structure you choose should serve *this specific target*. Some explanations are best as a single long essay. Others as a sequence of numbered acts. Others as a single chart with prose around it. There is no canonical section list — there is the structure this particular target needs.

4. **Render with `yuumi:pretty`.** A single-file `.html` file in the project's current working directory. Use the shared pretty assets (`../pretty/assets/shell.html`, `../pretty/references/components.md`, `../pretty/references/svg-patterns.md`) for the fixed Anthropic-style visual language; the shell loads pinned PrismJS CDN scripts by default for marketplace scan-safety. Inline those scripts only if the user explicitly needs offline/self-contained delivery; the *content structure* is yours to invent each time.

5. **Verify, then open in browser.** Check that the saved HTML opens cleanly, has no console errors, and reads correctly in the first viewport. Then `open {slug}-explained.html` on macOS. Tell the user the file path. Don't re-explain the contents in chat — the artifact is the deliverable.

## How to design the structure (no template — a way of thinking)

You're not filling in a form. You're building a path from where the reader is now to where you want them to be. Some heuristics:

- **Lead with the headline insight.** Don't tease. The lede should already give away the most important thing. Readers who only read the first paragraph should still walk away with the core idea.
- **Name the surprise first.** If there's something non-obvious about this target — something that makes a reader say "huh, didn't expect that" — surface it early. Surprise creates the engagement that carries them through the rest.
- **One thought per section.** Don't pack three insights into one section just because they're related. Let each insight breathe.
- **Reader stuckness is a planning input.** As you draft, ask: "would a reader pause here and re-read?" That's a signal to add an analogy, a diagram, or to split the paragraph. Stuck-points are where structure happens.
- **Cut, then cut more.** Every paragraph that doesn't move the reader closer to the headline insight is friction. If you find yourself writing background that's "nice to have" — remove it.
- **End with what they take away.** Whether you call it "lessons," "takeaways," or something else, the closing should consolidate the mental model so the reader leaves with something portable.

These are heuristics, not rules. Some explanations open with a quote, some with a question, some with a code block. The right opening for *this* target is the one that pulls the reader in.

## Visualization discipline — draw only the stuck points

A visual earns its place only when it removes work from the reader's head. Before adding any figure, write down the burden it unloads: a branch they would have to simulate, a timeline they would have to remember, a before/after comparison, an input/output contract, a data transformation, or an ownership boundary.

High-value explainer visuals:

- **Mental-model map** — the few real parts and how they relate.
- **Sequence or lifecycle** — when order matters more than component names.
- **Branch / decision tree** — when conditions determine behavior.
- **Input → output strip** — when examples clarify what the system promises.
- **Before / after comparison** — when a refactor or design choice changes responsibility.
- **Verification ladder** — when trust depends on stacked evidence.

There is no fixed count and no ceiling. The number of visuals is set by **how many genuine cognitive-load points the content has** — not by its length — and you judge that. The goal is to visualize *every* place where the reader would otherwise have to compute something in their head: a branch to simulate, a timeline to hold, a transformation to track, a boundary to map. A page with one such point needs one visual; a page dense with them needs many; long prose with few stuck-points still needs few. The discipline is not "few" but "each earns its place by removing a named burden, and none exists just to look busy." A mediocre visual still costs the reader attention, so cut those; never cap the strong ones. If a single map sprawls, it may still read better as its own dedicated page.

Motion is the top rung of the same ladder, not a special case. A relationship you reveal in motion — a stepped walkthrough, an animated sequence — can unload a timeline or a branch better than a still frame, so there is no cap on animation either. But motion pays a second toll beyond "name the burden": **truthfulness.** Animation asserts time, order, or parallelism; use it only where those are real (a sequence reveal is honest because the page already flows in time; animating independent steps to look parallel is not). And every animation must collapse to a meaningful still frame with JS off and under `prefers-reduced-motion`. In a single-file artifact, motion means controlled SVG/CSS animation and steppers, never embedded video.

Facts beat symmetry. Do not invent layers, nodes, arrows, files, calls, or domains because a diagram looks empty. Trace the code first; draw only relationships that actually exist. If the visual is about a general concept rather than this codebase, label it as conceptual.

Place each visual where the reader would otherwise pause and re-read. The caption should carry the insight in one sentence.

## What to use from the style assets

The Anthropic visual style is a **palette of materials**, not a recipe. You should know what's available and reach for what fits.

- **`../pretty/assets/shell.html`** — the empty starting file. Copy this to `<slug>-explained.html`, then write your content into the body. It contains the design tokens, fonts, and every component's CSS, but no prescribed content sections.
- **`../pretty/references/components.md`** — a catalog of what each visual component is *for*. Use this to answer "I want to convey X — what component fits?" Not to answer "what should come next in my doc?" (That's your call.)
- **`../pretty/references/svg-patterns.md`** — diagram patterns you can drop in when a relationship is hard to express in prose. Includes battle-tested traps to avoid in SVG animations.

These are reference materials, not a workflow. Read them when you have a specific question, not before you've thought about the target.

## What's preserved from the original explain skill

The original mission stays: plain-language explanation of architecture, technologies, decisions, lessons, bugs, pitfalls, how good engineers think. Engaging, not textbook-flavored. Analogies and anecdotes where they help. Voice is essayist, not bureaucratic.

What's *changed* is that the structure is no longer prescribed. The original skill let you write a free-form explanation; the previous HTML version started to constrain that with a fixed section template. This version returns the structural freedom while keeping the visual style.

## File output

Save as `<topic-slug>-explained.html` in the current working directory. Use kebab-case slugs derived from what the target actually is — not from how the user phrased their request. Open with the OS default browser after writing.

## Visual QA

If the explanation is meant to carry the Anthropic visual language, do a manual quality pass before opening it:

- Warm paper, clay accent, hairline rules, editorial type, and generous whitespace are intact.
- The page structure is content-shaped, not copied from a template.
- Every diagram has a named comprehension job and no decorative filler.
- Code-fact visuals are backed by actual files, calls, or data shapes you inspected.
- Browser console is clean and the first screen establishes the mental model quickly.

## Anti-patterns

- **Don't follow the visual order of a section template you've seen before.** Decide the structure for *this* target. The shell file deliberately has no content sections inside it.
- **Don't open with a generic "Overview" section.** Open with the insight or the question that makes the rest worth reading.
- **Don't add a section just because it exists in `components.md`.** Components are tools — use them only when they serve the reader's path.
- **Don't dump the explanation in chat first.** Write the HTML, open it, then say "saved to {path}."
- **Don't replicate the source code's organization.** The reader doesn't care which file something is in; they care about the *idea*. Structure by ideas, not files.
- **Don't animate what isn't temporal, causal, or parallel.** Motion asserts order and concurrency; using it where the relationship is static or sequential installs a false mental model. The limit on motion is not a count — it's truthfulness — and every animation must still degrade to a meaningful still frame with JS off.

## When you're done

Tell the user: "Saved to `<path>` and opened in your browser." Don't recap the content in chat — let them read.
