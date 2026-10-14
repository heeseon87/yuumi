---
name: statusline-doctor
description: Diagnose and fix the Claude Code Tokyo Night statusline from the yuumi plugin (missing copy, permissions, settings.json path, npx-era leftovers)
version: 2.0.1
---

# Yuumi Statusline Doctor

Diagnose and automatically fix common statusline issues. **Adapt every check to the user's OS** (macOS/Linux vs Windows).

## Architecture (what "healthy" looks like)

The yuumi plugin ships `statusline.mjs` in `skills/statusline-setup/assets/`, inside a versioned plugin cache folder that changes on every `/plugin update`. So the statusline runs from a **fixed copy**:

```
~/.claude/hud/statusline.mjs
```

- `/yuumi:statusline-setup` made that copy once and pointed `settings.json` `statusLine.command` at it.
- The plugin's `SessionStart` hook (`assets/sync.mjs`) refreshes the copy at each session start when the plugin brings a different version — only when the file there is yuumi's own (its header says `yuumi statusline`).
- **macOS/Linux**: the command is the quoted copy path, run via its shebang. The file must be executable (`+x`).
- **Windows**: the command is an absolute `node.exe` + the quoted copy path (no shebang). The node path must be fully resolved — Claude Code spawns it without a shell, so `%VAR%` tokens never expand.

## Steps

Run these checks **in order**. Print each as a checklist line. If a check fails, fix it and re-verify.

### 0. Detect platform

Check `process.platform` (or `uname` / `ver`). On Windows prefer `where` over `which`, `%USERPROFILE%` over `~`, and resolve absolute paths.

### 1. Check node availability

- macOS/Linux: `which node && node --version`
- Windows: `where node && node --version`

Fail: tell the user to install Node.js or configure their version manager. On Windows the standard installer puts node at `C:\Program Files\nodejs\node.exe`.

### 2. Check the installed copy

The plugin's own copy is `<statusline-setup skill base directory>/assets/statusline.mjs` (the statusline-setup skill sits beside this one, in `../statusline-setup/` from this skill's base directory).

- `~/.claude/hud/statusline.mjs` **missing** → not set up yet. Run `/yuumi:statusline-setup`.
- **Present but different** from the plugin's copy:
  - header contains `yuumi statusline` → the sync hook has not run since the last update (or failed). Run `/yuumi:statusline-setup` to copy it now.
  - header does not → another tool's statusline sits at that path. Ask before replacing it; `/yuumi:statusline-setup` backs it up to `~/.claude/hud/backup/` first.

### 3. Check executable permissions (macOS/Linux only)

- macOS/Linux: `test -x ~/.claude/hud/statusline.mjs`
- Windows: skip (no exec bit).

Fix on Unix: `chmod 755 ~/.claude/hud/statusline.mjs` (or re-run `/yuumi:statusline-setup`, which does this).

### 4. Check settings.json statusLine command

Read `~/.claude/settings.json` and inspect `statusLine.command`. It should reference the fixed copy:

- macOS/Linux: `"<homedir>/.claude/hud/statusline.mjs"`
- Windows: `"<abs node.exe>" "<homedir>\\.claude\\hud\\statusline.mjs"`

| Problem | Pattern | Fix |
|---------|---------|-----|
| **npx-era path** | Command points into `~/.claude/skills/yuumi-statusline-setup/…` | Re-run `/yuumi:statusline-setup` — repoints at `~/.claude/hud/` (see 4b) |
| Points into the plugin cache | Command contains `/plugins/cache/` | Re-run `/yuumi:statusline-setup` — that folder changes on every update |
| Points at a missing file | The path in `command` doesn't exist on disk | Re-run `/yuumi:statusline-setup` (or, if yuumi was uninstalled, delete the `statusLine` key — see 4a) |
| Unexpanded `%ProgramFiles%` (Windows, blank statusline) | Command contains a literal `%…%` | Re-run `/yuumi:statusline-setup` — writes the absolute `node.exe` path |
| Stale / missing node path (Windows) | `node.exe` in the command is gone | Re-run `/yuumi:statusline-setup` |
| Missing statusLine | No `statusLine` key | Re-run `/yuumi:statusline-setup` |

#### 4a. Dead statusLine after uninstalling

Uninstalling the plugin leaves `~/.claude/hud/statusline.mjs` and the `statusLine` key in place, so the statusline keeps working without updates. If the user wants it gone, offer to **delete the `statusLine` key** from `settings.json` (back it up first to `~/.claude/hud/backup/`) and the copy.

#### 4b. npx-era leftovers (migration)

Before 2.0, yuumi installed with `npx skills add -g heeseon87/yuumi`, which left:
- `statusLine.command` → `~/.claude/skills/yuumi-statusline-setup/assets/statusline.mjs`
- skill folders `~/.claude/skills/yuumi-*` and `~/.agents/skills/yuumi-*`
- `skillOverrides` keys like `yuumi-edit` in `settings.json`

Detect and migrate:
- Re-run `/yuumi:statusline-setup` to repoint `statusLine` at `~/.claude/hud/statusline.mjs`.
- Old skill folders make every skill show twice. Tell the user to remove them: `npx skills remove -g` the `yuumi-*` skills (or delete those folders).
- Any `SessionStart` entry in `settings.json` whose command contains `yuumi` or `claude-kit` → **remove that entry** (preserve all other tools' hooks). Re-running `/yuumi:statusline-setup` does this automatically.

### 5. Verify the statusline actually runs

Spawn the configured command the way Claude Code does (with stdin) and inspect the output:

- macOS/Linux:
  ```bash
  echo '{"model":{"display_name":"Opus"},"version":"2.0.0","workspace":{"current_dir":"/tmp"},"session_id":"x"}' | ~/.claude/hud/statusline.mjs
  ```
- Windows:
  ```bash
  echo {"model":{"display_name":"Opus"},"version":"2.0.0","workspace":{"current_dir":"C:\\tmp"},"session_id":"x"} | "C:\Program Files\nodejs\node.exe" "%USERPROFILE%\.claude\hud\statusline.mjs"   # use the absolute node path from settings.json — a shell expands %VAR% and masks the bug
  ```

Pass: output contains ANSI escape codes (e.g. `[`).
Fail diagnostics:
- **Unix, "permission denied"** → Step 3 fix (`chmod 755`).
- **Windows, blank + `%ProgramFiles%` in the command** → the env-var form never expands without a shell; re-run setup (writes the absolute node path).
- **Command path missing** → Step 4 / 4a.
- **No output, exit 0** → run the stdin sample above directly to surface the real error.

### 6. Reinstall / re-wire

When the copy is missing or the config is from an older install, re-run setup:

```
/yuumi:statusline-setup
```

It copies the statusline to `~/.claude/hud/`, sets the exec bit, repoints `settings.json`, removes old yuumi `SessionStart` hooks, and backs up what it replaces. If the plugin itself is missing, install it first: `/plugin install yuumi@yuumi`.

## Output format

```
yuumi statusline doctor (macos)
  [pass] node available (v24.15.0)
  [pass] statusline installed (~/.claude/hud/statusline.mjs, matches the plugin's copy)
  [pass] executable bit set
  [FAIL] settings.json pointed into ~/.claude/skills/ (npx era) → re-ran setup
  [pass] statusline runs successfully

All checks passed. Restart Claude Code to apply changes.
```

Use `[pass]` / `[FAIL]` prefixes, print the detected platform on the header, and if any fix was applied, remind the user to restart Claude Code.
