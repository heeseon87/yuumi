// Yuumi HUD + ad-extension combined statusline.
//
// An ad extension (Kickbacks/vibe-ads) forces settings.json -> statusLine to
// `node "<this file>"` and rewrites this file with its ad-only script on
// every ad poll. To keep BOTH the Yuumi Tokyo Night HUD and the ad, this file
// is owned by yuumi and locked immutable (chflags uchg / chattr +i) so the
// extension's writeFileSync(scriptPath) fails silently — extension activation
// and the ad-cache (cli-ad.json) refresh are independent of this write, so
// nothing breaks and the ad text/URL still update live (cli-ad.json is read
// directly on every render).
//
// To hand this slot back to the extension, or render Yuumi without the ad:
//   run /yuumi-statusline-setup-ad with --restore, or
//   chflags nouchg "<this file>"   then re-run the relevant setup.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

// 1. Read the session JSON Claude Code pipes on stdin (fd 0).
let input = "";
try { input = readFileSync(0, "utf8"); } catch { /* no stdin */ }

// 2. Locate + run the Yuumi statusline, forwarding stdin verbatim.
//    Resolved at run time against the global skills dir, so `npx skills
//    update` refreshing the yuumi install never strands this wrapper.
function findYuumi() {
  const roots = [
    join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "skills"),
  ];
  for (const root of roots) {
    try {
      for (const d of readdirSync(root)) {
        const p = join(root, d, "assets", "statusline.mjs");
        if (existsSync(p)) return p;
      }
    } catch { /* next root */ }
  }
  return "";
}

let hud = "";
try {
  const yuumi = findYuumi();
  if (yuumi) {
    hud = execFileSync(process.execPath, [yuumi], {
      input, encoding: "utf8", timeout: 5000, maxBuffer: 1 << 20,
    });
  }
} catch { /* Yuumi failed: still emit the ad line */ }

// 3. Build the ad line from the extension's cache (original ad logic
//    preserved). 10-min freshness gate; strip ONLY control chars (C0 + DEL +
//    C1) so adText/clickUrl can never emit their own ANSI/OSC — the OSC 8
//    hyperlink framing below is the only escape this script prints. Emoji /
//    pipes / unicode / URLs pass through untouched.
let adLine = "";
try {
  const CACHE = join(homedir(), ".vibe-ads", "cli-ad.json");
  const FRESH_MS = 600000;
  const o = JSON.parse(readFileSync(CACHE, "utf8"));
  const fresh = o && typeof o.ts === "number"
    && (Date.now() - o.ts) <= FRESH_MS
    && typeof o.adText === "string" && o.adText.length > 0;
  if (fresh) {
    const strip = (s) => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
    const text = "ad· " + strip(o.adText);
    const url = typeof o.clickUrl === "string" ? strip(o.clickUrl) : "";
    const ESC = "\u001b";
    adLine = url
      ? ESC + "]8;;" + url + ESC + "\\" + text + ESC + "]8;;" + ESC + "\\"
      : text;
  }
} catch { /* no/stale ad: HUD only */ }

// 4. Emit Yuumi HUD lines, then the ad as the final line.
const hudTrimmed = hud.replace(/\n+$/, "");
let out = hudTrimmed;
if (adLine) out = hudTrimmed ? hudTrimmed + "\n" + adLine : adLine;
process.stdout.write(out);
process.exit(0);
