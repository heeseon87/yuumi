#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/pretty-qa.mjs <artifact.html>');
  process.exit(2);
}

let html;
try {
  html = readFileSync(file, 'utf8');
} catch (error) {
  console.error(`Could not read ${file}: ${error.message}`);
  process.exit(2);
}

const issues = [];
const warnings = [];
const add = (msg) => issues.push(msg);
const warn = (msg) => warnings.push(msg);
const unescapeAttr = (value) => value
  .replace(/&quot;/g, '"')
  .replace(/&#34;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
if (!title) add('Missing <title>.');
if (/^Explainer$/i.test(title)) add('Default <title>Explainer</title> remains.');

const lang = html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1]?.trim();
if (!lang) add('Missing <html lang="...">.');
if (lang && /^en\b/i.test(lang) && /[가-힣]/.test(html)) {
  add('Korean text detected but <html lang="en"> remains.');
}

if (/The body is intentionally empty/.test(html)) {
  add('Shell placeholder comment remains in the artifact body.');
}

const preCodeRe = /<pre\b([^>]*)>\s*<code\b([^>]*)>/gi;
let m;
while ((m = preCodeRe.exec(html))) {
  const preAttrs = m[1] || '';
  const codeAttrs = m[2] || '';
  const hasLangClass = /class=["'][^"']*\blanguage-[^"']+["']/i.test(codeAttrs);
  const hasDataLang = /\bdata-lang(uage)?=["'][^"']+["']/i.test(preAttrs + ' ' + codeAttrs);
  if (!hasLangClass && !hasDataLang) {
    add('Bare <pre><code> block found without language-* class or data-lang.');
    break;
  }
}

if (/<[^>]+\bclass=["'][^"']*\bmermaid\b[^"']*["'][^>]*>/i.test(html)) {
  add('Runtime Mermaid (.mermaid) found. Final artifacts should inline static SVG or use a smaller hand-drawn diagram.');
}

if (/<img\b(?![^>]*\balt=)[^>]*>/i.test(html)) {
  add('<img> without alt attribute found. Use alt="" only for decorative images.');
}

if (/<[^>]+\son[a-z]+\s*=/i.test(html)) {
  add('Inline event handler found (for example onclick=). Bind behavior in JS instead.');
}

const ids = new Set();
for (const idMatch of html.matchAll(/\bid=["']([^"']+)["']/gi)) ids.add(idMatch[1]);
for (const hrefMatch of html.matchAll(/<a\b[^>]*\bhref=["']#([^"']+)["'][^>]*>/gi)) {
  const target = hrefMatch[1];
  if (target && !ids.has(target)) add(`Anchor href="#${target}" has no matching id.`);
}

for (const tabMatch of html.matchAll(/\bdata-tab=["']([^"']+)["']/gi)) {
  const target = tabMatch[1];
  if (target && !ids.has(target)) add(`data-tab="${target}" has no matching tab-panel id.`);
}

let chartCount = 0;
for (const chartMatch of html.matchAll(/<([a-z0-9-]+)\b([^>]*?)\bdata-chart=(['"])([\s\S]*?)\3([^>]*)>/gi)) {
  chartCount += 1;
  const tag = chartMatch[1].toLowerCase();
  const raw = unescapeAttr(chartMatch[4]);
  if (tag !== 'canvas') add('[data-chart] must be placed on a <canvas> element for Chart.js.');
  try { JSON.parse(raw); }
  catch (error) { add(`Invalid JSON in data-chart: ${error.message}`); }
}
if (chartCount > 0 && !/<table\b/i.test(html)) {
  add('[data-chart] found but no source <table> exists in the artifact. Pair every chart with source data.');
}

for (const foldMatch of html.matchAll(/<details\b[^>]*\bclass=["'][^"']*\bfold\b[^"']*["'][^>]*>([\s\S]*?)<\/details>/gi)) {
  const body = foldMatch[1];
  if (/<h1\b/i.test(body) || /class=["'][^"']*\blede\b/i.test(body)) {
    add('A .fold appears to contain the main point (<h1> or .lede). Never fold the headline insight.');
  }
}

for (const figMatch of html.matchAll(/<figure\b[\s\S]*?<svg\b([^>]*)[\s\S]*?<\/svg>[\s\S]*?<\/figure>/gi)) {
  const attrs = figMatch[1] || '';
  const full = figMatch[0];
  const hidden = /aria-hidden=["']true["']/i.test(attrs);
  const labelled = /role=["']img["']/i.test(attrs) || /aria-labelledby=/i.test(attrs) || /<title\b/i.test(full);
  if (!hidden && !labelled) warn('A figure SVG lacks role="img"/aria-labelledby/<title>. Add an accessibility label if it is meaningful.');
}

if (issues.length) {
  console.error('Pretty QA failed:');
  for (const issue of issues) console.error(' - ' + issue);
  if (warnings.length) {
    console.error('\nWarnings:');
    for (const item of warnings) console.error(' - ' + item);
  }
  process.exit(1);
}

console.log('Pretty QA passed.');
if (warnings.length) {
  console.log('Warnings:');
  for (const item of warnings) console.log(' - ' + item);
}
