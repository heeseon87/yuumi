#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file || file === '--help' || file === '-h') {
  console.log(`Usage: node skills/pretty/scripts/anthropic-similarity.mjs <artifact.html> [--json]\n\nScores a local HTML artifact against built-in Anthropic design profiles.\nThe score is static and inspectable: palette, typography, layout rhythm, components, and restraint.`);
  process.exit(file ? 0 : 1);
}

const html = fs.readFileSync(file, 'utf8');
const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? html);
const all = `${html}\n${styleBlocks}`.toLowerCase();

const PROFILES = [
  {
    name: 'claude.com product/platform profile',
    colors: ['#f5f4ed', '#faf9f5', '#141413', '#1f1e1d', '#30302e', '#c96442', '#d97757', '#c46849', '#e8e6dc', '#f0eee6', '#d1cfc5', '#b0aea5', '#87867f', '#5e5d59', '#4d4c48'],
    typography: {
      serif: ['anthropic serif', 'copernicus', 'tiempos', 'georgia', 'hahmlet'],
      sans: ['anthropic sans', 'styrene', 'inter', 'system-ui', '-apple-system', 'arial'],
      mono: ['anthropic mono', 'jetbrains mono', 'sfmono', 'menlo']
    }
  },
  {
    name: 'anthropic.com editorial/news profile',
    colors: ['#f4f4eb', '#f5f4ed', '#faf9f5', '#141413', '#000000', '#44443e', '#7c7c74', '#b0aea5', '#d47f2a', '#6e4216'],
    typography: {
      serif: ['anthropic serif', 'copernicus', 'tiempos', 'georgia', 'hahmlet'],
      sans: ['anthropic sans', 'styrene', 'inter', 'system-ui', '-apple-system', 'arial'],
      mono: ['anthropic mono', 'jetbrains mono', 'sfmono', 'menlo']
    }
  }
];

function hexToRgb(hex) {
  let s = hex.replace('#', '').trim();
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  if (s.length === 8) s = s.slice(0, 6);
  const n = Number.parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorDistance(a, b) {
  const ar = hexToRgb(a), br = hexToRgb(b);
  return Math.sqrt((ar[0] - br[0]) ** 2 + (ar[1] - br[1]) ** 2 + (ar[2] - br[2]) ** 2);
}

function extractColors(text) {
  const colors = new Set();
  for (const m of text.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
    let c = m[0].toLowerCase();
    if (c.length === 4) c = '#' + c.slice(1).split('').map((x) => x + x).join('');
    if (c.length === 9) c = c.slice(0, 7);
    colors.add(c);
  }
  return [...colors];
}

function hasAny(needles, haystack = all) {
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

function count(re, text = body) {
  return (text.match(re) || []).length;
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function scorePalette(profile, colors) {
  const hits = [];
  const misses = [];
  for (const target of profile.colors) {
    let best = Infinity;
    let bestColor = null;
    for (const c of colors) {
      const d = colorDistance(c, target);
      if (d < best) { best = d; bestColor = c; }
    }
    if (best <= 4) hits.push({ target, actual: bestColor, kind: 'exact' });
    else if (best <= 18) hits.push({ target, actual: bestColor, kind: 'near' });
    else misses.push(target);
  }
  const exact = hits.filter((h) => h.kind === 'exact').length;
  const near = hits.filter((h) => h.kind === 'near').length;
  const overlap = (exact + near * 0.65) / profile.colors.length;

  const warmNeutralCount = colors.filter((c) => {
    const [r, g, b] = hexToRgb(c);
    return r >= b && g >= b * 0.86 && Math.max(r, g, b) - Math.min(r, g, b) < 80;
  }).length;
  const warmDiscipline = colors.length ? warmNeutralCount / colors.length : 0;
  const gradientPenalty = Math.max(0, count(/linear-gradient|radial-gradient|conic-gradient/g, styleBlocks.toLowerCase()) - 1) * 3;

  return {
    score: clamp((overlap * 28) + (warmDiscipline * 7) - gradientPenalty, 0, 35),
    exact,
    near,
    misses,
    colorsFound: colors.length,
    warmDiscipline: Number(warmDiscipline.toFixed(3))
  };
}

function scoreTypography(profile) {
  let s = 0;
  const reasons = [];
  if (hasAny(profile.typography.serif)) { s += 4; reasons.push('serif-family'); }
  if (hasAny(profile.typography.mono)) { s += 3; reasons.push('mono-family'); }
  if (hasAny(profile.typography.sans) || all.includes('hahmlet')) { s += 2; reasons.push('body-family-or-cjk-substitute'); }
  if (/h1\s*\{[^}]*font-size\s*:\s*(5[2-9]|6[0-9]|7[0-2])px|h1\s*\{[^}]*font-size\s*:\s*(3\.2|3\.5|3\.75|4)rem/is.test(styleBlocks)) { s += 3; reasons.push('hero-scale'); }
  if (/h1\s*\{[^}]*line-height\s*:\s*1\.(0[3-9]|1[0-9]|2)/is.test(styleBlocks)) { s += 2; reasons.push('tight-heading-leading'); }
  if (/font-weight\s*:\s*500/.test(styleBlocks)) { s += 2; reasons.push('medium-weight-headings'); }
  if (/body\s*\{[^}]*font-size\s*:\s*(17|18|19|20)px/is.test(styleBlocks)) { s += 2; reasons.push('readable-body-size'); }
  if (/body\s*\{[^}]*line-height\s*:\s*1\.(5[5-9]|6|7|75|8)/is.test(styleBlocks)) { s += 2; reasons.push('generous-body-leading'); }
  return { score: clamp(s, 0, 20), reasons };
}

function scoreLayout() {
  let s = 0;
  const reasons = [];
  if (/\.container\s*\{[^}]*max-width\s*:\s*(10[4-9][0-9]|11[0-9][0-9]|12[0-8][0-9])px/is.test(styleBlocks)) { s += 4; reasons.push('anthropic-container-width'); }
  if (/\.container\s*\{[^}]*padding\s*:\s*(7[2-9]|8[0-9]|9[0-9])px/is.test(styleBlocks)) { s += 3; reasons.push('large-top-padding'); }
  if (/h2\s*\{[^}]*margin\s*:\s*(7[2-9]|8[0-9]|9[0-9])px/is.test(styleBlocks)) { s += 3; reasons.push('section-breathing-room'); }
  if (/border-radius\s*:\s*(8|12|16|24|32|999)px/g.test(styleBlocks)) { s += 3; reasons.push('rounded-scale'); }
  if (/@media\s*\([^)]*max-width\s*:\s*640px/is.test(styleBlocks)) { s += 2; reasons.push('mobile-breakpoint'); }
  return { score: clamp(s, 0, 15), reasons };
}

function scoreComponents() {
  let s = 0;
  const reasons = [];
  const checks = [
    [/class=["'][^"']*lede/i, 2, 'lede'],
    [/class=["'][^"']*meta/i, 2, 'metadata-block'],
    [/class=["'][^"']*callout/i, 3, 'clay-rail-callout'],
    [/class=["'][^"']*aside/i, 2, 'quiet-aside'],
    [/class=["'][^"']*steps/i, 2, 'ordered-step-list'],
    [/<figure[\s>]/i, 2, 'figure'],
    [/<svg[\s>]/i, 2, 'line-art-svg'],
    [/<pre[\s>][\s\S]*<code/i, 2, 'code-block'],
    [/<table[\s>]/i, 1.5, 'hairline-table'],
    [/class=["'][^"']*lesson/i, 1.5, 'lesson-block']
  ];
  for (const [re, pts, reason] of checks) {
    if (re.test(body)) { s += pts; reasons.push(reason); }
  }
  if (/border-left\s*:\s*2px\s+solid\s+var\(--accent\)/i.test(styleBlocks)) { s += 1.5; reasons.push('accent-left-rail-css'); }
  if (/border-top\s*:\s*1px\s+solid/i.test(styleBlocks) && /border-bottom\s*:\s*1px\s+solid/i.test(styleBlocks)) { s += 1.5; reasons.push('hairline-rules-css'); }
  return { score: clamp(s, 0, 20), reasons };
}

function scoreRestraint(colors) {
  let s = 10;
  const penalties = [];
  const gradientCount = count(/linear-gradient|radial-gradient|conic-gradient/g, styleBlocks.toLowerCase());
  if (gradientCount > 1) { s -= (gradientCount - 1) * 2; penalties.push(`gradients:${gradientCount}`); }
  const banned = ['glassmorphism', 'backdrop-filter', 'neon', 'rainbow', '#00ffff', '#ff00ff'];
  for (const b of banned) {
    if (all.includes(b)) { s -= 2; penalties.push(b); }
  }
  const saturated = colors.filter((c) => {
    const [r, g, b] = hexToRgb(c);
    return Math.max(r, g, b) - Math.min(r, g, b) > 150;
  }).length;
  if (saturated > 4) { s -= (saturated - 4); penalties.push(`saturated-colors:${saturated}`); }
  return { score: clamp(s, 0, 10), penalties };
}

const colors = extractColors(all);
const results = PROFILES.map((profile) => {
  const palette = scorePalette(profile, colors);
  const typography = scoreTypography(profile);
  const layout = scoreLayout();
  const components = scoreComponents();
  const restraint = scoreRestraint(colors);
  const score = palette.score + typography.score + layout.score + components.score + restraint.score;
  return {
    profile: profile.name,
    score: Number(score.toFixed(2)),
    breakdown: {
      palette: Number(palette.score.toFixed(2)),
      typography: Number(typography.score.toFixed(2)),
      layout: Number(layout.score.toFixed(2)),
      components: Number(components.score.toFixed(2)),
      restraint: Number(restraint.score.toFixed(2))
    },
    evidence: {
      palette,
      typography: typography.reasons,
      layout: layout.reasons,
      components: components.reasons,
      restraint: restraint.penalties
    }
  };
});

const best = results.reduce((a, b) => (b.score > a.score ? b : a), results[0]);
const output = {
  artifact: path.resolve(file),
  maxScore: best.score,
  bestProfile: best.profile,
  passed95: best.score >= 95,
  results
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(output, null, 2));
} else {
  console.log(`Anthropic similarity maxScore: ${output.maxScore.toFixed(2)} / 100`);
  console.log(`Best profile: ${output.bestProfile}`);
  console.log(`Passed >=95: ${output.passed95 ? 'yes' : 'no'}`);
  for (const r of output.results) {
    console.log(`\n${r.profile}: ${r.score.toFixed(2)}`);
    console.log(`  palette ${r.breakdown.palette} · typography ${r.breakdown.typography} · layout ${r.breakdown.layout} · components ${r.breakdown.components} · restraint ${r.breakdown.restraint}`);
    const misses = r.evidence.palette.misses || [];
    if (misses.length) console.log(`  missing colors: ${misses.join(', ')}`);
  }
}
