---
name: setup
description: Configure Tokyo Night statusline after plugin install
---

# Claude Kit Setup

Run the setup script to configure the Tokyo Night powerline statusline.

## Steps

1. Find the plugin cache directory and run the setup script:

```bash
node "$(find ~/.claude/plugins/cache -path '*/claude-kit/*/scripts/plugin-setup.mjs' -print -quit 2>/dev/null)"
```

2. If the above fails, try the direct path:

```bash
node ~/.claude/plugins/cache/hs/claude-kit/1.0.0/scripts/plugin-setup.mjs
```

3. After setup completes, tell the user to restart Claude Code to see the new statusline.

## What it does

- Backs up existing HUD files to `~/.claude/hud/backup/`
- Copies `statusline.mjs` to `~/.claude/hud/`
- Configures `settings.json` with the statusline command
- Uses the absolute Node.js binary path for nvm/fnm compatibility

## After setup

The statusline shows:
- Line 1: Version | Model(Context) | Directory | Branch (powerline segments)
- Line 2: 5h/7d rate limits with progress bars | Session duration | Context bar

Skills available: `/interview`, `/edit`, `/explain`
