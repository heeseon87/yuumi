#!/usr/bin/env node
/**
 * Claude Kit - Setup & Sync
 *
 * Two modes:
 *   default   (/claude-kit:setup) — verbose, backs up, prints summary
 *   --quiet   (SessionStart hook) — silent unless changes, no backups
 *
 * What it does:
 *   1. Sync ~/.claude/hud/statusline.mjs from the latest plugin source (marketplaces > cache)
 *   2. Generate ~/.claude/hud/statusline.cmd on Windows (with detected node path)
 *   3. Write settings.json statusLine + SessionStart hook (preserving other hooks)
 *
 * Architecture: settings.json points at stable ~/.claude/hud/ paths (not at
 * volatile marketplaces dir, which Claude Code can wipe on git-pull failure).
 * The SessionStart hook re-runs this script in --quiet mode every session,
 * so users never need to manually re-run setup after a plugin update.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = join(__dirname, '..');

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const HUD_DIR = join(CLAUDE_DIR, 'hud');
const BACKUP_DIR = join(HUD_DIR, 'backup');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');

const QUIET = process.argv.includes('--quiet');
const log = QUIET ? () => {} : (...a) => console.log(...a);

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// Prefer marketplaces dir (auto-updated on /plugin marketplace update),
// fall back to the cache dir we were invoked from (Windows backslashes normalized).
function getSourceRoot() {
  const normalized = PLUGIN_ROOT.replace(/\\/g, '/');
  if (normalized.includes('/marketplaces/')) return PLUGIN_ROOT;
  const m = normalized.match(/\/plugins\/cache\/([^/]+)\//);
  if (m) {
    const mp = join(CLAUDE_DIR, 'plugins', 'marketplaces', m[1]);
    if (existsSync(join(mp, 'hud'))) return mp;
  }
  return PLUGIN_ROOT;
}

// Standard installer location stays valid across node minor upgrades; for
// nvm-windows/fnm/volta fall back to the absolute path of the running node.
function resolveWindowsNodeRef() {
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  if (existsSync(join(programFiles, 'nodejs', 'node.exe'))) {
    return '"%ProgramFiles%\\nodejs\\node.exe"';
  }
  return `"${process.execPath}"`;
}

function backup(filePath) {
  if (QUIET) return;
  if (!existsSync(filePath)) return;
  mkdirSync(BACKUP_DIR, { recursive: true });
  const name = basename(filePath);
  const backupPath = join(BACKUP_DIR, `${name}.${timestamp}.bak`);
  copyFileSync(filePath, backupPath);
  log(`[claude-kit] Backed up ${name} → backup/${name}.${timestamp}.bak`);
}

function filesEqual(a, b) {
  if (!existsSync(a) || !existsSync(b)) return false;
  return readFileSync(a).equals(readFileSync(b));
}

// SessionStart hook command — finds the latest plugin-setup.mjs in cache (SemVer
// descending) and re-runs it in --quiet mode. Stale 1.x.x dirs are skipped.
// Single line so it round-trips through JSON without surprises.
const HOOK_COMMAND = `node -e "var p=require('path'),fs=require('fs'),h=require('os').homedir(),c=p.join(h,'.claude/plugins/cache'),r=[];function w(d){try{for(var e of fs.readdirSync(d,{withFileTypes:true})){var f=p.join(d,e.name);if(e.isDirectory())w(f);else if(e.name=='plugin-setup.mjs'&&f.includes('claude-kit')){var v=p.basename(p.dirname(p.dirname(f)));if(/^[0-9]+\\.[0-9]+\\.[0-9]+$/.test(v))r.push([v,f])}}}catch(_){}}w(c);if(!r.length)process.exit(0);r.sort(function(a,b){var x=a[0].split('.').map(Number),y=b[0].split('.').map(Number);for(var i=0;i<3;i++)if(x[i]!==y[i])return y[i]-x[i];return 0});require('child_process').execFile(process.execPath,[r[0][1],'--quiet'],function(){})"`;

let changed = 0;

log('[claude-kit] Running setup...');

// 1. Ensure HUD dir
mkdirSync(HUD_DIR, { recursive: true });

// 2. Sync statusline.mjs (only writes if content differs)
const sourceRoot = getSourceRoot();
const srcMjs = join(sourceRoot, 'hud', 'statusline.mjs');
const destMjs = join(HUD_DIR, 'statusline.mjs');

if (existsSync(srcMjs) && !filesEqual(srcMjs, destMjs)) {
  backup(destMjs);
  copyFileSync(srcMjs, destMjs);
  try { chmodSync(destMjs, 0o755); } catch { /* Windows */ }
  changed++;
  log(`[claude-kit] Updated ${destMjs}`);
}

// 3. Windows .cmd wrapper (regenerated when content differs — node path may have moved)
let statusLineEntryPath = destMjs;
if (process.platform === 'win32') {
  const cmdPath = join(HUD_DIR, 'statusline.cmd');
  const nodeRef = resolveWindowsNodeRef();
  const cmdContent = `@echo off\r\n${nodeRef} "%~dp0statusline.mjs" %*\r\n`;
  const current = existsSync(cmdPath) ? readFileSync(cmdPath, 'utf-8') : null;
  if (current !== cmdContent) {
    backup(cmdPath);
    writeFileSync(cmdPath, cmdContent);
    changed++;
    log(`[claude-kit] Updated ${cmdPath} (node ref: ${nodeRef})`);
  }
  statusLineEntryPath = cmdPath;
}

// 4. settings.json: statusLine + SessionStart hook (only writes if shape differs)
try {
  let settings = {};
  if (existsSync(SETTINGS_FILE)) {
    settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
  }

  const desiredStatusLine = {
    type: 'command',
    command: `"${statusLineEntryPath}"`,
    refreshInterval: 1
  };
  const desiredHookEntry = {
    hooks: [{ type: 'command', command: HOOK_COMMAND }]
  };

  // Find existing claude-kit entry by marker, replace in place; else append.
  // Preserves other tools' SessionStart hooks.
  settings.hooks = settings.hooks || {};
  const arr = settings.hooks.SessionStart = settings.hooks.SessionStart || [];
  const idx = arr.findIndex(e => e?.hooks?.some(h => typeof h?.command === 'string' && h.command.includes('claude-kit')));
  const before = JSON.stringify({ statusLine: settings.statusLine, hookEntry: idx >= 0 ? arr[idx] : null });

  settings.statusLine = desiredStatusLine;
  if (idx >= 0) arr[idx] = desiredHookEntry;
  else arr.push(desiredHookEntry);

  const after = JSON.stringify({ statusLine: settings.statusLine, hookEntry: idx >= 0 ? arr[idx] : arr[arr.length - 1] });

  if (before !== after) {
    backup(SETTINGS_FILE);
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    changed++;
    log('[claude-kit] Updated settings.json (statusLine + SessionStart hook)');
  }
} catch (e) {
  if (!QUIET) console.log('[claude-kit] Warning: settings.json update failed —', e.message);
}

if (!QUIET) {
  log('');
  log(`[claude-kit] ${changed === 0 ? 'Already up to date.' : `${changed} item(s) updated.`}`);
  log('');
  log('  Statusline: Tokyo Night powerline theme');
  log('  Skills:     /interview, /edit, /explain, /doctor');
  log('  Auto-sync:  SessionStart hook keeps HUD synced with the installed plugin version');
  log('');
  log('  Restart Claude Code to apply changes.');
  if (changed > 0) {
    log(`  Backups:    ~/.claude/hud/backup/*${timestamp}.bak`);
  }
}
