# Attribution

The HTML files in this directory are copied from Anthropic's public
"The unreasonable effectiveness of HTML — examples" gallery, released under
the Apache License 2.0. See `LICENSE` for the full text and `README.md` for
the upstream description.

These files serve as **stylistic ground truth** for the claude-kit skills.
They are not templates to copy wholesale — they are reference materials
demonstrating tone, palette, spacing, and pattern choices for Anthropic-themed
HTML artifacts. Read them when you need a sanity check on what "good" looks
like.

## File index — relevance to claude-kit skills

| File | Primary use | Useful for |
|---|---|---|
| `01-exploration-code-approaches.html` | Code exploration | side-by-side comparisons in essay-style explanations |
| `02-exploration-visual-designs.html` | Visual design exploration | swatch grids, layout comparison |
| `03-code-review-pr.html` | PR review write-up | future `/claude-kit:review` style skill |
| `04-code-understanding.html` | **`/claude-kit:explain-code` — primary reference** | sidebar + Key files + Gotchas + callstack walkthrough |
| `05-design-system.html` | Design system documentation | token tables, component galleries |
| `06-component-variants.html` | UI component variations | variant matrices |
| `07-prototype-animation.html` | Prototype animations | animation patterns and timing |
| `08-prototype-interaction.html` | Interactive prototypes | hover, focus, state transitions |
| `09-slide-deck.html` | Slide deck format | future deck/presentation skill |
| `10-svg-illustrations.html` | Hand-drawn-feeling SVG | illustration patterns for diagrams |
| `11-status-report.html` | Status reports | structured status tables and KPI panels |
| `12-incident-report.html` | Incident postmortems | timeline + impact + lessons format |
| `13-flowchart-diagram.html` | Architecture diagrams | hot boxes, labeled arrows, marker styles |
| `14-research-feature-explainer.html` | Feature explainer | sticky nav, expandable details, tab patterns |
| `15-research-concept-explainer.html` | **`/claude-kit:explain` — primary reference** | long-form concept walkthrough, essay tone |
| `16-implementation-plan.html` | **`/claude-kit:implement` — primary reference** | implementation plan / running notes format |
| `17-pr-writeup.html` | PR writeup | structured change description close to explain-code |
| `18-editor-triage-board.html` | Custom editor UI | kanban-style triage board |
| `19-editor-feature-flags.html` | Custom editor UI | feature flag management editor |
| `20-editor-prompt-tuner.html` | Custom editor UI | prompt tuning interface |
| `index.html` | Categorized index | navigation overview of all samples |
| `README.md` | Upstream description | source attribution |
| `LICENSE` | Apache 2.0 license | governs all files in this directory |

## Licensing

The files in this directory are licensed under Apache License 2.0 (see
`LICENSE`). claude-kit itself remains MIT licensed (see plugin root).
Both licenses are compatible — MIT projects may include Apache 2.0 code
provided the Apache 2.0 license and notices are retained, which they are
here.
