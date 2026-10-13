# yuumi 🐱

> A Claude Code plugin marketplace: a Tokyo Night statusline, a handful of workflow skills, and a live design map of what your agent is building.
> Your agent does the carrying. You ride along like Yuumi — slurping cup ramen, and (let's be honest) taking the credit.

## Why "yuumi"?

In *League of Legends*, **Yuumi** is the cat who attaches to a teammate and rides into battle on their back. She doesn't walk the lane — she gets carried. The AD carry does the work; Yuumi tosses out a heal, a little speed, the occasional poke, and somehow finishes the game convinced *she* hard-carried. (She was eating cup ramen behind the ADC the whole time.)

That's the whole idea — and in this story, **you're Yuumi.** Your coding **agent is the ADC**: it walks the lane, takes the fights, does the carrying. You attach to it, ride along, toss out the occasional buff (a prompt, a nudge, a skill), and come away having "carried." This marketplace is your Yuumi kit — a statusline to watch the lane for you, a few skills to buff the agent doing the work, and a live map of what it is building. Now sit back, eat your cup ramen, and shout it one more time: "Carry!" 😎

Claude Code only. The statusline works on **macOS, Linux, and Windows**; design-map currently runs on **macOS**.

---

## What you get

Two plugins, from one marketplace:

| Plugin | What it is | Platforms |
|--------|------------|-----------|
| **`yuumi`** | Tokyo Night statusline (HUD) + workflow skills: `interview`, `edit`, `explain`, `review`, plus `statusline-setup` / `statusline-doctor` | macOS · Linux · Windows |
| **`design-map`** | A live design map: Claude keeps a class or sequence diagram of the design in sync as it works, drawn in your browser, with a firefly showing where it is looking | macOS |

## Install

Inside Claude Code (terminal):

```
/plugin marketplace add heeseon87/yuumi
/plugin install yuumi@yuumi
/plugin install design-map@yuumi
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

## design-map

Claude draws a **design map** — a Mermaid class diagram (structure: boxes and relations) or sequence diagram (behavior: participants and ordered messages) — while you discuss or build a change, and keeps it true as it works. The map lives in your browser at `http://127.0.0.1:7777`, with decisions, progress and a feedback thread beside it, and what you write there reaches the Claude session.

### Start a map

Just ask Claude, in your own words:

- "Draw this change as a design map" → a class map of what the change touches
- "Map the order-creation flow as a sequence diagram" → a sequence map
- "Open the design map for PROJ-142" → reopens (or creates) a map by name

Claude opens it with `map_open`, then keeps it current with `map_update` as it analyzes, decides and implements. The browser opens on its own the first time.

### Commands

| Command | What it does |
|---------|--------------|
| `/design-map` | Reopen the last map of this folder in the browser; this session takes its feedback |
| `/design-map <name>` | Open a map (or a saved diagram) by name |
| `/design-map list` | List maps and diagrams |
| `/design-map browser` | Open the current map in a new browser tab |
| `/design-map drawer` | Open the diagram drawer: every map and saved diagram, with tags, memos and versions |
| `/design-map export <file.md>` | Write the map (Mermaid block with legend, decisions, progress) into a Markdown file; re-running replaces only that block |
| `/design-map close` | Close the map in this session |

You can also ask Claude to keep any plain Mermaid diagram in the drawer ("put this flow in the drawer as a sequence diagram").

### Reading the map

- **Colors** say how much each box touches existing code: grey = unchanged · light purple = only stored values change · purple = code changes · green = new · red = removed. `«external»`, `«table»` and `«resource»` boxes are green when this change brings them in.
- **Stamps and breathing**: a done box gets a 완료 stamp; a box whose files changed but isn't done breathes softly.
- **The firefly** flies to the box Claude is reading (mint) or editing (peach), with a caption naming the file.
- **Fog** settles on boxes whose code changed while the map didn't, and lifts when Claude updates the map.
- **Rings** in the header show steps, implementation and decisions closing.

### Talking to the map

- Click a box, a line or the whole map, write in the side panel, and press ⌘↩ — it reaches Claude as feedback, and the answer pops up as a bubble over that box. While Claude is busy, **지금 끼어들기** delivers it into the running turn.
- **Double-click (or long-press) a box** to write right on it. **Hold a box for a moment and pull** to another box (or ⌥-drag) to ask why they connect, or to suggest a relation.
- **Hover a decision** to see the boxes it would change; pick an option with **이걸로 결정**.
- 🔔 in the header turns on a soft chime and a macOS notification when Claude answers.

### Getting around

| Key / control | What it does |
|---------------|--------------|
| scroll · drag empty space | zoom · pan (`f` fit, `1` 100%) |
| `⌘K` or `/` | Spotlight: jump to a box, member, file or decision; filters such as **새 코드만 보기** (new code only) |
| `p` or **▶ 흐름** | Play the call flow: a pulse travels the arrows in order |
| time-machine slider (bottom) | Scrub through revisions; `▶` replays from the first, `[` `]` step |
| click a box | Focus: only its neighbours stay sharp, its lines flow |

Zooming out far turns boxes into name pills; zooming in shows each box's files.

### Settings

`/config` → design-map: `port` (default 7777, bound to 127.0.0.1), `editor` for opening a box's file (`intellij`, `vscode`, `cursor`, `zed`, or `custom` with `editorCommand`), `mapsDir` (default `~/.claude/design-maps`), and `nodePath` (empty = the `node` on your PATH).

Maps and their history live in `~/.claude/design-maps`, outside the plugin, so updates never touch them. More detail (feedback loop internals, sequence-map notation, files): [`plugins/design-map/README.md`](plugins/design-map/README.md) (Korean).

Requires **Node 22.6+** and `npm i -g @mermaid-js/mermaid-cli` (its Mermaid bundle feeds the browser page). macOS only for now (pages open with `open`).

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
