---
name: claude-kit:pretty
description: Create Anthropic-style HTML artifacts with the shared Claude Kit visual system, component catalog, SVG patterns, and a static similarity score against Anthropic-made pages
argument-hint: [brief]
---

Design `$1` as a self-contained Anthropic-style HTML artifact.

The output should feel like it belongs in the same family as Anthropic / Claude pages: warm paper, clay accent, quiet editorial hierarchy, sparse line-art diagrams, hairline rules, generous breathing room, and zero generic SaaS sludge.

## The North Star

**The reader should understand the artifact in one pass and trust the page before they know why.**

Visual polish is not decoration here. It is the interface for comprehension. Use the Anthropic visual language to make dense technical material feel calm, deliberate, and readable.

## What you produce

A complete `.html` file in the current working directory unless the user names another path.

Use:

- `skills/pretty/assets/shell.html` — blank HTML shell with tokens, typography, CSS components, and the optional SVG animation controller.
- `skills/pretty/references/components.md` — component catalog. It tells you what each component is for; it is not a section template.
- `skills/pretty/references/svg-patterns.md` — line-art SVG patterns for relationships that prose cannot carry.
- `skills/pretty/scripts/anthropic-similarity.mjs` — static conformance metric. Run it on the artifact and iterate until `maxScore >= 95` when the brief is meant to be Anthropic-style.
- `skills/pretty/references/anthropic-similarity.md` — methodology, source pages, scoring weights, and limitations for the metric.

## Workflow

1. **Understand the artifact.** Identify the reader, the one idea they must leave with, and the structure that will get them there. Ask only if a missing decision changes the artifact.
2. **Start from the shell.** Copy `skills/pretty/assets/shell.html` to the output path and write content inside `<div class="container">`.
3. **Invent the structure for this artifact.** Do not fill a fixed template. Use the component catalog only when a component's meaning fits the content.
4. **Keep the visual language fixed.** Warm parchment background, near-black ink, clay accent, serif editorial headings, JetBrains Mono for code, hairline rules, soft ring borders, restrained dark code blocks.
5. **Measure similarity.** Run:
   ```bash
   node skills/pretty/scripts/anthropic-similarity.mjs <artifact.html>
   ```
   If `maxScore` is below 95, improve the artifact: usually the issue is missing reference colors, weak type hierarchy, too little whitespace, generic card styling, gradients, or not enough Anthropic-specific components.
6. **Open the file.** On macOS: `open <artifact.html>`. Report only the path and verification state. Do not dump the artifact's contents in chat.

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

### Components

- Use `.lede` for the headline insight, not a vague subtitle.
- Use `.meta` for small labeled facts.
- Use `.callout` for a real insight that deserves a left clay rail. If everything is a callout, nothing is.
- Use `.aside` for cautions or edge cases.
- Use `.steps` only when order matters.
- Use `<figure>` + SVG for spatial, temporal, or branching relationships. Keep it line-art: thin strokes, no gradients, no shadows.
- Use language-classed `<pre><code>` for short code excerpts. Add the language class; the shell handles rendering and labels. Do not paste huge code blocks as a substitute for explanation.

## Similarity metric

The metric is intentionally static and inspectable. It does not pretend to be a human taste judge. It scores whether the artifact uses the same design profile as Anthropic-made pages:

- palette overlap and warm-neutral discipline
- typography roles, sizes, weights, and line-height
- layout rhythm, container width, section spacing, responsive behavior
- component motifs: hairline rules, clay rail callouts, code blocks, line-art SVG, tables, step lists
- restraint: few gradients, no glassmorphism, no neon/rainbow palette, no generic SaaS card soup

`maxScore` is the best score across built-in Anthropic reference profiles. For this skill, treat `95` as the minimum bar for an artifact that claims the Anthropic look.

## Anti-patterns

- Do not clone Anthropic copy, product screens, or proprietary layouts. Borrow the design language, not copyrighted content.
- Do not add fake metrics, testimonial cards, decorative icons, or generic feature grids.
- Do not use gradients, glass, neon, rainbow accents, or cool blue-gray palettes.
- Do not use a fixed section order just because a previous pretty page did.
- Do not put long explanations in chat. The HTML artifact is the deliverable.
- Do not claim `>=95` unless you actually ran the metric on the saved file.

## When you're done

Tell the user: `Saved to <path>. Similarity maxScore: <score>. Opened in your browser.`

If the score is below 95, say why and what would need to change. Do not hand-wave it as done.
