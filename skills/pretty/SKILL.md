---
name: yuumi:pretty
description: Use when a deliverable should be a polished single-file HTML page — a report, explainer, design note, comparison, or anything too long or too visual for chat — rendered in the warm editorial Yuumi visual system
version: 1.6.0
argument-hint: [brief]
---

Design `$1` as a single-file **online** HTML artifact. The deliverable is one `.html` file; fonts and optional libraries are loaded from pinned CDNs, and the normal viewing assumption is that the reader is online.

The output should feel like a warm editorial technical note: paper background, clay accent, quiet hierarchy, sparse line-art diagrams, hairline rules, generous breathing room, and zero generic SaaS sludge.

## The North Star

**The first screen gives the reader the point and a map; the reader then controls how deep they go.**

A reader should grasp the headline insight and the shape of the whole in one glance, then descend into detail on their own terms — expanding sections, switching views, stepping through a process. Trust comes before they know why. Visual and interactive polish is not decoration; it is the interface for comprehension.

## What you produce

A complete `.html` file in the current working directory unless the user names another path.

Use the files shipped in **this skill's own directory**, resolved relative to this SKILL.md wherever it is installed:

- `assets/shell.html` — blank HTML shell with tokens, typography, CSS components, lazy CDN loaders, and the optional SVG animation controller.
- `references/components.md` — component catalog. It tells you what each component is for; it is not a section template.
- `references/svg-patterns.md` — line-art SVG patterns for relationships that prose cannot carry.
- `references/interaction-patterns.md` — navigation scaffold (`.toc`, `.fold`, `[data-tabs]`) and active widgets (before/after, stepper, filterable table). Everything important remains reachable without custom JS.
- `references/data-viz.md` — when to reach past inline SVG to Chart.js (quantitative) or Mermaid (large graphs), and how the shell lazy-loads + themes them.

Use the shell and references as a shared visual system, not as a score target. There is no numeric style gate; quality comes from browser verification, source fidelity, restrained visual language, and whether the structure lowers reader effort.

## Workflow

1. **Understand the artifact.** Identify the reader, the one idea they must leave with, and the structure that will get them there. Ask only if a missing decision changes the artifact.
2. **Start from the shell.** Copy this skill's `assets/shell.html` to the output path and write content inside `<div class="container">`.
3. **Invent the structure for this artifact.** Do not fill a fixed template. Use any component or layout that improves comprehension. The catalog is a palette, not a checklist.
4. **Plan navigation for length.** If the artifact is long (4+ major sections or 3+ viewports), give the reader a map and a way to control depth: a `.toc`, `.fold` for optional depth, `[data-tabs]` for parallel views. Do not cram a long artifact into one flat scroll. Keep the headline insight on the first screen — never fold the main point. The shell can auto-build a fallback `.toc` from 4+ `<h2>` sections if you forget, but that is a safety net, not the standard: write an explicit `<nav class="toc">` with matching section ids when the map is part of the intended reading path.
5. **Keep the visual language fixed.** Warm parchment background, near-black ink, clay accent, serif editorial headings, JetBrains Mono for code, hairline rules, soft ring borders, restrained dark code blocks.
6. **Run the QA pass.** Combine rendered-view checks with the optional `tools/pretty-qa.mjs` helper. Check browser errors, first-screen comprehension, CJK typography when relevant, source-fact fidelity, restrained palette/type/spacing, component markup contracts, SVG label fit, prose discipline, and whether every visual element earns its place.
7. **Open or render the file using the available environment.** macOS: `open <artifact.html>`. Linux desktop: `xdg-open <artifact.html>`. Headless/container: use a browser screenshot if available, or state that visual QA was limited. Report the path and verification state; do not dump the artifact's contents in chat.

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
- Korean and mixed Korean/English are first-class. The shell uses Hahmlet because it keeps CJK prose visually close to the serif posture without breaking Korean rendering.

### Content safety

Treat user-provided or retrieved text as untrusted. Escape text before inserting it into HTML nodes, SVG `<text>`, attributes, and JSON-in-attribute values such as `data-chart`. Never paste raw HTML from a source document unless the user explicitly requested preserving trusted markup and you have inspected it.

Risky insertion points include `<p>`, `<figcaption>`, SVG labels, `href`, `src`, `aria-label`, `data-note`, `data-chart`, and code snippets containing strings like `</script>`. Prefer text nodes and attribute escaping over string concatenation.

### Prose discipline

A figure of speech earns its place the same way a diagram does — by carrying a thought the plain sentence could not. Strip the metaphor: if an insight remains, keep it; if only ornament remains, cut back to the plain statement. The cut is for noise, not substance — where the idea itself is genuinely hard, slow down and expand instead of trimming. The danger is two-sided: a flattened, dry voice is as wrong as prose that reaches for a flourish every sentence. Spend words only where they buy comprehension, and never let the writing describe its own structure — the words should be the understanding, not a description of the act of explaining.

### Cognitive-load visuals

Visuals are not decoration. Add a diagram only when it saves the reader from doing mental bookkeeping: simulating branches, remembering a timeline, comparing before/after states, mapping input to output, following a data transformation, or stacking verification evidence.

Before adding any visual or interaction — `<figure>`, a chart, a tab group, a stepper — name the specific burden it removes. If the answer is vague ("it looks nicer", "the page needs interest"), skip it. There is no fixed ceiling on count; the ceiling is the gate: every element must earn its place by removing a named burden. A page may be richly visual or nearly all prose — what is never allowed is a visual or widget that exists only to look busy.

**Climb the modality ladder.** The same idea costs the reader less working memory as it moves from prose to a static diagram to motion, so motion (an animated SVG, a stepped reveal) is a first-class tool, not a last resort — there is no count-cap on it. But each climb pays two tolls: the *named burden* above, and *truthfulness* — motion asserts time, order, causality, or parallelism, so animate only where those are real (a sequence reveal is honest because the page already flows in time; animating independent items to look parallel is not). Every animation must degrade to a meaningful final still frame with JS off and under `prefers-reduced-motion`.

Inline SVG is the default. For final pretty artifacts, prefer inline SVG styled with the shell tokens. When the data is genuinely quantitative use Chart.js, and for large auto-laid graphs use Mermaid only as a drafting tool: a final artifact embeds the pre-rendered static SVG, never a runtime `.mermaid` div, which degrades to raw source with JS off. The shell lazy-loads Chart.js and Mermaid from pinned CDNs only when the page contains the element (`[data-chart]` on a `<canvas>`, or `.mermaid`). See `data-viz.md`.

Active widgets (before/after, stepper, filterable table) are progressive enhancements — the page must be fully usable, and the main point fully visible, with JS disabled. Always pair a chart with its source data table.

### Components

These are named conveniences in the shell, not the only legal moves. If comprehension wants a comparison grid, a single-column essay, a dense table, a split-panel walkthrough, or a custom semantic block, use it. Keep the color, spacing, typography, hairlines, and restraint in the Yuumi family.

- Use `.lede` for the headline insight, not a vague subtitle.
- Use `.meta` for small labeled facts.
- Use `.callout` for a real insight that deserves a left clay rail. If everything is a callout, nothing is.
- Use `.aside` for cautions or edge cases.
- Use `.steps` only when order matters.
- Use `<figure>` + SVG for spatial, temporal, or branching relationships. Keep it line-art: thin strokes, no gradients, no shadows.
- Use language-classed `<pre><code class="language-…">` for short code excerpts. Bare `<pre><code>` is a QA failure unless intentionally plain text and labeled as such. The shell has a best-effort fallback for common languages, but the artifact should still declare the language explicitly and verify that token spans were produced. Do not paste huge code blocks as a substitute for explanation.

## Quality bar

The page should feel warm, editorial, restrained, and technically precise: paper, quiet hierarchy, sparse line-art, hairline rules, clay used sparingly, and no generic SaaS sludge.

The real test is comprehension. A reader should need less working memory after the page exists:

- the headline insight is visible in the first viewport
- named facts are grouped instead of buried in prose
- branches, timelines, contracts, and verification stacks are visualized only when prose would make the reader calculate
- visuals are source-grounded and captioned with the actual insight
- the browser renders cleanly with no console errors
- components render as components: each matches its markup contract in `components.md` — verified in the rendered browser view, because a collapsed grid, an unstyled list, or a missing rule line produces no console error
- interactions work and degrade: `[data-tabs]` switch, steppers step, folds toggle natively, and with JS off every tab panel/step remains visible while the main point stays on the first screen
- code blocks are language-classed (`<pre><code class="language-…">`) and Prism produced token spans; no bare `<pre><code>` blocks remain unless intentionally plain text and labeled as such
- charts render on-palette with a paired data table, and chart/graph libraries load only on pages that use them
- the layout is navigable: long pages have a map (`.toc`) and the reader can control depth; the map remains tappable on mobile
- keyboard focus is visible on every interactive element; motion respects `prefers-reduced-motion`
- SVGs use an accessible structure: `<figure>`, `<svg role="img" aria-labelledby="...">`, `<title>`, `<desc>`, and an insight-bearing `<figcaption>`
- meaningful `<img>` elements have `alt`; decorative images use `alt=""`
- SVG text fits: every label sits inside its box with padding and no label overlaps a neighbor, even with the longest label in the diagram — hand-placed coordinates overflow on a long name, so verify in the rendered browser view, not by reading the markup
- every figure of speech earns its place: stripping the metaphor still leaves the insight; prose that leaves only style is cut, and the writing never narrates its own structure

## Anti-patterns

- Do not clone proprietary copy, product screens, or layouts. Borrow broad design qualities, not copyrighted content.
- Do not add fake metrics, testimonial cards, decorative icons, or generic feature grids.
- Do not add diagrams just because the page feels empty. Visualize only the parts the reader would otherwise have to calculate or stack mentally.
- Do not use gradients, glass, neon, rainbow accents, or cool blue-gray palettes.
- Do not use a fixed section order just because a previous pretty page did.
- Do not put long explanations in chat. The HTML artifact is the deliverable.
- Do not add interaction for its own sake. A tab group, stepper, or slider must remove a named burden, not signal "interactive".
- Do not fold, tab, or otherwise hide the artifact's main point. Progressive disclosure defers *optional depth*, never the headline insight.
- Do not show a chart without its underlying data table. Charts must remain fact-checkable when a chart library fails or JS is disabled.
- Do not load a chart/graph library "just in case". Only the element's presence triggers it.
- Do not use bare `<pre><code>` for code examples. Add `class="language-sql"`, `language-kotlin`, `language-typescript`, etc.; otherwise Prism may leave the whole block as plain warm-white text.
- Do not let library defaults (bright blue, drop shadows) leak through — verify charts render on-palette.
- Do not let rhetoric signal tone without carrying meaning — if stripping a figure leaves the same point, it was decoration; narrating the document's own structure is the same noise.
- Do not place two opposing labels on the same SVG row — a long name will cross the one facing it. Give a secondary label its own line; a lone label cannot collide regardless of length. When hand-placed labels keep overflowing, switch to CSS auto-width boxes or an auto-layout renderer.
- Do not wrap a component's root element in an extra container. The markup contracts in `components.md` are exact: grid and counter components lay out direct children only, and one stray wrapper collapses the layout without any console error.

## Optional automated QA

After creating an artifact, run `node tools/pretty-qa.mjs <artifact.html>` when Node is available. This does not replace rendered visual QA, but it catches common silent failures: default titles, wrong Korean `lang`, bare code blocks, runtime Mermaid in final output, images without `alt`, broken TOC anchors, inline event handlers, and charts without nearby tables.

## When you're done

Tell the user: `Saved to <path>. Verification: <checks performed>. Limitations: <anything not visually verified>.`

If visual QA is limited, say exactly what was and was not verified. Do not hand-wave it as done.
