# SVG Diagram & Animation Patterns

Read this when adding a `<figure>` with an SVG diagram. These are battle-tested patterns from prior iterations — copying them avoids re-discovering known traps.

## Universal SVG principles

1. **Single accent color.** Stroke in `var(--accent)` for emphasized elements, `var(--text)` for primary structure, `var(--text-dim)` for secondary. No fills (except `var(--bg)` to mask backgrounds behind crossing paths).
2. **Thin strokes.** 1.2–1.5 for primary structure, 1.0 for secondary lines. Anthropic diagrams are line-art, not bold infographics.
3. **Serif italic labels.** Use the `.svg-text-italic` class (italic serif, accent-deep) for diagram-internal labels. Monospace `.svg-text-mono` for code identifiers inside boxes.
4. **Empty box fills.** Most rectangles should be `fill="none"` so the cream background shows through. Fill with `var(--bg)` only to mask lines passing behind a box.
5. **No drop shadows. No gradients.** Anthropic style is flat.
6. **`viewBox` not fixed sizes.** Make the SVG scale to its container.

## When to use a diagram

Diagrams earn their place only when the relationship is hard to express linearly:

| Use case | Pattern |
|---|---|
| Domain relationships (tables, entities) | ERD-lite — boxes + arrows + key column highlights |
| Sequence of calls across actors | Sequence diagram — lanes + lifelines + horizontal arrows |
| Parallel work that fans out and joins | Fan-out/join — single source, N targets, optional merge node |
| Decision tree / branching logic | Diamond decision node + labeled branches |
| File/directory hierarchy | Skip SVG — use `.tree` grid (CJK-safe) |

## Pattern 1 — ERD / Architecture diagram

Three or four entity boxes connected by labeled lines. Use this for "what tables/services are involved".

```html
<figure>
  <svg viewBox="0 0 720 360" xmlns="http://www.w3.org/2000/svg" aria-label="Domain architecture">
    <defs>
      <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-dim)"/>
      </marker>
    </defs>

    <!-- Entity box -->
    <g>
      <rect x="40" y="70" width="200" height="118" fill="none" stroke="var(--text)" stroke-width="1.2" rx="3"/>
      <text x="50" y="92" class="svg-text" font-weight="600">entity_name</text>
      <text x="230" y="92" class="svg-text-italic" text-anchor="end">label</text>
      <line x1="50" y1="100" x2="230" y2="100" stroke="var(--rule)" stroke-width="0.8"/>
      <text x="50" y="118" class="svg-text-mono"><tspan fill="var(--accent-deep)" font-weight="600">uuid</tspan> (PK)</text>
      <text x="50" y="135" class="svg-text-mono">field_2</text>
      <!-- ...more fields -->
    </g>

    <!-- Connector arrow -->
    <line x1="140" y1="190" x2="200" y2="230" stroke="var(--text-dim)" stroke-width="1" marker-end="url(#arrow)"/>
  </svg>
  <figcaption><span class="fig-num">Fig 1</span>{{caption}}</figcaption>
</figure>
```

**Tips:**
- Highlight primary keys with `<tspan fill="var(--accent-deep)" font-weight="600">`.
- Use dashed borders (`stroke-dasharray="4 3"`) on join/bridge tables to set them apart.
- Add a section label above each cluster (`Domain (MySQL)`, `Object Storage (GCS)`) using `.svg-text-dim`.

## Pattern 2 — Sequence diagram

Time flows top-to-bottom. Each actor is a lane with a dashed lifeline. Messages are horizontal arrows.

```html
<figure>
  <svg viewBox="0 0 720 560" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arr-fwd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text)"/>
      </marker>
      <marker id="arr-back" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M 10 0 L 0 5 L 10 10 z" fill="var(--text-dim)"/>
      </marker>
    </defs>

    <!-- Lane headers -->
    <g>
      <rect x="40" y="30" width="100" height="28" fill="none" stroke="var(--text)" stroke-width="1"/>
      <text x="90" y="49" class="svg-text" text-anchor="middle">Client</text>
      <!-- ...more lanes -->
    </g>

    <!-- Lifelines (dashed) -->
    <line x1="90" y1="60" x2="90" y2="540" stroke="var(--rule-strong)" stroke-width="0.8" stroke-dasharray="3 4"/>

    <!-- Request message (solid arrow) -->
    <line x1="90" y1="90" x2="230" y2="90" stroke="var(--text)" stroke-width="1" marker-end="url(#arr-fwd)"/>
    <text x="160" y="84" class="svg-text" text-anchor="middle">message label</text>

    <!-- Reply message (dashed back-arrow) -->
    <line x1="230" y1="142" x2="90" y2="142" stroke="var(--text-dim)" stroke-width="0.8" stroke-dasharray="2 3" marker-end="url(#arr-back)"/>

    <!-- Transaction/scope box -->
    <rect x="200" y="180" width="470" height="280" fill="none" stroke="var(--accent)" stroke-width="1.3" stroke-dasharray="5 4" rx="3"/>
    <text x="210" y="174" class="svg-text-italic" font-size="11">TRANSACTION tx { … }</text>
  </svg>
  <figcaption><span class="fig-num">Fig 2</span>{{caption}}</figcaption>
</figure>
```

**Conventions:**
- **Solid arrow** = request / forward call
- **Dashed arrow** = response / return
- **Dashed accent rectangle** = transaction or other scope
- Lane width: 100-120px. Keep names short.
- For parallel dispatch within a sequence, fan out 5 arrows from one source to one lane.

## Pattern 3 — Fan-out / join with animation

The most visually impactful pattern. Used for parallel async work that converges. **Only use this once per document** — the animation steals attention.

The SVG structure with both fan-out and join phases, plus an `awaitAll` merge node:

```html
<figure>
  <div id="parallelFig">
  <svg viewBox="0 0 900 280" xmlns="http://www.w3.org/2000/svg" aria-label="Parallel work fan-out and join">
    <defs>
      <marker id="arr-final" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-dim)"/>
      </marker>
    </defs>

    <!-- Source node -->
    <g>
      <circle cx="60" cy="140" r="28" fill="none" stroke="var(--text)" stroke-width="1.3"/>
      <text x="60" y="144" class="svg-text" text-anchor="middle" font-weight="600">source</text>
      <circle cx="60" cy="140" r="3.5" fill="var(--accent)" class="pulse"/>
    </g>

    <!-- 5 target boxes -->
    <g>
      <rect x="370" y="14"  width="180" height="32" fill="var(--bg)" stroke="var(--text)" stroke-width="1" rx="3"/>
      <text x="460" y="34" class="svg-text-mono" text-anchor="middle">target_1</text>
      <!-- ...4 more -->
    </g>

    <!-- Fan-out paths (solid accent) -->
    <g fill="none" stroke="var(--accent)" stroke-width="1.4" stroke-linecap="round">
      <path d="M 88 132 C 200 80, 280 36, 370 30" class="parallel-line fanout"/>
      <!-- ...4 more curves -->
    </g>

    <!-- Join paths (dashed accent-deep) -->
    <g fill="none" stroke="var(--accent-deep)" stroke-width="1.3" stroke-linecap="round" stroke-dasharray="5 3">
      <path d="M 550 30 C 640 60, 720 130, 745 152" class="parallel-line join"/>
      <!-- ...4 more curves -->
    </g>

    <!-- Merge node (awaitAll) -->
    <g>
      <circle id="awaitNode" cx="770" cy="158" r="26"
        fill="var(--bg)" stroke="var(--rule-strong)" stroke-width="1.3"
        stroke-dasharray="3 3"/>
      <text x="770" y="155" class="svg-text" text-anchor="middle" font-weight="600" font-size="11">await</text>
      <text x="770" y="168" class="svg-text" text-anchor="middle" font-weight="600" font-size="11">All</text>
    </g>

    <!-- Final arrow (fades in last) -->
    <line x1="797" y1="158" x2="855" y2="158" stroke="var(--text-dim)" stroke-width="1" marker-end="url(#arr-final)" id="commitArrow" opacity="0"/>
    <text x="826" y="148" class="svg-text-italic" text-anchor="middle" id="commitLabel" opacity="0">next ↩</text>
  </svg>
  </div>
  <figcaption><span class="fig-num">Fig N</span>{{caption}}
    <br><button class="replay" onclick="replayParallel()">
      <svg viewBox="0 0 16 16"><path d="M 8 3 V 1 L 4 4 L 8 7 V 5 a 3 3 0 1 1 -3 3" stroke="currentColor" stroke-width="1.3" fill="none"/></svg>
      replay
    </button>
  </figcaption>
</figure>
```

**Critical IDs the animation controller looks for:**
- `#parallelFig` — outer container
- `.parallel-line.fanout` — paths that animate in phase 1
- `.parallel-line.join` — paths that animate in phase 2 (optional)
- `#awaitNode` — node that turns from dashed to solid when joins complete (optional)
- `#commitArrow`, `#commitLabel` — final elements that fade in last (optional)

The IIFE at the bottom of `template.html` reads these IDs and orchestrates the 4-phase animation. Don't rewrite it — just add the elements with the right IDs.

**Animation timing** (auto-played once when figure enters viewport):
1. **Phase 1 — fan-out** (0.05s + i×0.12s start, 0.7s duration): solid accent lines reveal from source to targets
2. **Phase 2 — join** (0.85s + i×0.1s start, 0.55s duration): dashed lines reveal from targets to merge node
3. **Phase 3 — node** (after all joins): merge node border turns solid accent
4. **Phase 4 — final** (250ms after node): commit arrow + label fade in

## SVG animation — the rules

These are the traps that have eaten multiple rewrite cycles. Follow them religiously.

### Rule 1: Always use `getTotalLength()` for line-draw

Fixed `stroke-dasharray` values like `200` will clip curves. The IIFE measures path length at runtime:

```javascript
const len = line.getTotalLength();
line.style.strokeDasharray = len;
line.style.strokeDashoffset = len;  // hidden
// then transition strokeDashoffset to 0 to reveal
```

Bezier curves have lengths that exceed their straight-line distances. A curve from (88,140) to (500,30) might be 420px straight but 450px along the curve. Fixed values guess wrong.

### Rule 2: Don't put `marker-end` on animated paths

SVG markers are placed at the *logical* path endpoint, ignoring `stroke-dashoffset`. They appear at the destination before the line draws. Two solutions:

1. **Omit marker-end** and let lines terminate cleanly at box edges. This is what the fan-out/join pattern does.
2. **Use a separate `<polygon>`** as the arrowhead, with `opacity: 0`, and fade it in via `transitionend` or `setTimeout` after the line completes.

### Rule 3: CSS animation forwards doesn't re-trigger

A CSS `animation: x 1s forwards` runs once and stops. Setting the class again won't replay it. Use CSS transition + JS instead:

```javascript
// reset
line.style.transition = 'none';
line.style.strokeDashoffset = len;
// force browser to register the reset
void fig.getBoundingClientRect();
// animate
line.style.transition = 'stroke-dashoffset 0.7s ease-out';
line.style.strokeDashoffset = '0';
```

The `getBoundingClientRect()` call is required — without it, the browser batches the two style changes into one frame and the reset never materializes.

### Rule 4: Respect `prefers-reduced-motion`

```javascript
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reducedMotion) {
  // skip animation; set final state directly
}
```

The template's CSS already short-circuits `.parallel-line` to its final visible state when this media query matches.

### Rule 5: Auto-play once via IntersectionObserver

Don't auto-play immediately on page load — the user may scroll past it before noticing. Use IntersectionObserver to trigger when the figure enters the viewport:

```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      animate();
      observer.unobserve(entry.target);  // play once
    }
  });
}, { threshold: 0.35 });
observer.observe(fig);
```

Then expose `window.replayParallel = animate` so the replay button works.

## Pattern 4 — Decision tree

For binary or small-N branching logic. Diamond shape for decision, rectangles for outcomes.

```html
<figure>
  <svg viewBox="0 0 720 220" xmlns="http://www.w3.org/2000/svg">
    <!-- Start box -->
    <rect x="20" y="80" width="150" height="50" rx="4" fill="none" stroke="var(--text)" stroke-width="1.2"/>
    <text x="95" y="110" class="svg-text" text-anchor="middle">incoming</text>

    <!-- Decision diamond -->
    <polygon points="220,105 305,55 390,105 305,155" fill="none" stroke="var(--accent)" stroke-width="1.3"/>
    <text x="305" y="100" class="svg-text" text-anchor="middle" font-style="italic">predicate?</text>

    <!-- Branches -->
    <path d="M 365 75 Q 460 50 540 50" stroke="var(--text-dim)" stroke-width="1" fill="none"/>
    <text x="445" y="42" class="svg-text" text-anchor="middle" fill="var(--accent-deep)">true</text>

    <path d="M 365 135 Q 460 170 540 170" stroke="var(--text-dim)" stroke-width="1" fill="none"/>
    <text x="445" y="190" class="svg-text" text-anchor="middle" fill="var(--accent-deep)">false</text>

    <!-- Outcome boxes — solid border for "heavy path", dashed for "fast path" -->
    <rect x="540" y="28" width="160" height="46" rx="4" fill="none" stroke="var(--text-dim)" stroke-width="1" stroke-dasharray="3 3"/>
    <text x="620" y="56" class="svg-text" text-anchor="middle">fast return</text>

    <rect x="540" y="148" width="160" height="46" rx="4" fill="none" stroke="var(--text)" stroke-width="1.2"/>
    <text x="620" y="176" class="svg-text" text-anchor="middle">do work</text>
  </svg>
  <figcaption><span class="fig-num">Fig N</span>{{caption}}</figcaption>
</figure>
```

**Convention:** dashed border for "fast/cheap path", solid for "heavy/expensive path". This visual asymmetry communicates the cost difference at a glance.

## Caption guidance

Captions are italic serif, centered, with a small `Fig N` prefix. Use them to make the *insight* explicit, not just describe what's drawn:

- Bad: "Three boxes connected by arrows showing the domain."
- Good: "A single request leaves marks in three tables and one bucket. The join table binds the two domains; the bucket diverges for large JSON."

The reader should be able to read just the caption and get the point. The diagram supports it.
