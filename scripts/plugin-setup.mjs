#!/usr/bin/env node
/**
 * Claude Kit - Post-Install Setup
 *
 * Configures Tokyo Night powerline statusline when plugin is installed.
 * Backs up existing HUD files and settings before overwriting.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, chmodSync, symlinkSync, unlinkSync, lstatSync } from 'node:fs';
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

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// marketplace 소스 경로 탐색 (자동 업데이트되는 디렉토리)
// Windows의 backslash 경로도 인식하도록 정규화 후 매칭
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

// Windows의 symlink는 관리자 권한 또는 개발자 모드를 요구. 실패 시 copy로 폴백.
function linkOrCopy(src, dest) {
  try {
    symlinkSync(src, dest);
    return 'linked';
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') {
      copyFileSync(src, dest);
      return 'copied';
    }
    throw e;
  }
}

function backup(filePath) {
  if (!existsSync(filePath)) return;
  mkdirSync(BACKUP_DIR, { recursive: true });
  const name = basename(filePath);
  const backupPath = join(BACKUP_DIR, `${name}.${timestamp}.bak`);
  copyFileSync(filePath, backupPath);
  console.log(`[claude-kit] Backed up ${name} → backup/${name}.${timestamp}.bak`);
}

console.log('[claude-kit] Running post-install setup...');

// 1. Create HUD directory
mkdirSync(HUD_DIR, { recursive: true });

// 2. Symlink HUD files (marketplace 소스를 직접 참조 → 자동 업데이트 반영)
// Windows에서 symlink가 막히면 copy로 폴백 (이 경우 자동 업데이트는 안 되므로 재실행 안내)
const sourceRoot = getSourceRoot();
const hudFiles = ['statusline.mjs'];
const copiedFiles = [];
for (const file of hudFiles) {
  const src = join(sourceRoot, 'hud', file);
  const dest = join(HUD_DIR, file);
  if (existsSync(src)) {
    try {
      const stat = lstatSync(dest);
      if (!stat.isSymbolicLink()) backup(dest);
      unlinkSync(dest);
    } catch {} // dest가 없으면 무시
    const action = linkOrCopy(src, dest);
    if (action === 'copied') copiedFiles.push(file);
    console.log(`[claude-kit] ${action === 'linked' ? 'Linked' : 'Copied'} ${file} → ${action === 'linked' ? src : dest}`);
  }
}

// Make executable (source for symlink target, dest for copy)
try {
  chmodSync(join(sourceRoot, 'hud', 'statusline.mjs'), 0o755);
} catch { /* Windows doesn't need this */ }
for (const file of copiedFiles) {
  try {
    chmodSync(join(HUD_DIR, file), 0o755);
  } catch { /* Windows doesn't need this */ }
}

// 3. Backup & configure settings.json
try {
  let settings = {};
  if (existsSync(SETTINGS_FILE)) {
    backup(SETTINGS_FILE);
    settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'));
  }

  const hudScriptPath = join(HUD_DIR, 'statusline.mjs');

  settings.statusLine = {
    type: 'command',
    command: `"${hudScriptPath}"`,
    refreshInterval: 1
  };

  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  console.log('[claude-kit] Configured statusLine in settings.json');
} catch (e) {
  console.log('[claude-kit] Warning: Could not configure settings.json:', e.message);
}

console.log('[claude-kit] Setup complete!');
console.log('');
console.log('  Statusline: Tokyo Night powerline theme');
console.log('  Skills:     /interview, /edit, /explain, /doctor');
console.log(`  Backups:    ~/.claude/hud/backup/*${timestamp}.bak`);
console.log('');
if (copiedFiles.length > 0) {
  console.log('  Note: HUD files were copied (symlink unavailable on this system).');
  console.log('        Re-run /claude-kit:setup after plugin updates to refresh.');
  console.log('');
}
console.log('  Restart Claude Code to see the new statusline.');
console.log('  To restore: copy the .bak files back to their original names.');
