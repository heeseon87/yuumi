#!/usr/bin/env node
/**
 * Yuumi statusline installer — single-channel (`npx skills`) design.
 *
 * This script ships INSIDE the statusline-setup skill (assets/), so
 * `npx skills add -g heeseon87/yuumi` carries it to
 * ~/.claude/skills/yuumi-statusline-setup/assets/setup.mjs alongside
 * statusline.mjs. It:
 *
 *   1. Resolves its own install location (import.meta.url).
 *   2. Refuses a project-scoped install — statusLine is a user-level setting and
 *      must point at a home-stable path.
 *   3. Restores the exec bit the skills-CLI copy drops, so statusline.mjs keeps
 *      running via its `#!/usr/bin/env node` shebang (fnm / nvm friendly).
 *   4. Points settings.json `statusLine` DIRECTLY at the sibling statusline.mjs.
 *
 * No ~/.claude/hud copy and no SessionStart hook: the skills-CLI install path is
 * already stable, so `npx skills update` refreshes statusline.mjs in place and
 * the running statusline picks it up — nothing to re-sync. The script also
 * removes any leftover yuumi SessionStart hook from the old marketplace era,
 * which would otherwise point at a plugin-setup.mjs that no longer exists.
 */

import {
  existsSync, readdirSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname, basename } from 'node:path';

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');
const BACKUP_DIR = join(CLAUDE_DIR, 'hud', 'backup');
const GLOBAL_SKILLS = join(CLAUDE_DIR, 'skills');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const REINSTALL = 'npx skills add -g heeseon87/yuumi';

// Locate this skill's statusline.mjs in the GLOBAL skills dir. We search the
// global dir directly — not this script's own import.meta.url — for two reasons:
//   1. statusLine is a user-level setting, so it must resolve to a home-stable
//      path. Finding the asset under ~/.claude/skills/… *is* the global-install
//      requirement; a project-only install simply isn't found here.
//   2. The skills CLI installs as a symlink by default, and Node resolves a
//      module's own path through that symlink to the CLI's cache dir. Using the
//      logical ~/.claude/skills/… path (never realpath'd) keeps settings.json
//      pointed at a location that survives `npx skills update`.
function findGlobalStatusline() {
  let entries;
  try {
    entries = readdirSync(GLOBAL_SKILLS, { withFileTypes: true });
  } catch {
    return null;
  }
  const dirs = entries.filter((e) => e.isDirectory() || e.isSymbolicLink());
  // Prefer the canonical statusline-setup dir; fall back to any skill shipping
  // the asset + setup pair (covers a renamed install dir).
  const ranked = [
    ...dirs.filter((e) => /statusline-setup/.test(e.name)),
    ...dirs.filter((e) => !/statusline-setup/.test(e.name)),
  ];
  for (const e of ranked) {
    const asset = join(GLOBAL_SKILLS, e.name, 'assets', 'statusline.mjs');
    const setup = join(GLOBAL_SKILLS, e.name, 'assets', 'setup.mjs');
    if (existsSync(asset) && existsSync(setup)) return asset;
  }
  return null;
}

const statuslinePath = findGlobalStatusline();
if (!statuslinePath) {
  console.error('[yuumi] No global yuumi statusline install found under:');
  console.error(`[yuumi]   ${GLOBAL_SKILLS}`);
  console.error('[yuumi] The statusline is a user-level setting, so install globally:');
  console.error(`[yuumi]   ${REINSTALL}`);
  console.error('[yuumi] then run this skill again.');
  process.exit(1);
}

// 2. The skills-CLI copy drops +x; restore it so the shebang keeps node
//    resolution dynamic (a pinned absolute node path would break under fnm/nvm).
try { chmodSync(statuslinePath, 0o755); } catch { /* Windows: no exec bit */ }

// 3. statusLine command. mac/Linux runs the file directly via its shebang;
//    Windows has no shebang, so it needs a fully-resolved node.exe (Claude Code
//    spawns this without a shell, so %VAR% tokens never expand — resolve here).
function resolveWindowsNodeRef() {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const standardNode = join(programFiles, 'nodejs', 'node.exe');
  return `"${existsSync(standardNode) ? standardNode : process.execPath}"`;
}
let statusLineCommand = `"${statuslinePath}"`;
if (platform() === 'win32') {
  statusLineCommand = `${resolveWindowsNodeRef()} "${statuslinePath}"`;
}

// 4. Write settings.json — set statusLine, preserve everything else, and drop any
//    legacy marketplace-era yuumi SessionStart hook.
function backup(file) {
  if (!existsSync(file)) return;
  mkdirSync(BACKUP_DIR, { recursive: true });
  copyFileSync(file, join(BACKUP_DIR, `${basename(file)}.${timestamp}.bak`));
}

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

// Migration: remove the old auto-sync SessionStart hook (it re-ran a
// plugin-setup.mjs that the single-channel layout no longer ships). Leave every
// other tool's SessionStart hooks untouched.
if (Array.isArray(settings.hooks?.SessionStart)) {
  settings.hooks.SessionStart = settings.hooks.SessionStart.filter(
    (e) => !e?.hooks?.some(
      (h) => typeof h?.command === 'string' && /yuumi|claude-kit/.test(h.command),
    ),
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
  console.log('[yuumi] Already configured — no changes.');
}

console.log('');
console.log('  Statusline: Tokyo Night powerline theme');
console.log(`  Source:     ${statuslinePath}`);
console.log(`  Update:     npx skills update   (refreshes statusline.mjs in place)`);
console.log('');
console.log('  Restart Claude Code once to apply.');
