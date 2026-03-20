#!/usr/bin/env node
/**
 * Claude Kit - Post-Install Setup
 *
 * Configures Tokyo Night powerline statusline when plugin is installed.
 * Backs up existing HUD files and settings before overwriting.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = join(__dirname, '..');

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const HUD_DIR = join(CLAUDE_DIR, 'hud');
const BACKUP_DIR = join(HUD_DIR, 'backup');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function backup(filePath) {
  if (!existsSync(filePath)) return;
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const name = filePath.split('/').pop();
  const backupPath = join(BACKUP_DIR, `${name}.${timestamp}.bak`);
  copyFileSync(filePath, backupPath);
  console.log(`[claude-kit] Backed up ${name} → backup/${name}.${timestamp}.bak`);
}

console.log('[claude-kit] Running post-install setup...');

// 1. Create HUD directory
if (!existsSync(HUD_DIR)) {
  mkdirSync(HUD_DIR, { recursive: true });
}

// 2. Backup & copy HUD files
const hudFiles = ['statusline.mjs', 'usage-api.js'];
for (const file of hudFiles) {
  const src = join(PLUGIN_ROOT, 'hud', file);
  const dest = join(HUD_DIR, file);
  if (existsSync(src)) {
    backup(dest);
    copyFileSync(src, dest);
    console.log(`[claude-kit] Installed ${file}`);
  }
}

// Make statusline executable
try {
  chmodSync(join(HUD_DIR, 'statusline.mjs'), 0o755);
} catch { /* Windows doesn't need this */ }

// 3. Backup & configure settings.json
try {
  let settings = {};
  if (existsSync(SETTINGS_FILE)) {
    backup(SETTINGS_FILE);
    settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
  }

  const nodeBin = process.execPath || 'node';
  const hudScriptPath = join(HUD_DIR, 'statusline.mjs').replace(/\\/g, '/');

  settings.statusLine = {
    type: 'command',
    command: `"${nodeBin}" "${hudScriptPath}"`
  };

  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  console.log('[claude-kit] Configured statusLine in settings.json');
} catch (e) {
  console.log('[claude-kit] Warning: Could not configure settings.json:', e.message);
}

console.log('[claude-kit] Setup complete!');
console.log('');
console.log('  Statusline: Tokyo Night powerline theme');
console.log('  Skills:     /interview, /edit, /explain');
console.log(`  Backups:    ~/.claude/hud/backup/*${timestamp}.bak`);
console.log('');
console.log('  Restart Claude Code to see the new statusline.');
console.log('  To restore: copy the .bak files back to their original names.');
