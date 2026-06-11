# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) and other coding agents when working in this repository.

## Repository purpose

`yuumi` ships two things, distributed through **one channel** — the [`skills`](https://skills.sh) CLI (`vercel-labs/skills`):

- **Workflow skills** (any agent): `interview`, `edit`, `explain`, `implement`, `pretty`, `teach-me`, `review` — each a single `skills/<name>/SKILL.md` prompt.
- **A Claude Code statusline** (Claude Code only): a Tokyo Night powerline HUD, `skills/statusline-setup/assets/statusline.mjs`, plus three operational skills that install/diagnose it — `statusline-setup`, `statusline-setup-ad` (installs the HUD alongside a statusline-owning ad extension by locking the combined renderer immutable), `statusline-doctor`.

Users install everything with `npx skills add -g heeseon87/yuumi`. There is no build, lint, or test pipeline; the repo is `.mjs` files and `SKILL.md` prompts that agents read directly.

**Single-channel by design.** The Claude Code plugin marketplace and the separate Codex plugin package were retired — the `skills` CLI installs into Claude Code, Codex, Cursor, Hermes, and dozens of other agents from this one repo, so maintaining per-agent packages was pure duplication. Do **not** reintroduce `.claude-plugin/marketplace.json`, `plugins/yuumi/`, or `.agents/` — `plugin.json` + the `skills/` tree are all the `skills` CLI needs.

### How install names map to commands

The `skills` CLI installs each skill as a **personal skill** under the agent's global skills dir (e.g. `~/.claude/skills/`). For a personal skill, the slash command is the **install directory name**, not the frontmatter `name`. The CLI derives the install dir from frontmatter `name` by sanitizing the colon to a hyphen:

| Frontmatter `name` | Install dir | Claude Code command |
|---|---|---|
| `yuumi:pretty` | `yuumi-pretty` | `/yuumi-pretty` |
| `yuumi:statusline-setup` | `yuumi-statusline-setup` | `/yuumi-statusline-setup` |

So keep frontmatter `name: yuumi:<name>` — the `yuumi-` prefix it produces is intentional: it preserves branding and avoids colliding with generic `edit`/`setup`/`pretty` skills in a shared global dir. (The colon-namespaced `/yuumi:pretty` form only exists for plugin installs, which we no longer ship.)

## Release workflow

Publishing is "commit + push to `main`". Users pull via `npx skills add -g heeseon87/yuumi` and update with `npx skills update`.

**Before every push**, bump the version. Two places must stay in sync:

- `.claude-plugin/plugin.json` → `version`
- `version:` frontmatter in **every** `skills/<name>/SKILL.md` (all ten)

Hermes update detection uses content hashes, not the `version` field, but keeping it accurate and uniform keeps the published revision human-readable.

`skills.sh.json` curates how the skills group on the skills.sh registry (a "Yuumi workflow skills" group and a "Claude Code statusline" group). Add new skills to the appropriate group. It controls registry *display*, not what `npx skills add` discovers — the CLI walks the `skills/` tree and reads `plugin.json`.

Supporting files for a skill must live **inside that skill's directory** (`references/`, `assets/`, `examples/`) so the `skills` CLI carries them — it only ships files under a skill dir. This is why the statusline lives in `skills/statusline-setup/assets/`, not a repo-root `hud/`: a root dir would be invisible to the installer. `yuumi:pretty` likewise ships `assets/shell.html`, `examples/temp-page.html`, and `references/*.md`.

After pushing `main`, sanity-check discovery (no install):

```bash
npx skills add heeseon87/yuumi --list   # should list 10 skills with current descriptions
```

Hermes and other agents pull from the same skills.sh release; there is no separate per-agent publish step.

## Manual verification

Smoke-test a statusline change locally (the script reads stdin JSON, never CLI args):

```bash
echo '{"model":{"display_name":"Opus"},"cwd":"'$PWD'","version":"1.4.0","context_window":{"used_percentage":12,"context_window_size":200000}}' | node skills/statusline-setup/assets/statusline.mjs
```

For end-to-end verification, run `/yuumi-statusline-doctor` inside Claude Code — it checks node availability, the installed statusline asset, exec bit, `settings.json` shape, and legacy marketplace-era config.

## Statusline architecture (`skills/statusline-setup/assets/statusline.mjs`)

Claude Code runs this script on every statusline refresh (interval = 1s), piping session JSON to stdin. Two lines are emitted:

- **Line 1** — powerline segments (`IME? · version · model(ctx size) · dir · branch`) joined by the `` arrow glyph with Tokyo Night backgrounds.
- **Line 2** — rate limits (5h / 7d bars) · session duration · context bar, separated by dim ` | `.

Non-obvious invariants — do not "simplify" these without understanding why they exist:

- **Statusline launcher.** On macOS/Linux, `settings.json → statusLine.command` is the quoted `statusline.mjs` path and relies on the shebang (`#!/usr/bin/env node`) so version managers keep working — `statusline-setup` restores the executable bit the `skills` CLI copy drops. On Windows, setup writes a direct quoted node executable plus quoted `statusline.mjs` path (no shebang). Do **not** route Windows through `statusline.cmd`; the batch wrapper can leave orphaned `cmd.exe` processes when Claude Code is hard-killed. `/yuumi-statusline-doctor` should detect missing exec bits, stale node paths, and legacy config.
- **Allocation-based colors.** The 5h and 7d bars use `getAllocationLevel(usedPercent, elapsed, totalPeriods)`. The threshold is not a fixed percent — it's a moving target based on *elapsed time* inside the window. Level 0 ("이월") means you are under-spending vs. the proportional line; levels 1 → 4 escalate as you burn through faster than the clock. Changes cascade into both `allocationBar` and `colorAllocationPercent`.
- **Session start from transcript.** `getSessionStartFromTranscript` reads the first 2 KB of the transcript file and scans multiple timestamp fields (top-level `timestamp`, `snapshot.timestamp`, `data.timestamp`) to sidestep a bug in the default tail-based parser. Do not convert this to a tail read.
- **Version check is non-blocking.** `getLatestVersion` returns the cached value synchronously and spawns a detached `node -e` registry refresh on cache expiry (1 h TTL at `~/.claude/.claude-code-latest-version.json`). Never `await` / `execSync` the network call, and do not use `npm view`/`shell: true` in the hot path — it would stall every 1 s refresh or create extra Windows shell processes.
- **IME detection is per-OS.** macOS reads `com.apple.HIToolbox.plist` via `defaults`; Linux probes `fcitx5-remote` → `fcitx-remote` → `ibus engine`; Windows PowerShell reads `InputLanguage.Culture.Name` (keyboard *layout* only — it cannot see the IME han/eng toggle). Each branch must stay `try`-wrapped with a short timeout so a failing platform never blocks rendering.
- **Non-breaking spaces.** Final output replaces literal spaces with ` ` because Claude Code's statusline renderer collapses runs of ASCII spaces.

## Statusline setup skill behavior (`skills/statusline-setup/assets/setup.mjs`)

`/yuumi-statusline-setup` runs this script (located via a small one-liner in `SKILL.md`). The `skills` CLI can place files but cannot edit `settings.json`, so this is the one manual step a Claude Code user takes after install.

- **Self-locates against the global skills dir**, not its own `import.meta.url`. It searches `~/.claude/skills/*/assets/statusline.mjs` (+ sibling `setup.mjs`) and points `settings.json` at that **logical** path. This is deliberate: (1) finding the asset under `~/.claude/skills/` *is* the global-install requirement — a project-local install isn't found, and the script refuses with a nudge to `npx skills add -g`; (2) the `skills` CLI installs as a symlink by default and Node resolves a module's own path through the symlink into the CLI cache, so `import.meta.url` would yield an unstable path. Using the logical `~/.claude/skills/…` path keeps `settings.json` valid across `npx skills update`.
- **Restores the exec bit** on `statusline.mjs` (the CLI copy drops it) so the shebang launch keeps node resolution dynamic.
- **Writes `settings.json.statusLine`** = `{ type: "command", command: "\"<asset path>\"", refreshInterval: 1 }` (Windows: absolute `node.exe` + path). Backs up the prior `settings.json` to `~/.claude/hud/backup/`. All other keys are preserved.
- **No `SessionStart` hook, no `~/.claude/hud/` copy.** The skill-dir path is already stable, so `npx skills update` refreshes the statusline in place with nothing to re-sync. The script also *removes* any leftover `yuumi`/`claude-kit` `SessionStart` hook from the retired marketplace era (it pointed at a `plugin-setup.mjs` that no longer ships), preserving every other tool's hooks.

## Skills structure

Each skill is a `skills/<name>/SKILL.md` prompt (plus optional `assets/`, `references/`, `examples/` for files the installer must carry). The YAML `name` field is `yuumi:<name>`; see "How install names map to commands" for why that becomes `/yuumi-<name>` once installed. `statusline-setup`, `statusline-setup-ad`, and `statusline-doctor` are Claude Code-only operational skills (no-ops elsewhere); the other seven are portable.

## Runtime requirements users must satisfy

- **Nerd Font terminal** — `statusline.mjs` hard-codes ``, ``, ``, ``, ``, ``, and the powerline arrow ``. If you change a glyph, pick a matching codepoint from the Nerd Fonts cheatsheet.
- **Truecolor (24-bit ANSI)** — the palette uses `\x1b[38;2;R;G;Bm`. 256-color terminals will not render Tokyo Night correctly.
