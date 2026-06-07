---
name: yuumi:statusline-setup
description: Install the Tokyo Night statusline in Claude Code (one-time; Claude Code only — sets settings.json statusLine to point at the statusline shipped with this skill)
version: 1.5.1
---

# Yuumi Statusline Setup

Install the Tokyo Night powerline statusline for **Claude Code**. This is a **one-time** step after installing yuumi with `npx skills add -g heeseon87/yuumi`.

> **Claude Code only.** Other agents (Codex, Cursor, …) have no statusline concept — this skill is a no-op there. For diagnosing an existing install, use `/yuumi-statusline-doctor`.

## What it does (one-time)

The statusline (`statusline.mjs`) ships **inside this skill's `assets/`**, so `npx skills` already placed it at a stable path. Setup just wires Claude Code to it:

- Restores the executable bit on `statusline.mjs` (the skills-CLI copy drops it) so its `#!/usr/bin/env node` shebang keeps node resolution dynamic — fnm / nvm friendly.
- Points `settings.json` `statusLine.command` **directly** at the installed `assets/statusline.mjs` (on Windows: an absolute `node.exe` + the path, since there is no shebang).
- Backs up the prior `settings.json` to `~/.claude/hud/backup/`.
- Removes any leftover yuumi `SessionStart` auto-sync hook from the old marketplace-era install.

There is **no `SessionStart` hook and no `~/.claude/hud/` copy** — the skill-dir path is stable, so `npx skills update` refreshes the statusline in place with nothing to re-sync.

## Steps

1. **Locate and run the setup script** shipped in this skill's `assets/`. It must be the **global** install (`~/.claude/skills/…`) because the statusline is a user-level setting; the script refuses a project-local install and tells the user to re-run `npx skills add -g heeseon87/yuumi`.

```bash
node -e "var fs=require('fs'),p=require('path'),os=require('os');var roots=[p.join(process.env.CLAUDE_CONFIG_DIR||p.join(os.homedir(),'.claude'),'skills'),p.join(process.cwd(),'.claude','skills')];for(var r of roots){try{for(var d of fs.readdirSync(r)){var a=p.join(r,d,'assets');if(fs.existsSync(p.join(a,'setup.mjs'))&&fs.existsSync(p.join(a,'statusline.mjs'))){require('child_process').execFileSync(process.execPath,[p.join(a,'setup.mjs')],{stdio:'inherit'});process.exit(0)}}}catch(e){}}console.error('yuumi statusline-setup assets not found. Install globally first: npx skills add -g heeseon87/yuumi');process.exit(1)"
```

2. Tell the user to **restart Claude Code once**. The statusline appears at the bottom of the screen.

## Updates

No re-run needed. `npx skills update` refreshes `statusline.mjs` at its stable skill-dir path; the next statusline refresh picks it up. If something looks off, run `/yuumi-statusline-doctor`.

## After setup

The statusline shows:
- **Line 1** — IME indicator (가/A) · version · model (context) · directory · git branch (powerline segments)
- **Line 2** — 5h / 7d rate-limit bars · session duration · context bar

Requires a **Nerd Font** terminal and **truecolor (24-bit)** support.
