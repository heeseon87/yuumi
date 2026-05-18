# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

`claude-kit` is a Claude Code **plugin** distributed through a marketplace (`heeseon87/claude-kit`). It ships:

- A Tokyo Night powerline statusline — `hud/statusline.mjs`
- A post-install setup script — `scripts/plugin-setup.mjs` (invoked via `/claude-kit:setup`)
- Seven slash commands under `skills/<name>/SKILL.md` — `setup`, `doctor`, `interview`, `edit`, `explain`, `explain-code`, `implement`
- A bundled `references/html-effectiveness/` directory — official Anthropic HTML samples (Apache 2.0, see `references/html-effectiveness/ATTRIBUTION.md`) used as stylistic ground truth by the `explain` and `explain-code` skills.

There is no build, lint, or test pipeline. The repo is a flat collection of `.mjs` files and `SKILL.md` prompts that Claude Code reads directly.

## Release workflow

Publishing is "commit + push to `main`". Users pull via `/plugin marketplace add heeseon87/claude-kit`.

**Before every push**, bump the patch version. The three version fields must stay in sync:

- `.claude-plugin/marketplace.json` → `version`
- `.claude-plugin/marketplace.json` → `plugins[0].version`
- `.claude-plugin/plugin.json` → `version`

If the version is not bumped, existing installs do not know to re-pull.

## Manual verification

To smoke-test a statusline change locally (the script reads stdin JSON, never CLI args):

```bash
echo '{"model":{"display_name":"Opus"},"cwd":"'$PWD'","version":"1.0.0","context_window":{"used_percentage":12,"context_window_size":200000}}' | node hud/statusline.mjs
```

For end-to-end verification, run `/claude-kit:doctor` inside Claude Code — it checks node availability, file presence, exec bit, and the `settings.json` command shape.

## Statusline architecture (`hud/statusline.mjs`)

Claude Code runs this script on every statusline refresh (interval = 1s), piping session JSON to stdin. Two lines are emitted:

- **Line 1** — powerline segments (`IME? · version · model(ctx size) · dir · branch`) joined by the `` arrow glyph with Tokyo Night backgrounds.
- **Line 2** — rate limits (5h / 7d bars) · session duration · context bar, separated by dim ` | `.

Non-obvious invariants — do not "simplify" these without understanding why they exist:

- **Shebang execution.** `settings.json → statusLine.command` is the script path *alone* (quoted). Do **not** prefix a node binary; the shebang (`#!/usr/bin/env node`) handles that, so the statusline keeps working across `nvm` / `fnm` / `volta` version switches. The `/claude-kit:doctor` skill exists specifically to detect and strip a leaked node path.
- **Allocation-based colors.** The 5h and 7d bars use `getAllocationLevel(usedPercent, elapsed, totalPeriods)`. The threshold is not a fixed percent — it's a moving target based on *elapsed time* inside the window. Level 0 ("이월") means you are under-spending vs. the proportional line; levels 1 → 4 escalate as you burn through faster than the clock. Changes cascade into both `allocationBar` and `colorAllocationPercent`.
- **Session start from transcript.** `getSessionStartFromTranscript` reads the first 2 KB of the transcript file and scans multiple timestamp fields (top-level `timestamp`, `snapshot.timestamp`, `data.timestamp`) to sidestep a bug in the default tail-based parser. Do not convert this to a tail read.
- **Version check is non-blocking.** `getLatestVersion` returns the cached value synchronously and spawns `npm view` in the background on cache expiry (1 h TTL at `~/.claude/.claude-code-latest-version.json`). Never `await` / `execSync` the network call — it would stall every 1 s refresh.
- **IME detection is per-OS.** macOS reads `com.apple.HIToolbox.plist` via `defaults`; Linux probes `fcitx5-remote` → `fcitx-remote` → `ibus engine`; Windows PowerShell reads `InputLanguage.Culture.Name` (keyboard *layout* only — it cannot see the IME han/eng toggle). Each branch must stay `try`-wrapped with a short timeout so a failing platform never blocks rendering.
- **Non-breaking spaces.** Final output replaces literal spaces with ` ` because Claude Code's statusline renderer collapses runs of ASCII spaces.

## Setup script behavior (`scripts/plugin-setup.mjs`)

- Installs by **symlinking** `~/.claude/hud/statusline.mjs` → the marketplace source (detected via the `/plugins/cache/<marketplace>/` path pattern, then redirected to `~/.claude/plugins/marketplaces/<marketplace>/`). Users auto-receive updates on marketplace refresh — they do not need to re-run setup.
- Backs up any pre-existing non-symlink HUD file and the current `settings.json` into `~/.claude/hud/backup/<name>.<timestamp>.bak` before overwriting.
- Overwrites `settings.json.statusLine` unconditionally with `{ type: "command", command: "\"<path>\"", refreshInterval: 1 }`. Any other keys in `settings.json` are preserved.

## Skills structure

Each skill is a single `SKILL.md` file under `skills/<name>/`. The YAML `name` field must be `claude-kit:<name>` — that is the slash command. The file is the entire prompt; there is no supporting JS / config.

## Runtime requirements users must satisfy

- **Nerd Font terminal** — `statusline.mjs` hard-codes ``, ``, ``, ``, ``, ``, and the powerline arrow ``. If you change a glyph, pick a matching codepoint from the Nerd Fonts cheatsheet.
- **Truecolor (24-bit ANSI)** — the palette uses `\x1b[38;2;R;G;Bm`. 256-color terminals will not render Tokyo Night correctly.
