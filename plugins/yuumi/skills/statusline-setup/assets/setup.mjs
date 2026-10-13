#!/usr/bin/env node
/**
 * Yuumi statusline installer — Claude Code plugin design (2.0).
 *
 * The plugin lives in a versioned cache folder (~/.claude/plugins/cache/…/<version>/)
 * that changes on every `/plugin update`, so settings.json must not point into it.
 * This script:
 *
 *   1. Copies the statusline.mjs shipped beside it to the fixed path
 *      ~/.claude/hud/statusline.mjs (backing up a different file already there).
 *   2. Sets the exec bit so the `#!/usr/bin/env node` shebang keeps node resolution
 *      dynamic (fnm / nvm friendly).
 *   3. Points settings.json `statusLine` at that fixed path.
 *   4. Removes leftover yuumi entries from the npx-skills era: a statusLine into
 *      ~/.claude/skills/… is replaced, and old yuumi SessionStart hooks in
 *      settings.json are dropped (the plugin's own hook does the syncing now).
 *
 * After this one-time run, the plugin's SessionStart hook (sync.mjs) refreshes the
 * fixed copy whenever the plugin version brings a different statusline.mjs.
 */

import {
  existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync, renameSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
const HUD_DIR = join(CLAUDE_DIR, 'hud');
const BACKUP_DIR = join(HUD_DIR, 'backup');
const TARGET = join(HUD_DIR, 'statusline.mjs');
const SOURCE = join(dirname(fileURLToPath(import.meta.url)), 'statusline.mjs');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function backup(file) {
  if (!existsSync(file)) return;
  mkdirSync(BACKUP_DIR, { recursive: true });
  copyFileSync(file, join(BACKUP_DIR, `${basename(file)}.${timestamp}.bak`));
}

if (!existsSync(SOURCE)) {
  console.error(`[yuumi] statusline.mjs is missing beside this script: ${SOURCE}`);
  console.error('[yuumi] Reinstall the plugin: /plugin install yuumi@yuumi');
  process.exit(1);
}

// 1–2. Copy to the fixed path. A different file already there is kept in backup/.
const next = readFileSync(SOURCE);
const current = existsSync(TARGET) ? readFileSync(TARGET) : null;
if (current === null || !current.equals(next)) {
  if (current !== null) backup(TARGET);
  mkdirSync(HUD_DIR, { recursive: true });
  const partial = `${TARGET}.partial`;
  writeFileSync(partial, next);
  renameSync(partial, TARGET);
}
try { chmodSync(TARGET, 0o755); } catch { /* Windows: no exec bit */ }

// 3. statusLine command. mac/Linux runs the file directly via its shebang;
//    Windows has no shebang, so it needs a fully-resolved node.exe (Claude Code
//    spawns this without a shell, so %VAR% tokens never expand — resolve here).
function resolveWindowsNodeRef() {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const standardNode = join(programFiles, 'nodejs', 'node.exe');
  return `"${existsSync(standardNode) ? standardNode : process.execPath}"`;
}
const statusLineCommand = platform() === 'win32' ? `${resolveWindowsNodeRef()} "${TARGET}"` : `"${TARGET}"`;

// 4. settings.json — set statusLine, preserve everything else, drop old yuumi hooks.
let settings = {};
if (existsSync(SETTINGS_FILE)) {
  try {
    settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
  } catch (e) {
    console.error(`[yuumi] ${SETTINGS_FILE} is not valid JSON — fix it first:`, e.message);
    process.exit(1);
  }
}
const before = JSON.stringify(settings);
settings.statusLine = { type: 'command', command: statusLineCommand, refreshInterval: 1 };
if (Array.isArray(settings.hooks?.SessionStart)) {
  settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
    (e) => !e?.hooks?.some((h) => typeof h?.command === 'string' && /yuumi|claude-kit/.test(h.command)),
  );
  if (settings.hooks.SessionStart.length === 0) delete settings.hooks.SessionStart;
  if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
}
if (JSON.stringify(settings) !== before) {
  backup(SETTINGS_FILE);
  mkdirSync(dirname(SETTINGS_FILE), { recursive: true });
  writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`);
  console.log('[yuumi] Configured statusLine in settings.json.');
} else {
  console.log('[yuumi] settings.json already points at the statusline — no changes.');
}

console.log('');
console.log('  Statusline: Tokyo Night powerline theme');
console.log(`  Installed:  ${TARGET}`);
console.log('  Updates:    /plugin update yuumi@yuumi — the next session start refreshes the copy');
console.log('');
console.log('  Restart Claude Code once to apply.');
