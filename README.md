# yuumi 🐱

> A Claude Code plugin marketplace: a Tokyo Night statusline, a handful of workflow skills, and a terminal mod for Duet, a local design canvas and code review.
> Your agent does the carrying. You ride along like Yuumi — slurping cup ramen, and (let's be honest) taking the credit.

## Why "yuumi"?

In *League of Legends*, **Yuumi** is the cat who attaches to a teammate and rides into battle on their back. She doesn't walk the lane — she gets carried. The AD carry does the work; Yuumi tosses out a heal, a little speed, the occasional poke, and somehow finishes the game convinced *she* hard-carried. (She was eating cup ramen behind the ADC the whole time.)

That's the whole idea — and in this story, **you're Yuumi.** Your coding **agent is the ADC**: it walks the lane, takes the fights, does the carrying. You attach to it, ride along, toss out the occasional buff (a prompt, a nudge, a skill), and come away having "carried." This marketplace is your Yuumi kit — a statusline to watch the lane for you, a few skills to buff the agent doing the work, and a line to the map it is building in Duet. Now sit back, eat your cup ramen, and shout it one more time: "Carry!" 😎

Claude Code only. The statusline works on **macOS, Linux, and Windows**; the duet mod needs the [Duet](https://github.com/heeseon87/duet) app running on the same machine.

---

## What you get

Two plugins, from one marketplace:

| Plugin | What it is | Platforms |
|--------|------------|-----------|
| **`yuumi`** | Tokyo Night statusline (HUD) + workflow skills: `interview`, `edit`, `explain`, `review`, plus `statusline-setup` / `statusline-doctor` | macOS · Linux · Windows |
| **`duet`** | Terminal mod for [Duet](https://github.com/heeseon87/duet): read and change Duet's design maps from Claude Code, take comments and decisions sent from Duet, connect and pin a map with `/duet <map>` | wherever Duet runs (tested on macOS) |

## Install

Inside Claude Code (terminal):

```
/plugin marketplace add heeseon87/yuumi
/plugin install yuumi@yuumi
/plugin install duet@yuumi
```

Install either or both. Then turn on the statusline once:

```
/yuumi:statusline-setup
```

and restart Claude Code. The statusline appears at the bottom of the screen.

## Update

```
/plugin update yuumi@yuumi
```

No setup re-run needed. The statusline runs from a fixed copy at `~/.claude/hud/statusline.mjs`; the plugin's session-start hook refreshes that copy from the new version at the next session start.

---

## The yuumi skills

Plugin skills are called as **`/yuumi:<name>`**.

#### `/yuumi:interview [plan-file]` — pressure-test a plan before you build it
Reads a plan/spec file and **interviews you in depth** with pointed, non-obvious questions: technical implementation, UX, edge cases, tradeoffs, the things you haven't thought about yet. It keeps probing until the plan is solid, then writes the refined spec back to the file.
- **Use it when** you have a rough plan and want the holes found *before* you write code.
- **Output:** a sharpened spec, written to your plan file.

#### `/yuumi:edit [files…]` — edit in place with `{curly-brace}` notes
**Position is context.** Instead of copy-pasting text back and forth, you leave instructions *where they belong* — drop `{make this hit harder}` or `{too vague}` or `{cut}` right next to the line, and the skill applies each edit in context and removes the markers. Handles one file, several files, or (with no argument) finds every `{note}` in your docs.
- **Use it when** you're revising long drafts or making consistent edits across multiple files and the copy-paste loop is tedious.
- **Output:** the edited file(s) plus a short summary of every change made.

#### `/yuumi:explain [topic]` — explain like I'm one year into the field, right in the chat
Explains a topic pitched at a first-year junior in its field, as **big ASCII diagrams and few words in the chat**, with the prose set as marginalia beside each line. No HTML, no browser.
- **Use it when** you want the picture now, in the terminal.
- **Output:** the explanation in the conversation itself.

#### `/yuumi:review [PR number / branch / diff / file]` — understand someone else's change before you judge it
Reviewing a change is hard because the real work is *understanding* it, and understanding has to come before any verdict. This walks you top-down through a PR, branch, or diff you didn't write, **building the mental model in dialogue** instead of handing you a passive summary: it opens with *why* the change exists before *what* it did, lays out a route through the parts so you always know where you are, draws rough ASCII sketches wherever you'd otherwise juggle structure in your head, and hands *you* the next prediction to make rather than making it for you. The judgment that follows stays yours — it builds the understanding, it doesn't rubber-stamp a verdict into your hands.
- **Use it when** you have to review, or just get your head around, code someone else wrote — a PR, an unfamiliar diff, a branch.
- **Output:** an accurate mental model of the change, built actively in your terminal — no passive essay to skim.

### Statusline maintenance

#### `/yuumi:statusline-setup` — one-time statusline install
Copies the Tokyo Night statusline shipped in the plugin to `~/.claude/hud/statusline.mjs`, points `settings.json` `statusLine` at it, and backs up what it replaces. Run it once after installing.

#### `/yuumi:statusline-doctor` — diagnose & auto-fix the statusline
Runs an OS-aware checklist (node, the installed copy, executable bit, `settings.json` path, leftovers from the old `npx skills` install) and **fixes anything fixable**, then prints a pass/fail report.
- **Use it when** the statusline is blank, stale, or misbehaving.

---

## The statusline

Once set up, the HUD renders two lines (powerline segments on a Tokyo Night palette):

- **Line 1** — IME indicator (가/A) · version · model (context size) · directory · git branch
- **Line 2** — 5h / 7d rate-limit bars · per-model weekly limit (plans with model-scoped limits, e.g. Fable) · session duration · context bar

The rate-limit bars are **allocation-aware**: the color isn't a fixed percentage, it's relative to how much time has elapsed in the window — so you can tell at a glance whether you're under- or over-spending your budget.

---

## duet

[Duet](https://github.com/heeseon87/duet) is a local app that puts a design canvas, a code review and a live Claude Code agent on one screen. This mod connects a terminal Claude Code session to it, so you can design in Duet and build from the terminal.

- **Maps from the terminal.** `duet_map_list`, `duet_map_read`, `duet_map_create`, `duet_map_update` and `duet_map_reply` make, read and change Duet's maps. Changes show live on the canvas and are kept as revisions, marked with the terminal they came from. A new map is pinned when the terminal has none, and outside a Duet workspace it first opens the folder's git repository as one.
- **Duet to the terminal.** Pick the terminal in Duet's agent panel (the 터미널 section). Canvas comments, decisions, review comments and messages typed in Duet then go into this session, and the answer comes back to the thread.
- **Connecting.** A session starts off Duet: no polling, no `duet_map_*` tools, no status line. `/duet` connects it and lists the maps, `/duet <map>` connects it and pins the map this terminal works from (for this session only), and `/duet off` unpins and disconnects.
- **Status line.** `Duet · 📌 <map> · rev N · 결정 a/b`, or `Duet 꺼짐` while Duet is not running.

Start Duet first (`duet` in the repo you want to open); the mod finds it through `~/.duet`. Then run `/duet` in a terminal anywhere inside a Duet workspace, a worktree under it included.

---

## Requirements

- **[Node.js](https://nodejs.org/) 18+** in PATH. On Windows the standard installer (`C:\Program Files\nodejs`) is recommended; nvm-windows / fnm / volta also work.
- **A [Nerd Font](https://github.com/ryanoasis/nerd-fonts/releases) terminal** for the statusline glyphs (see below). JetBrainsMono Nerd Font is recommended.
- **A truecolor (24-bit) terminal** — the Tokyo Night palette uses 24-bit ANSI color. 256-color terminals won't render it correctly.

## Troubleshooting

```
/yuumi:statusline-doctor
```

> **Coming from the old `npx skills` install (yuumi 1.x)?** Install the plugin, run `/yuumi:statusline-setup` (it repoints `settings.json` at `~/.claude/hud/`), then remove the old skill folders with `npx skills remove -g` for the `yuumi-*` skills — otherwise every skill shows up twice. Skills dropped in 2.0: `design`, `explain-detail`, `implement`, `pretty`, `teach-me`, `update`; the old `explain-fast` is now `explain`.

## Platform notes

On macOS/Linux, `statusLine.command` is the copy's path run via its `#!/usr/bin/env node` shebang (setup sets the executable bit). On Windows there is no shebang, so the command is an absolute `node.exe` + the path — it prefers `%ProgramFiles%\nodejs\node.exe` and falls back to the node binary that ran setup. If you switch node installations, re-run `/yuumi:statusline-setup` once.

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

*Your agent carries. You take the credit. That's the yuumi way. 🐱*
