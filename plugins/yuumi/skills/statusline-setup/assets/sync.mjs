#!/usr/bin/env node
/**
 * SessionStart sync for the yuumi statusline. Runs on every session start, so it is
 * silent, quick, and never fails the session (always exits 0).
 *
 * It refreshes ~/.claude/hud/statusline.mjs from the copy shipped in this plugin
 * version, but only when the person has opted in (the file is already there, put by
 * /yuumi:statusline-setup) and the file there is yuumi's own: a statusline another
 * tool wrote at that path is left alone.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
  const target = join(claudeDir, 'hud', 'statusline.mjs');
  const source = join(dirname(fileURLToPath(import.meta.url)), 'statusline.mjs');
  if (existsSync(target) && existsSync(source)) {
    const next = readFileSync(source);
    const current = readFileSync(target);
    // Older copies carried "Heeseon's Statusline" before the yuumi marker existed.
    const isOurs = /yuumi statusline|Heeseon's Statusline/.test(current.subarray(0, 600).toString());
    if (isOurs && !current.equals(next)) {
      const partial = `${target}.partial`;
      writeFileSync(partial, next);
      renameSync(partial, target);
      try { chmodSync(target, 0o755); } catch { /* Windows: no exec bit */ }
    }
  }
} catch {
  // A failed refresh keeps the previous statusline; the session goes on.
}
process.exit(0);
