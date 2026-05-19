# Component Catalog

A catalog of the visual components available in `assets/shell.html`. **Each entry tells you what the component is *for* — when its meaning fits.** It does not tell you where to put it or what should come before or after. That is your decision, made for the specific target you're explaining.

Read this when you have a question like *"I want to convey X — what fits?"* — not before you've thought about what the page needs to say.

---

## Primitives (always available, used as needed)

### `<h1>`, `<h2>`, `<h3>`
Serif headings, sized for hierarchy. `<h2>` can take an italic number prefix via `<span class="num">01</span>` when you want academic-essay numbering, but bare headings are equally valid.

### `<p>` — body paragraph
Standard prose. 19px sans-serif at line-height 1.75 — book-like density.

### `.body-start` — drop-cap paragraph
A first letter set in large serif accent. Use it **once per document**, on the paragraph where you want to mark "the real prose starts here." More than once dilutes the effect.

### `<blockquote>` — pull quote
A line that deserves to ring. Big italic serif with a hanging quote glyph. The quote mark is drawn by CSS — don't include literal `"` in your text. Use sparingly: 0–3 per document.

### `<pre><code>` — code excerpt
Dark monospace block. Spans inside for syntax color: `.k` (keyword), `.fn` (function), `.s` (string), `.c` (comment, italic), `.n` (default). Keep excerpts short — if the snippet is long, your prose is doing too little.

### `<code>` — inline code
Accent-colored monospace inline. Use for identifiers, file paths, short literal values.

### `.hr-soft`, `.ornament`
Section breaks. `.hr-soft` is a hairline rule. `.ornament` is centered `· · ·` in italic serif — more ceremonial. Reach for either when prose alone doesn't signal "we're shifting gears."

---

## Headed front-matter

### `.eyebrow`
Small uppercase tracked label, accent-deep colored. Often used above an `<h1>` for a kicker (publication name, doc type). Not required — bare `<h1>` is fine.

### `.lede`
Italic serif sentence after the title. The headline insight — written so a reader who reads *only* this line still walks away with the point. The page's job is to expand on this; if your lede doesn't already give the gist, rewrite it.

### `.byline`
Small sans-serif line for context (subject path, file location, date). Use when readers benefit from knowing "where this lives in the codebase." Skip for conceptual explanations.

---

## Structural prose components

### `.meta` — definition list
Borderless `<dl>` with hairline rules above and below, two-column grid. Use when you have a small set of *named facts* a reader wants at a glance — endpoint metadata, configuration parameters, identifier mappings. Don't use it for prose; use it for *short labeled values*.

### `.method-tag`
Small dark pill for HTTP methods (`POST`, `GET`, etc.) inside `.meta`. Only when explaining an HTTP endpoint.

### `.steps` — ordered list with hanging numerals
Each item gets an italic serif number and a hairline connector to the next. Use when something happens *in order* and the order matters. Don't use it for an unordered set of facts (use prose or `.callout` instead).

### `.nest` — nested sub-group
A left accent rail around a deeper inner ordered list. Use when one step in `.steps` contains several sub-steps (e.g., a transaction encloses four operations). Pass `data-label="..."` to label the rail (`TRANSACTION`, `PHASE 2`, etc.); omit for an unlabeled group.

### `.callout` — left-accent callout
A minimal block: italic serif label + dash list. Use it for **2-3 sentences of insight that earn their own breathing room** — the surprising point, the non-obvious connection. Don't overuse: more than 4-5 per document and they stop being callouts. If everything is a callout, nothing is.

Suggested labels (you choose what fits): `Insight`, `Surprise`, `Why it matters`, `Key idea`. A label that names the *intent* of the callout beats a generic one.

### `.aside` — softer side note
Like `.callout` but with a gray border instead of accent. Use for caution, edge cases, or "the shadow side" — content that's important but tonally quieter than an insight. The visual softness signals "this is a complication, not a revelation."

### `.lesson` — takeaway
Inline italic tag + serif title + dim body. Use for portable lessons — what a senior would tell a junior. Tag with roman numerals (`i.`, `ii.`), prose categories (`Pattern`, `Caution`), or any short marker. Useful as a closing block, but not the only way to close.

---

## Diagrams and tables

### `<figure>` + `<svg>` + `<figcaption>`
For diagrams. Caption is italic serif centered, prefixed by `<span class="fig-num">Fig N</span>`. The caption should make the *insight* explicit, not describe what's drawn — a reader who sees only the caption should still get the point.

See `references/svg-patterns.md` for four patterns: ERD, sequence, fan-out/join (with animation), decision tree. Use a diagram when the relationship is spatial, temporal, or branching in a way that linear prose can't carry. Skip it when prose already makes the idea clear.

### `<table>` (inside `.t-wrap`)
Hairline rows, no zebra striping. Use for genuinely tabular data — 3+ columns of parallel facts. For 2 columns with 3 rows, prose or a `.callout` is usually clearer.

### `.tree` — file/path hierarchy
Two-column CSS grid: left column is monospace path (with ASCII tree connectors), right column is italic serif annotations. The grid handles alignment automatically — never use whitespace padding to align comments (especially with CJK characters, where it always breaks). See the inner spans `.path .dir`, `.path .var`, `.path .branch`, `.note` for styling parts of each row.

---

## Closing apparatus

### `.footnotes`
Numbered footnotes at the document end with a thin rule above. Reference from the body with `<sup><a href="#fn1">1</a></sup>`. Use for tangents, prior art, citations — content that would interrupt the body if inline. Also a good place for a final "Source · `path/to/file.ext`" line.

### `<sup>` markers in body
Tiny superscript reference. The link goes to the matching `<li id="fnN">` in `.footnotes`.

---

## Picking components — the rule

The components above are *tools*. The right tool depends on what you're trying to convey at that moment:

- A *headline insight* → `.lede` or `.callout`
- A *list of ordered actions* → `.steps`
- A *list of unordered facts* → prose, or `.callout` if they're insights
- A *cluster of named labels and values* → `.meta` or `<table>`
- A *spatial/temporal relationship* → `<figure>` with SVG
- A *single ringing sentence* → `<blockquote>`
- A *named caution or complication* → `.aside`
- A *portable lesson to leave the reader with* → `.lesson`
- A *tangent or citation* → `<sup>` + `.footnotes`

What you're free to invent:
- The order of sections
- Whether to have numbered `<h2>` headings or unnumbered ones, or none
- Whether to open with a quote, a question, a code excerpt, or prose
- How many callouts, how many figures, how many lessons
- Whether to close with takeaways, a quote, or just a final paragraph

There is no canonical structure. There is the structure *this* target needs.

---

## Common mistakes to avoid

- **Using `.callout` more than 4-5 times.** They lose their impact. Most content should be prose.
- **Adding `.body-start` to multiple paragraphs.** Drop cap is once per document.
- **Forcing a `<table>` for two-column data.** Prose or `.callout` is often clearer.
- **Adding background colors to `.callout` or `.aside`.** They should stay on the page background — the left border is the entire accent.
- **Forgetting the empty `<div class="note"></div>` cell in `.tree` rows.** The grid needs both cells per row to align.
- **Using `<h1>` more than once.** It's the page title.
- **Including literal quotation marks in `<blockquote>`.** The CSS draws the opening glyph.
