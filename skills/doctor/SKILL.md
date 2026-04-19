---
name: claude-kit:doctor
description: Diagnose and fix claude-kit statusline issues (broken paths, permissions, outdated settings)
---

# Claude Kit Doctor

Diagnose and automatically fix common statusline issues. **Adapt every check to the user's OS** (macOS/Linux vs Windows) — the expected statusLine entry differs:

- **macOS/Linux**: `~/.claude/hud/statusline.mjs` is invoked directly via shebang.
- **Windows**: `~/.claude/hud/statusline.cmd` is invoked, which then calls `node` with the `.mjs`.

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

The `.mjs` is required on every platform; the `.cmd` is required on Windows only.

- macOS/Linux: `test -f ~/.claude/hud/statusline.mjs && echo OK || echo MISSING`
- Windows: `test -f "$USERPROFILE/.claude/hud/statusline.mjs" && test -f "$USERPROFILE/.claude/hud/statusline.cmd"` (or use `cmd /c "if exist ... echo OK"`)

Fail: Run setup (Step 6).

### 3. Check executable permissions (macOS/Linux only)

- macOS/Linux: `test -x ~/.claude/hud/statusline.mjs`
- Windows: skip — `.cmd` is executable by virtue of its extension being in `PATHEXT`.

Fix on Unix: `chmod 755 ~/.claude/hud/statusline.mjs`

### 4. Check settings.json statusLine command

Read `~/.claude/settings.json` and inspect `statusLine.command`. The expected value is one of:

- macOS/Linux: `"<homedir>/.claude/hud/statusline.mjs"` (with surrounding quotes inside the JSON string)
- Windows: `"<homedir>/.claude/hud/statusline.cmd"` (with surrounding quotes inside the JSON string)

Common problems:

| Problem | Pattern | Fix |
|---------|---------|-----|
| Hardcoded node path | `"/path/to/node" "/path/to/statusline.mjs"` | Run setup |
| Missing statusLine | No `statusLine` key | Run setup |
| Wrong extension on Windows | Path ends with `statusline.mjs` on Windows | Run setup (the new setup writes `.cmd` on Windows) |
| Wrong extension on Unix | Path ends with `.cmd` on macOS/Linux | Run setup |
| Path doesn't exist | File pointed at by command is missing | Run setup |

### 4b. Check SessionStart auto-sync hook (1.3.0+)

claude-kit registers a `SessionStart` hook so HUD files refresh automatically every session — no manual setup re-run needed after `/plugin update`. Verify:

- `settings.hooks.SessionStart` exists (array)
- Exactly one entry's command contains `claude-kit` (the auto-sync walker)

Missing or duplicated → run setup. The setup is idempotent and only adds/replaces the claude-kit entry, leaving any other tools' SessionStart hooks intact.

### 5. Verify the statusline actually runs

Spawn the configured command exactly the way Claude Code does (with stdin) and inspect the output:

- macOS/Linux:
  ```bash
  echo '{"model":{"display_name":"Opus"},"version":"2.0.0","workspace":{"current_dir":"/tmp"},"session_id":"x"}' | ~/.claude/hud/statusline.mjs
  ```
- Windows:
  ```bash
  echo {"model":{"display_name":"Opus"},"version":"2.0.0","workspace":{"current_dir":"C:\\tmp"},"session_id":"x"} | cmd //c "%USERPROFILE%\.claude\hud\statusline.cmd"
  ```

Pass: produces text output containing ANSI escape codes (e.g. `\u001b[`).
Fail diagnostics:
- **Windows, "node not found" / "is not recognized"** → The `.cmd` wrapper points at a stale node path (likely after a node uninstall or version manager change). Re-run setup (Step 6).
- **Unix, "permission denied"** → Step 3 fix.
- **No output, exit 0** → Possibly a runtime crash silenced by Claude Code; run with stdin sample above to see the real error.

### 6. Reinstall (when files are missing or wrapper is stale)

Run `/claude-kit:setup` (or invoke the script directly — picks the highest cached version, never an older stale one):

```bash
node -e "var p=require('path'),fs=require('fs'),h=require('os').homedir(),c=p.join(h,'.claude/plugins/cache'),r=[];function w(d){try{for(var e of fs.readdirSync(d,{withFileTypes:true})){var f=p.join(d,e.name);if(e.isDirectory())w(f);else if(e.name=='plugin-setup.mjs'&&f.includes('claude-kit')){var v=p.basename(p.dirname(p.dirname(f)));if(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(v))r.push([v,f])}}}catch(_){}}w(c);if(!r.length){console.error('plugin-setup.mjs not found in cache');process.exit(1)}r.sort(function(a,b){var x=a[0].split('.').map(Number),y=b[0].split('.').map(Number);for(var i=0;i<3;i++)if(x[i]!==y[i])return y[i]-x[i];return 0});require('child_process').execFileSync(process.execPath,[r[0][1]],{stdio:'inherit'})"
```

The setup is idempotent — it backs up existing files, regenerates `statusline.cmd` (Windows) with the current node path, and rewrites the `statusLine` block in settings.json.

## Output format

```
claude-kit doctor (windows)
  [pass] node available (v24.15.0)
  [pass] statusline.mjs exists
  [pass] statusline.cmd exists
  [pass] settings.json points at statusline.cmd
  [FAIL] cmd wrapper references missing node path → re-ran setup
  [pass] statusline runs successfully

All checks passed. Restart Claude Code to apply changes.
```

Use `[pass]` and `[FAIL]` prefixes. Print the detected platform on the header line. If any fix was applied, remind the user to restart Claude Code.
