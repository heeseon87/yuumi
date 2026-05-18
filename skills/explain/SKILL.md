---
name: claude-kit:explain
description: Explain a target as a self-contained HTML artifact in Anthropic's essay theme — same content philosophy as before, just rendered as an engaging HTML page instead of plain markdown.
argument-hint: [target]
---

# What to explain

Explain the whole in plain language.

Explain the technical architecture, the structure of the codebase and how the various parts are connected, the technologies used, why we made these technical decisions, and lessons I can learn from it (this should include the bugs we ran into and how we fixed them, potential pitfalls and how to avoid them in the future, new technologies used, how good engineers think and work, best practices, etc).

It should be very engaging to read; don't make it sound like boring technical documentation/textbook. Where appropriate, use analogies and anecdotes to make it more understandable and memorable.

# How to render

The output is a **self-contained HTML file** in Anthropic's long-form essay theme — the same tone as their research blog (interpretability papers, "tracing thoughts" series). Save to the current working directory as `<target-slug>-explained.html` and run `open <path>` to launch it in the browser.

For code/file targets: read the relevant files before writing. For URLs: fetch the content. For abstract topics: synthesize from knowledge.

## Anthropic essay theme

Book-like, typography-centric, generous whitespace. Single column. Serif body. Drop cap on the opening paragraph. Footnotes for prior art. Insight callouts with a clay accent line.

### Design tokens

```css
:root {
  --ivory:    #FAF9F5;
  --slate:    #141413;
  --clay:     #D97757;
  --oat:      #E3DACC;
  --olive:    #788C5D;
  --rust:     #B04A3F;
  --gray-150: #F0EEE6;
  --gray-300: #D1CFC5;
  --gray-500: #87867F;
  --gray-700: #3D3D3A;
  --serif: 'Hahmlet', ui-serif, Georgia, 'Times New Roman', serif;
  --sans:  'Hahmlet', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --mono:  Monaco, ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
```

### Fonts in `<head>`

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hahmlet:wght@100..900&display=swap" rel="stylesheet">
```

Hahmlet is a Korean serif variable font; `unicode-range` automatically restricts it to Korean glyphs while Latin falls through to system fonts. Monaco is the preferred coding font. **Do not** load Inter, Source Serif 4, Roboto, Noto Sans KR, or Nanum Gothic Coding — system fonts + Hahmlet only.

### Typography

- Body: `font-family: var(--serif); font-size: 19px; line-height: 1.75; color: var(--gray-700);`
- H1: serif 56–60px, weight 500, color slate, letter-spacing -0.02em
- H2: serif 28–30px, weight 500, color slate (often prefixed with italic clay numerals "01", "02")
- Lede / subtitle: italic serif 22–24px, gray-700
- Eyebrow above H1: sans 12px uppercase, letter-spacing 0.16em, clay color
- Container: `max-width: 720–760px`, single column on ivory background

### Required patterns

- **Drop cap** on the first paragraph after the lede (`::first-letter` float left, ~62px clay serif)
- **Section numbers**: italic clay serif numerals inside H2 (`<h2><span class="num">01</span>Title</h2>`)
- **Insight blocks** for key takeaways: left 2px clay border, italic serif "Insight" label in clay, no card background
- **Asides** for caveats: left 2px gray-300 border, italic serif label
- **Pull quotes**: italic serif 22–24px, with a large hanging `"` glyph in clay
- **Footnotes**: inline `<sup><a href="#fn1">1</a></sup>`, bottom `<ol class="footnotes">`
- **Ornament** between major sections: `<div class="ornament">· · ·</div>` in clay
- **Eyebrow** at the very top: small caps sans label above H1

### Visual elements (sparingly)

Visualizations should **augment** prose, never replace it. Use SVG only where spatial/temporal/relational structure is hard to convey in words alone.

- SVG: hairline strokes (1.2–1.5px), `fill: none`, single clay accent, serif italic labels
- One animation maximum, only if there's true concurrency or motion to show
- For animated lines: measure with `path.getTotalLength()` at runtime — never hardcode `stroke-dasharray`
- Multi-phase animations: CSS `transition` + JS `setTimeout` (easier to replay than `@keyframes`)
- `marker-end` cannot be hidden by `stroke-dashoffset` — remove markers or fade arrows separately
- Honor `prefers-reduced-motion: reduce` with a static fallback
- Auto-play via IntersectionObserver on viewport entry; provide a replay button

### What NOT to do

- No card-heavy UI. Few or zero white panels. Typography carries the structure.
- No gradients.
- No Latin web fonts (Inter, Source Serif 4, Roboto, etc.) — system fonts only.
- No sidebar layout (that's for `/claude-kit:explain-code`).
- Don't shrink H1/H2 to documentation sizes — this is the essay.
- Visualizations augment narrative; they never replace it.

## References (bundled with this plugin)

The full Anthropic HTML gallery (20 samples + index, Apache 2.0) is bundled in this plugin at `references/html-effectiveness/`. See `ATTRIBUTION.md` for the complete file index and license notes.

For essay-style explainer work, the most relevant samples are:

- `15-research-concept-explainer.html` — **primary reference**. Long-form concept walkthrough, closest to this skill's target tone.
- `14-research-feature-explainer.html` — research-flavored explainer with sticky nav and expandable details.
- `10-svg-illustrations.html` — hand-drawn-feeling SVG illustration patterns for diagrams.
- `12-incident-report.html` — timeline + lessons format if the explanation is retro-style.

Read these files **when you need a stylistic sanity check** (spacing, palette, voice, when to use a `<details>` vs a footnote, etc.). Treat them as the source of truth if anything in this SKILL.md feels ambiguous.

## Process

1. Read or research the target (files, URLs, concepts).
2. Find the human story — the surprising decision, the bug that taught a lesson, the clever pattern. Lead with it.
3. Pick a memorable title and lede. Avoid generic "How X works".
4. Draft 5–10 H2 sections, each one tight idea, numbered (01, 02, …).
5. Insert at most 2–3 SVG figures and at most 1 animation. Skip if the target has no meaningful spatial structure.
6. One Insight callout per section if you have something genuinely non-obvious to say.
7. Footnotes for prior art (papers, blog posts, related patterns) and one pull quote every 3–4 sections to break rhythm.
8. Save as `<target-slug>-explained.html` in the current directory. Run `open <path>`.

Use analogies. Use anecdotes. Make the reader want to keep reading.
