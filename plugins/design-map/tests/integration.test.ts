import { describe, expect, test } from 'claude-code/testing'

import { MAPS, PAGES, REPO, world } from './world'

/** A slash command as the person types it: where it came from and how it shows are the engine's. */
const typed = (args: string) => ({ command: 'design-map', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } }) as never

const SESSION = { cwd: '/Users/test/work', surface: 'terminal', isInteractive: true } as const

const ELEMENTS = {
  upsert: [
    { id: 'Api', kind: 'group' },
    { id: 'OrderController', parent: 'Api', files: ['src/api/OrderController.kt'] },
    { id: 'Domain', kind: 'group' },
    { id: 'OrderService', parent: 'Domain', change: 'modify', steps: [1], files: ['src/domain/OrderService.kt'],
      members: [{ text: 'refund(orderId)', change: 'add' }] },
    { id: 'RefundPolicy', parent: 'Domain', label: '환불 정책', change: 'add', steps: [2], decision: 'D1' },
  ],
}

describe('the tools, end to end beneath the plugin', () => {
  test('open creates the map, starts the page server and shows the page once', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const opened = await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '데모', repo: REPO, base: 'origin/main' })
    expect(opened.deny).toBeUndefined()
    expect(String(opened.result)).toContain('# Design map: how to draw it')
    expect(String(opened.result)).toContain('Created map "demo"')
    expect(String(opened.result)).toContain('Browser: http://127.0.0.1:7777/map/demo')
    expect(JSON.parse(w.files.get(`${MAPS}/demo.json`) ?? '{}')).toMatchObject({ title: '데모', repo: REPO, base: 'origin/main', revision: 0 })
    expect(w.ran.filter(argv => argv[0] === '/bin/sh').length).toBe(1)
    expect(w.browsed).toEqual(['http://127.0.0.1:7777/map/demo'])
    expect(w.page()?.title).toBe('데모')
    // Progress counts from where the branch forked from base, not from base's tip.
    expect(w.ran).toContainEqual(['git', '-C', REPO, 'diff', '--name-only', 'f0rk'])

    // Opening again in the same session reuses the server and the browser tab.
    await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo' })
    expect(w.ran.filter(argv => argv[0] === '/bin/sh').length).toBe(1)
    expect(w.browsed.length).toBe(1)
  })

  test('update writes atomically, rewrites the page, and refuses a bad batch whole', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '데모' })

    const saved = await $.tool.call({
      tool: 'mcp__design-map__map_update',
      elements: ELEMENTS,
      relations: { add: [{ from: 'OrderController', to: 'OrderService' }, { from: 'OrderService', to: 'RefundPolicy', label: '환불 판단', decision: 'D1' }] },
      decisions: { upsert: [{ id: 'D1', question: '환불 판단은 누가?', options: [{ id: 'D1-a', text: '새 정책 클래스' }] }] },
    })
    expect(saved.deny).toBeUndefined()
    expect(String(saved.result)).toContain('Saved revision 1')
    await w.clock.advance(100)
    const page = w.page()
    expect(page?.mermaid).toContain('class RefundPolicy["환불 정책 (스텝 2) [D1]"]')
    expect(page?.mermaid).toContain('direction TB')
    expect(page?.mermaid).not.toContain('namespace Legend')
    expect(page?.revision).toBe(1)
    expect((page?.legend as { text: string }[]).map(l => l.text)).toContain('천천히 빛남 · [D번호] 결정 대기')

    const before = w.files.get(`${MAPS}/demo.json`)
    const bad = await $.tool.call({ tool: 'mcp__design-map__map_update', elements: { upsert: [{ id: 'Fine' }, { id: '한글' }] } })
    expect(bad.deny).toContain('Nothing was written')
    expect(bad.deny).toContain('"한글" must be ASCII')
    expect(w.files.get(`${MAPS}/demo.json`)).toBe(before)
  })

  test('progress: changed files mark their element 🔧 and the rest are off the map', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '데모', repo: REPO })
    await $.tool.call({ tool: 'mcp__design-map__map_update', elements: ELEMENTS, decisions: { upsert: [{ id: 'D1', question: 'q' }] } })
    await w.clock.advance(100)

    w.changed = ['src/domain/OrderService.kt', 'build.gradle.kts']
    await w.clock.advance(15_000)
    // The page draws working and done itself: the title stays plain, the state rides beside it.
    expect(w.page()?.mermaid).toContain('class OrderService["OrderService (스텝 1)"]')
    expect(w.page()?.states.OrderService).toEqual({ isDone: false, isWorking: true })
    expect(w.page()?.outside).toEqual(['build.gradle.kts'])
    expect(w.statuses.at(-1)).toContain('지도 밖 1')

    await $.tool.call({ tool: 'mcp__design-map__map_update', elements: { upsert: [{ id: 'OrderService', done: true }] } })
    await w.clock.advance(100)
    expect(w.page()?.mermaid).toContain('class OrderService["OrderService (스텝 1)"]')
    expect(w.page()?.states.OrderService).toEqual({ isDone: true, isWorking: false })
  })

  test("another session's write is picked up on the next tick", async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '데모' })
    await $.tool.call({ tool: 'mcp__design-map__map_update', elements: { upsert: [{ id: 'A' }] } })
    await w.clock.advance(100)

    const map = JSON.parse(w.files.get(`${MAPS}/demo.json`) ?? '{}')
    map.elements.push({ id: 'B' })
    map.revision += 1
    w.write(`${MAPS}/demo.json`, JSON.stringify(map))
    await w.clock.advance(15_100)
    expect(w.page()?.mermaid).toContain('class B["B"]')

    const saved = await $.tool.call({ tool: 'mcp__design-map__map_update', elements: { upsert: [{ id: 'C' }] } })
    expect(String(saved.result)).toContain('Saved revision 3')
    const ids = JSON.parse(w.files.get(`${MAPS}/demo.json`) ?? '{}').elements.map((e: { id: string }) => e.id)
    expect(ids).toEqual(['A', 'B', 'C'])
  })

  test('view folds a group and keeps the facts untouched', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '데모' })
    await $.tool.call({ tool: 'mcp__design-map__map_update', elements: ELEMENTS, decisions: { upsert: [{ id: 'D1', question: 'q' }] } })
    const map = w.files.get(`${MAPS}/demo.json`)
    const viewed = await $.tool.call({ tool: 'mcp__design-map__map_view', collapse: ['Domain'] })
    expect(String(viewed.result)).toContain('"collapse":["Domain"]')
    await w.clock.advance(100)
    expect(w.page()?.mermaid).toContain('class Domain["Domain (2개) (스텝 1·2) [D1]"]')
    expect(w.files.get(`${MAPS}/demo.json`)).toBe(map)
    expect(JSON.parse(w.files.get(`${MAPS}/demo.view.json`) ?? '{}')).toEqual({ collapse: ['Domain'] })

    const refused = await $.tool.call({ tool: 'mcp__design-map__map_view', collapse: ['OrderService'] })
    expect(refused.deny).toContain('"OrderService" is not a group')
  })
})

describe('the command', () => {
  test('nothing opens inside Claude Code: the map lives in the browser, the status line sums it up', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '데모', repo: REPO })
    await $.tool.call({
      tool: 'mcp__design-map__map_update',
      elements: ELEMENTS,
      decisions: { upsert: [{ id: 'D1', question: '환불 판단은 누가?', options: [{ id: 'D1-a', text: '새 정책 클래스', impact: 'RefundPolicy 신규' }] }] },
    })
    await w.clock.advance(15_100)
    await $.command.run(typed(''))
    expect(w.opened).toEqual([])
    expect(w.statuses.at(-1)).toContain('🗺 데모 · 결정 1개 열림')
    expect(w.browsed.length).toBe(1)
  })

  test('/design-map reopens the last map of this folder; browser forces a new tab', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '데모' })
    await $.command.run(typed('close'))
    const listed = await $.command.run(typed('list'))
    expect(JSON.stringify(listed)).toContain('demo: 데모')
    const reopened = await $.command.run(typed(''))
    expect(JSON.stringify(reopened)).toContain('http://127.0.0.1:7777/map/demo')
    expect(w.opened).toEqual([])
    expect(w.browsed.length).toBe(1)
    await $.command.run(typed('browser'))
    expect(w.browsed.length).toBe(2)
  })

  test('/design-map export writes the block into a markdown file, replacing it next time', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '데모' })
    await $.tool.call({ tool: 'mcp__design-map__map_update', elements: { upsert: [{ id: 'A', change: 'add' }] } })
    w.write('/Users/test/work/doc.md', '# 문서\n\n본문\n')
    await $.command.run(typed('export /Users/test/work/doc.md'))
    await $.command.run(typed('export /Users/test/work/doc.md'))
    const doc = w.files.get('/Users/test/work/doc.md') ?? ''
    expect(doc.startsWith('# 문서\n\n본문\n\n<!-- design-map:start demo -->')).toBe(true)
    expect(doc.match(/design-map:start/g)?.length).toBe(1)
    expect(doc).toContain('namespace Legend')
    expect(w.files.has(`${PAGES}/demo.page.json`)).toBe(true)
  })
})
