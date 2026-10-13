// A world beneath the plugin for tests: files in memory, a fake page server,
// browser and git, and the kit's own clock, store and environment.

import { mock } from 'claude-code/testing'
import type { MockClock } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { FeedbackItem } from '../hooks/feedback'
import { SERVER_FILES, serverVersion } from '../hooks/version'

// Under /Users: macOS treats /home as a network mount.
export const HOME = '/Users/test'
export const MAPS = `${HOME}/.claude/design-maps`
export const PAGES = `${HOME}/.cache/design-map`
export const REPO = '/Users/test/work/repo'

export type World = {
  files: Map<string, string>
  ran: string[][]
  statuses: (string | undefined)[]
  opened: string[]
  /** URLs handed to `open`: what the browser showed. */
  browsed: string[]
  /** What `git diff --name-only` answers in REPO. */
  changed: string[]
  /** Whether the page server answers /health. */
  isServing: boolean
  /** The browser page's data for a map, as last written. */
  page: (name?: string) => { mermaid: string; [key: string]: unknown } | undefined
  /** Writes a file as another process would, moving its modification time. */
  write: (path: string, text: string) => void
  /** The page server's feedback for the map "demo". */
  feedback: FeedbackItem[]
  /** What the browser does when the user sends feedback. */
  leave: (item: Pick<FeedbackItem, 'target' | 'action' | 'text'>) => FeedbackItem
  /** Prompts the mod submitted to the session. */
  submitted: string[]
  /** Whether a submit fails, as when the session refuses it. */
  isSubmitRefused: boolean
  /** Rows the mod appended to the session: `user` the model reads, `system` the person sees. */
  appended: { type: string; text: string }[]
  /** What the page server holds as the map's owner, and whether that owner is polling. */
  owner: { session: string; label: string } | null
  isOwnerListening: boolean
  /** Activity the mod posted for the page. */
  activity: Record<string, unknown>[]
  /** Where a path really leads, for links; a path not listed resolves to itself. */
  links: Map<string, string>
  /** Diagrams the mod saved through the page server. */
  saved: Record<string, unknown>[]
  /** What mermaid-cli says about the next sources it checks, when it refuses them. */
  mermaidError: string | undefined
  clock: MockClock
}

export function world(on: On): World {
  const files = new Map<string, string>()
  const mtimes = new Map<string, number>()
  let writes = 0
  const write = (path: string, text: string) => {
    files.set(path, text)
    writes += 1
    mtimes.set(path, writes)
  }
  const w: World = {
    files,
    ran: [],
    statuses: [],
    opened: [],
    browsed: [],
    changed: [],
    isServing: false,
    page: (name = 'demo') => {
      const text = files.get(`${PAGES}/${name}.page.json`)
      return text === undefined ? undefined : JSON.parse(text)
    },
    write,
    feedback: [],
    leave: item => {
      const left: FeedbackItem = { ...item, id: w.feedback.length + 1, at: 0, status: 'sent' }
      w.feedback.push(left)
      return left
    },
    submitted: [],
    isSubmitRefused: false,
    appended: [],
    owner: null,
    isOwnerListening: false,
    activity: [],
    links: new Map(),
    saved: [],
    mermaidError: undefined,
    clock: mock.clock(on, { now: 1_000 }),
  }
  // The plugin's own server files, as the mod reads them to know which server version is current.
  const SOURCES = SERVER_FILES.map(file => `${file} source`)
  const LOCAL = new Set(['expand', 'collapse', 'hide', 'reset', 'decide', 'open'])
  mock.store(on)
  mock.env(on, { HOME })

  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  files.set(`${PAGES}/server.token`, 'tok\n')
  on('fs.exists', async (_$, e) => ({ value: files.has(e.path) || [...files.keys()].some(p => p.startsWith(`${e.path}/`)) }))
  on('fs.read', async (_$, e) => {
    const own = SERVER_FILES.findIndex(file => e.path.endsWith(`/${file}`))
    if (own >= 0) return { value: SOURCES[own] ?? '' }
    const text = files.get(e.path)
    return text === undefined ? { deny: `ENOENT: ${e.path}` } : { value: text }
  })
  on('fs.write', async (_$, e) => {
    write(e.path, e.text)
    return { value: undefined }
  })
  on('fs.stat', async (_$, e) => ({
    value: { kind: 'file', size: files.get(e.path)?.length ?? 0, mtimeMs: mtimes.get(e.path) ?? 0, isLink: false, ...(e.resolve ? { realPath: w.links.get(e.path) ?? e.path } : {}) },
  }))
  on('fs.list', async (_$, e) => ({
    value: [...files.keys()]
      .filter(p => p.slice(0, p.lastIndexOf('/')) === e.path)
      .map(p => ({ name: p.slice(p.lastIndexOf('/') + 1), kind: 'file' as const, size: 0, mtimeMs: mtimes.get(p) ?? 0, isLink: false })),
  }))
  on('process.run', async (_$, e) => {
    const argv = [...e.argv]
    w.ran.push(argv)
    const ok = (stdout = '') => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv[0] === '/bin/sh' && argv.some(a => a.endsWith('/scripts/server.mjs'))) w.isServing = true
    if (argv[0] === 'open') w.browsed.push(argv[1] ?? '')
    if (argv[0] === 'git' && argv.includes('merge-base')) return ok('f0rk\n')
    if (argv[0] === 'git' && argv.includes('diff')) return ok(w.changed.join('\n'))
    if (argv.some(a => a.endsWith('/mermaid-cli/src/cli.js')) && w.mermaidError !== undefined) {
      return { value: { exitCode: 1, stdout: '', stderr: w.mermaidError, isStdoutTruncated: false, isStderrTruncated: false } }
    }
    return ok()
  })
  on('http.fetch', async (_$, e) => {
    const answer = (value: unknown, status = 200) => ({ value: { status, ok: status < 300, headers: {}, text: JSON.stringify(value) } })
    if (!w.isServing) return { deny: 'ECONNREFUSED' }
    const path = e.url.replace(/^http:\/\/127\.0\.0\.1:\d+/, '')
    // The mod's files have no modification time here, so the current version is 0-0.
    if (path === '/health') return answer({ app: 'design-map', pid: 4242, version: serverVersion(SOURCES) })
    if (path === '/api/demo/feedback' && e.init?.method !== 'POST') {
      return answer({ items: w.feedback, isListening: w.isOwnerListening, isBusy: false, owner: w.owner })
    }
    if (e.init?.headers?.['x-design-map-token'] !== 'tok') return answer('bad token', 403)
    const input = JSON.parse(e.init?.body ?? '{}')
    if (path === '/api/_library/save') {
      const isNew = !w.saved.some(s => s.id === input.id)
      w.saved.push(input)
      if (typeof input.mermaid === 'string') write(`${MAPS}/${input.id}.mmd`, input.mermaid)
      return answer({ id: input.id, revision: w.saved.filter(s => s.id === input.id).length, isNew })
    }
    if (path === '/api/demo/own') {
      w.owner = { session: input.session, label: input.label }
      return answer({ owner: w.owner })
    }
    if (path === '/api/demo/activity') {
      w.activity.push(input)
      return answer({})
    }
    if (path === '/api/demo/claim') {
      const claimed = w.feedback.filter(i => i.status === 'sent' && (input.isBusy !== true || LOCAL.has(i.action) || i.urgent === true))
      for (const item of claimed) item.status = 'working'
      return answer({ items: claimed })
    }
    const match = /^\/api\/demo\/feedback\/(\d+)$/.exec(path)
    const item = match === null ? undefined : w.feedback.find(i => i.id === Number(match[1]))
    if (item === undefined) return answer({ error: 'not found' }, 404)
    if (input.status !== undefined) item.status = input.status
    if (typeof input.reply === 'string') item.reply = input.reply
    else if (typeof input.fallback === 'string' && item.reply === undefined) item.reply = input.fallback
    return answer(item)
  })
  on('prompt.submit', async (_$, e) => {
    if (w.isSubmitRefused) return { drop: true, reason: 'refused' } as never
    w.submitted.push(e.text)
    return { text: e.text }
  })
  on('session.id', async () => ({ value: 'session-1' }))
  // The kit cannot store a row (an append answered without next is skipped, and nothing is
  // beneath): record what the mod tried to append, and let the call fail as it then does.
  on('session.append', async (_$, e, next) => {
    const block = e.message.content[0] as { text?: string } | undefined
    w.appended.push({ type: e.message.type, text: block?.text ?? '' })
    return next(e)
  })
  // Built-in tools beneath the plugin: they just succeed.
  on('tool.call', async () => ({ result: 'ok' }) as never)
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', async (_$, e) => ({ text: e.answer }))
  on('tool.register', async (_$, e) => ({ value: { tool: `mcp__design-map__${e.name}` } }))
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', async (_$, e) => {
    w.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', async () => ({ value: undefined }))
  on('ui.status', async (_$, e) => {
    w.statuses.push(e.text)
    return { value: undefined }
  })
  return w
}
