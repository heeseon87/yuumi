import { describe, expect, test } from 'claude-code/testing'

import { SERVER_FLAGS } from '../hooks/version'
import { MAPS, PAGES, REPO, world } from './world'

const SESSION = { cwd: '/Users/test/work', surface: 'terminal', isInteractive: true } as const

/** A slash command as the person types it: where it came from and how it shows are the engine's. */
const typed = (args: string) => ({ command: 'design-map', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } }) as never

const OPEN = 'mcp__design-map__map_open'
const UPDATE = 'mcp__design-map__map_update'
const SAVE = 'mcp__design-map__diagram_save'
const FLOW = 'flowchart TB\n  A --> B\n'

describe('the drawer: one folder of design maps and plain diagrams', () => {
  test('the page server gets the drawer folder and the flags that let Node run model.ts', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    expect(JSON.parse(w.files.get(`${PAGES}/launch.json`) ?? '{}')).toMatchObject({ port: 7777, mapsDir: MAPS })
    await $.tool.call({ tool: OPEN, name: 'demo', title: '데모', repo: REPO })
    const started = w.ran.filter(argv => argv[0] === '/bin/sh')
    expect(started.length).toBe(1)
    const argv = started[0] ?? []
    expect(argv.slice(0, 5)).toEqual(['/bin/sh', '-c', 'log="$1"; shift; nohup "$@" >> "$log" 2>&1 < /dev/null &', 'design-map-server', `${PAGES}/server.log`])
    expect(argv.slice(6, 6 + SERVER_FLAGS.length)).toEqual([...SERVER_FLAGS])
    expect(String(argv[6 + SERVER_FLAGS.length]).endsWith('/scripts/server.mjs')).toBe(true)
    expect(argv.slice(7 + SERVER_FLAGS.length)).toEqual(['7777', PAGES, MAPS])
  })

  test('every revision of a map is kept for the drawer\'s history', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.tool.call({ tool: OPEN, name: 'demo', title: '데모' })
    await $.tool.call({ tool: UPDATE, elements: { upsert: [{ id: 'A', change: 'add' }] } })
    expect(JSON.parse(w.files.get(`${MAPS}/.history/demo/0.json`) ?? '{}')).toMatchObject({ title: '데모', revision: 0, elements: [] })
    expect(JSON.parse(w.files.get(`${MAPS}/.history/demo/1.json`) ?? '{}')).toMatchObject({ revision: 1, elements: [{ id: 'A' }] })
    expect(w.ran).toContainEqual(['mkdir', '-p', `${MAPS}/.history/demo`])
  })

  test('a map the person put in the trash is not written back, and closes', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.tool.call({ tool: OPEN, name: 'demo', title: '데모' })
    w.files.delete(`${MAPS}/demo.json`)
    const refused = await $.tool.call({ tool: UPDATE, elements: { upsert: [{ id: 'A' }] } })
    expect(String(refused.deny)).toContain('trash')
    expect(w.files.has(`${MAPS}/demo.json`)).toBe(false)
    const after = await $.tool.call({ tool: UPDATE, elements: { upsert: [{ id: 'A' }] } })
    expect(String(after.deny)).toContain('No design map is open')
  })

  test('one id is one kind, and ids have no dots (no id may be another\'s sidecar)', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    w.write(`${MAPS}/flow.mmd`, FLOW)
    expect(String((await $.tool.call({ tool: OPEN, name: 'flow', title: '흐름' })).deny)).toContain('plain diagram')
    expect(String((await $.tool.call({ tool: OPEN, name: 'demo.meta', title: '점' })).deny)).toContain('lowercase')
    await $.tool.call({ tool: OPEN, name: 'demo', title: '데모' })
    expect(String((await $.tool.call({ tool: SAVE, name: 'demo', title: '덮어쓰기', mermaid: FLOW })).deny)).toContain('design map')
    expect(w.saved).toEqual([])
  })

  test('diagram_save checks the source with Mermaid, saves through the server and shows a new diagram once', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    const saved = await $.tool.call({ tool: SAVE, name: 'flow', title: '흐름', mermaid: FLOW, tags: ['결제'] })
    expect(saved.deny).toBeUndefined()
    expect(String(saved.result)).toContain('Saved the new diagram "flow"')
    expect(w.saved).toEqual([{ id: 'flow', title: '흐름', mermaid: FLOW, tags: ['결제'] }])
    expect(w.ran.some(argv => argv.some(a => a.endsWith('/mermaid-cli/src/cli.js')))).toBe(true)
    expect(w.browsed).toEqual(['http://127.0.0.1:7777/map/flow'])

    // A memo alone: no check, no new tab.
    const checks = w.ran.length
    const memo = await $.tool.call({ tool: SAVE, name: 'flow', memo: '결제 흐름 메모' })
    expect(memo.deny).toBeUndefined()
    expect(w.saved.at(-1)).toEqual({ id: 'flow', memo: '결제 흐름 메모' })
    expect(w.ran.slice(checks).some(argv => argv.some(a => a.endsWith('/mermaid-cli/src/cli.js')))).toBe(false)
    expect(w.browsed.length).toBe(1)

    expect(String((await $.tool.call({ tool: SAVE, name: 'empty', mermaid: FLOW })).deny)).toContain('give a title')
  })

  test('a source Mermaid cannot parse is refused whole; a checker that does not run lets it through, said so', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    w.mermaidError = 'Error: Parse error on line 2:\n...A-- B\n-----^\nExpecting \'LINK\''
    const refused = await $.tool.call({ tool: SAVE, name: 'bad', title: '깨짐', mermaid: 'flowchart TB\n  A-- B\n' })
    expect(String(refused.deny)).toContain('Nothing was saved')
    expect(String(refused.deny)).toContain('Parse error on line 2')
    expect(w.saved).toEqual([])

    w.mermaidError = 'Error: Failed to launch the browser process!'
    const unchecked = await $.tool.call({ tool: SAVE, name: 'bad', title: '깨짐', mermaid: FLOW })
    expect(unchecked.deny).toBeUndefined()
    expect(String(unchecked.result)).toContain('Mermaid did not check it')
    expect(w.saved.length).toBe(1)
  })

  test('list and status use the drawer\'s titles; drawer and diagrams open in the browser', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await $.tool.call({ tool: OPEN, name: 'demo', title: '데모' })
    w.write(`${MAPS}/demo.meta.json`, JSON.stringify({ title: '내 데모', tags: ['노트'] }))
    w.write(`${MAPS}/demo.feedback.json`, '{"nextId":1,"items":[]}')
    w.write(`${MAPS}/flow.mmd`, FLOW)
    w.write(`${MAPS}/flow.meta.json`, JSON.stringify({ title: '흐름도' }))
    const listed = JSON.stringify(await $.command.run(typed('list')))
    expect(listed).toContain('- demo: 내 데모')
    expect(listed).toContain('- flow: 흐름도 (다이어그램)')
    expect(listed.match(/- demo/g)?.length).toBe(1)

    await w.clock.advance(15_000)
    expect(w.statuses.at(-1)).toContain('🗺 내 데모')
    const reopened = await $.tool.call({ tool: OPEN, name: 'demo' })
    expect(String(reopened.result)).toContain('renamed it "내 데모"')

    await $.command.run(typed('drawer'))
    await $.command.run(typed('flow'))
    expect(w.browsed.slice(-2)).toEqual(['http://127.0.0.1:7777/', 'http://127.0.0.1:7777/map/flow'])
    expect(w.opened).toEqual([])
    expect(JSON.stringify(await $.command.run(typed('../x')))).toContain('No item')
  })
})
