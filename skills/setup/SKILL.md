---
name: yuumi:setup
description: Initial setup for Tokyo Night statusline (run once after install; updates auto-sync via SessionStart hook)
version: 1.3.26
---

# Yuumi Setup

Run the setup script to configure the Tokyo Night powerline statusline. **This is a one-time step after first install** — subsequent plugin updates auto-sync via a SessionStart hook, no need to re-run.

For diagnosing existing installations, use `/yuumi:doctor` instead.

## Steps

1. Find the **latest** cached `plugin-setup.mjs` (SemVer descending) and run it. Picking the highest version is critical: stale older versions in the cache (e.g. 1.2.0) lack the Windows symlink-fallback and will crash on Windows.

```bash
node -e "var p=require('path'),fs=require('fs'),h=require('os').homedir(),c=p.join(h,'.claude/plugins/cache'),r=[];function w(d){try{for(var e of fs.readdirSync(d,{withFileTypes:true})){var f=p.join(d,e.name);if(e.isDirectory())w(f);else if(e.name=='plugin-setup.mjs'&&f.includes('yuumi')){var v=p.basename(p.dirname(p.dirname(f)));if(/^[0-9]+\.[0-9]+\.[0-9]+$/.test(v))r.push([v,f])}}}catch(_){}}w(c);if(!r.length){console.error('plugin-setup.mjs not found in cache');process.exit(1)}r.sort(function(a,b){var x=a[0].split('.').map(Number),y=b[0].split('.').map(Number);for(var i=0;i<3;i++)if(x[i]!==y[i])return y[i]-x[i];return 0});require('child_process').execFileSync(process.execPath,[r[0][1]],{stdio:'inherit'})"
```

2. Tell the user to restart Claude Code once. Future updates apply automatically on the next session start.

## What it does (one-time)

- Writes `~/.claude/hud/statusline.mjs` from the latest plugin source
- Configures `settings.json` `statusLine.command` to point at the stable `~/.claude/hud/` path; on Windows this is a direct `node statusline.mjs` command, not a `.cmd` wrapper
- Registers a `SessionStart` hook in `settings.json` that re-runs this script in `--quiet` mode every session, keeping HUD files in sync with the installed plugin version automatically — no manual setup needed after `/plugin update`
- Backs up any pre-existing files to `~/.claude/hud/backup/`

## After setup

The statusline shows:
- Line 1: IME indicator (가/A) | Version | Model(Context) | Directory | Branch (powerline segments)
- Line 2: 5h/7d rate limits with progress bars | Session duration | Context bar

Skills available: `/interview`, `/edit`, `/explain`, `/doctor`
