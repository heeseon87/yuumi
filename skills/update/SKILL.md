---
name: yuumi:update
description: Use when the user wants to update, upgrade, or refresh the installed yuumi skills to their latest published versions — pulls only the yuumi pack, leaving every other skill source untouched
version: 1.5.6
---

# Yuumi Update

Update **only the yuumi skills** to their latest published versions, without touching any other installed skill source.

## Why this exists

The plain `npx skills update` refreshes *every* skill from *every* source you have installed (Vercel's packs, agent-browser, whatever else). When you only want the yuumi pack current, that's a blunt instrument. This skill scopes the update to yuumi alone.

## How it works

`npx skills update` accepts an explicit list of skill names. So the move is: ask the CLI which yuumi skills are installed, then hand exactly those names back to `update`.

```bash
npx skills list -g --json \
  | grep -oE '"yuumi:[^"]*"' \
  | tr -d '"' \
  | sort -u
```

That prints the installed yuumi skill names (`yuumi:edit`, `yuumi:pretty`, …). The `yuumi:` colon form only appears in the JSON `name` values — install paths use the hyphen form (`yuumi-edit`), so this match never catches a path by accident.

Then feed them to `update`:

```bash
names=$(npx skills list -g --json | grep -oE '"yuumi:[^"]*"' | tr -d '"' | sort -u)
[ -z "$names" ] && { echo "No yuumi skills installed — run: npx skills add -g heeseon87/yuumi"; exit 0; }
echo "$names" | xargs npx skills update -g -y
```

**The empty-name guard is not optional.** If extraction returns nothing and you pipe an empty list into `update`, the CLI falls back to updating *everything* — the exact blunt behavior this skill avoids. Always confirm `names` is non-empty before calling `update`.

## Steps

1. Run the extraction and **show the user the list** of yuumi skills that will be updated.
2. If the list is empty, stop and point them at `npx skills add -g heeseon87/yuumi` — nothing is installed to update.
3. Run the scoped `update`. It reports each skill as updated or already current.
4. **Claude Code only:** the statusline refreshes in place — `settings.json` points at the stable `~/.claude/skills/yuumi-statusline-setup/assets/statusline.mjs` path, and the CLI's symlink install preserves the executable bit, so a normal update needs no follow-up. Only if the HUD looks broken afterward, nudge the user to run `/yuumi-statusline-setup` (or `/yuumi-statusline-doctor` to diagnose). Skip this note entirely on other agents.

## Scope notes

- **Global install assumed.** yuumi installs with `-g` (`npx skills add -g heeseon87/yuumi`), so this skill uses `-g` throughout. If the user installed project-locally, swap `-g` for `-p`.
- **Portable.** `npx skills update` is the same across Claude Code, Codex, Cursor, Hermes, and every other agent the CLI supports — this skill is not Claude Code-specific (only the optional statusline note is).
- **Self-updating.** Once published, this skill updates itself in the same pass. Harmless — the running prompt is already loaded.
