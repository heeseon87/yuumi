#!/usr/bin/env node
// Yuumi statusline + ad-extension coexistence installer.
//
// The Kickbacks/vibe-ads extension owns the statusline slot: it forces
// settings.json -> statusLine to `node "~/.vibe-ads/vibe-ads-statusline.mjs"`
// and rewrites that file with its ad-only script on every ad poll (no env
// override exists for the path). So pointing settings at the yuumi statusline
// directly just gets reverted. Instead this setup replaces THAT file with the
// combined renderer (Yuumi HUD + live ad line, shipped as the sibling
// statusline-ad.mjs) and locks it immutable so the extension's rewrite fails.
// The extension tolerates this: its scriptPath write throws inside apply()'s
// try/catch, while activation and the cli-ad.json ad-cache refresh are
// independent of it — so ads keep rotating and the combined script picks them
// up by reading cli-ad.json directly.
//
// Known trade-off: the extension's settings.json spinnerVerbs refresh sits
// AFTER the blocked write in the same apply(), so the CLI spinner verb stays
// frozen at its last ad text. The webview spinner ad and the statusline ad
// line keep rotating normally.
//
// --restore: unlock the file so the extension reclaims the slot on its next
// ad poll (ad-only statusline again). Run /yuumi-statusline-setup afterwards
// instead if you want the pure Yuumi statusline.
import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir, platform } from "node:os";
import { join, dirname } from "node:path";

const VIBE_DIR = join(homedir(), ".vibe-ads");
const TARGET = join(VIBE_DIR, "vibe-ads-statusline.mjs");
const RESTORE = process.argv.includes("--restore");

function fail(msg) { console.error("✗ " + msg); process.exit(1); }
function ok(msg) { console.log("✓ " + msg); }

// chflags is macOS/BSD; Linux immutability (chattr +i) usually needs root.
if (platform() === "win32") fail("Windows is not supported: the immutable-file lock this setup relies on has no Windows equivalent here.");
const LOCK = platform() === "darwin"
  ? { lock: ["chflags", ["uchg", TARGET]], unlock: ["chflags", ["nouchg", TARGET]] }
  : { lock: ["chattr", ["+i", TARGET]], unlock: ["chattr", ["-i", TARGET]] };

function run([cmd, args]) { execFileSync(cmd, args, { stdio: "pipe" }); }
function tryRun(spec) { try { run(spec); return true; } catch { return false; } }

// --- restore mode --------------------------------------------------------
if (RESTORE) {
  if (!existsSync(TARGET)) fail("nothing to restore: " + TARGET + " does not exist.");
  if (!tryRun(LOCK.unlock)) fail("could not unlock " + TARGET + " (try manually: " + LOCK.unlock[0] + " " + LOCK.unlock[1].join(" ") + ")");
  ok("unlocked " + TARGET);
  console.log("The ad extension will rewrite it with its ad-only statusline on its next ad poll (~10 min) or on the next editor restart.");
  console.log("For the pure Yuumi statusline instead, run /yuumi-statusline-setup.");
  process.exit(0);
}

// --- preconditions --------------------------------------------------------
// 1. The ad extension must actually be in play — otherwise the user wants the
//    plain setup, not this coexistence shim.
if (!existsSync(VIBE_DIR) || !existsSync(join(VIBE_DIR, "cli-ad.json")))
  fail("no ad extension found (" + VIBE_DIR + " missing). Use /yuumi-statusline-setup for the normal install.");

// 2. The yuumi statusline must be installed globally (same requirement and
//    same logical-path reasoning as setup.mjs: the skills CLI may install via
//    symlink, so resolve against the global skills dir, not import.meta.url).
const skillsRoot = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "skills");
let yuumiPath = "", assetPath = "";
try {
  for (const d of readdirSync(skillsRoot)) {
    const a = join(skillsRoot, d, "assets");
    if (!yuumiPath && existsSync(join(a, "statusline.mjs")) && existsSync(join(a, "setup.mjs")))
      yuumiPath = join(a, "statusline.mjs");
    if (!assetPath && existsSync(join(a, "statusline-ad.mjs")))
      assetPath = join(a, "statusline-ad.mjs");
  }
} catch { /* handled below */ }
if (!yuumiPath) fail("yuumi statusline not found under " + skillsRoot + ". Install globally first: npx skills add -g heeseon87/yuumi, then run /yuumi-statusline-setup once.");
if (!assetPath) fail("statusline-ad.mjs asset not found under " + skillsRoot + ". Install globally first: npx skills add -g heeseon87/yuumi");

// --- install: unlock -> copy -> lock (single pass, minimal race window) ---
tryRun(LOCK.unlock); // fine if it was not locked yet
copyFileSync(assetPath, TARGET);
if (!tryRun(LOCK.lock)) fail("wrote the combined statusline but could not lock it" + (platform() === "linux" ? " (chattr +i usually needs root — rerun lock with sudo: sudo chattr +i " + TARGET + ")" : "") + ". Without the lock the ad extension will overwrite it within minutes.");
ok("combined statusline written and locked: " + TARGET);

// --- settings.json: the extension normally forces this; heal if absent ----
const settingsPath = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "settings.json");
try {
  const cfg = JSON.parse(readFileSync(settingsPath, "utf8"));
  const cmd = (cfg.statusLine && cfg.statusLine.command) || "";
  if (!cmd.includes("vibe-ads-statusline.mjs")) {
    writeFileSync(settingsPath + ".statusline-ad.bak", JSON.stringify(cfg, null, 2) + "\n");
    cfg.statusLine = { type: "command", command: "node " + JSON.stringify(TARGET), padding: 0 };
    writeFileSync(settingsPath, JSON.stringify(cfg, null, 2) + "\n");
    ok("settings.json statusLine pointed at the combined script (backup: settings.json.statusline-ad.bak)");
  } else {
    ok("settings.json already points at " + TARGET);
  }
} catch (e) {
  fail("could not read/update " + settingsPath + ": " + e.message);
}

// --- verify: lock really blocks writes, and the script renders ------------
let lockHolds = false;
try { writeFileSync(TARGET, "x"); } catch { lockHolds = true; }
if (!lockHolds) fail("lock verification failed: " + TARGET + " is still writable.");
ok("lock verified (extension overwrites will fail with EPERM)");

try {
  const sample = JSON.stringify({ model: { display_name: "Opus" }, cwd: process.cwd(), version: "0.0.0", context_window: { used_percentage: 1, context_window_size: 200000 } });
  const out = execFileSync(process.execPath, [TARGET], { input: sample, encoding: "utf8", timeout: 8000 });
  const lines = out.split("\n").filter(Boolean).length;
  ok("render check passed (" + lines + " line(s): Yuumi HUD" + (lines > 2 ? " + ad" : ", ad line appears when the ad cache is fresh") + ")");
} catch (e) {
  fail("render check failed: " + e.message);
}

console.log("\nDone. Restart Claude Code once; the statusline shows the Yuumi HUD with the ad as the final line.");
console.log("To undo: run this skill with --restore (ad-only), or unlock and run /yuumi-statusline-setup (Yuumi-only).");
