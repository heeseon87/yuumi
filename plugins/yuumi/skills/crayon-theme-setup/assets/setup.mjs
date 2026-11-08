#!/usr/bin/env node
/**
 * Yuumi crayon theme installer: Duet's crayon paper look for the terminal stack.
 *
 *   node setup.mjs            install every piece that applies to this machine
 *   node setup.mjs --remove   take the pieces back out
 *   --check                   with either mode: print what it would do, write nothing
 *   --only=ghostty,claude     limit any mode to some pieces (ghostty, claude, zsh, herdr)
 *
 * Two kinds of action, both idempotent (a second run changes nothing):
 *   copy   a shipped file to a fixed path. Remove deletes it only while it still matches the shipped file.
 *   block  lines between `# crayon-theme start (yuumi)` and `# crayon-theme end (yuumi)` at the end of a config
 *          file. Install rewrites the block in place; remove strips it, leaving the file as it was before.
 * Every existing file is backed up to <claude dir>/crayon-theme/backup/ before it is changed.
 * App reloads (cmux, Ghostty, herdr, zsh, Claude Code /theme) are printed as next steps, never run.
 */

import {
  existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, renameSync, unlinkSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(HOME, '.claude');
const XDG = process.env.XDG_CONFIG_HOME || join(HOME, '.config');
const ASSETS = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(CLAUDE_DIR, 'crayon-theme', 'backup');
const START = '# crayon-theme start (yuumi)';
const END = '# crayon-theme end (yuumi)';
const MAC = platform() === 'darwin';
const CMUX_DIR = join(HOME, 'Library', 'Application Support', 'com.cmuxterm.app');

const args = process.argv.slice(2);
const REMOVE = args.includes('--remove');
const CHECK = args.includes('--check');
const ONLY = args.find((a) => a.startsWith('--only='))?.slice(7).split(',');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const asset = (name) => readFileSync(join(ASSETS, name), 'utf8');
const tilde = (p) => (p.startsWith(HOME) ? `~${p.slice(HOME.length)}` : p);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BLOCK = new RegExp(`\\n${escape(START)}\\n[\\s\\S]*?${escape(END)}\\n`);
const outsideBlock = (text) => (text ?? '').replace(BLOCK, '\n');

// Ghostty reads both the macOS app-support config and the XDG one; edit whichever exists, else create the XDG one.
// A relative custom-shader path resolves from the config file's own folder, so the shader goes beside it.
const GHOSTTY_DIRS = [...(MAC ? [join(HOME, 'Library', 'Application Support', 'com.mitchellh.ghostty')] : []), join(XDG, 'ghostty')];
function existingGhosttyConfig() {
  for (const dir of GHOSTTY_DIRS) {
    for (const name of ['config', 'config.ghostty']) if (existsSync(join(dir, name))) return join(dir, name);
  }
  return null;
}
const ghosttyConfig = () => existingGhosttyConfig() ?? join(XDG, 'ghostty', 'config');
// cmux runs on Ghostty's engine and reads Ghostty's config, so either app counts.
function hasGhostty() {
  if (existingGhosttyConfig() || existsSync(CMUX_DIR) || (MAC && existsSync('/Applications/Ghostty.app'))) return true;
  return (process.env.PATH ?? '').split(':').some((dir) => existsSync(join(dir, 'ghostty')));
}

const zshrc = join(HOME, '.zshrc');
const herdrConfig = join(XDG, 'herdr', 'config.toml');

// Each piece: skip() returns why install leaves it out (null when it applies); actions() lists its copies and blocks.
const PIECES = [
  {
    id: 'ghostty',
    skip: () => (hasGhostty() ? null : 'neither Ghostty nor cmux found'),
    actions: () => {
      const config = ghosttyConfig();
      return [
        { kind: 'copy', src: 'ghostty/Crayon Pastel 66', target: join(XDG, 'ghostty', 'themes', 'Crayon Pastel 66') },
        { kind: 'copy', src: 'ghostty/crayon_paper.glsl', target: join(dirname(config), 'shaders', 'crayon_paper.glsl') },
        // Older hand installs wrote these two lines without markers; fold them into the block.
        { kind: 'block', src: 'ghostty/config', target: config, create: true,
          legacy: [/^# Crayon paper \(grain \+ wax\) after Duet.*\n/m, /^custom-shader = shaders\/crayon_paper\.glsl\n/m] },
      ];
    },
    next: {
      install: existsSync(CMUX_DIR)
        ? 'cmux: run `cmux themes set "Crayon Pastel 66"` (cmux picks its theme itself), then `cmux reload-config`.'
        : 'Ghostty: reload the config (Cmd+Shift+, on macOS) or restart Ghostty.',
      remove: existsSync(CMUX_DIR)
        ? 'cmux: run `cmux themes set "<your previous theme>"`, then `cmux reload-config`.'
        : 'Ghostty: reload the config or restart Ghostty.',
    },
  },
  {
    id: 'claude',
    skip: () => null,
    actions: () => [{ kind: 'copy', src: 'claude/crayon-pastel-66.json', target: join(CLAUDE_DIR, 'themes', 'crayon-pastel-66.json') }],
    next: {
      install: 'Claude Code: open `/theme` and pick "Crayon Pastel 66".',
      remove: 'Claude Code: open `/theme` and pick another theme.',
    },
  },
  {
    id: 'zsh',
    skip: () => {
      const text = read(zshrc);
      if (text === null) return 'no ~/.zshrc';
      if (!/^\s*ZSH_THEME=["']?agnoster["']?/m.test(text)) return 'the zsh prompt theme is not agnoster';
      if (/^\s*AGNOSTER_DIR_BG=/m.test(outsideBlock(text))) return '~/.zshrc already sets its own AGNOSTER colors';
      return null;
    },
    actions: () => [{ kind: 'block', src: 'zsh/agnoster.zsh', target: zshrc }],
    next: { install: 'zsh: run `exec zsh` in shells that are already open.', remove: 'zsh: run `exec zsh` in open shells.' },
  },
  {
    id: 'herdr',
    skip: () => {
      const text = read(herdrConfig);
      if (text === null) return `herdr is not configured (no ${tilde(herdrConfig)})`;
      if (/^\s*\[theme\.custom\]/m.test(outsideBlock(text))) return 'herdr config already has its own [theme.custom]';
      return null;
    },
    actions: () => [{ kind: 'block', src: 'herdr/theme-custom.toml', target: herdrConfig }],
    next: { install: 'herdr: run `herdr server reload-config`.', remove: 'herdr: run `herdr server reload-config`.' },
  },
];

function backup(id, file) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  copyFileSync(file, join(BACKUP_DIR, `${id}-${basename(file)}.${timestamp}.bak`));
}

function write(id, file, text) {
  if (existsSync(file)) backup(id, file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(`${file}.partial`, text);
  renameSync(`${file}.partial`, file);
}

// Returns [status, newText|undefined]; newText undefined means leave the file alone.
function plan(action, mode) {
  const current = read(action.target);
  if (action.kind === 'copy') {
    const shipped = asset(action.src);
    if (mode === 'remove') {
      if (current === null) return ['not installed'];
      return current === shipped ? ['removed', null] : ['kept: edited since install'];
    }
    if (current === shipped) return ['up to date'];
    return [current === null ? 'installed' : 'replaced (old copy backed up)', shipped];
  }

  let base = current ?? '';
  if (mode === 'remove') {
    if (!BLOCK.test(base)) return ['no block'];
    base = base.replace(BLOCK, '');
    return ['block removed', base === '' ? null : base];
  }
  if (current === null && !action.create) return ['file missing'];
  for (const re of action.legacy ?? []) base = base.replace(re, '');
  base = base.replace(BLOCK, '');
  // The leading \n ends a last line that had none, or leaves one blank line; remove strips exactly that \n back.
  const next = `${base}\n${START}\n${asset(action.src)}${END}\n`;
  if (next === current) return ['up to date'];
  return [current === null ? 'created' : BLOCK.test(current) ? 'block updated' : 'block added', next];
}

const nextSteps = [];
for (const piece of PIECES) {
  if (ONLY && !ONLY.includes(piece.id)) continue;
  const why = REMOVE ? null : piece.skip();
  if (why) {
    console.log(`${piece.id.padEnd(8)} skipped: ${why}`);
    continue;
  }
  let changed = false;
  for (const action of piece.actions()) {
    const [status, text] = plan(action, REMOVE ? 'remove' : 'install');
    console.log(`${piece.id.padEnd(8)} ${status.padEnd(28)} ${tilde(action.target)}`);
    if (text === undefined) continue;
    changed = true;
    if (CHECK) continue;
    if (text === null) {
      backup(piece.id, action.target);
      unlinkSync(action.target);
    } else {
      write(piece.id, action.target, text);
    }
  }
  if (changed) nextSteps.push(piece.next[REMOVE ? 'remove' : 'install']);
}

if (CHECK) console.log('\n(check only: nothing was written)');
if (!CHECK && nextSteps.length) {
  console.log('\nNext steps:');
  for (const step of nextSteps) console.log(`  - ${step}`);
  console.log(`\nBackups of changed files: ${tilde(BACKUP_DIR)}`);
}
