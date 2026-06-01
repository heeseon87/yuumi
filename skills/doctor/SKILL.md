---
name: yuumi:doctor
description: Diagnose and fix yuumi statusline issues (broken paths, permissions, outdated settings)
version: 1.3.25
---

# Yuumi Doctor

Diagnose and automatically fix common statusline issues. **Adapt every check to the user's OS** (macOS/Linux vs Windows) — the expected statusLine entry differs:

- **macOS/Linux**: `~/.claude/hud/statusline.mjs` is invoked directly via shebang.
- **Windows**: `node` is invoked directly with `~/.claude/hud/statusline.mjs`; no `.cmd` wrapper should sit in the statusline hot path.

## Steps

Run these checks **in order**. Print each result as a checklist. If any check fails, fix it and re-verify.

### 0. Detect platform

Check `process.platform` (or run `uname` / `ver`). Use the correct command shape for each subsequent step. On Windows prefer `where` over `which`, `%USERPROFILE%` over `~`, and `cmd /c` for shell invocations.

### 1. Check node availability

- macOS/Linux: `which node && node --version`
- Windows: `where node && node --version`

Pass: node found.
Fail: Tell user to install Node.js or configure their version manager. On Windows, the standard installer puts node at `C:\Program Files\nodejs\node.exe`.

### 2. Check HUD files exist

The `.mjs` is required on every platform. A legacy `.cmd` wrapper may still exist on Windows, but settings should not point at it.

- macOS/Linux: `test -f ~/.claude/hud/statusline.mjs && echo OK || echo MISSING`
- Windows: `test -f "$USERPROFILE/.claude/hud/statusline.mjs"` (or use `cmd /c "if exist ... echo OK"`)

Fail: Run setup (Step 6).

### 3. Check executable permissions (macOS/Linux only)

- macOS/Linux: `test -x ~/.claude/hud/statusline.mjs`
- Windows: skip — `.cmd` is executable by virtue of its extension being in `PATHEXT`.

Fix on Unix: `chmod 755 ~/.claude/hud/statusline.mjs`

### 4. Check settings.json statusLine command

Read `~/.claude/settings.json` and inspect `statusLine.command`. The expected value is one of:

- macOS/Linux: `"<homedir>/.claude/hud/statusline.mjs"` (with surrounding quotes inside the JSON string)
- Windows: an **absolute** node path + the `.mjs`, e.g. `"C:\\Program Files\\nodejs\\node.exe" "<homedir>\\.claude\\hud\\statusline.mjs"` for a standard install, or `"<current node.exe>" "<homedir>\\.claude\\hud\\statusline.mjs"` for version managers. The node path must be fully resolved — Claude Code spawns this command without a shell, so `%VAR%` tokens never expand.

Common problems:

| Problem | Pattern | Fix |
|---------|---------|-----|
| Unexpanded `%ProgramFiles%` (blank statusline) | Command contains the literal `%ProgramFiles%` (or any `%...%`) on Windows | Run setup (it now writes the absolute `node.exe` path; the env-var form never expands without a shell) |
| Hardcoded stale node path | `"C:\\old\\node.exe" "...statusline.mjs"` and node path is missing | Run setup |
| Legacy Windows cmd wrapper | Path ends with `statusline.cmd` on Windows | Run setup (the new setup removes the `.cmd` wrapper from the hot path) |
| Missing statusLine | No `statusLine` key | Run setup |
| Wrong extension on Unix | Path ends with `.cmd` on macOS/Linux | Run setup |
| Path doesn't exist | File pointed at by command is missing | Run setup |

### 4b. Check SessionStart auto-sync hook (1.3.0+)

yuumi registers a `SessionStart` hook so HUD files refresh automatically every session — no manual setup re-run needed after `/plugin update`. Verify:

- `settings.hooks.SessionStart` exists (array)
- Exactly one entry's command contains `yuumi` (the auto-sync walker)

Missing or duplicated → run setup. The setup is idempotent and only adds/replaces the yuumi entry, leaving any other tools' SessionStart hooks intact.

**Legacy `claude-kit` entry (pre-rename installs).** Before the rename to `yuumi`, the auto-sync hook command contained the marker `claude-kit`. The new setup only matches `yuumi`, so an old entry is left untouched and **appends** alongside the new one — two hooks then fight to overwrite `~/.claude/hud/statusline.mjs` every session. Detect and remove it:

- Any `SessionStart` entry whose command contains `claude-kit` (or `agent-kit`) but **not** `yuumi` is a stale pre-rename hook → remove that entry from `settings.json` (preserve all other entries), then re-run setup.
- Also remove the stale cached plugin dir if present: `~/.claude/plugins/cache/<marketplace>/claude-kit` (the new install lives under `.../yuumi`).

### 5. Verify the statusline actually runs

Spawn the configured command exactly the way Claude Code does (with stdin) and inspect the output:

- macOS/Linux:
  ```bash
  echo '{"model":{"display_name":"Opus"},"version":"2.0.0","workspace":{"current_dir":"/tmp"},"session_id":"x"}' | ~/.claude/hud/statusline.mjs
  ```
- Windows:
  ```bash
  echo {"model":{"display_name":"Opus"},"version":"2.0.0","workspace":{"current_dir":"C:\\tmp"},"session_id":"x"} | "%ProgramFiles%\nodejs\node.exe" "%USERPROFILE%\.claude\hud\statusline.mjs"
  ```

Pass: produces text output containing ANSI escape codes (e.g. `\u001b[`).
Fail diagnostics:
- **Windows, blank statusline + `statusLine.command` contains `%ProgramFiles%`** → The env-var form never expands when Claude Code spawns the command without a shell, so `node.exe` is not found. Re-run setup (Step 6); it writes the absolute node path. NOTE: testing the command by hand in cmd.exe *does* expand `%ProgramFiles%`, which masks the bug — diagnose from the literal `settings.json` value, not from a shell test.
- **Windows, node path missing / stale** → Re-run setup (Step 6). It rewrites the direct `node statusline.mjs` command with the current node reference.
- **Windows, settings still points at `statusline.cmd`** → Re-run setup (Step 6). The legacy wrapper is removed from the statusline hot path to avoid orphaned `cmd.exe` processes.
- **Unix, "permission denied"** → Step 3 fix.
- **`~/.claude/hud/statusline.mjs` is a symlink (check with `ls -l` / `readlink`), esp. dangling** → A pre-symlink-era install left the dest as a symlink into a marketplace that was later renamed/removed, so it now points at nothing. `existsSync` reports false for a dangling link, so the statusline silently fails to launch. Re-run setup (Step 6) — 1.3.17+ unlinks any symlink dest and writes a real file. On older setup builds, `rm ~/.claude/hud/statusline.mjs` first, then re-run.
- **No output, exit 0** → Possibly a runtime crash silenced by Claude Code; run with stdin sample above to see the real error.

### 6. Reinstall (when files are missing or wrapper is stale)

Run `/yuumi:setup` (or invoke the script directly — picks the highest cached version, never an older stale one):

```bash
node -e "var p=require('path'),fs=require('fs'),h=require('os').homedir(),c=p.join(h,'.claude/plugins/cache'),r=[];function w(d){try{for(var e of fs.readdirSync(d,{withFileTypes:true})){var f=p.join(d,e.name);if(e.isDirectory())w(f);else if(e.name=='plugin-setup.mjs'&&f.includes('yuumi')){var v=p.basename(p.dirname(p.dirname(f)));if(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(v))r.push([v,f])}}}catch(_){}}w(c);if(!r.length){console.error('plugin-setup.mjs not found in cache');process.exit(1)}r.sort(function(a,b){var x=a[0].split('.').map(Number),y=b[0].split('.').map(Number);for(var i=0;i<3;i++)if(x[i]!==y[i])return y[i]-x[i];return 0});require('child_process').execFileSync(process.execPath,[r[0][1]],{stdio:'inherit'})"
```

The setup is idempotent — it backs up existing files, refreshes `statusline.mjs`, and rewrites the `statusLine` block in settings.json. On Windows it writes a direct `node statusline.mjs` command rather than a `.cmd` wrapper, because the wrapper can leave orphaned `cmd.exe` processes after hard-killed Claude Code sessions.

## Output format

```
yuumi doctor (windows)
  [pass] node available (v24.15.0)
  [pass] statusline.mjs exists
  [pass] settings.json uses direct node + statusline.mjs
  [FAIL] legacy statusline.cmd still configured → re-ran setup
  [pass] statusline runs successfully

All checks passed. Restart Claude Code to apply changes.
```

Use `[pass]` and `[FAIL]` prefixes. Print the detected platform on the header line. If any fix was applied, remind the user to restart Claude Code.
