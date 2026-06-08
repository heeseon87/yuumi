---
name: yuumi:pretty
description: Create Anthropic-style HTML artifacts with the shared Yuumi visual system — navigable layouts, progressive disclosure, optional interactive widgets and data charts, a component catalog, SVG patterns, and cognitive-load-focused visual QA
version: 1.5.2
argument-hint: [brief]
---

Design `$1` as a single-file Anthropic-style HTML artifact. The shell loads pinned PrismJS files from jsDelivr by default so the marketplace package stays scan-safe; inline those files only when the final deliverable explicitly needs offline/self-contained behavior.

The output should feel like it belongs in the same family as Anthropic / Claude pages: warm paper, clay accent, quiet editorial hierarchy, sparse line-art diagrams, hairline rules, generous breathing room, and zero generic SaaS sludge.

## The North Star

**The first screen gives the reader the point and a map; the reader then controls how deep they go.**

A reader should grasp the headline insight and the shape of the whole in one glance, then descend into detail on their own terms — expanding sections, switching views, stepping through a process. Trust comes before they know why. Visual and interactive polish is not decoration; it is the interface for comprehension.

## What you produce

A complete `.html` file in the current working directory unless the user names another path.

Use:

- `skills/pretty/assets/shell.html` — blank HTML shell with tokens, typography, CSS components, and the optional SVG animation controller.
- `skills/pretty/references/components.md` — component catalog. It tells you what each component is for; it is not a section template.
- `skills/pretty/references/svg-patterns.md` — line-art SVG patterns for relationships that prose cannot carry.
- `skills/pretty/references/interaction-patterns.md` — navigation scaffold (TOC, fold, tabs) and active widgets (before/after, stepper, filterable table). Everything degrades gracefully without JS.
- `skills/pretty/references/data-viz.md` — when to reach past inline SVG to Chart.js (quantitative) or Mermaid (large graphs), and how the shell lazy-loads + themes them.

Use the shell and references as a shared visual system, not as a score target. There is no numeric style gate; quality comes from browser verification, source fidelity, restrained visual language, and whether the structure lowers reader effort.

## Workflow

1. **Understand the artifact.** Identify the reader, the one idea they must leave with, and the structure that will get them there. Ask only if a missing decision changes the artifact.
2. **Start from the shell.** Copy `skills/pretty/assets/shell.html` to the output path and write content inside `<div class="container">`.
3. **Invent the structure for this artifact.** Do not fill a fixed template. Use any component or layout that improves comprehension. The catalog is a palette, not a checklist.
4. **Plan navigation for length.** If the artifact is long (4+ major sections or 3+ viewports), give the reader a map and a way to control depth: a `.toc`, `.fold` for optional depth, `.tabs` for parallel views. Do not cram a long artifact into one flat scroll. Keep the headline insight on the first screen — never fold the main point. The shell can auto-build a fallback `.toc` from 4+ `<h2>` sections if you forget, but that is a safety net, not the standard: write an explicit `<nav class="toc">` with matching section ids when the map is part of the intended reading path.
5. **Keep the visual language fixed.** Warm parchment background, near-black ink, clay accent, serif editorial headings, JetBrains Mono for code, hairline rules, soft ring borders, restrained dark code blocks.
6. **Run the visual QA pass.** Check the saved artifact for browser errors, first-screen comprehension, CJK typography when relevant, source-fact fidelity, restrained palette/type/spacing, SVG label fit (the longest label stays inside its box and no labels overlap), prose discipline (every figure of speech earns its place, no structure-narration), and whether every visual element earns its place.
7. **Open the file.** On macOS: `open <artifact.html>`. Report only the path and verification state. Do not dump the artifact's contents in chat.

## Visual language

### Palette

Use the reference swatches in the shell; do not freestyle colors.

- Page background: `#f5f4ed` parchment.
- Raised surface: `#faf9f5` ivory.
- Primary ink: `#141413` warm near-black.
- Secondary text: `#5e5d59`, faint text `#87867f`.
- Rules and borders: `#e8e6dc`, `#f0eee6`, `#d1cfc5`.
- Accent: `#c96442` / `#d97757` clay. Use it sparingly.
- Dark code/surface: `#1f1e1d` / `#30302e`, text `#faf9f5`, dim `#b0aea5`.

### Typography

- Headings should feel editorial: medium-weight serif, tight line-height, no fake bold weight.
- Body should read like a calm essay: generous line-height, paragraph rhythm, no cramped dashboard density.
- Code is always JetBrains Mono or a mono fallback.
- Korean and mixed Korean/English are first-class. The shell uses Hahmlet because it keeps CJK prose visually close to Anthropic's serif posture without breaking Korean rendering.

### Prose discipline

A figure of speech earns its place the same way a diagram does — by carrying a thought the plain sentence could not. Strip the metaphor: if an insight remains, keep it; if only ornament remains, cut back to the plain statement. The cut is for noise, not substance — where the idea itself is genuinely hard, slow down and expand instead of trimming. The danger is two-sided: a flattened, dry voice is as wrong as prose that reaches for a flourish every sentence. Spend words only where they buy comprehension, and never let the writing describe its own structure — the words should be the understanding, not a description of the act of explaining.

### Cognitive-load visuals

Visuals are not decoration. Add a diagram only when it saves the reader from doing mental bookkeeping: simulating branches, remembering a timeline, comparing before/after states, mapping input to output, following a data transformation, or stacking verification evidence.

Before adding any visual or interaction — `<figure>`, a chart, a tab group, a stepper — name the specific burden it removes. If the answer is vague ("it looks nicer", "the page needs interest"), skip it. There is no fixed ceiling on count; the ceiling is the gate: every element must earn its place by removing a named burden. A page may be richly visual or nearly all prose — what is never allowed is a visual or widget that exists only to look busy.

**Climb the modality ladder.** The same idea costs the reader less working memory as it moves from prose to a static diagram to motion, so motion (an animated SVG, a stepped reveal) is a first-class tool, not a last resort — there is no count-cap on it. But each climb pays two tolls: the *named burden* above, and *truthfulness* — motion asserts time, order, causality, or parallelism, so animate only where those are real (a sequence reveal is honest because the page already flows in time; animating independent items to look parallel is not). Every animation must degrade to a meaningful still frame with JS off and under `prefers-reduced-motion`. In a self-contained artifact, "motion" is controlled SVG/CSS animation and steppers — never embedded video. See `svg-patterns.md` for the ladder and the one-instance limit on the turnkey fan-out/join controller.

Inline SVG is the default. For final pretty artifacts, prefer self-contained inline SVG styled with the shell tokens. When the data is genuinely quantitative use Chart.js, and for large auto-laid or draft graphs use Mermaid — the shell lazy-loads both from a pinned CDN only when the page contains the element (`[data-chart]` on a `<canvas>`, or `.mermaid`). See `data-viz.md`.

Active widgets (before/after, stepper, filterable table) are progressive enhancements — the page must be fully usable, and the main point fully visible, with JS disabled. Always pair a chart with its source data table.

### Components

These are named conveniences in the shell, not the only legal moves. If comprehension wants a comparison grid, a single-column essay, a dense table, a split-panel walkthrough, or a custom semantic block, use it. Keep the color, spacing, typography, hairlines, and restraint in the Anthropic family.

- Use `.lede` for the headline insight, not a vague subtitle.
- Use `.meta` for small labeled facts.
- Use `.callout` for a real insight that deserves a left clay rail. If everything is a callout, nothing is.
- Use `.aside` for cautions or edge cases.
- Use `.steps` only when order matters.
- Use `<figure>` + SVG for spatial, temporal, or branching relationships. Keep it line-art: thin strokes, no gradients, no shadows.
- Use language-classed `<pre><code class="language-…">` for short code excerpts. Bare `<pre><code>` is a QA failure: Prism cannot reliably colorize it and the block falls back to plain warm-white text. The shell has a best-effort fallback for common languages, but the artifact should still declare the language explicitly and verify that token spans were produced. Do not paste huge code blocks as a substitute for explanation.

## Quality bar

The page should feel Anthropic-adjacent without copying Anthropic: warm paper, quiet editorial hierarchy, sparse line-art, hairline rules, clay used sparingly, and no generic SaaS sludge.

The real test is comprehension. A reader should need less working memory after the page exists:

- the headline insight is visible in the first viewport
- named facts are grouped instead of buried in prose
- branches, timelines, contracts, and verification stacks are visualized only when prose would make the reader calculate
- visuals are source-grounded and captioned with the actual insight
- the browser renders cleanly with no console errors
- interactions work and degrade: tabs switch, steppers step, folds toggle, and with JS off every panel/step is visible and the main point is on the first screen
- code blocks are language-classed (`<pre><code class="language-…">`) and Prism produced token spans; no bare `<pre><code>` blocks remain unless intentionally plain text and labeled as such
- charts render on-palette with a paired data table, and chart/graph libraries load only on pages that use them
- the layout is navigable: long pages have a map (`.toc`) and the reader can control depth
- keyboard focus is visible on every interactive element; motion respects `prefers-reduced-motion`
- SVG text fits: every label sits inside its box with padding and no label overlaps a neighbor, even with the longest label in the diagram — hand-placed coordinates overflow on a long name, so verify in the rendered browser view, not by reading the markup
- every figure of speech earns its place: stripping the metaphor still leaves the insight; prose that leaves only style is cut, and the writing never narrates its own structure (see Prose discipline)

## Anti-patterns

- Do not clone Anthropic copy, product screens, or proprietary layouts. Borrow the design language, not copyrighted content.
- Do not add fake metrics, testimonial cards, decorative icons, or generic feature grids.
- Do not add diagrams just because the page feels empty. Visualize only the parts the reader would otherwise have to calculate or stack mentally.
- Do not use gradients, glass, neon, rainbow accents, or cool blue-gray palettes.
- Do not use a fixed section order just because a previous pretty page did.
- Do not put long explanations in chat. The HTML artifact is the deliverable.
- Do not add interaction for its own sake. A tab group, stepper, or slider must remove a named burden, not signal "interactive".
- Do not fold, tab, or otherwise hide the artifact's main point. Progressive disclosure defers *optional depth*, never the headline insight.
- Do not show a chart without its underlying data table. Charts must survive JS-off and be fact-checkable.
- Do not load a chart/graph library "just in case". Only the element's presence triggers it.
- Do not use bare `<pre><code>` for code examples. Add `class="language-sql"`, `language-kotlin`, `language-typescript`, etc.; otherwise Prism may leave the whole block as plain warm-white text.
- Do not let library defaults (bright blue, drop shadows) leak through — verify charts render on-palette.
- Do not let rhetoric signal tone without carrying meaning — if stripping a figure leaves the same point, it was decoration; narrating the document's own structure is the same noise (see Prose discipline).
- Do not place two opposing labels on the same SVG row — a long name will cross the one facing it. Give a secondary label its own line; a lone label cannot collide regardless of length. When hand-placed labels keep overflowing, switch to CSS auto-width boxes or an auto-layout renderer.

## When you're done

Tell the user: `Saved to <path>. Opened in your browser. Verified: <checks>.`

If visual QA is limited, say exactly what was and was not verified. Do not hand-wave it as done.
