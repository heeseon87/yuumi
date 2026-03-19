#!/usr/bin/env node
/**
 * Custom HUD - Heeseon's Statusline
 *
 * Line 1: ModelName | DirName | Branch
 * Line 2: 5h:X% | wk:X% | session:Xm | ctx:X%
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { getUsage } from './usage-api.js';

// ============================================================================
// Stdin Parsing
// ============================================================================

async function readStdin() {
  if (process.stdin.isTTY) return null;

  const chunks = [];
  process.stdin.setEncoding('utf8');

  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }

  const raw = chunks.join('');
  if (!raw.trim()) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ============================================================================
// Data Extractors
// ============================================================================

function getModelName(stdin) {
  // stdin.model.display_name: Claude Code가 세션별로 전달하는 공식 표시용 값
  // "Sonnet 4.6" → "Sonnet", "Opus" → "Opus"
  const name = stdin.model?.display_name ?? stdin.model?.id ?? 'Unknown';
  return name.split(' ')[0];
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
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    // 긴 브랜치명 줄이기
    if (branch.length > 20) {
      return branch.substring(0, 17) + '...';
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

  // Calculate reset time in minutes from Date
  const getResetMinutes = (resetsAt) => {
    if (!resetsAt) return 0;
    const now = Date.now();
    const resetTime = resetsAt instanceof Date ? resetsAt.getTime() : new Date(resetsAt).getTime();
    return Math.max(0, Math.floor((resetTime - now) / 60000));
  };

  // 5-hour limit (usage-api returns fiveHourPercent and fiveHourResetsAt)
  if (typeof rateLimits.fiveHourPercent === 'number') {
    const raw = rateLimits.fiveHourPercent;
    const pct = Math.round(raw);
    const resetMinutes = getResetMinutes(rateLimits.fiveHourResetsAt);
    const reset = formatDuration(resetMinutes);
    // 5시간 = 300분, 경과 시간을 시간 단위로 변환, 5구간
    const elapsedHours = (300 - resetMinutes) / 60;
    // 색상은 원본 값으로 계산, 표시는 반올림
    const bar5h = allocationBar(raw, elapsedHours, 5);
    parts.push(`\u231B ${bar5h} ${colorAllocationPercent(pct, raw, elapsedHours, 5)}(${reset})`);
  }

  // Weekly limit (usage-api returns weeklyPercent and weeklyResetsAt)
  if (typeof rateLimits.weeklyPercent === 'number') {
    const raw = rateLimits.weeklyPercent;
    const pct = Math.round(raw);
    const resetMinutes = getResetMinutes(rateLimits.weeklyResetsAt);
    const reset = formatDuration(resetMinutes);
    // 168시간(7일), 경과 일수 계산, 7구간
    const elapsedDays = (168 - Math.max(1, resetMinutes / 60)) / 24;
    // 색상은 원본 값으로 계산, 표시는 반올림
    const bar7d = allocationBar(raw, elapsedDays, 7);
    parts.push(`\uD83D\uDCC5 ${bar7d} ${colorAllocationPercent(pct, raw, elapsedDays, 7)}(${reset})`);
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
// Colors (ANSI Truecolor - Tokyo Night palette)
// ============================================================================

const RST = '\x1b[0m';
const BOLD = '\x1b[1m';

// Truecolor helpers
const fg = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const bg = (r, g, b) => `\x1b[48;2;${r};${g};${b}m`;

// Tokyo Night palette
const TN = {
  blue:    { fg: fg(122, 162, 247), bg: bg(122, 162, 247) },  // #7aa2f7
  green:   { fg: fg(158, 206, 106), bg: bg(158, 206, 106) },  // #9ece6a
  purple:  { fg: fg(187, 154, 247), bg: bg(187, 154, 247) },  // #bb9af7
  cyan:    { fg: fg(125, 207, 255), bg: bg(125, 207, 255) },  // #7dcfff
  amber:   { fg: fg(224, 175, 104), bg: bg(224, 175, 104) },  // #e0af68
  coral:   { fg: fg(247, 118, 142), bg: bg(247, 118, 142) },  // #f7768e
  lavender:{ fg: fg(169, 177, 214), bg: bg(169, 177, 214) },  // #a9b1d6
  dark:    { fg: fg(26, 27, 38) },                              // #1a1b26
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
  return `${TN.cyan.fg}${pctStr}${RST}`;
};

// CShip 스타일 context progress bar: [████████░░] 32%
const contextBar = (percent, width = 10) => {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;

  // 바 색상: CShip Tokyo Night threshold 기준
  let barColorFg;
  if (percent >= 70) barColorFg = TN.coral.fg;
  else if (percent >= 40) barColorFg = TN.amber.fg;
  else barColorFg = TN.cyan.fg;

  const filledStr = '█'.repeat(filled);
  const emptyStr = '░'.repeat(empty);
  const bar = `${barColorFg}${filledStr}${RST}${dim(emptyStr)}`;
  const pct = colorPercent(percent);

  return `${barColorFg}\uF1C0${RST} ${bar} ${pct}`;
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
  const pctStr = `${displayPercent}%`;
  const level = getAllocationLevel(rawPercent, elapsed, totalPeriods);
  const style = LEVEL_STYLES[level];
  if (!style) return pctStr;
  return `${style.bold ? BOLD : ''}${style.fg}${pctStr}${RST}`;
};

// 이월/당겨쓰기 기반 프로그레스 바
const allocationBar = (usedPercent, elapsed, totalPeriods, width = 8) => {
  const filled = Math.round((usedPercent / 100) * width);
  const empty = width - filled;
  const level = getAllocationLevel(usedPercent, elapsed, totalPeriods);
  const style = LEVEL_STYLES[level];

  const filledStr = '█'.repeat(filled);
  const emptyStr = '░'.repeat(empty);

  if (!style) return `${filledStr}${dim(emptyStr)}`;
  return `${style.bold ? BOLD : ''}${style.fg}${filledStr}${RST}${dim(emptyStr)}`;
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

    const modelName = getModelName(stdin);
    segments.push({ text: `\uF2DB ${modelName}`, color: TN.blue });          //  microchip (CShip)

    const dirName = getDirName(stdin);
    segments.push({ text: `\uF07B ${dirName}`, color: TN.green });          //  folder

    const branch = getGitBranch(stdin);
    if (branch) {
      segments.push({ text: `\uE0A0 ${branch}`, color: TN.purple });       //  git branch
    }

    // ── Line 2: Rate Limits | Session | Context ──
    const line2 = [];

    try {
      const rateLimits = await getUsage();
      const limitsStr = formatRateLimits(rateLimits);
      if (limitsStr) {
        line2.push(limitsStr);
      }
      if (rateLimits?._error === 'auth') {
        line2.push(yellow('[auth]'));
      }
    } catch { /* continue without usage data */ }

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
