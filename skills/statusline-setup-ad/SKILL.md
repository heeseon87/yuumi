---
name: yuumi:statusline-setup-ad
description: Use when the Kickbacks/vibe-ads ad extension owns the Claude Code statusline and the user wants the Yuumi Tokyo Night statusline back WITHOUT removing the ad — installs a combined HUD+ad statusline and locks it against the extension's rewrites (Claude Code only; macOS/Linux)
version: 1.6.1
---

# Yuumi Statusline Setup (ad-coexistence)

Restore the Yuumi Tokyo Night statusline **while keeping the Kickbacks/vibe-ads ad** that an ad extension renders in the statusline slot.

> **Claude Code only.** Use `/yuumi-statusline-setup` for the normal (ad-free) install, `/yuumi-statusline-doctor` to diagnose. If the ad extension is not installed, this skill refuses and points to the normal setup.

## Why a separate skill

The ad extension forces `settings.json → statusLine` to its own script path (`~/.vibe-ads/vibe-ads-statusline.mjs`) and rewrites that file on every ad poll — there is no path override, so the normal setup gets reverted within minutes. The only stable arrangement is to **replace that file with a combined renderer and lock it immutable** (`chflags uchg` / `chattr +i`). The extension tolerates the blocked write (its ad cache keeps refreshing independently), and the combined script reads the ad cache directly, so the ad line stays live.

Known trade-off (cosmetic): the extension's CLI `spinnerVerbs` ad text freezes at its last value, because that settings write sits behind the blocked file write in the extension's apply cycle. The webview spinner ad and the statusline ad line keep rotating.

## Steps

1. **Locate and run the setup script** shipped in this skill's `assets/`. Requires the **global** install (`~/.claude/skills/…`) of both this skill and `statusline-setup` (the combined script invokes the Yuumi statusline from there at render time).

```bash
node -e "var fs=require('fs'),p=require('path'),os=require('os');var roots=[p.join(process.env.CLAUDE_CONFIG_DIR||p.join(os.homedir(),'.claude'),'skills'),p.join(process.cwd(),'.claude','skills')];for(var r of roots){try{for(var d of fs.readdirSync(r)){var a=p.join(r,d,'assets');if(fs.existsSync(p.join(a,'setup-ad.mjs'))&&fs.existsSync(p.join(a,'statusline-ad.mjs'))){require('child_process').execFileSync(process.execPath,[p.join(a,'setup-ad.mjs')].concat(process.argv.slice(1)),{stdio:'inherit'});process.exit(0)}}}catch(e){}}console.error('yuumi statusline-setup-ad assets not found. Install globally first: npx skills add -g heeseon87/yuumi');process.exit(1)" -- 
```

   Pass `--restore` (after the `--`) to unlock the file and hand the slot back to the ad extension.

2. Tell the user to **restart Claude Code once**.

## After setup

- **Line 1–2** — the Yuumi HUD (powerline segments; rate-limit/context bars). See `/yuumi-statusline-setup` for details.
- **Line 3** — `ad· <text>`, an OSC 8 hyperlink to the advertiser, refreshed live from the extension's ad cache (hidden when the cache is stale).

## Updating / undoing

- `npx skills update` refreshes the Yuumi statusline in place; the locked wrapper resolves it at render time, so no re-run is needed.
- **Hand the slot back to the extension** (ad-only statusline): run with `--restore`.
- **Drop the ad entirely**: run with `--restore`, remove the ad extension, then run `/yuumi-statusline-setup`.
