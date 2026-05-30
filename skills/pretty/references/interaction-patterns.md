# Interaction & Navigation Patterns

A catalog of the interactive components baked into `../assets/shell.html`. Same rule as `components.md`: each entry says what it's *for* and which mental burden it removes. **A palette, not a checklist.** Every component degrades gracefully — with JS off, all content stays reachable. Never hide essential information behind an interaction.

## Navigation scaffold

### `.toc` — sticky table of contents (scrollspy)
A right-rail (desktop) / top strip (mobile) `<nav>` of anchor links. The current section auto-highlights as the reader scrolls. **Removes:** "where am I in a long document" navigation burden. **Use when:** the page has 4+ `<h2>` sections or scrolls past ~3 viewports. **Don't use:** short single-idea pages — the rail is noise.

### `.fold` — collapsible `<details>` section
Hairline-topped section with a clay disclosure marker. Open in source (JS-off shows everything). **Removes:** first-screen overload — keep the headline visible, defer depth. **Use when:** a section is optional depth (proofs, edge cases, full logs). **Don't use:** to hide the page's main point. The lede and core claim must never be folded.

### `.tabs` — parallel-view switcher
A tab bar over `.tab-panel`s. JS-off shows all panels stacked. **Removes:** the burden of scrolling between equivalent alternatives. **Use when:** content is genuinely parallel (same idea in Kotlin vs SQL, three deployment targets). **Don't use:** for sequential content (use `.stepper`) or unrelated sections.

### `.fnref` footnote popover
`<sup>` reference that previews its note on hover/focus. **Removes:** the jump-to-bottom-and-back round trip. **Use when:** tangents/citations the reader may want without leaving their place. Always keep the real `.footnotes` list too (fallback + print).

## Active widgets (use only when justified)

### `[data-before-after]` — compare slider
Overlays two states; a range input clips between them. JS-off stacks both. **Removes:** mental diffing of two states. **Use when:** before/after is the whole point (refactor, config change, design tweak). **Don't use:** for more than two states, or where a side-by-side `<table>` reads clearer.

### `[data-stepper]` — sequential walkthrough
Shows one `.stepper-step` at a time with prev/next. JS-off shows all steps numbered. **Removes:** holding a multi-step process in working memory all at once. **Use when:** order matters and steps are heavy enough that seeing one at a time aids focus. **Don't use:** for a short ordered list (use `.steps`).

### `[data-filter-table]` — filterable table
A search input that hides non-matching rows. JS-off hides the input, shows all rows. **Removes:** scanning a long table for a few rows. **Use when:** 15+ rows. **Don't use:** small tables — the input is overhead.

## The rule
Add an interaction only when you can name the burden it removes. "It feels more interactive" is not a reason. Interactions are an accessibility contract: the page must be fully usable, and the main point fully visible, with no JS at all.
