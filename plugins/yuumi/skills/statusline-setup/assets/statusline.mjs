#!/usr/bin/env node
/**
 * yuumi statusline (Tokyo Night). Installed to ~/.claude/hud/statusline.mjs by
 * /yuumi:statusline-setup and kept current there by the yuumi plugin's SessionStart sync.
 *
 * Line 1: ModelName | DirName | Branch
 * Line 2: 5h:X% | wk:X% | session:Xm | ctx:X%
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

// ============================================================================
// Stdin Parsing
// ============================================================================

const STDIN_TIMEOUT_MS = 1000;

async function readStdin() {
  if (process.stdin.isTTY) return null;

  return new Promise((resolve) => {
    const chunks = [];
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      const raw = chunks.join('');
      if (!raw.trim()) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    };

    const timer = setTimeout(() => {
      try { process.stdin.destroy(); } catch {}
      finish();
    }, STDIN_TIMEOUT_MS);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { chunks.push(chunk); });
    process.stdin.once('end', finish);
    process.stdin.once('error', finish);
    process.stdin.resume();
  });
}

// ============================================================================
// Data Extractors
// ============================================================================

function getModelName(stdin) {
  // stdin.model.display_name: Claude Code가 세션별로 전달하는 공식 표시용 값
  // "Sonnet 4.6" → "Sonnet 4.6"; 버전이 없으면 id(claude-opus-5-5)에서 보충 → "Opus 5.5"
  const display = stdin.model?.display_name ?? '';
  const id = stdin.model?.id ?? '';
  const name = display.split(' ').slice(0, 2).join(' ') || 'Unknown';
  if (/\d/.test(name)) return name;
  const m = id.match(/^claude-[a-z]+-(\d+)(?:-(\d{1,2}))?(?:-|$)/);
  if (!m) return name === 'Unknown' && id ? id : name;
  return `${name} ${m[2] ? `${m[1]}.${m[2]}` : m[1]}`;
}


function getDirName(stdin) {
  const cwd = stdin.cwd || process.cwd();
  return basename(cwd);
}

function getGitBranch(stdin) {
  const cwd = stdin.cwd || process.cwd();
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 500,
    }).trim();
    // 긴 브랜치명 줄이기
    if (branch.length > 50) {
      return branch.substring(0, 47) + '...';
    }
    return branch;
  } catch {
    return null;
  }
}

function getContextPercent(stdin) {
  const nativePercent = stdin.context_window?.used_percentage;
  if (typeof nativePercent === 'number' && !Number.isNaN(nativePercent)) {
    return Math.min(100, Math.max(0, Math.round(nativePercent)));
  }
  return 0;
}

function getEffortLevel(stdin) {
  // stdin.effort.level: low | medium | high | xhigh | max (세션별 실제 적용값)
  return stdin.effort?.level ?? null;
}


// ============================================================================
// Version Check (1시간 캐시)
// ============================================================================

const VERSION_CACHE_PATH = join(homedir(), '.claude', '.claude-code-latest-version.json');
const VERSION_CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1시간

function refreshLatestVersionInBackground() {
  const script = `
const https = require('node:https');
const { mkdirSync, writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const cachePath = ${JSON.stringify(VERSION_CACHE_PATH)};
const req = https.get('https://registry.npmjs.org/@anthropic-ai%2fclaude-code/latest', { timeout: 3000 }, (res) => {
  let body = '';
  res.setEncoding('utf8');
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    try {
      if (res.statusCode !== 200) process.exit(0);
      const version = JSON.parse(body).version;
      if (!version) process.exit(0);
      mkdirSync(dirname(cachePath), { recursive: true });
      writeFileSync(cachePath, JSON.stringify({ version, timestamp: Date.now() }));
    } catch {}
  });
});
req.on('timeout', () => req.destroy());
req.on('error', () => {});
`;

  try {
    const child = spawn(process.execPath, ['-e', script], {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    });
    child.unref();
  } catch {}
}

function getLatestVersion() {
  let cachedVersion = null;

  try {
    if (existsSync(VERSION_CACHE_PATH)) {
      const cache = JSON.parse(readFileSync(VERSION_CACHE_PATH, 'utf-8'));
      cachedVersion = cache.version;
      if (Date.now() - cache.timestamp < VERSION_CHECK_INTERVAL_MS) {
        return cachedVersion; // 신선한 캐시
      }
    }
  } catch {}

  // 만료된 캐시가 있으면 즉시 반환, 백그라운드에서 갱신 (블로킹 없음)
  refreshLatestVersionInBackground();

  return cachedVersion; // 이전 캐시값 반환 (없으면 null)
}

function isOutdated(current, latest) {
  if (!current || !latest) return false;
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((c[i] || 0) < (l[i] || 0)) return true;
    if ((c[i] || 0) > (l[i] || 0)) return false;
  }
  return false;
}

// ============================================================================
// Formatting Helpers
// ============================================================================

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days}d${remainingHours}h` : `${days}d`;
}

function formatRateLimits(rateLimits) {
  if (!rateLimits) return null;

  const parts = [];

  // Unix timestamp (초) → 남은 분
  const getResetMinutes = (resetsAt) => {
    if (!resetsAt) return 0;
    return Math.max(0, Math.floor((resetsAt * 1000 - Date.now()) / 60000));
  };

  // 5-hour limit (stdin: five_hour.used_percentage, five_hour.resets_at)
  const fiveHour = rateLimits.five_hour;
  if (fiveHour && typeof fiveHour.used_percentage === 'number') {
    const pct = fiveHour.used_percentage;
    const resetMinutes = getResetMinutes(fiveHour.resets_at);
    const reset = formatDuration(resetMinutes);
    const elapsedHours = (300 - resetMinutes) / 60;
    const bar5h = allocationBar(pct, elapsedHours, 5);
    parts.push(`\u231B ${bar5h} ${colorAllocationPercent(pct, pct, elapsedHours, 5)}(${reset})`);
  }

  // 7-day limit (stdin: seven_day.used_percentage, seven_day.resets_at)
  const sevenDay = rateLimits.seven_day;
  if (sevenDay && typeof sevenDay.used_percentage === 'number') {
    const pct = sevenDay.used_percentage;
    const resetMinutes = getResetMinutes(sevenDay.resets_at);
    const reset = formatDuration(resetMinutes);
    const elapsedDays = (168 - Math.max(1, resetMinutes / 60)) / 24;
    const bar7d = allocationBar(pct, elapsedDays, 7);
    parts.push(`\uD83D\uDCC5 ${bar7d} ${colorAllocationPercent(pct, pct, elapsedDays, 7)}(${reset})`);
  }

  if (parts.length === 0) return null;

  return parts.join(' ');
}

// 트랜스크립트 파일의 첫 줄에서 세션 시작 시간 읽기
// OMC의 tail-based 파싱 버그를 우회하여 정확한 시작 시간 계산
function getSessionStartFromTranscript(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) {
    return null;
  }

  try {
    // 파일의 첫 2KB만 읽어서 첫 몇 줄 추출 (첫 줄이 snapshot일 수 있음)
    const fd = openSync(transcriptPath, 'r');
    const buffer = Buffer.alloc(2048);
    const bytesRead = readSync(fd, buffer, 0, 2048, 0);
    closeSync(fd);

    if (bytesRead === 0) return null;

    const content = buffer.toString('utf8', 0, bytesRead);
    const lines = content.split('\n').filter(line => line.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // 다양한 위치에서 timestamp 찾기
        const timestamp =
          entry.timestamp ||                    // 직접 timestamp
          entry.snapshot?.timestamp ||          // file-history-snapshot
          entry.data?.timestamp;                // progress 등

        if (timestamp) {
          return new Date(timestamp);
        }
      } catch {
        // 이 줄 파싱 실패, 다음 줄 시도
      }
    }
  } catch {
    // 파일 읽기 실패
  }

  return null;
}

// ============================================================================
// Usage API (모델별 주간 한도 — /usage 커맨드와 같은 소스, 2분 캐시)
// ============================================================================

// stdin의 rate_limits에는 five_hour/seven_day 통합 버킷만 온다.
// Fable처럼 모델별 주간 한도(weekly_scoped)는 OAuth usage API에만 있으므로
// 백그라운드에서 키체인 토큰으로 조회해 캐시하고, 메인 경로는 캐시만 읽는다.
const USAGE_API_CACHE_PATH = join(homedir(), '.claude', '.statusline-usage-api.json');
// 이 엔드포인트는 rate limit이 민감하다 (실측: 초당 호출 시 계정 단위 429, 1시간 이상 지속).
// 아래 두 상수를 1분 밑으로 내리지 마라. 세션이 몇 개든 캐시 파일을 공유하므로
// 실제 호출은 계정 전체에서 2분당 1회로 묶인다.
const USAGE_API_REFRESH_MS = 2 * 60 * 1000;
// 갱신 '시도' 최소 간격. 실패가 지속돼도 이 간격 밑으로는 재시도하지 않는다.
const USAGE_API_ATTEMPT_MS = 2 * 60 * 1000;
// 캐시를 화면에 띄워둘 최대 나이. 이걸 넘으면 세그먼트를 감춘다.
const USAGE_API_MAX_STALE_MS = 10 * 60 * 1000;

function refreshUsageApiInBackground() {
  const script = `
const { execFileSync } = require('node:child_process');
const https = require('node:https');
const { writeFileSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { homedir, userInfo } = require('node:os');
const cachePath = ${JSON.stringify(USAGE_API_CACHE_PATH)};

// OAuth 토큰 조회: macOS는 키체인, Windows/Linux는 평문 credentials 파일.
// macOS도 키체인 실패 시(권한 거부 등) 파일로 폴백.
//
// 키체인에는 같은 서비스명 'Claude Code-credentials' 항목이 여러 개 쌓인다
// (계정 라벨이 실제 사용자명인 것, 'unknown'인 것, 해시 접미사가 붙은 옛 항목).
// -a 없이 조회하면 그중 아무거나 하나가 오는데, 껍데기 항목은 accessToken이
// 빈 문자열이고 옛 항목은 이미 만료라 401이 난다. 그래서 후보를 여러 개 모은 뒤
// '토큰이 있고 아직 안 만료된 것 중 가장 늦게 만료되는 것'을 고른다.
// 계정 라벨을 하드코딩하면 다른 사용자 머신에서 깨지므로 라벨로 특정하지 않는다.
function readToken() {
  const candidates = [];
  const collect = (raw) => {
    try {
      const oauth = JSON.parse(raw).claudeAiOauth;
      if (oauth && oauth.accessToken) candidates.push(oauth);
    } catch {}
  };

  if (process.platform === 'darwin') {
    let user = '';
    try { user = userInfo().username; } catch {}
    const argSets = [['find-generic-password', '-s', 'Claude Code-credentials', '-w']];
    if (user) {
      argSets.push(['find-generic-password', '-s', 'Claude Code-credentials', '-a', user, '-w']);
    }
    for (const args of argSets) {
      try {
        collect(execFileSync('security', args, { encoding: 'utf8', timeout: 3000 }));
      } catch {}
    }
  }

  try {
    const configDir = process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
    collect(readFileSync(join(configDir, '.credentials.json'), 'utf8'));
  } catch {}

  const now = Date.now();
  const unexpired = candidates.filter((o) => !o.expiresAt || o.expiresAt > now);
  // 전부 만료로 보이면 그래도 가장 최신 것으로 시도한다 (expiresAt이 틀릴 수 있다).
  const pool = unexpired.length > 0 ? unexpired : candidates;
  pool.sort((a, b) => (b.expiresAt || 0) - (a.expiresAt || 0));
  return pool.length > 0 ? pool[0].accessToken : null;
}

try {
  const token = readToken();
  if (!token) process.exit(0);
  const req = https.get('https://api.anthropic.com/api/oauth/usage', {
    headers: { Authorization: 'Bearer ' + token, 'anthropic-beta': 'oauth-2025-04-20' },
    timeout: 5000,
  }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', c => { body += c; });
    res.on('end', () => {
      try {
        if (res.statusCode !== 200) process.exit(0);
        const limits = JSON.parse(body).limits;
        if (!Array.isArray(limits)) process.exit(0);
        writeFileSync(cachePath, JSON.stringify({ timestamp: Date.now(), lastAttempt: Date.now(), limits }));
      } catch {}
    });
  });
  req.on('timeout', () => req.destroy());
  req.on('error', () => {});
} catch {}
`;

  try {
    const child = spawn(process.execPath, ['-e', script], {
      stdio: 'ignore',
      detached: true,
      windowsHide: true,
    });
    child.unref();
  } catch {}
}

// 모델 범위 주간 한도(weekly_scoped)만 반환. 통합 버킷은 stdin이 이미 제공.
function getScopedWeeklyLimits() {
  let cached = null;
  try {
    if (existsSync(USAGE_API_CACHE_PATH)) {
      cached = JSON.parse(readFileSync(USAGE_API_CACHE_PATH, 'utf-8'));
      if (Date.now() - cached.timestamp < USAGE_API_REFRESH_MS) {
        return extractScoped(cached);
      }
    }
  } catch {}

  // 시도 스로틀: 마지막 시도 후 30초 안 지났으면 spawn 없이 만료 캐시만 표시
  const lastAttempt = cached?.lastAttempt || 0;
  if (Date.now() - lastAttempt >= USAGE_API_ATTEMPT_MS) {
    try {
      writeFileSync(USAGE_API_CACHE_PATH, JSON.stringify({
        timestamp: cached?.timestamp || 0,
        lastAttempt: Date.now(),
        limits: cached?.limits || [],
      }));
    } catch {}
    refreshUsageApiInBackground();
  }

  // 만료 캐시라도 잠깐은 그대로 보여준다 (갱신 실패가 일시적일 수 있다).
  // 다만 무한정은 안 된다. 토큰이 죽으면 갱신은 조용히 실패만 하는데,
  // 그때 옛 값을 계속 그리면 화면은 멀쩡해 보이고 숫자만 얼어붙는다.
  // 상한을 넘기면 세그먼트를 지워서 고장이 눈에 보이게 한다.
  if (!cached || Date.now() - (cached.timestamp || 0) > USAGE_API_MAX_STALE_MS) return null;
  return extractScoped(cached);
}

function extractScoped(cached) {
  const scoped = (cached.limits || []).filter(
    (l) => l.kind === 'weekly_scoped' && typeof l.percent === 'number'
  );
  return scoped.length > 0 ? scoped : null;
}

// 모델 범위별 아이콘 (Nerd Font). fable(우화) = 책, 그 외 모델은 이름 그대로.
const SCOPE_ICON = {
  fable: '📖',  // 📖 open book emoji
};

// weekly_scoped 항목 → " ██░░ 37%(2d14h)" (색상은 7일 배분 기준)
function formatScopedWeekly(scopedLimits) {
  const parts = [];
  for (const limit of scopedLimits) {
    const name = (limit.scope?.model?.display_name || limit.kind).toLowerCase();
    const label = SCOPE_ICON[name] || name;
    const resetMinutes = limit.resets_at
      ? Math.max(0, Math.floor((new Date(limit.resets_at).getTime() - Date.now()) / 60000))
      : 0;
    const elapsedDays = (168 - Math.max(1, resetMinutes / 60)) / 24;
    const bar = allocationBar(limit.percent, elapsedDays, 7);
    parts.push(
      `${magenta(label)} ${bar} ${colorAllocationPercent(limit.percent, limit.percent, elapsedDays, 7)}(${formatDuration(resetMinutes)})`
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

// ============================================================================
// Colors (ANSI Truecolor - Tokyo Night palette)
// ============================================================================

const RST = '\x1b[0m';
const BOLD = '\x1b[1m';

// Truecolor helpers
const fg = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const bg = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;

// Tokyo Night palette (muted pastel variant)
// 채도 ~40-50%, 명도 ~65-70% 범위로 조정 — 라이트/다크 양쪽 터미널에서
// 눈부심 없이 가독성 유지. 어두운 글자(dark.fg) 대비 모두 AA 통과(~6.5:1+).
const TN = {
  blue:    { fg: fg(135, 165, 200), bg: bg(135, 165, 200) },  // #87a5c8
  green:   { fg: fg(165, 195, 130), bg: bg(165, 195, 130) },  // #a5c382
  purple:  { fg: fg(170, 158, 210), bg: bg(170, 158, 210) },  // #aa9ed2
  cyan:    { fg: fg(95, 160, 180), bg: bg(95, 160, 180) },    // #5fa0b4
  amber:   { fg: fg(210, 170, 110), bg: bg(210, 170, 110) },  // #d2aa6e
  coral:   { fg: fg(220, 145, 158), bg: bg(220, 145, 158) },  // #dc919e
  teal:    { fg: fg(135, 195, 180), bg: bg(135, 195, 180) },  // #87c3b4
  lavender:{ fg: fg(170, 180, 205), bg: bg(170, 180, 205) },  // #aab4cd
  dark:    { fg: fg(26, 27, 38) },                              // #1a1b26
};

// Effort 단계별 색상/라벨 (낮음 → 높음 순으로 차분한 색에서 강조색으로)
const EFFORT_STYLE = {
  low:    TN.lavender,
  medium: TN.cyan,
  high:   TN.teal,
  xhigh:  TN.amber,
  max:    TN.coral,
};

const EFFORT_LABEL = {
  low: 'LOW',
  medium: 'MED',
  high: 'HIGH',
  xhigh: 'XHIGH',
  max: 'MAX',
};

// Powerline 세그먼트 연결: 화살표로 배경색이 이어지는 효과
// '' (U+E0B0) = powerline right arrow
const PL = '\uE0B0';

/**
 * 세그먼트 배열 [{text, color}] → powerline 스타일 문자열
 * [bg:A] text [fg:A bg:B]  [bg:B] text [fg:B]  ← 끝
 */
function joinSegments(segments) {
  let out = '';
  for (let i = 0; i < segments.length; i++) {
    const { text, color } = segments[i];
    // 세그먼트 본체: 컬러 배경 + 어두운 bold 글자
    out += `${color.bg}${TN.dark.fg}${BOLD} ${text} ${RST}`;
    // 전환 화살표: 현재 색을 fg로, 다음 세그먼트 색을 bg로
    if (i < segments.length - 1) {
      const next = segments[i + 1].color;
      out += `${color.fg}${next.bg}${PL}${RST}`;
    } else {
      // 마지막: 현재 색 fg로 화살표만 (배경 없음)
      out += `${color.fg}${PL}${RST}`;
    }
  }
  return out;
}

// 전경색 전용 (Line 2용)
const bold = (text) => `${BOLD}${text}${RST}`;
const dim = (text) => `\x1b[2m${text}${RST}`;
const yellow = (text) => `${TN.amber.fg}${text}${RST}`;
const green = (text) => `${TN.green.fg}${text}${RST}`;
const orange = (text) => `${TN.coral.fg}${text}${RST}`;
const red = (text) => `\x1b[1m${TN.coral.fg}${text}${RST}`;
const cyan = (text) => `${TN.cyan.fg}${text}${RST}`;
const magenta = (text) => `${TN.purple.fg}${text}${RST}`;

// 퍼센트에 따른 색상 (Tokyo Night threshold: 40% warn, 70% critical)
const colorPercent = (percent) => {
  const pctStr = `${percent}%`;
  if (percent >= 70) return red(pctStr);
  if (percent >= 40) return yellow(pctStr);
  return cyan(pctStr);
};

// 프로그레스 바 공통 헬퍼
const makeBar = (percent, colorFg, width = 10) => {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `${colorFg}${'█'.repeat(filled)}${RST}${dim('░'.repeat(empty))}`;
};

// CShip 스타일 context progress bar
const contextBar = (percent, width = 10) => {
  let barColorFg;
  if (percent >= 70) barColorFg = TN.coral.fg;
  else if (percent >= 40) barColorFg = TN.amber.fg;
  else barColorFg = TN.cyan.fg;

  return `${barColorFg}\uF1C0${RST} ${makeBar(percent, barColorFg, width)} ${colorPercent(percent)}`;
};

// 이월/당겨쓰기 기반 색상 (5시간, 주간 공통)
// 남은 시간 비례로 구간을 4등분 (분 단위 정밀도)
// level: 0=이월, 1=초록, 2=노랑, 3=주황, 4=빨강
const getAllocationLevel = (usedPercent, elapsed, totalPeriods) => {
  const allocation = 100 / totalPeriods;
  const cumulative = allocation * elapsed;
  const remaining = allocation * (totalPeriods - elapsed);

  if (usedPercent < cumulative)                      return 0; // 이월분
  if (usedPercent < cumulative + remaining * (1/4))  return 1; // 초록
  if (usedPercent < cumulative + remaining * (2/4))  return 2; // 노랑
  if (usedPercent < cumulative + remaining * (3/4))  return 3; // 주황
  return 4;                                                     // 빨강
};

const LEVEL_STYLES = [
  null,                                          // 0: 이월 (무색)
  { fg: TN.green.fg, bold: false },              // 1: 초록
  { fg: TN.amber.fg, bold: false },              // 2: 노랑
  { fg: TN.coral.fg, bold: false },              // 3: 주황
  { fg: TN.coral.fg, bold: true },               // 4: 빨강 (bold)
];

const colorAllocationPercent = (displayPercent, rawPercent, elapsed, totalPeriods) => {
  const pctStr = `${Math.floor(displayPercent)}%`;
  const level = getAllocationLevel(rawPercent, elapsed, totalPeriods);
  const style = LEVEL_STYLES[level];
  if (!style) return pctStr;
  return `${style.bold ? BOLD : ''}${style.fg}${pctStr}${RST}`;
};

// 이월/당겨쓰기 기반 프로그레스 바
const allocationBar = (usedPercent, elapsed, totalPeriods, width = 8) => {
  const level = getAllocationLevel(usedPercent, elapsed, totalPeriods);
  const style = LEVEL_STYLES[level];
  const colorFg = style ? `${style.bold ? BOLD : ''}${style.fg}` : '';
  return makeBar(usedPercent, colorFg, width);
};

// 세션 시간 색상: 경과 시간에 따른 색상
// 0-30분: 회색, 30분-1시간: 초록, 1시간-24시간: 노랑, 24시간+: 주황
const colorSessionDuration = (minutes) => {
  const formatted = formatDuration(minutes);
  if (minutes >= 1440) return orange(formatted);  // 24시간 이상
  if (minutes >= 60) return yellow(formatted);    // 1시간 이상
  if (minutes >= 30) return green(formatted);     // 30분 이상
  return formatted;                                // 30분 미만 (기본)
};

// ============================================================================
// Main
// ============================================================================

async function main() {
  try {
    const stdin = await readStdin();
    if (!stdin) {
      console.log('[HUD] No stdin');
      return;
    }




    // ── Line 1: Model  Directory  Branch (powerline 세그먼트) ──
    const segments = [];

    const version = stdin.version || '';
    const latest = getLatestVersion();
    const outdated = isOutdated(version, latest);
    const versionText = outdated ? `${version} \u21E1` : version;  // ⇡ 업데이트 있음
    segments.push({ text: versionText, color: outdated ? TN.amber : TN.lavender });

    const modelName = getModelName(stdin);
    const ctxSize = stdin.context_window?.context_window_size;
    const ctxLabel = ctxSize
      ? (ctxSize >= 1000000 ? `${Math.floor(ctxSize / 1000000)}M` : `${Math.floor(ctxSize / 1000)}k`)
      : '';
    segments.push({ text: `\uF2DB ${modelName}${ctxLabel ? `(${ctxLabel})` : ''}`, color: TN.blue });

    const effortLevel = getEffortLevel(stdin);
    if (effortLevel) {
      const effortLabel = EFFORT_LABEL[effortLevel] ?? effortLevel.toUpperCase();
      const effortColor = EFFORT_STYLE[effortLevel] ?? TN.lavender;
      segments.push({ text: effortLabel, color: effortColor });
    }

    const dirName = getDirName(stdin);
    segments.push({ text: `\uF07B ${dirName}`, color: TN.green });          //  folder

    const branch = getGitBranch(stdin);
    if (branch) {
      segments.push({ text: `\uE0A0 ${branch}`, color: TN.purple });       //  git branch
    }

    // ── Line 2: Rate Limits | Session | Context ──
    const line2 = [];

    const limitsStr = formatRateLimits(stdin.rate_limits);
    if (limitsStr) {
      line2.push(limitsStr);
    }

    // 모델별 주간 한도 (usage API, 2분 캐시) — Fable 등 weekly_scoped 버킷
    const scopedLimits = getScopedWeeklyLimits();
    if (scopedLimits) {
      const scopedStr = formatScopedWeekly(scopedLimits);
      if (scopedStr) line2.push(scopedStr);
    }

    const sessionStart = getSessionStartFromTranscript(stdin.transcript_path);
    if (sessionStart) {
      const durationMinutes = Math.floor((Date.now() - sessionStart.getTime()) / 60000);
      line2.push(`\uF017 ${colorSessionDuration(durationMinutes)}`);
    }

    const contextPercent = getContextPercent(stdin);
    line2.push(contextBar(contextPercent));

    // Output (each console.log = one statusline row)
    const sep = dim(' | ');
    console.log(joinSegments(segments).replace(/ /g, '\u00A0'));
    console.log(line2.join(sep).replace(/ /g, '\u00A0'));

  } catch (error) {
    console.log('[HUD] Error');
  }
}

main();
