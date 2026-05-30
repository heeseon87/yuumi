# pretty 탐색·시각화 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `pretty` 스킬에 탐색형 골격(목차·접기·탭)·능동 위젯·정량 차트(지연 로딩)를 더하고, Anthropic 미학과 scan-safe를 유지하면서 표 너비 버그를 고친다.

**Architecture:** 완전 모놀리식 — 모든 CSS·인라인 JS는 `skills/pretty/assets/shell.html`에 상시 포함되고 모델은 마크업만 채운다. 무거운 라이브러리(Chart.js·Mermaid)만 shell 부트 JS가 페이지 내용(`[data-chart]`/`.mermaid`)을 감지했을 때 런타임에 핀 CDN으로 지연 로딩한다. 모든 인터랙션은 progressive enhancement(JS-off에서도 내용 100% 접근)로 설계한다.

**Tech Stack:** HTML5 / CSS(커스텀 프로퍼티 토큰) / 바닐라 인라인 JS(IntersectionObserver) / Chart.js 4(핀 CDN) / Mermaid 11(핀 CDN) / Node 22(검증 헬퍼, ESM). 빌드·테스트 파이프라인 없음 — 검증은 브라우저 렌더 + 콘솔 무에러로 한다.

**Branch:** `feat/pretty-explorable` (이미 생성됨, spec 커밋 포함).

---

## 검증 모델 (이 도메인 적응)

표준 단위테스트 프레임워크가 없으므로 각 shell.html 작업은 다음 리듬을 따른다:

1. **샘플 마크업 작성** — 새 컴포넌트를 쓰는 최소 HTML 조각을 `/tmp/sample.html`에 쓴다.
2. **현재 실패 확인** — 검증 헬퍼로 *현재* shell에 주입해 열고, 스타일/동작이 아직 없음을 눈으로 확인.
3. **shell.html 구현.**
4. **통과 확인** — 다시 주입·열기, 의도대로 렌더+동작+콘솔 무에러 확인.
5. **커밋.**

콘솔 에러는 브라우저 DevTools 콘솔, 또는 gstack `/browse`로 캡처한다(전역 설정상 chrome MCP 대신 `/browse` 사용). 라이브러리/차트 실패 시 부트 JS가 `document.documentElement.dataset`에 `prettyLibError`/`prettyChartError`를 남기므로 그것도 확인한다.

---

## File Structure

| 파일 | 책임 |
|------|------|
| `scripts/verify-pretty.mjs` | (신규) dev 검증 헬퍼 — 샘플 마크업을 shell에 주입해 열 수 있는 페이지 생성 |
| `skills/pretty/assets/shell.html` | 모든 CSS·인라인 JS·지연 로더의 단일 소스 |
| `skills/pretty/references/interaction-patterns.md` | (신규) 탐색 골격·능동 위젯 카탈로그 |
| `skills/pretty/references/data-viz.md` | (신규) 차트 라이브러리 결정 규칙·토큰 테마 |
| `skills/pretty/references/components.md` | 새 컴포넌트 포인터 추가 |
| `skills/pretty/references/svg-patterns.md` | 인터랙티브 SVG 노트 소량 추가 |
| `skills/pretty/SKILL.md` | 북극성·다이얼·워크플로·안티패턴·QA 개정 |
| `skills/pretty/examples/temp-page.html` | 새 역량 종합 데모 |
| `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json` | 버전 패치 +1 |

---

## Task 1: 검증 헬퍼 스크립트

**Files:**
- Create: `scripts/verify-pretty.mjs`

- [ ] **Step 1: 헬퍼 작성**

```js
#!/usr/bin/env node
// Dev-only QA helper for the pretty skill. Injects a sample-markup file into a
// fresh copy of shell.html and writes a ready-to-open verification page.
// Usage: node scripts/verify-pretty.mjs <sample-markup-file> [out.html]
import { readFileSync, writeFileSync } from 'node:fs';

const [, , sampleArg, outArg] = process.argv;
if (!sampleArg) {
  console.error('Usage: node scripts/verify-pretty.mjs <sample.html> [out.html]');
  process.exit(1);
}
const shellPath = new URL('../skills/pretty/assets/shell.html', import.meta.url);
const shell = readFileSync(shellPath, 'utf8');
const sample = readFileSync(sampleArg, 'utf8');
const marker = '<div class="container">';
if (!shell.includes(marker)) {
  console.error('container marker not found in shell.html');
  process.exit(1);
}
const out = outArg || '/tmp/pretty-verify.html';
writeFileSync(out, shell.replace(marker, marker + '\n' + sample + '\n'));
console.log(out);
```

- [ ] **Step 2: smoke 테스트**

```bash
printf '<p>hello</p>' > /tmp/sample.html
node scripts/verify-pretty.mjs /tmp/sample.html
```
Expected: `/tmp/pretty-verify.html` 출력, 에러 없음.

- [ ] **Step 3: 렌더 확인**

Run: `open /tmp/pretty-verify.html`
Expected: 양피지 배경에 "hello" 단락이 보임(기존 shell이 정상).

- [ ] **Step 4: 커밋**

```bash
git add scripts/verify-pretty.mjs
git commit -m "chore: add pretty verify helper for browser QA"
```

---

## Task 2: 표 열 너비 버그 픽스

**Files:**
- Modify: `skills/pretty/assets/shell.html` (표 CSS, 488–509행 근처)

배경: 전역 `overflow-wrap: anywhere`(72–73행)가 `table-layout: auto`와 겹쳐 셀 최소 너비를 0으로 만들어 짧은 셀이 여러 줄로 접힘.

- [ ] **Step 1: 실패 재현 샘플**

`/tmp/sample.html`:
```html
<table>
<thead><tr><th>Method</th><th>Status</th><th>Owner</th><th>Note</th></tr></thead>
<tbody>
<tr><td>POST</td><td>200 OK</td><td>auth-team</td><td>정상 동작</td></tr>
<tr><td>GET</td><td>404</td><td>auth-team</td><td>경로 없음</td></tr>
</tbody>
</table>
```

- [ ] **Step 2: 현재 실패 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: `200 OK`, `auth-team` 같은 짧은 셀이 부자연스럽게 2~3줄로 접힘.

- [ ] **Step 3: shell.html 수정** — `td code { font-size: 13.5px; }`(509행) 바로 뒤에 추가:

```css
	/* Cells should not break on every character — the global overflow-wrap:anywhere
	   (set on body for long URLs/code) otherwise collapses short cells to 2-3 lines. */
	th, td { overflow-wrap: normal; word-break: normal; }
	.col-tight { white-space: nowrap; }
```

- [ ] **Step 4: 통과 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 짧은 셀이 한 줄로 표시됨. 긴 본문 셀은 여전히 정상 줄바꿈.

- [ ] **Step 5: 커밋**

```bash
git add skills/pretty/assets/shell.html
git commit -m "fix: stop table cells wrapping short content (overflow-wrap leak)"
```

---

## Task 3: 접이식 섹션 (`<details>`/`<summary>`)

**Files:**
- Modify: `skills/pretty/assets/shell.html` (CSS 추가, Task 2 블록 뒤)

- [ ] **Step 1: 샘플**

`/tmp/sample.html`:
```html
<details class="fold" open>
  <summary>요점 — 먼저 보이는 부분</summary>
  <p>펼쳐진 본문. 첫 화면엔 이 정도만.</p>
</details>
<details class="fold">
  <summary>심화 — 기본 접힘</summary>
  <p>깊이 파고들 독자만 펼치는 내용.</p>
</details>
```

- [ ] **Step 2: 현재 실패 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 브라우저 기본 삼각형 + 무스타일 — 가족 미학과 안 맞음.

- [ ] **Step 3: shell.html에 CSS 추가**

```css
	/* Collapsible section — progressive disclosure. Open by default in source so
	   JS-off / print still shows everything. */
	.fold { border-top: 1px solid var(--rule); margin: 8px 0; }
	.fold > summary {
		list-style: none; cursor: pointer; padding: 16px 0;
		font-family: 'Hahmlet', Georgia, serif; font-size: 19px; color: var(--text);
		display: flex; align-items: baseline; gap: 12px;
	}
	.fold > summary::-webkit-details-marker { display: none; }
	.fold > summary::before {
		content: "›"; color: var(--accent); font-size: 18px;
		transition: transform 0.18s ease; transform: translateY(-1px);
	}
	.fold[open] > summary::before { transform: rotate(90deg) translateX(-1px); }
	.fold > summary:hover { color: var(--accent-deep); }
	.fold > *:not(summary) { margin-left: 24px; }
	@media (prefers-reduced-motion: reduce) {
		.fold > summary::before { transition: none; }
	}
```

확인: shell은 폰트를 변수가 아니라 `'Hahmlet', Georgia, serif`로 직접 쓴다(67행). 위 값은 그 본문 세리프 스택과 동일.

- [ ] **Step 4: 통과 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: clay `›` 마커가 펼침 시 90° 회전, hairline 상단선, summary는 세리프. 두 번째 항목은 접힌 상태.

- [ ] **Step 5: 커밋**

```bash
git add skills/pretty/assets/shell.html
git commit -m "feat: add collapsible .fold section for progressive disclosure"
```

---

## Task 4: sticky 목차 + scrollspy

**Files:**
- Modify: `skills/pretty/assets/shell.html` (CSS + 부트 JS 추가)

마크업 규약: `<nav class="toc">` 안에 `<a href="#id">`, 본문 `<h2 id="id">`. 데스크톱은 본문 우측에 sticky, 모바일은 상단 접이식.

- [ ] **Step 1: 샘플**

`/tmp/sample.html`:
```html
<nav class="toc" aria-label="목차">
  <a href="#s1">개요</a>
  <a href="#s2">구조</a>
  <a href="#s3">검증</a>
</nav>
<h2 id="s1">개요</h2><p style="min-height:90vh">…긴 본문…</p>
<h2 id="s2">구조</h2><p style="min-height:90vh">…긴 본문…</p>
<h2 id="s3">검증</h2><p style="min-height:90vh">…긴 본문…</p>
```

- [ ] **Step 2: 현재 실패 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 목차가 평범한 링크 목록, 스크롤해도 현재 위치 표시 없음.

- [ ] **Step 3: CSS 추가**

```css
	/* Sticky table of contents with scrollspy. */
	.toc {
		position: sticky; top: 24px; float: right; width: 200px;
		margin: 8px 0 24px 32px; padding-left: 16px;
		border-left: 1px solid var(--rule);
		font-size: 13px; line-height: 1.9;
	}
	.toc a {
		display: block; color: var(--text-faint); text-decoration: none;
		border-left: 2px solid transparent; margin-left: -17px; padding-left: 15px;
		transition: color 0.15s ease, border-color 0.15s ease;
	}
	.toc a:hover { color: var(--text-dim); }
	.toc a.active { color: var(--accent-deep); border-left-color: var(--accent); }
	@media (max-width: 880px) {
		.toc { position: static; float: none; width: auto; margin: 0 0 24px;
			border-left: none; border-top: 1px solid var(--rule);
			border-bottom: 1px solid var(--rule); padding: 12px 0; }
		.toc a { display: inline-block; margin: 0 14px 0 0; border-left: none; padding-left: 0; }
		.toc a.active { border-left: none; }
	}
	@media (prefers-reduced-motion: reduce) { .toc a { transition: none; } }
```

- [ ] **Step 4: 부트 JS 추가** — shell 하단 마지막 `<script>` 블록(애니메이션 컨트롤러 근처) 뒤에 새 `<script>`로:

```html
<script>
/* TOC scrollspy — highlights the section currently in view. No-op if no .toc. */
(function () {
	var toc = document.querySelector('.toc');
	if (!toc || !('IntersectionObserver' in window)) return;
	var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
	var byId = {};
	links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
	var targets = links
		.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); })
		.filter(Boolean);
	if (!targets.length) return;
	var obs = new IntersectionObserver(function (entries) {
		entries.forEach(function (en) {
			if (!en.isIntersecting) return;
			links.forEach(function (l) { l.classList.remove('active'); });
			var a = byId[en.target.id];
			if (a) a.classList.add('active');
		});
	}, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
	targets.forEach(function (t) { obs.observe(t); });
})();
</script>
```

- [ ] **Step 5: 통과 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 우측 sticky 목차, 스크롤하면 현재 섹션이 clay로 하이라이트. 880px 이하로 창 줄이면 상단 가로 목차로 전환. 콘솔 무에러.

- [ ] **Step 6: 커밋**

```bash
git add skills/pretty/assets/shell.html
git commit -m "feat: add sticky TOC with scrollspy for long-page navigation"
```

---

## Task 5: 탭 컴포넌트 (progressive enhancement)

**Files:**
- Modify: `skills/pretty/assets/shell.html` (CSS + JS)

원칙: 소스에는 모든 패널이 보이는 상태. JS가 초기화 시 `data-tabs`에 `tabs-on` 클래스를 붙이고 첫 패널 외를 숨김 → JS-off면 전부 펼쳐져 내용 접근 보장.

- [ ] **Step 1: 샘플**

`/tmp/sample.html`:
```html
<div class="tabs" data-tabs>
  <div class="tab-bar" role="tablist">
    <button class="tab" role="tab" data-tab="tk">Kotlin</button>
    <button class="tab" role="tab" data-tab="ts">SQL</button>
  </div>
  <div class="tab-panel" id="tk"><pre><code class="language-kotlin">val x = 1</code></pre></div>
  <div class="tab-panel" id="ts"><pre><code class="language-sql">SELECT 1;</code></pre></div>
</div>
```

- [ ] **Step 2: 현재 실패 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 버튼 2개가 무스타일, 패널 둘 다 그냥 세로로 보임.

- [ ] **Step 3: CSS 추가**

```css
	/* Tabs — switch parallel views (e.g. language variants). JS-off shows all panels. */
	.tab-bar { display: none; gap: 4px; border-bottom: 1px solid var(--rule); margin: 24px 0 0; }
	.tabs-on .tab-bar { display: flex; }
	.tab {
		background: none; border: none; cursor: pointer;
		font-family: inherit; font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase;
		color: var(--text-faint); padding: 10px 14px; margin-bottom: -1px;
		border-bottom: 2px solid transparent;
	}
	.tab:hover { color: var(--text-dim); }
	.tab[aria-selected="true"] { color: var(--accent-deep); border-bottom-color: var(--accent); }
	.tabs-on .tab-panel[hidden] { display: none; }
	.tabs-on .tab-panel { margin-top: 20px; }
```

- [ ] **Step 4: JS 추가** (새 `<script>` 또는 기존 부트 블록 안)

```html
<script>
/* Tabs — progressive enhancement. Without JS all panels stay visible. */
(function () {
	document.querySelectorAll('[data-tabs]').forEach(function (group) {
		var tabs = Array.prototype.slice.call(group.querySelectorAll('.tab'));
		var panels = Array.prototype.slice.call(group.querySelectorAll('.tab-panel'));
		if (!tabs.length || !panels.length) return;
		group.classList.add('tabs-on');
		function select(id) {
			tabs.forEach(function (t) { t.setAttribute('aria-selected', String(t.getAttribute('data-tab') === id)); });
			panels.forEach(function (p) { p.hidden = (p.id !== id); });
		}
		tabs.forEach(function (t) {
			t.addEventListener('click', function () { select(t.getAttribute('data-tab')); });
		});
		select(tabs[0].getAttribute('data-tab'));
	});
})();
</script>
```

- [ ] **Step 5: 통과 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 탭 바가 보이고, Kotlin 패널만 표시. SQL 클릭 시 전환, 선택 탭 clay 밑줄. 콘솔 무에러.

- [ ] **Step 6: 커밋**

```bash
git add skills/pretty/assets/shell.html
git commit -m "feat: add progressive-enhancement tabs for parallel views"
```

---

## Task 6: 각주 호버 팝오버

**Files:**
- Modify: `skills/pretty/assets/shell.html` (CSS만)

`<sup>` 참조에 hover/focus 시 각주 텍스트를 인라인 미리보기. 순수 CSS(접근성: focus도 지원).

- [ ] **Step 1: 샘플**

`/tmp/sample.html`:
```html
<p>본문 주장입니다<sup class="fnref"><a href="#fn1" tabindex="0" data-note="이게 호버 시 보이는 각주 내용입니다.">1</a></sup>.</p>
<ol class="footnotes"><li id="fn1">이게 호버 시 보이는 각주 내용입니다.</li></ol>
```

- [ ] **Step 2: 현재 실패 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 각주 번호 클릭 시 페이지 하단으로 점프할 뿐, 호버 미리보기 없음.

- [ ] **Step 3: CSS 추가**

```css
	/* Footnote hover/focus popover — preview without losing reading place. */
	.fnref { position: relative; }
	.fnref > a { text-decoration: none; color: var(--accent); }
	.fnref > a[data-note]:hover::after,
	.fnref > a[data-note]:focus::after {
		content: attr(data-note);
		position: absolute; left: 0; top: 1.6em; z-index: 5;
		width: max-content; max-width: 280px;
		background: var(--surface); color: var(--text-dim);
		border: 1px solid var(--rule-strong); border-radius: 3px;
		padding: 10px 12px; font-size: 13.5px; line-height: 1.6;
		box-shadow: 0 4px 14px rgba(20,20,19,0.08);
	}
```

- [ ] **Step 4: 통과 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 각주 번호에 마우스 올리거나 Tab 포커스 시 작은 팝오버로 각주 내용 표시.

- [ ] **Step 5: 커밋**

```bash
git add skills/pretty/assets/shell.html
git commit -m "feat: add footnote hover/focus popover"
```

---

## Task 7: before/after 슬라이더 위젯

**Files:**
- Modify: `skills/pretty/assets/shell.html` (CSS + JS)

두 상태(이전/이후)를 겹쳐 두고 range 입력으로 클립 비율 조절. JS-off면 두 블록이 위아래로 다 보임.

- [ ] **Step 1: 샘플**

`/tmp/sample.html`:
```html
<div class="ba" data-before-after>
  <div class="ba-stage">
    <div class="ba-after"><pre><code class="language-diff">+ 개선 후 코드</code></pre></div>
    <div class="ba-before"><pre><code class="language-diff">- 개선 전 코드</code></pre></div>
  </div>
  <label class="ba-control">이전 ↔ 이후
    <input type="range" min="0" max="100" value="50" aria-label="이전 이후 비교">
  </label>
</div>
```

- [ ] **Step 2: 현재 실패 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 두 코드블록과 슬라이더가 무스타일로 세로 나열, 겹침/클립 없음.

- [ ] **Step 3: CSS 추가**

```css
	/* Before/after compare — reader drags to reveal. JS-off shows both stacked. */
	.ba-stage { position: relative; }
	.ba-control { display: none; }
	.ba-on .ba-control {
		display: flex; align-items: center; gap: 12px; margin-top: 12px;
		font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-faint);
	}
	.ba-on .ba-control input[type="range"] { flex: 1; accent-color: var(--accent); }
	.ba-on .ba-stage { display: grid; }
	.ba-on .ba-stage > .ba-before, .ba-on .ba-stage > .ba-after { grid-area: 1 / 1; }
	.ba-on .ba-after { clip-path: inset(0 0 0 var(--split, 50%)); }
	.ba-on .ba-before { clip-path: inset(0 calc(100% - var(--split, 50%)) 0 0); }
```

- [ ] **Step 4: JS 추가**

```html
<script>
/* Before/after — progressive enhancement. */
(function () {
	document.querySelectorAll('[data-before-after]').forEach(function (el) {
		var range = el.querySelector('input[type="range"]');
		var stage = el.querySelector('.ba-stage');
		if (!range || !stage) return;
		el.classList.add('ba-on');
		function apply() { stage.style.setProperty('--split', range.value + '%'); }
		range.addEventListener('input', apply);
		apply();
	});
})();
</script>
```

- [ ] **Step 5: 통과 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 슬라이더를 끌면 이전/이후 코드가 좌우로 드러남. 콘솔 무에러.

- [ ] **Step 6: 커밋**

```bash
git add skills/pretty/assets/shell.html
git commit -m "feat: add before/after compare slider widget"
```

---

## Task 8: 단계별 stepper 위젯

**Files:**
- Modify: `skills/pretty/assets/shell.html` (CSS + JS)

시퀀스/변환을 한 단계씩. JS-off면 모든 단계가 번호와 함께 세로로 보임.

- [ ] **Step 1: 샘플**

`/tmp/sample.html`:
```html
<div class="stepper" data-stepper>
  <ol class="stepper-track">
    <li class="stepper-step"><strong>1. 요청 수신</strong><p>클라이언트가 POST.</p></li>
    <li class="stepper-step"><strong>2. 검증</strong><p>토큰 확인.</p></li>
    <li class="stepper-step"><strong>3. 응답</strong><p>200 반환.</p></li>
  </ol>
  <div class="stepper-nav">
    <button class="stepper-prev" aria-label="이전 단계">‹</button>
    <span class="stepper-count"></span>
    <button class="stepper-next" aria-label="다음 단계">›</button>
  </div>
</div>
```

- [ ] **Step 2: 현재 실패 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 3단계가 모두 보이고 버튼은 무스타일·무동작.

- [ ] **Step 3: CSS 추가**

```css
	/* Stepper — walk a sequence one step at a time. JS-off shows all steps. */
	.stepper-step { list-style: none; padding: 4px 0; }
	.stepper-nav { display: none; }
	.stepper-on .stepper-nav {
		display: flex; align-items: center; gap: 16px; margin-top: 16px;
		font-size: 13px; color: var(--text-faint);
	}
	.stepper-on .stepper-nav button {
		background: none; border: 1px solid var(--rule-strong); border-radius: 3px;
		width: 32px; height: 32px; cursor: pointer; color: var(--accent); font-size: 16px;
	}
	.stepper-on .stepper-nav button:disabled { color: var(--text-faint); cursor: default; opacity: 0.4; }
	.stepper-on .stepper-step { display: none; }
	.stepper-on .stepper-step.current { display: block; }
```

- [ ] **Step 4: JS 추가**

```html
<script>
/* Stepper — progressive enhancement. */
(function () {
	document.querySelectorAll('[data-stepper]').forEach(function (el) {
		var steps = Array.prototype.slice.call(el.querySelectorAll('.stepper-step'));
		var prev = el.querySelector('.stepper-prev');
		var next = el.querySelector('.stepper-next');
		var count = el.querySelector('.stepper-count');
		if (steps.length < 2 || !prev || !next) return;
		el.classList.add('stepper-on');
		var i = 0;
		function render() {
			steps.forEach(function (s, n) { s.classList.toggle('current', n === i); });
			if (count) count.textContent = (i + 1) + ' / ' + steps.length;
			prev.disabled = (i === 0);
			next.disabled = (i === steps.length - 1);
		}
		prev.addEventListener('click', function () { if (i > 0) { i--; render(); } });
		next.addEventListener('click', function () { if (i < steps.length - 1) { i++; render(); } });
		render();
	});
})();
</script>
```

- [ ] **Step 5: 통과 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 한 단계만 표시, ‹/› 로 이동, "1 / 3" 카운터, 양끝에서 버튼 비활성. 콘솔 무에러.

- [ ] **Step 6: 커밋**

```bash
git add skills/pretty/assets/shell.html
git commit -m "feat: add stepper widget for sequential walkthroughs"
```

---

## Task 9: 필터 가능한 표 위젯

**Files:**
- Modify: `skills/pretty/assets/shell.html` (CSS + JS)

행이 많은 표에 키워드 필터. JS-off면 입력창 숨고 표는 전체 표시.

- [ ] **Step 1: 샘플**

`/tmp/sample.html`:
```html
<div class="t-wrap" data-filter-table>
  <input class="table-filter" type="search" placeholder="필터…" aria-label="표 필터">
  <table>
    <thead><tr><th>키</th><th>설명</th></tr></thead>
    <tbody>
      <tr><td>alpha</td><td>첫 번째</td></tr>
      <tr><td>beta</td><td>두 번째</td></tr>
      <tr><td>gamma</td><td>세 번째</td></tr>
    </tbody>
  </table>
</div>
```

- [ ] **Step 2: 현재 실패 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 입력창 무스타일·무동작, 표 전체 표시.

- [ ] **Step 3: CSS 추가**

```css
	/* Filterable table — for long tables (15+ rows). JS-off hides the input. */
	.table-filter { display: none; }
	.filter-on .table-filter {
		display: block; width: 100%; box-sizing: border-box; margin: 0 0 12px;
		font-family: inherit; font-size: 14px; color: var(--text);
		background: var(--surface); border: 1px solid var(--rule-strong);
		border-radius: 3px; padding: 9px 12px;
	}
	.filter-on .table-filter:focus { outline: none; border-color: var(--accent); }
	.filter-on tr[hidden] { display: none; }
```

- [ ] **Step 4: JS 추가**

```html
<script>
/* Filterable table — progressive enhancement. */
(function () {
	document.querySelectorAll('[data-filter-table]').forEach(function (wrap) {
		var input = wrap.querySelector('.table-filter');
		var rows = Array.prototype.slice.call(wrap.querySelectorAll('tbody tr'));
		if (!input || !rows.length) return;
		wrap.classList.add('filter-on');
		input.addEventListener('input', function () {
			var q = input.value.trim().toLowerCase();
			rows.forEach(function (r) {
				r.hidden = q !== '' && r.textContent.toLowerCase().indexOf(q) === -1;
			});
		});
	});
})();
</script>
```

- [ ] **Step 5: 통과 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 입력창에 "beta" 입력 시 해당 행만 남음. 비우면 전체 복귀. 콘솔 무에러.

- [ ] **Step 6: 커밋**

```bash
git add skills/pretty/assets/shell.html
git commit -m "feat: add filterable table widget for long tables"
```

---

## Task 10: 라이브러리 지연 로더 + 토큰 테마

**Files:**
- Modify: `skills/pretty/assets/shell.html` (부트 JS 추가)

Chart.js·Mermaid를 페이지에 해당 요소가 있을 때만 핀 CDN에서 주입하고 shell 토큰으로 테마.

- [ ] **Step 1: 샘플 (차트 + Mermaid 동시)**

`/tmp/sample.html`:
```html
<figure>
  <canvas data-chart='{"type":"bar","data":{"labels":["A","B","C"],"datasets":[{"label":"건수","data":[12,19,7]}]}}'></canvas>
  <figcaption><span class="fig-num">Fig 1</span> 막대 차트.</figcaption>
</figure>
<table><thead><tr><th>구분</th><th>건수</th></tr></thead>
<tbody><tr><td>A</td><td>12</td></tr><tr><td>B</td><td>19</td></tr><tr><td>C</td><td>7</td></tr></tbody></table>
<div class="mermaid">graph LR; 요청-->검증-->응답;</div>
```

- [ ] **Step 2: 현재 실패 확인**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 빈 canvas, mermaid 텍스트가 그대로 노출, 차트/다이어그램 안 그려짐.

- [ ] **Step 3: 부트 JS 추가** (shell 하단 새 `<script>`)

```html
<script>
/* Heavy-library lazy loader — only fetches Chart.js / Mermaid when the page
   actually uses them. Pinned CDN (scan-safe, same pattern as PrismJS). */
(function () {
	var PINS = {
		chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js',
		mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js'
	};
	function token(name, fallback) {
		var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
		return v || fallback;
	}
	function inject(src, onload) {
		var s = document.createElement('script');
		s.src = src; s.async = true;
		s.onload = onload;
		s.onerror = function () { document.documentElement.dataset.prettyLibError = src; };
		document.head.appendChild(s);
	}
	if (document.querySelector('[data-chart]')) {
		inject(PINS.chart, function () {
			if (!window.Chart) return;
			Chart.defaults.color = token('--text-dim', '#5e5d59');
			Chart.defaults.borderColor = token('--rule', '#e8e6dc');
			Chart.defaults.font.family = "'JetBrains Mono', ui-monospace, monospace";
			var accent = token('--accent', '#c96442');
			document.querySelectorAll('[data-chart]').forEach(function (el) {
				try {
					var cfg = JSON.parse(el.getAttribute('data-chart'));
					(cfg.data.datasets || []).forEach(function (ds) {
						if (ds.backgroundColor === undefined) ds.backgroundColor = accent;
						if (ds.borderColor === undefined) ds.borderColor = accent;
					});
					new Chart(el, cfg);
				} catch (e) { document.documentElement.dataset.prettyChartError = e.message; }
			});
		});
	}
	if (document.querySelector('.mermaid')) {
		inject(PINS.mermaid, function () {
			if (!window.mermaid) return;
			try {
				mermaid.initialize({
					startOnLoad: true, theme: 'base',
					themeVariables: {
						primaryColor: token('--surface', '#faf9f5'),
						primaryTextColor: token('--text', '#141413'),
						primaryBorderColor: token('--rule-strong', '#d1cfc5'),
						lineColor: token('--text-dim', '#5e5d59'),
						fontFamily: "'JetBrains Mono', ui-monospace, monospace"
					}
				});
			} catch (e) { document.documentElement.dataset.prettyMermaidError = e.message; }
		});
	}
})();
</script>
```

- [ ] **Step 4: 통과 확인 (차트 페이지)**

```bash
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: 막대 차트가 clay 색으로 렌더, mermaid 흐름도가 토큰 색으로 렌더. 콘솔 무에러, `document.documentElement.dataset`에 `prettyLibError` 등 없음(DevTools 콘솔에 `document.documentElement.dataset` 입력해 확인).

- [ ] **Step 5: 지연 로딩 확인 (차트 없는 페이지)**

```bash
printf '<p>차트 없는 페이지</p>' > /tmp/sample.html
node scripts/verify-pretty.mjs /tmp/sample.html && open /tmp/pretty-verify.html
```
Expected: DevTools Network 탭에 `chart.umd.min.js`·`mermaid.min.js` 요청이 **없음**(지연 로딩 정상). gstack `/browse`의 network 조회로도 확인 가능.

- [ ] **Step 6: 커밋**

```bash
git add skills/pretty/assets/shell.html
git commit -m "feat: lazy-load Chart.js/Mermaid only when page uses them, themed by tokens"
```

---

## Task 11: 접근성·반응형 마무리

**Files:**
- Modify: `skills/pretty/assets/shell.html`

신규 인터랙션의 모션·포커스·반응형 마감. (대부분 각 Task에 이미 포함 — 여기서 누락분 점검·보강.)

- [ ] **Step 1: prefers-reduced-motion 일괄 점검** — 다음 블록을 shell CSS 끝(또는 기존 `@media (prefers-reduced-motion)` 블록)에 통합:

```css
	@media (prefers-reduced-motion: reduce) {
		.fold > summary::before, .toc a, .tab { transition: none !important; }
	}
```

- [ ] **Step 2: 키보드 포커스 가시성** — 신규 인터랙티브 요소에 포커스 링:

```css
	.tab:focus-visible, .stepper-nav button:focus-visible,
	.toc a:focus-visible, .fold > summary:focus-visible {
		outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px;
	}
```

- [ ] **Step 3: JS-off fallback 감사** — 모든 위젯 샘플을 한 파일에 합쳐 검증:

```bash
cat /tmp/sample-all.html  # Task 3~10 샘플을 모두 이어붙여 작성
node scripts/verify-pretty.mjs /tmp/sample-all.html && open /tmp/pretty-verify.html
```
그다음 브라우저에서 JS 비활성화(DevTools → Settings → Disable JavaScript) 후 새로고침.
Expected: 탭 패널 모두 보임 / 접이식 첫 항목 열림 / stepper 전 단계 보임 / 필터 입력창 숨김 / 차트 자리엔 데이터 표 남음 — **모든 내용 접근 가능**.

- [ ] **Step 4: 모바일 점검** — 창을 375px 폭으로 줄여 목차가 상단 가로형으로 전환되는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add skills/pretty/assets/shell.html
git commit -m "feat: a11y + responsive polish for interactive components"
```

---

## Task 12: `references/interaction-patterns.md` 신규

**Files:**
- Create: `skills/pretty/references/interaction-patterns.md`

`components.md` 형식("무엇을 위한 것 / 어떤 인지 부하를 더는가 / 언제 쓰지 말아야 하는가")을 그대로 따른다.

- [ ] **Step 1: 파일 작성** — 아래 전체 내용:

```markdown
# Interaction & Navigation Patterns

A catalog of the interactive components baked into `../assets/shell.html`. Same rule as `components.md`: each entry says what it's *for* and which mental burden it removes. **A palette, not a checklist.** Every component degrades gracefully — with JS off, all content stays reachable. Never hide essential information behind an interaction.

## Navigation scaffold

### `.toc` — sticky table of contents (scrollspy)
A right-rail (desktop) / top strip (mobile) `<nav>` of anchor links. The current section auto-highlights as the reader scrolls. **Removes:** "where am I in a long document" navigation burden. **Use when:** the page has 4+ `<h2>` sections or scrolls past ~3 viewports. **Don't use:** short single-idea pages — the rail is noise.

### `.fold` — collapsible `<details>` section
Hairline-topped section with a clay disclosure marker. Open in source (JS-off shows everything). **Removes:** first-screen overload — keep the headline visible, defer depth. **Use when:** a section is optional depth (proofs, edge cases, full logs). **Don't use:** to hide the page's main point. The lede and core claim must never be folded.

### `.tabs` — parallel-view switcher
A tab bar over `.tab-panel`s. JS-off shows all panels stacked. **Removes:** the burden of scrolling between equivalent alternatives. **Use when:** content is genuinely parallel (same idea in Kotlin vs SQL, three deployment targets). **Don't use:** for sequential content (use `.stepper`) or unrelated sections.

### `.fnref` footnote popover
`<sup>` reference that previews its note on hover/focus. **Removes:** the jump-to-bottom-and-back round trip. **Use when:** tangents/citations the reader may want without leaving their place. Always keep the real `.footnotes` list too (fallback + print).

## Active widgets (use only when justified)

### `[data-before-after]` — compare slider
Overlays two states; a range input clips between them. JS-off stacks both. **Removes:** mental diffing of two states. **Use when:** before/after is the whole point (refactor, config change, design tweak). **Don't use:** for more than two states, or where a side-by-side `<table>` reads clearer.

### `[data-stepper]` — sequential walkthrough
Shows one `.stepper-step` at a time with prev/next. JS-off shows all steps numbered. **Removes:** holding a multi-step process in working memory all at once. **Use when:** order matters and steps are heavy enough that seeing one at a time aids focus. **Don't use:** for a short ordered list (use `.steps`).

### `[data-filter-table]` — filterable table
A search input that hides non-matching rows. JS-off hides the input, shows all rows. **Removes:** scanning a long table for a few rows. **Use when:** 15+ rows. **Don't use:** small tables — the input is overhead.

## The rule
Add an interaction only when you can name the burden it removes. "It feels more interactive" is not a reason. Interactions are an accessibility contract: the page must be fully usable, and the main point fully visible, with no JS at all.
```

- [ ] **Step 2: 형식 검증**

```bash
grep -c "Removes:" skills/pretty/references/interaction-patterns.md
```
Expected: 6 이상 (각 패턴이 인지 부하를 명명).

- [ ] **Step 3: 커밋**

```bash
git add skills/pretty/references/interaction-patterns.md
git commit -m "docs: add interaction-patterns reference catalog"
```

---

## Task 13: `references/data-viz.md` 신규

**Files:**
- Create: `skills/pretty/references/data-viz.md`

- [ ] **Step 1: 파일 작성** — 아래 전체 내용:

```markdown
# Data Visualization — when to reach past inline SVG

Inline SVG (see `svg-patterns.md`) is the default for qualitative and relational diagrams — it carries the line-art Anthropic look. Reach for a library ONLY when the data is genuinely quantitative or the graph is too large to hand-draw.

## Decision rule
- **Relationship / sequence / branch / architecture** → inline SVG. Always.
- **Quantitative series** (bars, lines, distributions, real numbers to scale) → Chart.js.
- **Large auto-laid graph** (many nodes/edges, flowcharts you won't hand-place) → Mermaid.
- If a 3-row comparison fits a `<table>` or prose, use that. A chart for 3 numbers is slop.

## How loading works (do nothing special)
The shell lazy-loads Chart.js / Mermaid from a pinned CDN **only when** the page contains `[data-chart]` or `.mermaid`. You just write the element; the boot script injects the library and themes it with the shell tokens. Pages without charts never fetch the library.

## Chart.js
Put a Chart.js config (JSON) in `data-chart` on a `<canvas>`:

    <canvas data-chart='{"type":"line","data":{"labels":["1월","2월"],"datasets":[{"label":"요청","data":[10,24]}]}}'></canvas>

- Colors default to the clay accent and token grid/text — leave them unset to stay on-palette.
- **Always pair a chart with its source data table** (accessibility + JS-off fallback + fact-check).
- Keep it one idea per chart. No dual axes unless the comparison demands it.

## Mermaid
Put diagram source in a `<div class="mermaid">`:

    <div class="mermaid">graph LR; 요청-->검증-->응답;</div>

- Themed to `base` with shell tokens automatically.
- Prefer Mermaid for *draft / large* graphs. For a small, finished, on-brand diagram, hand-drawn inline SVG still looks better.

## Anti-patterns
- A chart where a sentence would do.
- A chart with no underlying data table.
- Library defaults (bright blue, drop shadows) leaking through — always verify it rendered on-palette.
- Loading a library "just in case" — only the element's presence should trigger it.
```

- [ ] **Step 2: 형식 검증**

```bash
grep -E "Chart.js|Mermaid|data table" skills/pretty/references/data-viz.md | head
```
Expected: 결정 규칙·테마·데이터 표 규칙이 모두 등장.

- [ ] **Step 3: 커밋**

```bash
git add skills/pretty/references/data-viz.md
git commit -m "docs: add data-viz reference (chart library decision rules)"
```

---

## Task 14: `components.md` 갱신 + `svg-patterns.md` 노트

**Files:**
- Modify: `skills/pretty/references/components.md`
- Modify: `skills/pretty/references/svg-patterns.md`

- [ ] **Step 1: components.md — "Diagrams and tables" 섹션 끝에 추가**

`### \`.tree\`` 항목 뒤(파일 88행 근처)에 삽입:

```markdown
---

## Interaction & navigation

These live in the shell too. See `interaction-patterns.md` for the full catalog and the "name the burden" rule.

- `.toc` — sticky scrollspy table of contents for long pages.
- `.fold` — collapsible `<details>` section for progressive disclosure (never fold the main point).
- `.tabs` — switch parallel views; JS-off shows all panels.
- `[data-before-after]`, `[data-stepper]`, `[data-filter-table]` — active widgets; use only when you can name the burden removed.

For quantitative charts (Chart.js) or large auto-laid graphs (Mermaid), see `data-viz.md`. Inline SVG stays the default for relational/line-art diagrams.
```

- [ ] **Step 2: components.md — "Picking components" 규칙 목록에 행 추가**

`- A *tangent or citation* → \`<sup>\` + \`.footnotes\`` 줄 뒤에 추가:

```markdown
- A *long page that needs a map* → `.toc`
- *Optional depth that would overload the first screen* → `.fold`
- *Parallel alternatives (same idea, different form)* → `.tabs`
- A *two-state comparison* → `[data-before-after]`
- A *sequence worth pacing* → `[data-stepper]`
- A *quantitative series* → Chart.js (`data-viz.md`); a *large graph* → Mermaid
```

- [ ] **Step 3: svg-patterns.md — "When to use a diagram" 섹션에 노트 1줄 추가**

해당 섹션 끝에 추가:

```markdown
> For *quantitative* data (real numbers to scale) prefer Chart.js, and for *large auto-laid* graphs prefer Mermaid — see `data-viz.md`. Inline SVG remains the default for relational and line-art diagrams. Inline SVG can also be made interactive (e.g. a `[data-stepper]` revealing paths one at a time) — see `interaction-patterns.md`.
```

- [ ] **Step 4: 검증**

```bash
grep -E "interaction-patterns|data-viz|\.toc|\.fold|\.tabs" skills/pretty/references/components.md
grep -E "Chart.js|Mermaid|interaction-patterns" skills/pretty/references/svg-patterns.md
```
Expected: 새 포인터들이 등장.

- [ ] **Step 5: 커밋**

```bash
git add skills/pretty/references/components.md skills/pretty/references/svg-patterns.md
git commit -m "docs: cross-link new interaction/data-viz components from catalogs"
```

---

## Task 15: `SKILL.md` 철학·워크플로 개정

**Files:**
- Modify: `skills/pretty/SKILL.md`

- [ ] **Step 1: description 갱신** — 프런트매터 `description:` 줄을 교체:

기존:
```
description: Create Anthropic-style HTML artifacts with the shared Yuumi visual system, component catalog, SVG patterns, and cognitive-load-focused visual QA
```
신규:
```
description: Create Anthropic-style HTML artifacts with the shared Yuumi visual system — navigable layouts, progressive disclosure, optional interactive widgets and data charts, a component catalog, SVG patterns, and cognitive-load-focused visual QA
```

- [ ] **Step 2: 북극성 확장** — "## The North Star" 본문 교체:

기존:
```
**The reader should understand the artifact in one pass and trust the page before they know why.**
```
신규:
```
**The first screen gives the reader the point and a map; the reader then controls how deep they go.**

A reader should grasp the headline insight and the shape of the whole in one glance, then descend into detail on their own terms — expanding sections, switching views, stepping through a process. Trust comes before they know why. Visual and interactive polish is not decoration; it is the interface for comprehension.
```

- [ ] **Step 3: "What you produce"에 새 참조 추가** — `Use:` 목록에 두 줄 추가:

```
- `skills/pretty/references/interaction-patterns.md` — navigation scaffold (TOC, fold, tabs) and active widgets (before/after, stepper, filterable table). Everything degrades gracefully without JS.
- `skills/pretty/references/data-viz.md` — when to reach past inline SVG to Chart.js (quantitative) or Mermaid (large graphs), and how the shell lazy-loads + themes them.
```

- [ ] **Step 4: 절제 다이얼 재조정** — "### Cognitive-load visuals"의 고정 상한 문장 교체:

기존:
```
Before adding `<figure>`, name the burden it removes. If the answer is vague — "it looks nicer" or "the page needs visual interest" — skip it. Three strong figures usually beat five. Five is the normal ceiling unless the artifact is explicitly a visual map.
```
신규:
```
Before adding any visual or interaction — `<figure>`, a chart, a tab group, a stepper — name the specific burden it removes. If the answer is vague ("it looks nicer", "the page needs interest"), skip it. There is no fixed ceiling on count; the ceiling is the gate: every element must earn its place by removing a named burden. A page may be richly visual or nearly all prose — what is never allowed is a visual or widget that exists only to look busy.
```

- [ ] **Step 5: 긴 내용 워크플로 추가** — "## Workflow"의 3번 항목 뒤에 새 항목 삽입(이후 번호 +1):

```
4. **Plan navigation for length.** If the artifact is long (4+ major sections or 3+ viewports), give the reader a map and a way to control depth: a `.toc`, `.fold` for optional depth, `.tabs` for parallel views. Do not cram a long artifact into one flat scroll. Keep the headline insight on the first screen — never fold the main point.
```

- [ ] **Step 6: 인터랙션 시각 언어 항목 추가** — "### Cognitive-load visuals" 끝에 문단 추가:

```
For quantitative data use Chart.js and for large auto-laid graphs use Mermaid; the shell lazy-loads them from a pinned CDN only when the page contains the element, and themes them with the shell tokens. Inline SVG stays the default for relational and line-art diagrams. Always pair a chart with its source data table. Active widgets (before/after, stepper, filterable table) are progressive enhancements — the page must be fully usable, and the main point fully visible, with JS disabled.
```

- [ ] **Step 7: 안티패턴 추가** — "## Anti-patterns" 목록 끝에 추가:

```
- Do not add interaction for its own sake. A tab group, stepper, or slider must remove a named burden, not signal "interactive".
- Do not fold, tab, or otherwise hide the artifact's main point. Progressive disclosure defers *optional depth*, never the headline insight.
- Do not show a chart without its underlying data table. Charts must survive JS-off and be fact-checkable.
- Do not load a chart/graph library "just in case". Only the element's presence triggers it.
- Do not let library defaults (bright blue, drop shadows) leak through — verify charts render on-palette.
```

- [ ] **Step 8: QA 패스 확장** — "## Quality bar"의 comprehension 체크리스트에 항목 추가:

```
- interactions work and degrade: tabs switch, steppers step, folds toggle, and with JS off every panel/step is visible and the main point is on the first screen
- charts render on-palette with a paired data table, and chart/graph libraries load only on pages that use them
- the layout is navigable: long pages have a map (`.toc`) and the reader can control depth
- keyboard focus is visible on every interactive element; motion respects `prefers-reduced-motion`
```

- [ ] **Step 9: 검증**

```bash
grep -E "first screen gives|interaction-patterns|data-viz|earn its place|degrade" skills/pretty/SKILL.md
```
Expected: 개정된 북극성·참조·게이트·fallback 문구가 모두 존재.

- [ ] **Step 10: 커밋**

```bash
git add skills/pretty/SKILL.md
git commit -m "docs: evolve pretty north star to navigable+explorable, retune restraint gate"
```

---

## Task 16: `examples/temp-page.html` 종합 데모 갱신

**Files:**
- Modify: `skills/pretty/examples/temp-page.html`

- [ ] **Step 1: 현재 예시를 shell 최신본 기반으로 재생성** — 기존 예시 내용을 토대로, 새 컴포넌트를 *정당하게* 쓰는 데모로 갱신:
  - 상단에 `.toc`(4+ 섹션 지도)
  - 한 섹션에 `.fold`(심화 내용)
  - 언어 비교에 `.tabs`
  - 한 곳에 `[data-stepper]`(시퀀스) 또는 `[data-before-after]`(리팩터 비교)
  - 정량 데이터 한 곳에 `data-chart` 막대/라인 + 옆에 데이터 표
  - 짧은 라벨 표에 `.col-tight` 적용(버그 픽스 시연)

  각 사용처에 "이 요소가 더는 인지 부하"를 figcaption/주석으로 명시. **억지로 다 넣지 말 것** — 데모이되 슬롯 채우기 금지(스킬 철학 준수).

- [ ] **Step 2: 검증**

```bash
open skills/pretty/examples/temp-page.html
```
Expected: 목차 scrollspy·접기·탭·위젯·차트가 모두 동작, 콘솔 무에러, 토큰 색 유지. JS-off에서도 전 내용 접근.

- [ ] **Step 3: 콘솔/네트워크 점검** — DevTools 또는 `/browse`로 콘솔 무에러 + 차트 lib는 차트 있을 때만 로드 확인.

- [ ] **Step 4: 커밋**

```bash
git add skills/pretty/examples/temp-page.html
git commit -m "docs: refresh pretty example demonstrating navigation + widgets + charts"
```

---

## Task 17: 최종 검증 + 버전 범프 + 통합 안내

**Files:**
- Modify: `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`

- [ ] **Step 1: 전체 회귀 검증** — Task 11의 `sample-all.html`을 다시 열어 모든 컴포넌트 동시 동작 + 콘솔 무에러 최종 확인. 기존 컴포넌트(`.lede`, `.callout`, `.steps`, `.tree`, SVG fan-out 애니메이션, Prism 하이라이팅)도 회귀 없는지 확인.

- [ ] **Step 2: 현재 버전 확인**

```bash
grep -E '"version"' .claude-plugin/marketplace.json .claude-plugin/plugin.json
```

- [ ] **Step 3: 세 버전 필드 패치 +1** — `.claude-plugin/marketplace.json`의 `version`·`plugins[0].version`, `.claude-plugin/plugin.json`의 `version`을 동일 패치 증가로 일치시킨다(예: 1.3.17 → 1.3.18). 셋이 어긋나면 기존 설치가 재-pull 안 함.

- [ ] **Step 4: doctor 스모크(선택)** — Claude Code에서 `/yuumi:doctor`로 파일 존재·settings 형태 점검.

- [ ] **Step 5: 커밋**

```bash
git add .claude-plugin/marketplace.json .claude-plugin/plugin.json
git commit -m "chore: bump version for pretty explorable enhancement"
```

- [ ] **Step 6: main 통합 안내** — 사용자에게 보고: `feat/pretty-explorable` 브랜치 준비 완료. main에 통합(merge/push)하면 마켓플레이스로 배포됨. **사용자 승인 후에만** push/merge 진행.

---

## Self-Review (작성자 점검 결과)

- **Spec 커버리지**: spec 4장(표 버그)→T2, 4b(탐색 골격)→T3·4·5·6, 4c(위젯)→T7·8·9, 4d(지연 로딩)→T10, 4e(접근성)→T11, 5장(references)→T12·13·14, 6장(SKILL.md)→T15, examples→T16, 7장(검증·버전)→T17. 누락 없음.
- **플레이스홀더**: 모든 코드/편집 단계에 실제 코드·정확한 명령·기대 출력 포함. "TBD/적절히 처리" 없음.
- **타입/이름 일관성**: 클래스·data 속성·함수 동작이 Task 간 일치(`.fold`, `.toc`/`active`, `.tabs`/`tabs-on`, `[data-before-after]`/`ba-on`/`--split`, `[data-stepper]`/`stepper-on`/`current`, `[data-filter-table]`/`filter-on`, `[data-chart]`/`.mermaid` 지연 로더). 토큰명(`--text`, `--text-dim`, `--text-faint`, `--rule`, `--rule-soft`, `--rule-strong`, `--accent`, `--accent-deep`, `--surface`)은 shell `:root`(34–56행)에서 실재 확인. 폰트는 shell이 변수가 아니라 `'Hahmlet', Georgia, serif`(67행)·`'JetBrains Mono'…`(80행)로 직접 쓰므로 T3는 그 스택을 그대로 사용. `@media (prefers-reduced-motion: reduce)` 블록은 shell 623행에 이미 존재(T11은 거기에 통합).
