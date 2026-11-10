---
name: crayon-theme-setup
description: Install the crayon paper terminal theme (after Duet's crayon look) for Ghostty / cmux, Claude Code, the zsh agnoster prompt and herdr, or take it back out
version: 2.0.8
# Setup edits terminal and shell config files: only the user starts it.
disable-model-invocation: true
---

# Yuumi Crayon Theme Setup

Puts the terminal on warm crayon paper: a paper-colored palette with crayon ink text, a paper-grain shader over the whole screen, and matching colors in Claude Code, the zsh prompt and herdr. It pairs with the yuumi statusline (`/yuumi:statusline-setup`), whose block colors it shares.

## Pieces

`assets/setup.mjs` installs each piece that applies to the machine and reports the rest as skipped, with the reason.

| Piece | What it installs | Installed when |
|---|---|---|
| `ghostty` | `Crayon Pastel 66` theme in `~/.config/ghostty/themes/`, the `crayon_paper.glsl` shader beside the Ghostty config, and a marked block in that config (`theme`, `window-colorspace = display-p3`, and the shader as the last `custom-shader`) | Ghostty or cmux is present |
| `claude` | `crayon-pastel-66.json` in `~/.claude/themes/` | always |
| `zsh` | a marked block at the end of `~/.zshrc` with the `AGNOSTER_*` chip colors | the prompt theme is agnoster and `~/.zshrc` sets no `AGNOSTER_DIR_BG` of its own |
| `herdr` | a marked `[theme.custom]` block at the end of `~/.config/herdr/config.toml` | the file exists and has no `[theme.custom]` of its own |

Every changed file is backed up to `~/.claude/crayon-theme/backup/` first. Re-running is safe: an unchanged piece reports `up to date`.

## Steps

Run the script from this skill's base directory.

1. Preview, and show the user the list it prints:

   ```bash
   node "<this skill's base directory>/assets/setup.mjs" --check
   ```

2. Install. When the user wants only some pieces, add `--only=ghostty,claude` (any of `ghostty`, `claude`, `zsh`, `herdr`):

   ```bash
   node "<this skill's base directory>/assets/setup.mjs"
   ```

3. Relay the script's **Next steps** to the user word for word. The script never reloads apps itself: cmux needs `cmux themes set "Crayon Pastel 66"`, Claude Code needs the theme picked in `/theme` (a per-session choice), open shells need `exec zsh`, herdr needs `herdr server reload-config`.

The step is done when the user has the printed next steps and knows which pieces were skipped and why.

## Removing

`--remove` deletes the copied files that still match the shipped ones (an edited copy is kept and reported) and strips the marked blocks, which leaves each config file byte for byte as it was before install. The one exception: unmarked crayon shader lines from an older hand install are folded into the block on install, so `--remove` takes them out too. Add `--check` to preview. Relay the next steps it prints, then tell the user to pick their previous theme in cmux and in Claude Code's `/theme`.

## Requirements and tuning

- **Ghostty 1.3.1+ or cmux.** The shader reads `iBackgroundColor`; 1.3.1 is the Ghostty version checked. The look was tuned and verified on cmux.
- **Retina screens.** The shader's `PX = 2.0` assumes a 2x display; on a 1x display set `PX` to `1.0` in the installed `crayon_paper.glsl`, or the grain comes out twice as coarse.
- **Wax streaks** ship off. Set `WAX_MAX_LIFT` to `0.37` in the installed shader for white crayon streaks on flat color fills.
- **herdr** colors are made for a light base theme such as `one-light`.
- The agnoster chips need a Nerd Font for their arrow glyphs, as the statusline does.
