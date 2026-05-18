---
name: claude-kit:implement
description: Implement a spec while keeping a running implementation-notes.html file in the Anthropic essay theme (same theme as /claude-kit:explain).
argument-hint: [spec]
---

Implement $1.

As you work, maintain a running `implementation-notes.html` file in the current working directory that captures anything I should know about how the implementation diverges from or interprets the spec:

- **Design decisions** — choices you made where the spec was ambiguous
- **Deviations** — places where you intentionally departed from the spec, and why
- **Tradeoffs** — alternatives you considered and why you picked what you did
- **Open questions** — anything you'd want me to confirm or revise

Update the file continuously as decisions accumulate — don't batch at the end. If a later decision reverses an earlier one, mark the earlier entry's status as `REVISED` and explain why both decisions are recorded.

# How to render — Anthropic essay theme

The notes are an HTML file in the **same theme as `/claude-kit:explain`**: book-like, typography-centric, ivory + clay + serif. Below are the core tokens you must use. For the full pattern catalog (drop caps, footnotes, pull quotes, ornaments, etc.), defer to `skills/explain/SKILL.md` and the bundled samples in `references/html-effectiveness/`.

## Fonts (`<head>`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Hahmlet:wght@100..900&display=swap" rel="stylesheet">
```

Hahmlet handles Korean via `unicode-range`; Latin falls through to system fonts. Monaco for mono. **Do not** load Inter, Source Serif 4, Roboto, Noto Sans KR, or Nanum Gothic Coding.

## Design tokens

```css
:root {
  --ivory:    #FAF9F5;
  --slate:    #141413;
  --clay:     #D97757;
  --oat:      #E3DACC;
  --olive:    #788C5D;
  --gray-150: #F0EEE6;
  --gray-300: #D1CFC5;
  --gray-500: #87867F;
  --gray-700: #3D3D3A;
  --serif: 'Hahmlet', ui-serif, Georgia, 'Times New Roman', serif;
  --sans:  'Hahmlet', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --mono:  Monaco, ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
body {
  background: var(--ivory);
  color: var(--gray-700);
  font-family: var(--serif);
  font-size: 19px;
  line-height: 1.75;
  padding: 72px 24px 120px;
}
```

## Typography

- Container: `max-width: 720–740px; margin: 0 auto;` — single column
- H1 serif 48–56px weight 500 slate, with `letter-spacing: -0.02em`
- H2 serif 26–30px weight 500 slate, optionally prefixed with italic clay numerals (`<h2><span class="num">01</span>Title</h2>`)
- Lede / subtitle: italic serif 22–24px gray-700
- Eyebrow above H1: sans 12px uppercase, letter-spacing 0.16em, clay color

## Patterns for an implementation-notes file

A typical implementation-notes.html has fewer ornaments than a full essay — it leans on structured elements:

- **Header**: eyebrow ("project name · implementation notes"), H1 (task name), italic lede summary
- **Decision summary table**: top + bottom `1px solid var(--gray-300)` on `<thead>`, hairline `var(--gray-150)` row dividers, no other borders
- **Note boxes** for deviations/decisions: `border-left: 2px solid var(--clay)`, italic clay label like `"Note"` or `"Deviation 1 — title"`, no card background
- **Aside boxes** for caveats/corrections: `border-left: 2px solid var(--gray-300)`, italic slate label
- **Status badges** (small uppercase pills with `padding: 2px 8px; border-radius: 3px;`):
  - `.status.done` — `background: rgba(120,140,93,0.15); color: #4a5a3b;`
  - `.status.open` — `background: rgba(217,119,87,0.15); color: var(--clay);`
  - `.status.decided` / `.status.revised` — `background: var(--gray-150); color: var(--gray-700);`
- **Inline code**: Monaco mono 0.86em, clay color on `background: rgba(217,119,87,0.08)`, 4px radius
- **Block code**: dark slate `#141413` bg, ivory text, Monaco mono 13.5px, 22–26px padding, 6px radius
- **Ornament** between major sections: `<div class="ornament">· · ·</div>` — centered clay, letter-spacing 0.5em, opacity 0.7

## Recommended structure

1. **Header** — eyebrow + H1 + italic lede
2. **§01 Spec interpretation** — restate the user's command (in a `<code>` block) and explain how you read it
3. **§02 Major decisions** — table with columns: area / status badge / decision
4. **§03 Deviations from spec** — note boxes, one per intentional departure, each with **why**
5. **§04 Alternatives considered** — H3 per alternative, brief reason for rejection
6. **§05 Open questions** — note boxes for things you'd want the user to confirm
7. **Ornament** + closing single-line italic remark

## References (bundled with this plugin)

The full Anthropic HTML gallery is bundled in this plugin at `references/html-effectiveness/` (Apache 2.0). See `ATTRIBUTION.md` there for the complete file index. The most relevant samples for implementation notes:

- `16-implementation-plan.html` — **primary reference**. Direct match for this skill's use case: structured plan/notes with decisions, alternatives, and open items.
- `15-research-concept-explainer.html` — essay tone, long-form structure for when notes need more narrative.
- `11-status-report.html` — structured status table patterns useful for decision summaries.

Read these when you need a stylistic sanity check.

# Process

1. Read / restate the spec.
2. Create `implementation-notes.html` **early** — right after the first non-trivial decision, not at the end.
3. Append continuously as you work. Each significant decision becomes a row in the table or a note box.
4. If a later decision reverses an earlier one: update the earlier entry's badge to `REVISED` and explain why both are recorded.
5. End by running `open implementation-notes.html` so the user can review.
