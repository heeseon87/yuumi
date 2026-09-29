---
name: yuumi:statusline-setup
description: Install the Tokyo Night statusline in Claude Code (one-time; Claude Code only — sets settings.json statusLine to point at the statusline shipped with this skill)
version: 1.6.14
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
- **Line 1** — IME indicator (가/A) · version · model (context) · effort level · directory · git branch (powerline segments)
- **Line 2** — 5h / 7d rate-limit bars · per-model weekly limit (see below) · session duration · context bar

Requires a **Nerd Font** terminal and **truecolor (24-bit)** support.

## Per-model weekly limit segment

Some subscription plans have model-scoped weekly limits (e.g. a separate Fable bucket) that Claude Code's `/usage` screen shows but the statusline stdin does not carry. The statusline fetches these itself:

- **Data source**: `https://api.anthropic.com/api/oauth/usage` — the same endpoint the `/usage` command uses. This is an **undocumented endpoint**; if its schema changes, the segment silently disappears (the rest of the statusline is unaffected).
- **Credential access**: the fetch authenticates with your own Claude Code OAuth token, read from the macOS Keychain (`Claude Code-credentials`) or, on Windows/Linux (and as a macOS fallback), from `~/.claude/.credentials.json`. Because the Keychain can hold several entries under that one service name, some of them empty or expired, the lookup reads a few candidates and keeps the one that still works. The token is sent **only** to `api.anthropic.com` and is never written anywhere.
- **macOS note**: the first fetch may show a Keychain permission dialog for `node`. Choose "Always Allow" once.
- **Rate limiting**: results are cached in `~/.claude/.statusline-usage-api.json` for 1 minute, with fetch attempts throttled to one per minute across all sessions. The endpoint rate-limits aggressively, so do not lower these intervals.
- Plans without model-scoped limits (or API-key logins) simply never show the segment.
