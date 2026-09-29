---
name: yuumi:design
description: Agree on domain, package location, responsibility, and function signatures before implementing — sketch the skeleton, record a design note, hand off code to yuumi:implement. Invoke by hand.
version: 1.6.14
disable-model-invocation: true
argument-hint: [what to build]
---

# Skeleton first

Jump straight to code and the domain, location, and responsibility questions get argued *after the fact* — you finish the code, then ask "which module does this belong in?" or "should this merge with the existing class?". This skill settles the **skeleton** before a line of code is written.

## The hard guard

This skill creates and edits no source files. Its only output is one design note, and the skeleton lives as signature sketches — code blocks — *inside* that note.

> If you created or edited a source file, you broke this skill.

The real code comes later, in step 5, from `yuumi:implement`.

## Steps

### 1. Scope and dependency direction

Find what `$1` touches: the modules and domains involved, the naming and patterns already there. **Settle the dependency direction first** — if module A cannot reference B, code that uses A cannot live in B, so direction fixes location before anything else. Misplacing code is the most expensive rework.

- **Done when:** you can name, in one line, the module the new code lands in and its dependency direction.

### 2. Present the four axes as one recommended design

Do not interrogate the axes one at a time. Put **one coherent recommendation** on the table and mark only the genuine forks:

- **Domain** — which bounded context it belongs to
- **Package location** — which module/package, grounded in step 1's dependency direction
- **Responsibility** — the new class's single responsibility; merge into an existing class or split
- **Function signatures** — input/output types, dependencies

Reach for `domain-modeling` when the domain terms are fuzzy, `codebase-design` when module seams or interface depth are the question.

Then confirm the forks in a single batched AskUserQuestion — not one per axis — and let the user correct the deltas.

- **Done when:** all four axes are settled on one choice each.

### 3. Approve the skeleton sketch

Draw the agreed structure as signature sketches: class and interface declarations, package paths, dependencies, function signatures. **No bodies** — `// TODO` or a one-line intent. Show it; get approval.

- **Done when:** the user approves the skeleton.

### 4. Record the design note

Write the settled decisions to `tasks/yyyy-MM-dd-<topic>-design.md`: the four-axis choices, the skeleton sketch, and the one or two tradeoffs worth tracing later. Keep it short.

- **Done when:** the file exists.

### 5. Hand off to yuumi:implement

Pass the design note to `yuumi:implement` as its input, so these decisions flow into that skill's implementation note. This skill stops here — it does not implement.
