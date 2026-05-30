# Data Visualization — when to reach past inline SVG

Inline SVG (see `svg-patterns.md`) is the default for qualitative and relational diagrams — it carries the line-art Anthropic look. Reach for a library ONLY when the data is genuinely quantitative or the graph is too large to hand-draw.

## Decision rule
- **Relationship / sequence / branch / architecture** → inline SVG. Always.
- **Quantitative series** (bars, lines, distributions, real numbers to scale) → Chart.js.
- **Large auto-laid graph** (many nodes/edges, flowcharts you won't hand-place) → Mermaid.
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
Put diagram source in a `<div class="mermaid">`:

    <div class="mermaid">graph LR; 요청-->검증-->응답;</div>

- Themed to `base` with shell tokens automatically.
- Prefer Mermaid for *draft / large* graphs. For a small, finished, on-brand diagram, hand-drawn inline SVG still looks better.

## Anti-patterns
- A chart where a sentence would do.
- A chart with no underlying data table.
- Library defaults (bright blue, drop shadows) leaking through — always verify it rendered on-palette.
- Loading a library "just in case" — only the element's presence should trigger it.
