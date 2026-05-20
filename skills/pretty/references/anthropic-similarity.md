# Anthropic Similarity Metric

`skills/pretty/scripts/anthropic-similarity.mjs` is a static design-profile score for local HTML artifacts built with `claude-kit:pretty`.

It compares an artifact against built-in profiles derived from Anthropic-made pages:

- `https://claude.com/product/overview`
- `https://claude.com/platform/api`
- `https://www.anthropic.com/news`

Reference extraction was based on the public HTML/CSS available from those pages on 2026-05-20. The important shared signals were:

- warm parchment / ivory surfaces: `#f5f4ed`, `#faf9f5`, `#e8e6dc`, `#f0eee6`
- warm near-black ink: `#141413`, `#1f1e1d`, `#30302e`
- clay / coral accents: `#c96442`, `#d97757`, `#c46849`
- muted warm text: `#5e5d59`, `#87867f`, `#b0aea5`, `#4d4c48`
- editorial serif hierarchy, restrained body rhythm, mono code treatment
- hairline rules, clay rail callouts, line-art SVG, quiet tables/metadata, generous spacing
- no gradient-heavy / glass / neon / generic SaaS treatment

## Score weights

Total: 100 points.

| Dimension | Points | What it checks |
|---|---:|---|
| Palette | 35 | overlap with reference swatches, near-color tolerance, warm-neutral discipline, gradient penalty |
| Typography | 20 | serif/mono/sans or CJK substitute roles, hero scale, tight heading leading, medium heading weight, readable body size, generous body leading |
| Layout | 15 | Anthropic-like max width, large page padding, section breathing room, rounded scale, mobile breakpoint |
| Components | 20 | lede, metadata, clay-rail callout, aside, steps, figure/SVG, code block, table, lesson, supporting CSS motifs |
| Restraint | 10 | few gradients, no glassmorphism/neon/rainbow, limited saturated color drift |

`maxScore` is the best score across built-in reference profiles. The pretty quality gate is `maxScore >= 95`.

## What this metric is not

This is not a perceptual screenshot comparison and not a human taste judge. It deliberately answers a narrower question: does the saved HTML use the same static design profile as Anthropic-made pages?

A page can score high and still be bad if the content structure is weak. A page can score lower and still be correct if the brief intentionally asks for a different visual language. Use the metric as a quality gate only when the artifact claims the Anthropic-style look.
