# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working in this repository.

## Repository purpose

`yuumi` is a **Claude Code plugin marketplace** (2.0). Two plugins, listed in `.claude-plugin/marketplace.json`:

- **`plugins/yuumi`** (relative source) — the Tokyo Night statusline (`skills/statusline-setup/assets/statusline.mjs`) and six skills: `interview`, `edit`, `explain`, `review`, `statusline-setup`, `statusline-doctor`. Commands are `/yuumi:<skill>`.
- **`duet`** (`git-subdir` source: `mod/` of [heeseon87/duet](https://github.com/heeseon87/duet)) — the terminal mod for the Duet app. Its code, tests and version live in the duet repo; this repo only lists it.

Users install with `/plugin marketplace add heeseon87/yuumi` then `/plugin install <plugin>@yuumi`. Claude Code only: the 1.x `npx skills` channel (Codex, Cursor, Hermes …) was retired in 2.0, along with the `design`, `explain-detail`, `implement`, `pretty`, `teach-me` and `update` skills. The old `explain-fast` is now `explain`.

## Release workflow

Publishing is "commit + push to `main`". Users update with `/plugin update <plugin>@yuumi`.

**Before every push**, bump the version of each plugin you changed:

- `yuumi`: `plugins/yuumi/.claude-plugin/plugin.json` → `version`, and the `version:` frontmatter in every `plugins/yuumi/skills/<name>/SKILL.md` (all six). Keep them uniform.
- `duet`: released from the duet repo (`mod/.claude-plugin/plugin.json` → `version`, then push there); nothing to bump here.

Supporting files for a skill live **inside that skill's directory** (`assets/`), so the skill can find them from its own base directory.

## Manual verification

Smoke-test a statusline change locally (the script reads stdin JSON, never CLI args):

```bash
echo '{"model":{"display_name":"Opus"},"cwd":"'$PWD'","version":"1.4.0","context_window":{"used_percentage":12,"context_window_size":200000}}' | node plugins/yuumi/skills/statusline-setup/assets/statusline.mjs
```

For end-to-end verification, run `/yuumi:statusline-doctor` inside Claude Code — it checks node availability, the installed copy, exec bit, `settings.json` path, and npx-era leftovers.

## Statusline architecture (`plugins/yuumi/skills/statusline-setup/assets/statusline.mjs`)

Claude Code runs this script on every statusline refresh (interval = 1s), piping session JSON to stdin. Two lines are emitted:

- **Line 1** — powerline segments (`IME? · version · model(ctx size) · dir · branch`) joined by the `` arrow glyph with Tokyo Night backgrounds.
- **Line 2** — rate limits (5h / 7d bars) · session duration · context bar, separated by dim ` | `.

Non-obvious invariants — do not "simplify" these without understanding why they exist:

- **Statusline launcher.** On macOS/Linux, `settings.json → statusLine.command` is the quoted `statusline.mjs` path and relies on the shebang (`#!/usr/bin/env node`) so version managers keep working — `statusline-setup` sets the executable bit on the copy. On Windows, setup writes a direct quoted node executable plus quoted `statusline.mjs` path (no shebang). Do **not** route Windows through `statusline.cmd`; the batch wrapper can leave orphaned `cmd.exe` processes when Claude Code is hard-killed. `/yuumi:statusline-doctor` should detect missing exec bits, stale node paths, and legacy config.
- **Allocation-based colors.** The 5h and 7d bars use `getAllocationLevel(usedPercent, elapsed, totalPeriods)`. The threshold is not a fixed percent — it's a moving target based on *elapsed time* inside the window. Level 0 ("이월") means you are under-spending vs. the proportional line; levels 1 → 4 escalate as you burn through faster than the clock. Changes cascade into both `allocationBar` and `colorAllocationPercent`.
- **Session start from transcript.** `getSessionStartFromTranscript` reads the first 2 KB of the transcript file and scans multiple timestamp fields (top-level `timestamp`, `snapshot.timestamp`, `data.timestamp`) to sidestep a bug in the default tail-based parser. Do not convert this to a tail read.
- **Version check is non-blocking.** `getLatestVersion` returns the cached value synchronously and spawns a detached `node -e` registry refresh on cache expiry (1 h TTL at `~/.claude/.claude-code-latest-version.json`). Never `await` / `execSync` the network call, and do not use `npm view`/`shell: true` in the hot path — it would stall every 1 s refresh or create extra Windows shell processes.
- **IME detection is per-OS.** macOS reads `com.apple.HIToolbox.plist` via `defaults`; Linux probes `fcitx5-remote` → `fcitx-remote` → `ibus engine`; Windows PowerShell reads `InputLanguage.Culture.Name` (keyboard *layout* only — it cannot see the IME han/eng toggle). Each branch must stay `try`-wrapped with a short timeout so a failing platform never blocks rendering.
- **OAuth token lookup must pick, not just fetch.** The macOS keychain accumulates several entries under the service name `Claude Code-credentials`: one labeled with the real account, one labeled `unknown` whose `accessToken` is an empty string, and older `Claude Code-credentials-<hash>` entries holding expired tokens. A `security find-generic-password -s ... -w` call without `-a` returns an arbitrary one of them, so `readToken` collects several candidates, drops any with an empty `accessToken`, and picks the one that expires latest among the unexpired. Do not collapse this back to a single lookup, and do not hardcode the account label: it differs per machine.
- **The scoped-limit cache expires from the screen.** `getScopedWeeklyLimits` keeps showing a stale cache for a short grace period, then hides the segment past `USAGE_API_MAX_STALE_MS` (10 min). The background refresh fails silently by design (a non-200 response writes nothing), so without this cap a dead token leaves a frozen percentage on screen that looks perfectly healthy. Cap the *display* age; never clear the cache on a failed response, since a transient 500 would discard a good reading.
- **Non-breaking spaces.** Final output replaces literal spaces with ` ` because Claude Code's statusline renderer collapses runs of ASCII spaces.

## Statusline setup and sync (`plugins/yuumi/skills/statusline-setup/assets/`)

The plugin is installed into a versioned cache folder that changes on every `/plugin update`, so `settings.json` must never point into it.

- **`setup.mjs`** (run by `/yuumi:statusline-setup`): copies `statusline.mjs` to the fixed path `~/.claude/hud/statusline.mjs` (backing up a different file to `~/.claude/hud/backup/`), sets the exec bit, points `settings.json` `statusLine` at the copy (Windows: absolute `node.exe` + path), and drops old yuumi `SessionStart` hooks from `settings.json`. Every other key and hook is preserved.
- **`sync.mjs`** (the plugin's `SessionStart` hook, `plugins/yuumi/hooks/hooks.json`): refreshes the copy when it differs from the plugin's. It only touches a copy that is already there **and** is yuumi's own (header `yuumi statusline`, or `Heeseon's Statusline` on old copies), so users who never ran setup, and other tools' statuslines at that path, are left alone. It is silent and always exits 0: a session must never fail because of it.

## Skills structure

Each skill is `plugins/yuumi/skills/<name>/SKILL.md` (plus `assets/` where needed). Frontmatter `name` is the bare skill name; the plugin adds the `yuumi:` prefix.

## Runtime requirements users must satisfy

- **Nerd Font terminal** — `statusline.mjs` hard-codes ``, ``, ``, ``, ``, ``, and the powerline arrow ``. If you change a glyph, pick a matching codepoint from the Nerd Fonts cheatsheet.
- **Truecolor (24-bit ANSI)** — the palette uses `\x1b[38;2;R;G;Bm`. 256-color terminals will not render Tokyo Night correctly.
