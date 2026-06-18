# Interaction Patterns

Interactions are allowed only when they remove a named burden. They must never hide the page's core claim. Native HTML and progressive enhancement are preferred: JS improves focus, pacing, and switching, but the important content remains reachable without custom JS.

## Navigation scaffold

### `.toc` — long-page map
A fixed scrollspy rail on desktop and a tappable inline map on small screens. **Removes:** re-orienting in a long page. **Use when:** 4+ major sections or 3+ viewports. **Don't use:** short notes where it adds more navigation than content.

```html
<nav class="toc" aria-label="On this page">
  <a href="#one">Core idea</a>
  <a href="#two">Trade-off</a>
</nav>
```

The shell can auto-build a fallback `.toc` from 4+ `<h2>` sections, but an intentional artifact should usually write its own map so labels carry meaning.

### `.fold` — native optional-depth disclosure
Hairline-topped `<details>` section with a clay disclosure marker. JS is not required: the browser can open and close it natively. **Removes:** first-screen overload. **Use when:** a section is optional depth (proofs, edge cases, full logs). **Don't use:** to hide the page's main point. The lede and core claim must never be folded.

```html
<details class="fold">
  <summary>선택 심화</summary>
  <p>Optional detail that would overload the main path.</p>
</details>
```

### `[data-tabs]` — parallel-view switcher
A tab bar over `.tab-panel`s. JS adds ARIA roles, keyboard navigation, and hides inactive panels; JS-off shows all panels stacked. **Removes:** the burden of scrolling between equivalent alternatives. **Use when:** content is genuinely parallel (same idea in Kotlin vs SQL, three deployment targets). **Don't use:** for sequential content (use `[data-stepper]`) or unrelated sections.

```html
<div data-tabs>
  <div class="tab-bar">
    <button class="tab" data-tab="kotlin">Kotlin</button>
    <button class="tab" data-tab="sql">SQL</button>
  </div>
  <section class="tab-panel" id="kotlin">...</section>
  <section class="tab-panel" id="sql">...</section>
</div>
```

## Active widgets

### `[data-before-after]` — before/after comparison
Overlays two states; a range input clips between them. JS-off stacks both. **Removes:** mental diffing of two states. **Use when:** before/after is the whole point (refactor, config change, design tweak). **Don't use:** for more than two states, or where a side-by-side `<table>` reads clearer.

### `[data-stepper]` — paced sequence
Shows one `.stepper-step` at a time with prev/next. JS-off shows all steps numbered. **Removes:** holding a multi-step process in working memory all at once. **Use when:** order matters and steps are heavy enough that seeing one at a time aids focus. **Don't use:** for a short ordered list (use `.steps`). This is the JS-off-safe top of the modality ladder (`svg-patterns.md`): paced motion over a *real* sequence that collapses to a numbered list when scripting is off.

### `[data-filter-table]` — filterable long table
A search input that hides non-matching rows. JS-off hides the input, shows all rows. **Removes:** scanning a long table for a few rows. **Use when:** 15+ rows. **Don't use:** small tables — the input is overhead.

## Accessibility contracts

- Tabs: use buttons with `.tab` and matching `.tab-panel` ids. The shell adds `role`, `aria-controls`, `aria-labelledby`, selected state, roving `tabindex`, and arrow-key navigation.
- Buttons: give icon-only buttons an `aria-label`.
- Folds: the `<summary>` text must be meaningful on its own.
- Steppers: keep each step as normal document content first; JS should only pace it.
- Mobile: the TOC becomes inline/tappable; do not rely on hover-only navigation.

## Naming the burden

Before adding a widget, write one sentence for yourself:

> This interaction removes the burden of _____.

If the blank is "it looks polished," delete the widget.
