# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository purpose

`yuumi` is a Claude Code **plugin** distributed through a marketplace (`heeseon87/yuumi`). It ships:

- A Tokyo Night powerline statusline — `hud/statusline.mjs`
- A post-install setup script — `scripts/plugin-setup.mjs` (invoked via `/yuumi:setup`)
- Eight slash commands under `skills/<name>/SKILL.md` — `setup`, `doctor`, `interview`, `edit`, `explain`, `implement`, `pretty`, `teach-me`

There is no build, lint, or test pipeline. The repo is a flat collection of `.mjs` files and `SKILL.md` prompts that Claude Code reads directly.

## Release workflow

Publishing is "commit + push to `main`". Users pull via `/plugin marketplace add heeseon87/yuumi`.

**Before every push**, bump the patch version. The three version fields must stay in sync:

- `.claude-plugin/marketplace.json` → `version`
- `.claude-plugin/marketplace.json` → `plugins[0].version`
- `.claude-plugin/plugin.json` → `version`

If the version is not bumped, existing installs do not know to re-pull.

Hermes users install the cross-agent workflow prompts through skills.sh / Hermes Skills Hub, not the Claude Code plugin marketplace. Keep Hermes release metadata in sync during the same release:

- Keep `skills.sh.json` listing only the published Hermes workflow skill directories: `interview`, `edit`, `explain`, `implement`, `pretty`, `teach-me`.
- Do **not** publish `setup` or `doctor` through skills.sh. They are Claude Code-only operational slash commands for installing/diagnosing the Tokyo Night statusline and read/update Claude Code settings.
- Add or update `version: <plugin version>` in each root `skills/<name>/SKILL.md` frontmatter. Hermes update detection uses content hashes, not this version field, but the field keeps the published skill revision human-readable and aligned with the Claude marketplace version.
- Make sure any new supporting files for a published Hermes skill live under that skill directory (`references/`, `assets/`, `examples/`, etc.) so the skills.sh bundle includes them. For example, `yuumi:pretty` ships `assets/shell.html`, `examples/temp-page.html`, and `references/*.md`.
- After pushing `main`, verify Hermes sees the release:
  ```bash
  hermes skills check
  hermes skills update
  hermes skills check
  ```
  The first check should show `update_available` for changed published Yuumi workflow skills, and the final check should show `up_to_date`. If an older local Hermes install still has `setup` or `doctor`, treat those as stale local installs rather than supported Hermes-published skills.
- Do not replace the skills.sh flow with a local `rsync` into `~/.hermes/skills/yuumi`; that only updates one machine and does not prove the public Hermes release path works.

Codex users install through Codex plugin marketplaces. Keep the Codex package in sync during the same release:

- Treat root `skills/` as the canonical skill source, then sync only the cross-agent workflow skills into `plugins/yuumi/skills/`: `interview`, `edit`, `explain`, `implement`, `pretty`, `teach-me`. Do **not** include `setup` or `doctor`; they are Claude Code-only operational commands.
- The Codex copy should match the allowed root skill content except for frontmatter `name`: root skills use `yuumi:<name>` for Claude/Hermes, while Codex plugin skills must use bare names (`interview`, `edit`, `explain`, `implement`, `pretty`, `teach-me`) so Codex exposes them once as `yuumi:<name>`, not `yuumi:yuumi:<name>`.
- Keep `plugins/yuumi/.codex-plugin/plugin.json` at the same semver as the Claude marketplace version. Use strict semver for public releases; reserve `+codex.<timestamp>` cachebusters for local iteration only.
- Keep `.agents/plugins/marketplace.json` pointing at `./plugins/yuumi` with `policy.installation: "AVAILABLE"`, `policy.authentication: "ON_INSTALL"`, and category `Productivity`.
- Validate the Codex manifest and marketplace JSON before committing. The manifest must include real `name`, `version`, `description`, `author.name`, `skills`, and required `interface` fields; `interface.defaultPrompt` should be an array of at most three short prompts.
- After pushing `main`, verify the Codex release path with the current CLI surface:
  ```bash
  codex plugin marketplace add heeseon87/yuumi
  codex plugin marketplace upgrade yuumi
  codex -C /Users/heeseon/github/claude-kit debug prompt-input "test"
  ```
  Check the `skills_instructions` block for the six Codex-published Yuumi workflow skills (`yuumi:interview`, `yuumi:edit`, `yuumi:explain`, `yuumi:implement`, `yuumi:pretty`, `yuumi:teach-me`), verify `yuumi:setup` and `yuumi:doctor` are absent, and make sure it does not point at a stale `claude-kit` or old `plugins/cache/yuumi/.../0.1.0` path.
- Do not document `codex plugin add`; this Codex CLI exposes plugin installation through `codex plugin marketplace add/upgrade`.

## Manual verification

To smoke-test a statusline change locally (the script reads stdin JSON, never CLI args):

```bash
echo '{"model":{"display_name":"Opus"},"cwd":"'$PWD'","version":"1.0.0","context_window":{"used_percentage":12,"context_window_size":200000}}' | node hud/statusline.mjs
```

For end-to-end verification, run `/yuumi:doctor` inside Claude Code — it checks node availability, file presence, exec bit, and the `settings.json` command shape.

## Statusline architecture (`hud/statusline.mjs`)

Claude Code runs this script on every statusline refresh (interval = 1s), piping session JSON to stdin. Two lines are emitted:

- **Line 1** — powerline segments (`IME? · version · model(ctx size) · dir · branch`) joined by the `` arrow glyph with Tokyo Night backgrounds.
- **Line 2** — rate limits (5h / 7d bars) · session duration · context bar, separated by dim ` | `.

Non-obvious invariants — do not "simplify" these without understanding why they exist:

- **Statusline launcher.** On macOS/Linux, `settings.json → statusLine.command` is the quoted `statusline.mjs` path and relies on the shebang (`#!/usr/bin/env node`) so version managers keep working. On Windows, setup writes a direct quoted node executable plus quoted `statusline.mjs` path. Do **not** route Windows through `statusline.cmd`; the batch wrapper can leave orphaned `cmd.exe` processes when Claude Code is hard-killed. `/yuumi:doctor` should detect stale node paths and legacy `.cmd` configuration.
- **Allocation-based colors.** The 5h and 7d bars use `getAllocationLevel(usedPercent, elapsed, totalPeriods)`. The threshold is not a fixed percent — it's a moving target based on *elapsed time* inside the window. Level 0 ("이월") means you are under-spending vs. the proportional line; levels 1 → 4 escalate as you burn through faster than the clock. Changes cascade into both `allocationBar` and `colorAllocationPercent`.
- **Session start from transcript.** `getSessionStartFromTranscript` reads the first 2 KB of the transcript file and scans multiple timestamp fields (top-level `timestamp`, `snapshot.timestamp`, `data.timestamp`) to sidestep a bug in the default tail-based parser. Do not convert this to a tail read.
- **Version check is non-blocking.** `getLatestVersion` returns the cached value synchronously and spawns a detached `node -e` registry refresh on cache expiry (1 h TTL at `~/.claude/.claude-code-latest-version.json`). Never `await` / `execSync` the network call, and do not use `npm view`/`shell: true` in the hot path — it would stall every 1 s refresh or create extra Windows shell processes.
- **IME detection is per-OS.** macOS reads `com.apple.HIToolbox.plist` via `defaults`; Linux probes `fcitx5-remote` → `fcitx-remote` → `ibus engine`; Windows PowerShell reads `InputLanguage.Culture.Name` (keyboard *layout* only — it cannot see the IME han/eng toggle). Each branch must stay `try`-wrapped with a short timeout so a failing platform never blocks rendering.
- **Non-breaking spaces.** Final output replaces literal spaces with ` ` because Claude Code's statusline renderer collapses runs of ASCII spaces.

## Setup script behavior (`scripts/plugin-setup.mjs`)

- Installs by **copying** the latest plugin `hud/statusline.mjs` to the stable `~/.claude/hud/statusline.mjs` (source resolved via the `/plugins/cache/<marketplace>/` path pattern, then redirected to `~/.claude/plugins/marketplaces/<marketplace>/`). The `SessionStart` hook re-runs this script every session to re-copy, so users auto-receive updates without re-running setup. **Symlink migration:** if the dest is a leftover symlink from older symlink-based installs, it is `unlink`ed before the copy — a *dangling* symlink (e.g. after the pointed-to marketplace is renamed/removed) slips past `existsSync` and would otherwise crash `copyFileSync` with ENOENT.
- Backs up any pre-existing non-symlink HUD file and the current `settings.json` into `~/.claude/hud/backup/<name>.<timestamp>.bak` before overwriting.
- Overwrites `settings.json.statusLine` unconditionally with `{ type: "command", command: "\"<path>\"", refreshInterval: 1 }`. Any other keys in `settings.json` are preserved.

## Skills structure

Each skill is a single `SKILL.md` file under `skills/<name>/`. The YAML `name` field must be `yuumi:<name>` — that is the slash command. The file is the entire prompt; there is no supporting JS / config.

## Runtime requirements users must satisfy

- **Nerd Font terminal** — `statusline.mjs` hard-codes ``, ``, ``, ``, ``, ``, and the powerline arrow ``. If you change a glyph, pick a matching codepoint from the Nerd Fonts cheatsheet.
- **Truecolor (24-bit ANSI)** — the palette uses `\x1b[38;2;R;G;Bm`. 256-color terminals will not render Tokyo Night correctly.
