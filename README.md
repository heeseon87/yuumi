# yuumi 🐱

> A Tokyo Night statusline and a pack of workflow skills for Claude Code — and Codex.
> Your agent does the carrying. You ride along like Yuumi — and (let's be honest) take the credit.

## Why "yuumi"?

In *League of Legends*, **Yuumi** is the cat who attaches to a teammate and rides into battle on their back. She doesn't walk the lane — she gets carried. The AD carry does the work; Yuumi tosses out a heal, a little speed, the occasional poke, and somehow finishes the game convinced *she* hard-carried. (She was eating cup ramen behind the ADC the whole time.)

That's the whole idea — and in this story, **you're Yuumi.** Your coding **agent is the ADC**: it walks the lane, takes the fights, does the carrying. You attach to it, ride along, toss out the occasional buff (a prompt, a nudge, a skill), and come away having "carried." This plugin is your Yuumi kit — a statusline to watch the lane for you, and a set of skills to buff the agent doing the work. Go ahead and take the credit; the cup ramen's already warm.

Works on **macOS, Linux, and Windows**.

---

## What you get

Two things:

1. **A statusline (HUD)** — a Tokyo Night powerline readout for your session. *Claude Code only.*
2. **Workflow skills** — authoring, planning, and HTML-artifact helpers. Most also run on **Codex**.

| Capability | Claude Code | Codex |
|------------|:-----------:|:-----:|
| Tokyo Night statusline HUD | ✅ | — |
| `interview` · `edit` · `explain` · `implement` · `pretty` | ✅ | ✅ |
| `setup` · `doctor` (HUD maintenance) | ✅ | — |

The Codex build intentionally ships only the portable workflow skills — there's no statusline to maintain there.

---

## The skills

A skill runs when you type its command. On Claude Code the command is `/yuumi:<name>` (e.g. `/yuumi:explain`); the examples below use the short form for readability.

### Authoring & planning — portable (Claude Code + Codex)

#### `/yuumi:interview [plan-file]` — pressure-test a plan before you build it
Reads a plan/spec file and **interviews you in depth** with pointed, non-obvious questions: technical implementation, UX, edge cases, tradeoffs, the things you haven't thought about yet. It keeps probing until the plan is solid, then writes the refined spec back to the file.
- **Use it when** you have a rough plan and want the holes found *before* you write code.
- **Output:** a sharpened spec, written to your plan file.

#### `/yuumi:edit [files…]` — edit in place with `{curly-brace}` notes
**Position is context.** Instead of copy-pasting text back and forth, you leave instructions *where they belong* — drop `{make this hit harder}` or `{too vague}` or `{cut}` right next to the line, and the skill applies each edit in context and removes the markers. Handles one file, several files, or (with no argument) finds every `{note}` in your docs.
- **Use it when** you're revising long drafts or making consistent edits across multiple files and the copy-paste loop is tedious.
- **Output:** the edited file(s) plus a short summary of every change made.

#### `/yuumi:explain [target]` — an Anthropic-style HTML explainer
Investigates a target (a file, endpoint, module, system, or concept), then renders a **single-file HTML explainer** designed to install an accurate mental model in one read. It traces the real code, explains the *why* behind decisions, and uses sparse line-art diagrams only where prose would make you do mental bookkeeping. Engaging essay, not dry docs.
- **Use it when** you (or a teammate) need to actually *understand* a piece of the system.
- **Output:** `<slug>-explained.html` in the working directory, opened in your browser.

#### `/yuumi:implement [spec]` — implement a spec, with a live decision log
Implements the spec while keeping a **running HTML notes file** that captures exactly what a reviewer needs: design decisions, deliberate deviations from the spec, tradeoffs considered, and open questions for you. The log is updated *as the work happens*, so you can open it mid-flight to check direction — and a reviewer can scan it in 30 seconds before merging.
- **Use it when** you want the implementation *and* a reviewer-facing record of every non-obvious choice.
- **Output:** the code, plus `<slug>-implementation-notes.html` (it tells you how many open questions are waiting).

#### `/yuumi:pretty [brief]` — the house visual system for HTML artifacts
Turns a brief into a polished, **single-file Anthropic-style HTML artifact** — warm paper background, clay accent, editorial serif type, hairline rules, line-art SVG diagrams, restrained dark code blocks. This is the shared visual language that `explain` and `implement` build on, so every artifact feels like the same family.

For longer material it goes past a static page: a **sticky table of contents** with scrollspy, **progressive disclosure** (collapsible sections and tabs), optional **interactive widgets** (before/after slider, step-through walkthroughs, filterable tables), and **data charts that lazy-load only when used** (Chart.js for quantitative data, Mermaid for large graphs) — all themed to the same palette, and every interaction degrades gracefully with JavaScript off. It ships component, interaction-pattern, and data-viz catalogs, and is tuned for cognitive-load-focused visual QA (Korean / mixed CJK text is first-class).
- **Use it when** you want a beautiful, self-contained — and now navigable, explorable — page for a concept, doc, or report.
- **Output:** a `.html` file in the working directory, opened in your browser.

### HUD maintenance — Claude Code only

#### `/yuumi:setup` — one-time statusline install
Installs the Tokyo Night statusline. Writes the HUD into `~/.claude/hud/`, points `settings.json` at it, and registers a **SessionStart hook** so future plugin updates auto-sync with no manual steps. Run this once after installing; back-ups of any pre-existing files are kept.

#### `/yuumi:doctor` — diagnose & auto-fix the statusline
Runs an OS-aware checklist (node availability, HUD files, permissions, `settings.json` shape, the SessionStart hook, stale Windows node paths / legacy `.cmd` wrappers) and **fixes anything fixable**, then prints a pass/fail report.
- **Use it when** the statusline is blank, stale, or misbehaving.

---

## The statusline

Once set up, the HUD renders two lines (powerline segments on a Tokyo Night palette):

- **Line 1** — IME indicator (가/A) · version · model (context size) · directory · git branch
- **Line 2** — 5h / 7d rate-limit bars · session duration · context bar

The rate-limit bars are **allocation-aware**: the color isn't a fixed percentage, it's relative to how much time has elapsed in the window — so you can tell at a glance whether you're under- or over-spending your budget.

---

## Install (one-time)

### Claude Code

```
/plugin marketplace add heeseon87/yuumi
/plugin install yuumi@yuumi
/yuumi:setup
```

Then restart Claude Code once. The statusline appears at the bottom of the screen.

### Codex

```bash
codex plugin marketplace add heeseon87/yuumi
```

Then open Codex Plugins, search for **Yuumi**, and install it. The Codex plugin includes only the portable workflow skills — `edit`, `explain`, `implement`, `interview`, and `pretty` — and skips the statusline/HUD setup.

## Update

```
/plugin marketplace update yuumi
/plugin update yuumi@yuumi
```

That's it — **no manual setup re-run needed**. The `SessionStart` hook installed during setup auto-syncs the HUD files with the latest plugin version every time you start a session.

## Requirements

- **[Node.js](https://nodejs.org/) 18+** in PATH. On Windows the standard installer (`C:\Program Files\nodejs`) is recommended; nvm-windows / fnm / volta also work.
- **A [Nerd Font](https://github.com/ryanoasis/nerd-fonts/releases) terminal** for the statusline glyphs (see below). JetBrainsMono Nerd Font is recommended.
- **A truecolor (24-bit) terminal** — the Tokyo Night palette uses 24-bit ANSI color. 256-color terminals won't render it correctly.

## Troubleshooting

```
/yuumi:doctor
```

Checks node availability, HUD file presence, `settings.json` configuration, the SessionStart hook, and stale Windows node references / legacy `.cmd` wrapper configuration — and auto-fixes anything fixable.

## Platform notes

On Windows, setup points `statusLine.command` directly at `node statusline.mjs` instead of generating a `statusline.cmd` wrapper. This still avoids relying on PATHEXT/shebang execution, but removes the extra batch-file layer that could leave orphaned `cmd.exe` processes after Claude Code is hard-killed. The command prefers `%ProgramFiles%\nodejs\node.exe` and falls back to the node binary that ran setup. If you switch node installations, re-run `/yuumi:setup` once to refresh the node reference.

## Nerd Font setup

Statusline icons require a [Nerd Font](https://github.com/ryanoasis/nerd-fonts/releases). We recommend JetBrainsMono Nerd Font.

### macOS

```bash
brew install --cask font-jetbrains-mono-nerd-font
```

Then set your terminal font to `JetBrainsMono Nerd Font`.

### Windows

```powershell
winget install JanDeDobbeleer.OhMyPosh --source winget
oh-my-posh font install
```

Choose `JetBrainsMono`, then in Windows Terminal: Settings > [Your Profile] > Appearance > Font face > `JetBrainsMono Nerd Font`.

### Linux

```bash
mkdir -p ~/.local/share/fonts
cd ~/.local/share/fonts
curl -fLO https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.zip
unzip JetBrainsMono.zip -d JetBrainsMono
fc-cache -fv
```

Then set your terminal font to `JetBrainsMono Nerd Font`.

> If you're using WSL, install the font on Windows and configure it in Windows Terminal instead of inside WSL.

---

*Your agent carries on Claude Code and Codex. You ride along — and take the credit. That's the yuumi way. 🐱*
