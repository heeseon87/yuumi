# Data Visualization — when to reach past inline SVG

Inline SVG (see `svg-patterns.md`) is the default for qualitative and relational diagrams — it carries the line-art Anthropic look. Reach for a library ONLY when the data is genuinely quantitative or the graph is too large to hand-draw.

## Decision rule
- **Relationship / sequence / branch / architecture** → inline SVG. Always.
- **Quantitative series** (bars, lines, distributions, real numbers to scale) → Chart.js.
- **Large auto-laid graph** (many nodes/edges, flowcharts you won't hand-place) → Mermaid — runtime in drafts, pre-rendered static SVG in final artifacts (see below).
- If a 3-row comparison fits a `<table>` or prose, use that. A chart for 3 numbers is slop.

## How loading works (do nothing special)
The shell lazy-loads Chart.js / Mermaid from a pinned CDN **only when** the page contains `[data-chart]` or `.mermaid`. You just write the element; the boot script injects the library and themes it with the shell tokens. Pages without charts never fetch the library.

## Chart.js
Put a Chart.js config (JSON) in `data-chart` **on a `<canvas>` element** (Chart.js requires a canvas — a `<div>` will silently fail to render):

    <canvas data-chart='{"type":"line","data":{"labels":["1월","2월"],"datasets":[{"label":"요청","data":[10,24]}]}}'></canvas>

- Colors default to the clay accent and token grid/text — leave them unset to stay on-palette.
- **Always pair a chart with its source data table** (accessibility + JS-off fallback + fact-check).
- Keep it one idea per chart. No dual axes unless the comparison demands it.

## Mermaid
Mermaid is a **drafting tool** here: the fastest way to get a large graph auto-laid, but wrong as a runtime dependency in a finished page — with JS off, a `.mermaid` div degrades to raw diagram source, which fails the JS-off rule everything else on the page obeys.

**Drafts / working sessions** — runtime loading is fine. Put diagram source in a `<div class="mermaid">`:

    <div class="mermaid">graph LR; 요청-->검증-->응답;</div>

- Themed to `base` with shell tokens automatically.
- For a small, finished, on-brand diagram, hand-drawn inline SVG still looks better.

**Final artifacts — pre-render to static SVG and inline it:**

1. Write the diagram source to a temp file (`diagram.mmd`).
2. Render: `npx -p @mermaid-js/mermaid-cli mmdc -i diagram.mmd -o diagram.svg` (first run downloads a headless browser, so it needs network once).
3. Inline the resulting `<svg>` into the page inside a `<figure>` with a real caption; delete the temp files.
4. Re-theme to the shell: mmdc defaults will not match the parchment palette — set strokes, fills, and fonts to the shell tokens via a mermaid theme config or by editing the SVG's styles.
5. Verify in the rendered browser view like any hand-drawn figure: labels fit their boxes, nothing overlaps, colors on-palette.

The pre-rendered result obeys every rule inline SVG obeys — JS-off safe, self-contained, fact-checkable. If pre-rendering is impossible (no network or the renderer won't run), do not ship runtime Mermaid in a final artifact: hand-draw the part that matters as inline SVG, or carry the relationship in prose with a smaller diagram.

## Anti-patterns
- A chart where a sentence would do.
- A chart with no underlying data table.
- Library defaults (bright blue, drop shadows) leaking through — always verify it rendered on-palette.
- Loading a library "just in case" — only the element's presence should trigger it.
