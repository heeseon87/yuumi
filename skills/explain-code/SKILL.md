---
name: claude-kit:explain-code
description: Explain code as a self-contained HTML artifact in Anthropic's technical-documentation theme — same content philosophy as /claude-kit:explain, but structured as a callstack walkthrough with sidebar (Key files + Gotchas) for use cases where the reader is sitting next to the editor.
argument-hint: [target]
---

# What to explain

Explain the whole in plain language.

Explain the technical architecture, the structure of the codebase and how the various parts are connected, the technologies used, why we made these technical decisions, and lessons I can learn from it (this should include the bugs we ran into and how we fixed them, potential pitfalls and how to avoid them in the future, new technologies used, how good engineers think and work, best practices, etc).

It should be very engaging to read; don't make it sound like boring technical documentation/textbook. Where appropriate, use analogies and anecdotes to make it more understandable and memorable.

# Code-specific structure

This is the code-focused variant of `/claude-kit:explain`. The reader is a fellow engineer who will modify, debug, or extend this code. Same content philosophy as the essay variant, but organized as a walkthrough:

- **Request path / data flow** — major components and how they connect (one SVG at the top)
- **Callstack walkthrough** — 4–7 numbered steps, each pointing at a specific `file:line` range, each with 1–3 paragraphs covering what happens and why
- **Hot steps** — mark 1–2 steps as "hot" where the system does the most work or has the most interesting design decision
- **Key files** — sidebar list with one-sentence purpose each
- **Gotchas** — sidebar list of 3–5 pitfalls a future maintainer should know

Read the source files **before** writing. Don't speculate about code you haven't inspected.

# How to render

Self-contained HTML in Anthropic's technical-documentation theme — the tone of their internal dev-tooling samples (e.g., the "code understanding" examples in their HTML gallery). Save as `<target-slug>-explained.html` in the current working directory and run `open <path>`.

## Anthropic tech-doc theme

Documentation-flavored, sidebar-driven, white cards on ivory. Smaller body, sans body font. Wide two-column layout with a sticky sidebar.

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

Hahmlet handles Korean via `unicode-range`; Latin uses system fonts. Monaco for mono. **Do not** load Inter / Source Serif 4 / Roboto / Noto Sans KR / Nanum Gothic Coding.

### Typography

- Body: `font-family: var(--sans); font-size: 15px; line-height: 1.65; color: var(--gray-700);` — documentation tone, NOT book
- H1: serif 32px weight 500 slate, letter-spacing -0.01em
- H2: serif 22px weight 500 slate
- Repo-line above H1: mono 12.5px gray-500 ("org/repo · note type")
- Summary: 15.5px max-width 760px
- Body color `gray-700` (not pure black)

### Layout — two columns with sticky sidebar

```css
.page {
  max-width: 1080px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 40px;
}
@media (max-width: 960px) { .page { grid-template-columns: 1fr; } }
header { grid-column: 1 / -1; }
aside { position: sticky; top: 24px; align-self: start; }
```

### Header pattern

```html
<header>
  <div class="repo-line">org/repo · note type</div>
  <h1>Title naming the system/endpoint/module</h1>
  <p class="summary">One paragraph capturing the system and the human story behind it. Mention the surprising design decision, the trade-off, the lesson — analogies welcome.</p>
  <div class="tldr"><b>TL;DR</b> · one or two terse sentences capturing the essence.</div>
</header>
```

- `.tldr`: `border: 1.5px solid var(--gray-300); border-left: 3px solid var(--clay); border-radius: 10px; background: #fff; padding: 16px 18px;`

### Callstack walkthrough — primary pattern

```html
<div class="step [hot]">
  <div class="badge">N</div>
  <div class="step-body">
    <div class="step-loc">path/to/file.kt<span class="range"> :48-52 — short label</span></div>
    <p>What happens at this step. Use plain language, add an analogy if it helps. This is where the engineering story is told step by step.</p>
    <p>Optional second paragraph for design rationale, trade-off, or pitfall.</p>
    <details class="snippet">
      <summary>show source</summary>
      <pre class="code">...</pre>
    </details>
  </div>
</div>
```

Styling:
- `.step`: 44px / 1fr grid, gap 18px, padding 20px 0, border-bottom 1.5px gray-150
- `.badge`: 34px circle, `background: var(--oat); border: 1.5px solid var(--gray-300); color: var(--slate); font-family: var(--mono); font-weight: 600; font-size: 14px;`
- `.step.hot .badge`: `background: rgba(217,119,87,0.14); border-color: var(--clay); color: var(--clay);`
- `.step-loc`: mono 13px slate, `.range` in gray-500
- `.snippet summary`: mono 12.5px gray-500 with rotating `▸` marker in clay
- `pre.code`: `background: var(--slate); color: #E8E6DC; font-family: var(--mono); font-size: 12.5px; border-radius: 8px; padding: 14px 16px;`

JavaScript: only one snippet open at a time.

```javascript
var snippets = document.querySelectorAll('details.snippet');
snippets.forEach(function (d) {
  d.addEventListener('toggle', function () {
    if (!d.open) return;
    snippets.forEach(function (other) { if (other !== d) other.open = false; });
  });
});
```

### Sidebar — Key files + Gotchas

```html
<aside>
  <div class="panel">
    <h3>Key files</h3>
    <ul class="key-files">
      <li>
        <span class="path">path/to/file.kt</span>
        <span class="desc">One-sentence purpose.</span>
      </li>
    </ul>
  </div>
  <div class="gotchas panel">
    <h3>Gotchas</h3>
    <ul>
      <li><strong>Pitfall name</strong> — short description with <code>code references</code>.</li>
    </ul>
  </div>
</aside>
```

Styling:
- `.panel`: white card, 1.5px gray-300 border, 12px radius, 18px 20px padding
- `.panel h3`: sans 11px weight 600 uppercase letter-spacing 0.08em gray-500
- `.key-files .path`: mono 12px slate (block, word-break)
- `.key-files .desc`: 12.5px gray-500
- `.gotchas`: `border-color: var(--clay); background: rgba(217,119,87,0.06);`
- `.gotchas h3`: clay, weight 700
- `.gotchas li::before`: 5px clay square bullet at left:0; top:8px

### Diagram panel — flow / architecture SVG

Place one diagram **before** the walkthrough showing the request path or architecture.

```css
.diagram-panel { border: 1.5px solid var(--gray-300); border-radius: 12px; background: #fff; padding: 24px; overflow-x: auto; }
svg.flow text { font-family: var(--mono); font-size: 12px; fill: var(--slate); }
svg.flow .sub { font-size: 10px; fill: var(--gray-500); }
svg.flow .box { fill: #fff; stroke: var(--gray-300); stroke-width: 1.5; }
svg.flow .box.hot { fill: rgba(217,119,87,0.10); stroke: var(--clay); }
svg.flow .arrow { stroke: var(--gray-500); stroke-width: 1.5; fill: none; }
```

Use `<marker id="arrowHead">` for arrowheads on static diagrams.

### Optional animation (one only)

If the code has interesting concurrency (parallel calls, fan-out/join), add one animated SVG **after** the walkthrough.

- Measure path length with `path.getTotalLength()` — never hardcode `stroke-dasharray`
- CSS `transition` + JS `setTimeout` for multi-phase animations (fan-out → join → node activation → final arrow)
- IntersectionObserver auto-play on viewport entry (`threshold: 0.35`)
- Replay button calling `window.replayParallel`-style function
- `prefers-reduced-motion: reduce` honored with static fallback
- `marker-end` cannot be hidden by `stroke-dashoffset` — remove from animated paths or fade arrows separately

### What NOT to do

- No drop cap, footnotes, or ornaments — those are essay style (`/claude-kit:explain`).
- No serif body — tech-doc body is sans.
- No narrow single column — this style is wide grid with sidebar.
- No Latin web fonts.
- Don't omit the sidebar. Key files + Gotchas are mandatory.
- Don't paste full code by default — wrap snippets in `<details>`.
- H1 stays at 32px (not 60px). This is documentation, not magazine.

## References (bundled with this plugin)

The full Anthropic HTML gallery (20 samples + index, Apache 2.0) is bundled in this plugin at `references/html-effectiveness/`. See `ATTRIBUTION.md` for the complete file index and license notes.

For code-explainer work, the most relevant samples are:

- `04-code-understanding.html` — **primary reference**. Direct match for this skill: sidebar (Key files + Gotchas), callstack walkthrough with numbered badges, expandable code, hot steps with clay accent.
- `13-flowchart-diagram.html` — architecture/flow SVG with hot boxes and labeled arrows. Match the box styles, stroke widths, and label typography here.
- `17-pr-writeup.html` — structured change description close to this style; good for PR-flavored explanations.
- `03-code-review-pr.html` — code review write-up patterns useful for diff-style explanations.
- `14-research-feature-explainer.html` — sticky nav, expandable `<details>` sections, tab patterns.
- `10-svg-illustrations.html` — SVG illustration patterns and palette use.

Read these files **when you need a stylistic sanity check** (sidebar panel spacing, hot-step proportions, code block contrast, how arrows are labeled, etc.). Treat them as the source of truth if anything in this SKILL.md feels ambiguous.

## Process

1. **Read the target.** Open the controller, service, repository, mapper, and infrastructure files. Trace the request end-to-end.
2. **Architecture mental model.** Major components, trust boundaries, where the work actually happens.
3. **Decide structure.** Which 4–7 steps form the callstack? Which 1–2 are "hot"? Which files go in the sidebar? Which 3–5 pitfalls go in Gotchas?
4. **Draft the Request path SVG** — boxes for major components, arrows for flow, hot fill on the most interesting box(es).
5. **Write the walkthrough.** For each step: file path + line range, 1–3 plain-language paragraphs covering what happens, why this design, what lesson/pitfall it carries. Use analogies. Wrap code in collapsed `<details>`.
6. **Write the sidebar.** Key files (one-sentence purpose each) and Gotchas (each with `code references` to specific functions/columns).
7. **Optionally add one animated SVG** for concurrency that text alone can't convey.
8. **Save and open.** Filename: `<target-slug>-explained.html`. Run `open <path>`.

Plain language. Engineering story. Analogies. Anecdotes. Make it the kind of doc you'd bookmark.
