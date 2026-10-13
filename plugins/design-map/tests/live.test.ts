import { describe, expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { editorCommand, shellQuote } from '../hooks/editor'
import { fnv1a } from '../hooks/version'
import { HOME, REPO, world } from './world'

const SESSION = { cwd: '/Users/test/work', surface: 'terminal', isInteractive: true } as const

const MAP = {
  elements: {
    upsert: [
      { id: 'Svc', change: 'modify', files: ['src/Svc.kt:12'] },
      { id: 'Repo', files: ['src/repo/'] },
    ],
  },
}

const done = (answer: string, turnId: string) => ({ answer, durationMs: 1, isAborted: false, turnId, reason: 'answer' as const })

async function opened($: Parameters<TestBody>[0], on: Parameters<TestBody>[1]) {
  const w = world(on)
  await $.session.start(SESSION)
  await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '데모', repo: REPO })
  await $.tool.call({ tool: 'mcp__design-map__map_update', ...MAP })
  await w.clock.advance(100)
  return w
}

describe('pure helpers', () => {
  test('fnv1a matches the reference and the server uses the same function', () => {
    expect(fnv1a('')).toBe('811c9dc5')
    expect(fnv1a('a')).toBe('e40c292c')
  })

  test('editor commands: presets need no shell, a custom template is quoted', () => {
    expect(editorCommand('intellij', '', '/r/A.kt', 12, HOME)).toEqual({ argv: [`${HOME}/Library/Application Support/JetBrains/Toolbox/scripts/idea`, '--line', '12', '/r/A.kt'] })
    expect(editorCommand('vscode', '', '/r/A.kt', undefined, HOME)).toEqual({ argv: ['code', '-g', '/r/A.kt:1'] })
    const custom = editorCommand('custom', 'nvim --remote {file} +{line}', "/r/it's.kt", 3, HOME)
    expect(custom).toEqual({ argv: ['/bin/sh', '-c', `nvim --remote ${shellQuote("/r/it's.kt")} +'3'`] })
    expect('error' in editorCommand('custom', ' ', '/r/A.kt', 1, HOME)).toBe(true)
  })
})

describe('where the session is looking', () => {
  test('a read of a mapped file names its box; one off the map says so; a search is a search', async ($, on) => {
    const w = await opened($, on)
    await $.turn.start({ text: '보자', turnId: 't1' })
    await $.tool.call({ tool: 'Read', file_path: `${REPO}/src/Svc.kt` })
    await w.clock.advance(200)
    const reading = w.activity.at(-1) as { current: { kind: string; ids: string[]; path: string }; trail: unknown[] }
    expect(reading.current).toMatchObject({ kind: 'read', ids: ['Svc'], path: 'src/Svc.kt' })
    expect(reading.trail.length).toBe(1)

    await $.tool.call({ tool: 'Read', file_path: `${REPO}/build.gradle.kts` })
    await w.clock.advance(200)
    expect((w.activity.at(-1) as { current: { outside: boolean } }).current.outside).toBe(true)

    // Grep is not a built-in on every build; the hook compares tool names as strings.
    await $.tool.call({ tool: 'Grep', pattern: 'fun save', path: REPO } as never)
    await w.clock.advance(200)
    expect((w.activity.at(-1) as { current: { kind: string; pattern: string } }).current).toMatchObject({ kind: 'search', pattern: 'fun save' })

    await $.turn.complete(done('끝', 't1'))
    await w.clock.advance(200)
    expect((w.activity.at(-1) as { current: unknown; isRunning: boolean })).toMatchObject({ current: null, isRunning: false })
  })
})

describe('paths through links', () => {
  test('a file read through a symlink of the repo still names its box', async ($, on) => {
    const w = await opened($, on)
    w.links.set(REPO, '/Users/test/real/repo')
    w.links.set('/Users/test/work/targets/repo/src/Svc.kt', '/Users/test/real/repo/src/Svc.kt')
    await $.turn.start({ text: '보자', turnId: 't1' })
    await $.tool.call({ tool: 'Read', file_path: '/Users/test/work/targets/repo/src/Svc.kt' })
    await w.clock.advance(200)
    expect((w.activity.at(-1) as { current: unknown }).current).toMatchObject({ kind: 'read', ids: ['Svc'], path: 'src/Svc.kt', outside: false })
  })
})

describe('the map going stale', () => {
  // The kit cannot store session rows (see world.ts), so what is checked here is the drift
  // the page shows; the notice and the model's row are seen in a live session.
  test('code edited with no map change is a drift episode, growing until the map changes', async ($, on) => {
    const w = await opened($, on)
    const drift = () => (w.activity.at(-1) as { drift: { files: string[]; turnId: string } | null }).drift
    await $.turn.start({ text: '고쳐 줘', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: `${REPO}/src/Svc.kt`, old_string: 'a', new_string: 'b' })
    await $.turn.complete(done('고쳤어', 't1'))
    await w.clock.advance(200)
    expect(drift()).toEqual({ name: 'demo', files: ['src/Svc.kt'], turnId: 't1' })

    // Still stale next turn: the same episode, with both files.
    await $.turn.start({ text: '더', turnId: 't2' })
    await $.tool.call({ tool: 'Edit', file_path: `${REPO}/src/Other.kt`, old_string: 'a', new_string: 'b' })
    await $.turn.complete(done('또 고쳤어', 't2'))
    await w.clock.advance(200)
    expect(drift()?.files).toEqual(['src/Svc.kt', 'src/Other.kt'])

    // A map change ends the episode.
    await $.turn.start({ text: '지도', turnId: 't3' })
    await $.tool.call({ tool: 'mcp__design-map__map_update', elements: { upsert: [{ id: 'Svc', done: true }] } })
    await $.turn.complete(done('반영', 't3'))
    await w.clock.advance(200)
    expect(drift()).toBeNull()
  })

  test('a map opened mid-turn on a branch with changes takes them as the baseline, not as this turn', async ($, on) => {
    const w = world(on)
    w.changed.push('src/Svc.kt', 'build.gradle.kts')
    await $.session.start(SESSION)
    await $.turn.start({ text: '지도 열어 줘', turnId: 't1' })
    await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '데모', repo: REPO })
    await $.turn.complete(done('열었어', 't1'))
    await w.clock.advance(200)
    expect((w.activity.at(-1) as { drift: unknown }).drift).toBeNull()

    // What the next turn changes still counts.
    await $.turn.start({ text: '고쳐 줘', turnId: 't2' })
    w.changed.push('src/Other.kt')
    await $.turn.complete(done('고쳤어', 't2'))
    await w.clock.advance(200)
    expect((w.activity.at(-1) as { drift: { files: string[] } | null }).drift?.files).toEqual(['src/Other.kt'])
  })

  test('a turn that changed the map, or touched no repo code, raises nothing', async ($, on) => {
    const w = await opened($, on)
    await $.turn.start({ text: '같이', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: `${REPO}/src/Svc.kt`, old_string: 'a', new_string: 'b' })
    await $.tool.call({ tool: 'mcp__design-map__map_view', collapse: [] })
    await $.turn.complete(done('같이 했어', 't1'))
    await $.turn.start({ text: '문서', turnId: 't2' })
    await $.tool.call({ tool: 'Edit', file_path: '/Users/test/notes/todo.md', old_string: 'a', new_string: 'b' })
    await $.turn.complete(done('문서만', 't2'))
    await w.clock.advance(200)
    expect((w.activity.at(-1) as { drift: unknown }).drift).toBeNull()
    expect(w.appended).toEqual([])
  })
})

describe('interrupting a running turn', () => {
  test('urgent feedback is taken while busy and handed to the running turn; refused, it waits for the turn', async ($, on) => {
    const w = await opened($, on)
    await $.turn.start({ text: '긴 작업', turnId: 't1' })
    w.leave({ target: { kind: 'element', id: 'Svc' }, action: 'comment', text: '잠깐, 이건 건드리지 마' })
    const urgent = w.feedback[0]
    if (urgent !== undefined) urgent.urgent = true
    w.leave({ target: { kind: 'map' }, action: 'comment', text: '이건 나중에' })
    await w.clock.advance(1_000)
    // Taken mid-turn (the plain one waits for the turn), and offered to the turn as a row; the
    // kit cannot store rows, so what shows here is the fallback: it queues as a turn of its own.
    expect(w.feedback.map(i => i.status)).toEqual(['working', 'sent'])
    expect(w.submitted.length).toBe(1)
    expect(w.submitted[0]).toContain('[design-map 피드백 #1]')
  })
})

describe('who receives the feedback', () => {
  test('a second session opening a map another live session shows stays out of its way', async ($, on) => {
    const w = world(on)
    w.isServing = true
    w.owner = { session: 'session-main', label: 'work · main' }
    w.isOwnerListening = true
    await $.session.start(SESSION)
    const opened = await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '데모' })
    expect(String(opened.result)).toContain('another session (work · main) shows this map')
    expect(w.browsed).toEqual([])
    expect(w.owner?.session).toBe('session-main')

    // The person asks for it here: this session takes it.
    await $.command.run({ command: 'design-map', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } } as never)
    expect(w.owner?.session).toBe('session-1')
    expect(w.browsed.length).toBe(1)
  })
})

describe('opening a file in the editor', () => {
  test('only a file the map lists, inside its repo, opens', async ($, on) => {
    const w = await opened($, on)
    w.leave({ target: { kind: 'element', id: 'Svc' }, action: 'open', text: 'src/Svc.kt:12' })
    w.leave({ target: { kind: 'element', id: 'Svc' }, action: 'open', text: '../../etc/passwd' })
    await w.clock.advance(1_000)
    expect(w.ran).toContainEqual([`${HOME}/Library/Application Support/JetBrains/Toolbox/scripts/idea`, '--line', '12', `${REPO}/src/Svc.kt`])
    expect(w.feedback.map(i => i.status)).toEqual(['done', 'failed'])
    expect(w.feedback[1]?.reply).toContain('지도에 없는 파일')

    // Listed, but a link leads out of the repo.
    w.links.set(`${REPO}/src/Svc.kt`, '/Users/test/secrets/key.pem')
    w.leave({ target: { kind: 'element', id: 'Svc' }, action: 'open', text: 'src/Svc.kt:12' })
    await w.clock.advance(1_000)
    expect(w.feedback[2]).toMatchObject({ status: 'failed' })
    expect(w.feedback[2]?.reply).toContain('repo 밖')
    expect(w.submitted).toEqual([])
  })
})
