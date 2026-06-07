---
name: yuumi:statusline-doctor
description: Diagnose and fix the Claude Code Tokyo Night statusline (broken paths, permissions, settings.json shape, legacy marketplace-era config) — Claude Code only
version: 1.5.1
---

# Yuumi Statusline Doctor

Diagnose and automatically fix common statusline issues for **Claude Code**. **Adapt every check to the user's OS** (macOS/Linux vs Windows).

> **Claude Code only.** The statusline is a Claude Code feature; this skill is a no-op on other agents.

## Architecture (what "healthy" looks like)

yuumi installs via `npx skills add -g heeseon87/yuumi`, so the statusline lives **inside the installed skill**, at a stable global path:

```
~/.claude/skills/yuumi-statusline-setup/assets/statusline.mjs
```

`settings.json` `statusLine.command` points **directly** at that file. There is **no `~/.claude/hud/statusline.mjs` copy and no `SessionStart` hook** — those belonged to the retired marketplace install and are now *legacy* (Step 4b migrates them away).

- **macOS/Linux**: the command is the quoted `assets/statusline.mjs` path, run via its shebang. The file must be executable (`+x`).
- **Windows**: the command is an absolute `node.exe` + the quoted `assets/statusline.mjs` path (no shebang). The node path must be fully resolved — Claude Code spawns it without a shell, so `%VAR%` tokens never expand.

## Steps

Run these checks **in order**. Print each as a checklist line. If a check fails, fix it and re-verify.

### 0. Detect platform

Check `process.platform` (or `uname` / `ver`). On Windows prefer `where` over `which`, `%USERPROFILE%` over `~`, and resolve absolute paths.

### 1. Check node availability

- macOS/Linux: `which node && node --version`
- Windows: `where node && node --version`

Fail: tell the user to install Node.js or configure their version manager. On Windows the standard installer puts node at `C:\Program Files\nodejs\node.exe`.

### 2. Locate the installed statusline asset

Find the skill's statusline (global install preferred):

```bash
node -e "var fs=require('fs'),p=require('path'),os=require('os');var roots=[p.join(process.env.CLAUDE_CONFIG_DIR||p.join(os.homedir(),'.claude'),'skills'),p.join(process.cwd(),'.claude','skills')];for(var r of roots){try{for(var d of fs.readdirSync(r)){var f=p.join(r,d,'assets','statusline.mjs');if(fs.existsSync(f)){console.log(f);process.exit(0)}}}catch(e){}}console.error('MISSING');process.exit(1)"
```

- **Found, under `~/.claude/skills/…`** → healthy location. Note the path for later steps.
- **Found, only under a project `.claude/skills/…`** → the user installed project-locally. The statusline needs a global install. Tell them to run `npx skills add -g heeseon87/yuumi`, then `/yuumi-statusline-setup`.
- **MISSING** → not installed (or removed). Tell them to run `npx skills add -g heeseon87/yuumi`, then `/yuumi-statusline-setup`.

### 3. Check executable permissions (macOS/Linux only)

The skills-CLI copy drops the exec bit. On Unix the shebang launch needs it.

- macOS/Linux: `test -x <asset path from Step 2>`
- Windows: skip (no exec bit).

Fix on Unix: `chmod 755 <asset path>` (or just re-run `/yuumi-statusline-setup`, which does this).

### 4. Check settings.json statusLine command

Read `~/.claude/settings.json` and inspect `statusLine.command`. It should reference the **Step 2 asset path**:

- macOS/Linux: `"<homedir>/.claude/skills/yuumi-statusline-setup/assets/statusline.mjs"`
- Windows: `"<abs node.exe>" "<homedir>\\.claude\\skills\\yuumi-statusline-setup\\assets\\statusline.mjs"`

| Problem | Pattern | Fix |
|---------|---------|-----|
| Points at a missing file | The path in `command` doesn't exist on disk | Re-run `/yuumi-statusline-setup` (or, if yuumi was removed via `npx skills remove`, delete the `statusLine` key — see 4a) |
| **Legacy marketplace path** | Command references `~/.claude/hud/statusline.mjs` | Re-run `/yuumi-statusline-setup` — it repoints at the skill-dir asset (4b) |
| Unexpanded `%ProgramFiles%` (Windows, blank statusline) | Command contains a literal `%…%` | Re-run `/yuumi-statusline-setup` — writes the absolute `node.exe` path |
| Stale / missing node path (Windows) | `node.exe` in the command is gone | Re-run `/yuumi-statusline-setup` |
| Wrong extension on Unix | Path ends in `.cmd` | Re-run `/yuumi-statusline-setup` |
| Missing statusLine | No `statusLine` key | Re-run `/yuumi-statusline-setup` |

#### 4a. Dead statusLine after `npx skills remove`

If the user removed yuumi via `npx skills remove`, the skill directory is gone but `settings.json` still carries a `statusLine` pointing at the deleted file — Claude Code then shows a blank/broken statusline every session. If Step 2 reported MISSING **and** the user does not intend to reinstall, offer to **delete the `statusLine` key** from `settings.json` (back it up first to `~/.claude/hud/backup/`). Otherwise reinstall and re-run setup.

#### 4b. Legacy marketplace-era config (migration)

Older installs used the Claude plugin marketplace, which wrote:
- `statusLine.command` → `~/.claude/hud/statusline.mjs`, and
- a `SessionStart` hook whose command contains `yuumi` (or the pre-rename `claude-kit`) that re-ran a `plugin-setup.mjs`.

Both are obsolete under the `npx skills` single channel. Detect and migrate:

- Any `SessionStart` entry whose command contains `yuumi` or `claude-kit` → **remove that entry** (preserve all other tools' hooks). Re-running `/yuumi-statusline-setup` does this automatically.
- `statusLine` pointing at `~/.claude/hud/` → re-run `/yuumi-statusline-setup` to repoint at the skill-dir asset.
- Optionally clean leftovers: the old `~/.claude/hud/statusline.mjs` copy and `~/.claude/plugins/cache/<marketplace>/yuumi` (and any pre-rename `claude-kit`) can be deleted once the statusline renders from the new path.

### 5. Verify the statusline actually runs

Spawn the configured command the way Claude Code does (with stdin) and inspect the output:

- macOS/Linux:
  ```bash
  echo '{"model":{"display_name":"Opus"},"version":"2.0.0","workspace":{"current_dir":"/tmp"},"session_id":"x"}' | <asset path from Step 2>
  ```
- Windows:
  ```bash
  echo {"model":{"display_name":"Opus"},"version":"2.0.0","workspace":{"current_dir":"C:\\tmp"},"session_id":"x"} | "%ProgramFiles%\nodejs\node.exe" "<asset path>"
  ```

Pass: output contains ANSI escape codes (e.g. `[`).
Fail diagnostics:
- **Unix, "permission denied"** → Step 3 fix (`chmod 755`).
- **Windows, blank + `%ProgramFiles%` in the command** → the env-var form never expands without a shell; re-run setup (writes the absolute node path). Diagnose from the literal `settings.json` value, not a hand-run in cmd.exe (which *does* expand it and masks the bug).
- **Command path missing** → Step 4 / 4a.
- **No output, exit 0** → run the stdin sample above directly to surface the real error.

### 6. Reinstall / re-wire

When files are missing or the config is legacy, re-run setup:

```
/yuumi-statusline-setup
```

It restores the exec bit, repoints `settings.json` at the skill-dir asset, removes the legacy `SessionStart` hook, and backs up the prior settings. If the skill itself is missing, install first: `npx skills add -g heeseon87/yuumi`.

## Output format

```
yuumi statusline doctor (macos)
  [pass] node available (v24.15.0)
  [pass] statusline asset found (~/.claude/skills/yuumi-statusline-setup/assets/statusline.mjs)
  [pass] executable bit set
  [FAIL] settings.json still points at legacy ~/.claude/hud/ → re-ran setup
  [pass] statusline runs successfully

All checks passed. Restart Claude Code to apply changes.
```

Use `[pass]` / `[FAIL]` prefixes, print the detected platform on the header, and if any fix was applied, remind the user to restart Claude Code.
