---
name: statusline-setup
description: Install the Tokyo Night statusline in Claude Code (one-time) — copies the statusline shipped with the yuumi plugin to ~/.claude/hud/statusline.mjs and points settings.json statusLine at it
version: 2.0.1
# Setup edits settings.json: only the user starts it.
disable-model-invocation: true
---

# Yuumi Statusline Setup

Install the Tokyo Night powerline statusline for **Claude Code**. This is a **one-time** step after installing the yuumi plugin.

For diagnosing an existing install, use `/yuumi:statusline-doctor`.

## What it does (one-time)

The plugin lives in a versioned cache folder that changes on every `/plugin update`, so the statusline is copied to a **fixed path** that settings.json can point at:

- Copies `assets/statusline.mjs` to `~/.claude/hud/statusline.mjs` (a different file already there is backed up to `~/.claude/hud/backup/`).
- Sets the executable bit so its `#!/usr/bin/env node` shebang keeps node resolution dynamic — fnm / nvm friendly.
- Points `settings.json` `statusLine.command` at `~/.claude/hud/statusline.mjs` (on Windows: an absolute `node.exe` + the path, since there is no shebang). The prior `settings.json` is backed up to `~/.claude/hud/backup/`.
- Removes leftover yuumi `SessionStart` hooks from `settings.json` (older installs); the plugin ships its own sync hook now.

## Steps

1. **Run the setup script** in this skill's `assets/` folder — use the base directory this skill was loaded from:

```bash
node "<this skill's base directory>/assets/setup.mjs"
```

2. Tell the user to **restart Claude Code once**. The statusline appears at the bottom of the screen.

## Updates

No re-run needed. After `/plugin update`, the plugin's `SessionStart` hook (`assets/sync.mjs`) copies the new `statusline.mjs` over `~/.claude/hud/statusline.mjs` at the next session start — only when that file is yuumi's own, so a statusline another tool wrote there is never overwritten. If something looks off, run `/yuumi:statusline-doctor`.

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
