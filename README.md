# claude-kit

Tokyo Night powerline statusline + essential skills for Claude Code. Works on macOS, Linux, and Windows.

## Prerequisites

[Node.js](https://nodejs.org/) 18 or newer in PATH. On Windows the standard installer (`C:\Program Files\nodejs`) is recommended; nvm-windows / fnm / volta also work.

## Install (one-time)

```
/plugin marketplace add heeseon87/claude-kit
/plugin install claude-kit@hs
/claude-kit:setup
```

Then restart Claude Code once. The statusline appears at the bottom of the screen.

## Update

```
/plugin marketplace update hs
/plugin update claude-kit@hs
```

That's it — **no manual setup re-run is needed**. A `SessionStart` hook installed by the initial setup automatically syncs HUD files with the latest plugin version every time you start a session.

## Platform notes

On Windows, setup also generates `~/.claude/hud/statusline.cmd` — a thin wrapper that invokes node with the `.mjs`, since Windows can't execute `.mjs` directly via PATHEXT/shebang. The wrapper prefers `%ProgramFiles%\nodejs\node.exe` and falls back to the node binary that ran setup. If you switch node installations (e.g., uninstall the system node, then install via fnm), re-run `/claude-kit:setup` once to regenerate the wrapper with the new node path.

## Troubleshooting

```
/claude-kit:doctor
```

Checks node availability, HUD file presence, settings.json configuration, the SessionStart hook, and the wrapper's node path on Windows — auto-fixes anything fixable.

## Nerd Font Setup

Statusline icons require a [Nerd Font](https://github.com/ryanoasis/nerd-fonts/releases). We recommend JetBrainsMono Nerd Font.

### macOS

```bash
brew install --cask font-jetbrains-mono-nerd-font
```

Then set your terminal font to `JetBrainsMono Nerd Font`.

### Windows

```powershell
winget install JanDeDobbeleer.OhMyPosh --source winget
oh-my-posh font install
```

Choose `JetBrainsMono`, then in Windows Terminal: Settings > [Your Profile] > Appearance > Font face > `JetBrainsMono Nerd Font`.

### Linux

```bash
mkdir -p ~/.local/share/fonts
cd ~/.local/share/fonts
curl -fLO https://github.com/ryanoasis/nerd-fonts/releases/latest/download/JetBrainsMono.zip
unzip JetBrainsMono.zip -d JetBrainsMono
fc-cache -fv
```

Then set your terminal font to `JetBrainsMono Nerd Font`.

> If you're using WSL, install the font on Windows and configure it in Windows Terminal instead of inside WSL.
