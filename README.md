# yuumi 🐱

> A Tokyo Night statusline for Claude Code, and a pack of workflow skills for any agent — installed with one `npx skills` command.
> Your agent does the carrying. You ride along like Yuumi — slurping cup ramen, and (let's be honest) taking the credit.

## Why "yuumi"?

In *League of Legends*, **Yuumi** is the cat who attaches to a teammate and rides into battle on their back. She doesn't walk the lane — she gets carried. The AD carry does the work; Yuumi tosses out a heal, a little speed, the occasional poke, and somehow finishes the game convinced *she* hard-carried. (She was eating cup ramen behind the ADC the whole time.)

That's the whole idea — and in this story, **you're Yuumi.** Your coding **agent is the ADC**: it walks the lane, takes the fights, does the carrying. You attach to it, ride along, toss out the occasional buff (a prompt, a nudge, a skill), and come away having "carried." This plugin is your Yuumi kit — a statusline to watch the lane for you, and a set of skills to buff the agent doing the work. Now sit back, eat your cup ramen, and shout it one more time: "Carry!" 😎

Works on **macOS, Linux, and Windows**.

---

## What you get

Two things:

1. **A statusline (HUD)** — a Tokyo Night powerline readout for your session. *Claude Code only.*
2. **Workflow skills** — authoring, planning, code-review, and HTML-artifact helpers. They run on **any agent** the [`skills`](https://skills.sh) CLI supports (Claude Code, Codex, Cursor, Hermes, and dozens more).

| Capability | Claude Code | Other agents |
|------------|:-----------:|:------------:|
| `interview` · `edit` · `explain` · `implement` · `pretty` · `teach-me` · `review` | ✅ | ✅ |
| `update` — refresh just the yuumi pack | ✅ | ✅ |
| Tokyo Night statusline HUD | ✅ | — |
| `statusline-setup` · `statusline-setup-ad` · `statusline-doctor` | ✅ | no-op |

One install path for everyone: **`npx skills add -g heeseon87/yuumi`**. The workflow skills work everywhere; the statusline is a Claude Code feature, so the `statusline-*` skills only do anything there.

---

## The skills

A skill runs when you type its command. Installed via the `skills` CLI, the command is the skill's directory name — **`/yuumi-<name>`** (e.g. `/yuumi-explain`). The examples below use that form.

### Authoring & planning — portable (any agent)

#### `/yuumi-interview [plan-file]` — pressure-test a plan before you build it
Reads a plan/spec file and **interviews you in depth** with pointed, non-obvious questions: technical implementation, UX, edge cases, tradeoffs, the things you haven't thought about yet. It keeps probing until the plan is solid, then writes the refined spec back to the file.
- **Use it when** you have a rough plan and want the holes found *before* you write code.
- **Output:** a sharpened spec, written to your plan file.

#### `/yuumi-edit [files…]` — edit in place with `{curly-brace}` notes
**Position is context.** Instead of copy-pasting text back and forth, you leave instructions *where they belong* — drop `{make this hit harder}` or `{too vague}` or `{cut}` right next to the line, and the skill applies each edit in context and removes the markers. Handles one file, several files, or (with no argument) finds every `{note}` in your docs.
- **Use it when** you're revising long drafts or making consistent edits across multiple files and the copy-paste loop is tedious.
- **Output:** the edited file(s) plus a short summary of every change made.

#### `/yuumi-explain [target]` — an Anthropic-style HTML explainer
Investigates a target (a file, endpoint, module, system, or concept), then renders a **single-file HTML explainer** designed to install an accurate mental model in one read. It traces the real code, explains the *why* behind decisions, and uses sparse line-art diagrams only where prose would make you do mental bookkeeping. Engaging essay, not dry docs.
- **Use it when** you (or a teammate) need to actually *understand* a piece of the system.
- **Output:** `<slug>-explained.html` in the working directory, opened in your browser.

#### `/yuumi-implement [spec]` — implement a spec, with a live decision log
Implements the spec while keeping a **running HTML notes file** that captures exactly what a reviewer needs: design decisions, deliberate deviations from the spec, tradeoffs considered, and open questions for you. The log is updated *as the work happens*, so you can open it mid-flight to check direction — and a reviewer can scan it in 30 seconds before merging.
- **Use it when** you want the implementation *and* a reviewer-facing record of every non-obvious choice.
- **Output:** the code, plus `<slug>-implementation-notes.html` (it tells you how many open questions are waiting).

#### `/yuumi-pretty [brief]` — the house visual system for HTML artifacts
Turns a brief into a polished, **single-file Anthropic-style HTML artifact** — warm paper background, clay accent, editorial serif type, hairline rules, line-art SVG diagrams, restrained dark code blocks. This is the shared visual language that `explain` and `implement` build on, so every artifact feels like the same family.

For longer material it goes past a static page: a **sticky table of contents** with scrollspy, **progressive disclosure** (collapsible sections and tabs), optional **interactive widgets** (before/after slider, step-through walkthroughs, filterable tables), and **data charts that lazy-load only when used** (Chart.js for quantitative data, Mermaid for large graphs) — all themed to the same palette, and every interaction degrades gracefully with JavaScript off. It ships component, interaction-pattern, and data-viz catalogs, and is tuned for cognitive-load-focused visual QA (Korean / mixed CJK text is first-class).
- **Use it when** you want a beautiful, self-contained — and now navigable, explorable — page for a concept, doc, or report.
- **Output:** a `.html` file in the working directory, opened in your browser.

#### `/yuumi-teach-me [topic]` — learn the session until you actually understand it
Turns the agent into a **wise, incremental teacher** for whatever you just built (or any `[topic]`). It keeps a running checklist of what you should grasp — the problem and the branches not taken, the solution with its design decisions and edge cases, and why the change matters — then has you restate your understanding first, quizzes you with `AskUserQuestion`, shows you the real code, and drills the *whys*. It won't wrap up until you've demonstrated you can reason about it on your own.
- **Use it when** you want to *own* a change, not just ship it — onboarding, post-implementation review, or understanding someone else's work.
- **Output:** a `<topic-slug>-understanding.md` checklist, plus a verified mental model in your head.

#### `/yuumi-review [PR number / branch / diff / file]` — understand someone else's change before you judge it
Reviewing a change is hard because the real work is *understanding* it, and understanding has to come before any verdict. This walks you top-down through a PR, branch, or diff you didn't write, **building the mental model in dialogue** instead of handing you a passive summary: it opens with *why* the change exists before *what* it did, lays out a route through the parts so you always know where you are, draws rough ASCII sketches wherever you'd otherwise juggle structure in your head, and hands *you* the next prediction to make rather than making it for you. The judgment that follows stays yours — it builds the understanding, it doesn't rubber-stamp a verdict into your hands.
- **Use it when** you have to review, or just get your head around, code someone else wrote — a PR, an unfamiliar diff, a branch.
- **Output:** an accurate mental model of the change, built actively in your terminal — no passive essay to skim.

### Maintenance — portable (any agent)

#### `/yuumi-update` — refresh just the yuumi skills
`npx skills update` refreshes *every* skill from *every* source you have installed. This scopes the update to the yuumi pack alone: it asks the CLI which `yuumi:*` skills are installed and updates exactly those, leaving your other skill sources untouched.
- **Use it when** you want the latest yuumi skills without sweeping every other pack along with them.
- **Output:** each yuumi skill reported as updated or already current. *(Claude Code: the statusline refreshes in place — no re-setup needed.)*

### HUD maintenance — Claude Code only

#### `/yuumi-statusline-setup` — one-time statusline install
Wires Claude Code to the Tokyo Night statusline that ships inside this skill. It points `settings.json` `statusLine` **directly** at the installed `statusline.mjs` (no `~/.claude/hud/` copy, no SessionStart hook) and backs up your prior settings. Run it once after `npx skills add -g heeseon87/yuumi`; updates then flow through `npx skills update` with nothing to re-run.

#### `/yuumi-statusline-setup-ad` — statusline install alongside an ad extension
For when a statusline-owning ad extension (Kickbacks/vibe-ads) keeps reverting the normal install. Replaces the extension's statusline script with a combined renderer — Yuumi HUD plus the live ad as a final line — and locks the file immutable so the extension's rewrites bounce off while its ad cache keeps refreshing. `--restore` hands the slot back to the extension. macOS/Linux only.

#### `/yuumi-statusline-doctor` — diagnose & auto-fix the statusline
Runs an OS-aware checklist (node availability, the installed statusline asset, executable bit, `settings.json` shape, legacy marketplace-era config) and **fixes anything fixable**, then prints a pass/fail report.
- **Use it when** the statusline is blank, stale, or misbehaving.

---

## The statusline

Once set up, the HUD renders two lines (powerline segments on a Tokyo Night palette):

- **Line 1** — IME indicator (가/A) · version · model (context size) · directory · git branch
- **Line 2** — 5h / 7d rate-limit bars · session duration · context bar

The rate-limit bars are **allocation-aware**: the color isn't a fixed percentage, it's relative to how much time has elapsed in the window — so you can tell at a glance whether you're under- or over-spending your budget.

---

## Install

One channel for every agent — the [`skills`](https://skills.sh) CLI:

```bash
npx skills add -g heeseon87/yuumi
```

It detects your agent(s) and installs the skills globally (`-g`). Pick the skills/agents you want, or take them all. This works on Claude Code, Codex, Cursor, Hermes, and [dozens more](https://skills.sh).

### Claude Code — turn on the statusline (one extra step)

The statusline is a Claude Code feature, so wiring it needs one command **inside Claude Code** after the install above:

```
/yuumi-statusline-setup
```

Then restart Claude Code once — the statusline appears at the bottom of the screen. (The `skills` CLI can place files but can't edit Claude Code's `settings.json`; this skill does that part. It requires the **global** install above.)

## Update

```bash
npx skills update
```

That's it — **no setup re-run needed**. The statusline lives at a stable path inside the installed skill, so `npx skills update` refreshes it in place and the next statusline refresh picks it up.

## Requirements

- **[Node.js](https://nodejs.org/) 18+** in PATH. On Windows the standard installer (`C:\Program Files\nodejs`) is recommended; nvm-windows / fnm / volta also work.
- **A [Nerd Font](https://github.com/ryanoasis/nerd-fonts/releases) terminal** for the statusline glyphs (see below). JetBrainsMono Nerd Font is recommended.
- **A truecolor (24-bit) terminal** — the Tokyo Night palette uses 24-bit ANSI color. 256-color terminals won't render it correctly.

## Troubleshooting

```
/yuumi-statusline-doctor
```

Checks node availability, the installed statusline asset, the executable bit, `settings.json` configuration, and legacy marketplace-era config (old `~/.claude/hud/` path or leftover SessionStart hook) — and auto-fixes anything fixable.

> **Migrating from an older marketplace install?** Just run `npx skills add -g heeseon87/yuumi` then `/yuumi-statusline-setup` — setup repoints `settings.json` at the new skill-dir statusline and removes the obsolete SessionStart hook. Run `/yuumi-statusline-doctor` if anything looks off.

## Platform notes

On macOS/Linux, `statusLine.command` is the statusline path run via its `#!/usr/bin/env node` shebang (setup restores the executable bit the installer drops). On Windows there is no shebang, so the command is an absolute `node.exe` + the path — it prefers `%ProgramFiles%\nodejs\node.exe` and falls back to the node binary that ran setup. If you switch node installations, re-run `/yuumi-statusline-setup` once to refresh the reference.

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

*Your agent carries — on Claude Code, Codex, and wherever else you ride. You take the credit. That's the yuumi way. 🐱*
