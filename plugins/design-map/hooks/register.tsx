import { atom, read, update } from 'claude-code'
import type { FsEntry, HttpInit, HttpResponse, ProcessRunInit, ProcessRunResult, Register, Timer } from 'claude-code'

import type {
  DesignMap,
  DesignMapDoc,
  DesignMapDrift,
  DesignMapProgress,
  DesignMapServer,
  DesignMapTurn,
  MapView,
} from '../types'
import { editorCommand } from './editor'
import { DECISION_NOTES, decisionPatchOf, feedbackIdsOf, feedbackPrompt, viewPatchOf } from './feedback'
import type { FeedbackItem } from './feedback'
import { guideOf, TOOL, TOOLS } from './guide'
import {
  applyUpdate,
  applyView,
  exportBlock,
  fileLine,
  filePath,
  lineRangeOf,
  ownersOf,
  pageOf,
  progressOf,
  pruneView,
  spliceBlock,
  summaryLine,
  toMermaid,
  validate,
} from './model'
import type { Diagram, MapUpdate, ViewPatch } from './model'
import { SERVER_FILES, SERVER_FLAGS, serverVersion } from './version'

const TOOL_PREFIX = 'mcp__design-map__'
/** An item's id: no dots, so no id is another's sidecar file (`a.meta` + `.json`). */
const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/
/** A drawer item's own file: a design map (.json) or a plain diagram (.mmd). */
const ITEM_FILE = /^([a-z0-9][a-z0-9_-]{0,63})\.(json|mmd)$/
/** What mermaid-cli says when a source does not parse, as opposed to failing to run. */
const MERMAID_SYNTAX = /Parse error|Lexical error|Syntax error|No diagram type detected|UnknownDiagramError/i
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const READ_TOOLS = new Set(['Read'])
const SEARCH_TOOLS = new Set(['Grep', 'Glob'])
const MAP_TOOLS = new Set([`${TOOL_PREFIX}map_update`, `${TOOL_PREFIX}map_view`])
/** How often the open map is checked for other sessions' writes and new file changes. */
const TICK_MS = 15_000
/** How often the browser's feedback is collected; also how the page knows a session listens. */
const POLL_MS = 1_000
/** How many steps of the trail the page gets. */
const TRAIL = 12
const NO_TURN: DesignMapTurn = { isRunning: false, turnId: null, feedback: null, edited: [], isMapChanged: false, changedAtStart: [] }

const docAtom = atom({ plugin: 'design-map', key: 'doc' } as const, null)
const serverAtom = atom({ plugin: 'design-map', key: 'server' } as const, { url: null, error: null })
const progressAtom = atom({ plugin: 'design-map', key: 'progress' } as const, null)
const turnAtom = atom({ plugin: 'design-map', key: 'turn' } as const, NO_TURN)
const driftAtom = atom({ plugin: 'design-map', key: 'drift' } as const, null)

/**
 * The engine calls the helpers need. `$` may only be spelled `$.noun.method()`
 * where it is used (the validator reads which calls a module makes), so the
 * session's hook builds this table of lambdas once and the helpers take it.
 */
type Io = {
  root: string
  exists: (path: string) => Promise<boolean>
  readText: (path: string) => Promise<string>
  writeText: (path: string, text: string) => Promise<void>
  mtime: (path: string) => Promise<number>
  realPath: (path: string) => Promise<string | undefined>
  list: (path: string) => Promise<FsEntry[]>
  run: (argv: readonly string[], init?: ProcessRunInit) => Promise<ProcessRunResult>
  fetch: (url: string, init?: HttpInit) => Promise<HttpResponse>
  submit: (text: string) => Promise<unknown>
  /** A row the model reads at its next request and the person does not see as typed. */
  tellModel: (text: string) => Promise<unknown>
  /** A notice the person sees in the transcript and the model never reads. */
  tellPerson: (text: string) => Promise<unknown>
  now: () => Promise<number>
  sleep: (ms: number) => Promise<void>
  after: (ms: number, fn: () => void) => Timer
  every: (ms: number, fn: () => void) => Timer
  /** The session running now: a /branch forks a new id without a session.start. */
  sessionId: () => Promise<string>
  status: (text: string | undefined) => void
  remember: (key: string, value: string) => Promise<void>
  recall: (key: string) => Promise<unknown>
  doc: Cell<DesignMapDoc | null>
  server: Cell<DesignMapServer>
  progress: Cell<DesignMapProgress | null>
  turn: Cell<DesignMapTurn>
  drift: Cell<DesignMapDrift | null>
}

/** One session value: the state library wants each atom named where it is read or written. */
type Cell<T> = {
  get: () => Promise<T>
  put: (value: T) => Promise<T>
  change: (fn: (value: T) => T) => Promise<T>
}

/** What this session is looking at, for the page: cosmetic, so a reload may forget it. */
type Focus = { kind: 'read' | 'edit' | 'search'; tool: string; path?: string; pattern?: string; ids: string[]; outside: boolean; at: number }

export const register: Register = (on, options) => {
  // Module state: a reload starts it over and session.start fills it again.
  let io: Io | undefined
  let mapsDir = ''
  let pagesDir = ''
  let cwd = ''
  let home = ''
  let isBrowserOff = false
  const nodePath = String(options.nodePath ?? '') || 'node'
  const port = Number(options.port ?? 7777) || 7777
  const editor = String(options.editor ?? 'intellij') || 'intellij'
  const editorTemplate = String(options.editorCommand ?? '')
  const base = `http://127.0.0.1:${port}`
  let ticker: Timer | undefined
  let pageTimer: Timer | undefined
  let progressTimer: Timer | undefined
  let activityTimer: Timer | undefined
  /** Maps this session already opened in the browser, so a reopen does not stack tabs. */
  const shownInBrowser = new Set<string>()
  let poller: Timer | undefined
  let token: string | undefined
  let session = ''
  let label = ''
  let isSubmitting = false
  let isPolling = false
  /** After a refused submit, comments wait this long before the next try. */
  let holdUntil = 0
  let focus: Focus | null = null
  let trail: { ids: string[]; kind: Focus['kind']; at: number }[] = []
  /** The map's repo with links resolved, so a path through a symlink still counts as inside it. */
  let repoReal: { repo: string; real: string | undefined } | undefined
  /** History folders this module already made. */
  const historyDirs = new Set<string>()

  // ------------------------------------------------------------ files

  const mapPath = (name: string) => `${mapsDir}/${name}.json`
  const viewPath = (name: string) => `${mapsDir}/${name}.view.json`
  const sourcePath = (name: string) => `${mapsDir}/${name}.mmd`
  const metaPath = (name: string) => `${mapsDir}/${name}.meta.json`
  const pageUrl = (name: string) => `${base}/map/${name}`

  async function readJson<T>(at: Io, path: string): Promise<T | undefined> {
    if (!(await at.exists(path))) return undefined
    return JSON.parse(await at.readText(path)) as T
  }

  async function writeMap(at: Io, doc: DesignMapDoc, map: DesignMap): Promise<DesignMapDoc> {
    const text = `${JSON.stringify(map, null, 2)}\n`
    await at.writeText(doc.path, text)
    await keepRevision(at, doc.name, map.revision ?? 0, text)
    const next = { ...doc, map, view: pruneView(map, doc.view), mtimeMs: await at.mtime(doc.path) }
    await at.doc.put(next)
    return next
  }

  /** Each revision of a map stays in the drawer's history, where the person can go back to it. */
  async function keepRevision(at: Io, name: string, revision: number, text: string) {
    const dir = `${mapsDir}/.history/${name}`
    try {
      if (!historyDirs.has(dir)) {
        await at.run(['mkdir', '-p', dir])
        historyDirs.add(dir)
      }
      await at.writeText(`${dir}/${revision}.json`, text)
    } catch {
      // The map itself is written; the page server keeps the current revision when it next looks.
    }
  }

  /** The title the person gave the item in the drawer, else its own. */
  async function drawerTitle(at: Io, name: string, own: string | undefined): Promise<string> {
    const meta = await readJson<{ title?: unknown }>(at, metaPath(name)).catch(() => undefined)
    return typeof meta?.title === 'string' && meta.title.trim() !== '' ? meta.title : own ?? name
  }

  /** The map as the person names it: the page, the status line and the list agree with the drawer. */
  const shownMap = (doc: DesignMapDoc): DesignMap => (doc.title === undefined || doc.title === doc.map.title ? doc.map : { ...doc.map, title: doc.title })

  async function writeView(at: Io, doc: DesignMapDoc, view: MapView): Promise<DesignMapDoc> {
    await at.writeText(viewPath(doc.name), `${JSON.stringify(view, null, 2)}\n`)
    const next = { ...doc, view }
    await at.doc.put(next)
    return next
  }

  type Header = { title?: string; context?: string; repo?: string; base?: string; diagram?: Diagram }

  /** Loads a map by name and makes it the session's; creates it when a title is given. */
  async function activate(at: Io, name: string, header: Header = {}): Promise<{ error: string } | { doc: DesignMapDoc; isNew: boolean }> {
    const path = mapPath(name)
    const found = await readJson<DesignMap>(at, path)
    if (found === undefined && (await at.exists(sourcePath(name)))) return { error: `"${name}" is a plain diagram in the drawer, not a design map; give the map another name.` }
    if (found === undefined && header.title === undefined) return { error: `No map "${name}" in ${mapsDir}; give a title to create it.` }
    if (found !== undefined && header.diagram !== undefined && header.diagram !== (found.diagram ?? 'class')) {
      return { error: `"${name}" is a ${found.diagram ?? 'class'} map and stays one; give a ${header.diagram} map another name.` }
    }
    const map: DesignMap = found ?? {
      schema: 1,
      ...(header.diagram === 'sequence' ? { diagram: 'sequence' as const } : {}),
      title: header.title ?? name,
      elements: [],
      relations: [],
      revision: 0,
    }
    const change: MapUpdate = {}
    for (const key of ['title', 'context', 'repo', 'base'] as const) {
      if (header[key] !== undefined && header[key] !== map[key]) change[key] = header[key]
    }
    const view = (await readJson<MapView>(at, viewPath(name))) ?? {}
    const title = await drawerTitle(at, name, header.title ?? map.title)
    let doc: DesignMapDoc = { name, path, map, view, mtimeMs: 0, title }
    if (found === undefined || Object.keys(change).length > 0) {
      const applied = applyUpdate(map, change)
      if (applied.errors.length > 0) return { error: applied.errors.join('\n') }
      doc = await writeMap(at, doc, { ...applied.map, revision: (map.revision ?? 0) + (found === undefined ? 0 : 1) })
    } else {
      doc = { ...doc, mtimeMs: await at.mtime(path) }
      await at.doc.put(doc)
    }
    await at.remember(`last:${cwd}`, name)
    await refreshProgress(at)
    await writePage(at)
    return { doc, isNew: found === undefined }
  }

  async function deactivate(at: Io) {
    await at.doc.put(null)
    await at.progress.put(null)
    await at.drift.put(null)
    at.status(undefined)
  }

  // ------------------------------------------------------------ browser

  /** Writes what the browser page draws; the server tells open pages it changed. */
  async function writePage(at: Io) {
    const doc = await at.doc.get()
    if (doc === null) return
    const progress = await at.progress.get()
    const page = pageOf(doc.name, doc.map, doc.view, progress?.touched ?? [], progress?.outside ?? [], await at.now())
    await at.writeText(`${pagesDir}/${doc.name}.page.json`, JSON.stringify(page))
  }

  function schedulePage() {
    const at = io
    if (at === undefined) return
    pageTimer?.cancel()
    pageTimer = at.after(30, () => void writePage(at))
  }

  async function isServing(at: Io): Promise<boolean> {
    try {
      const res = await at.fetch(`${base}/health`)
      return res.ok && res.text.includes('"design-map"')
    } catch {
      return false
    }
  }

  /** The code a server should run: a hash of the files it runs and serves, as server.mjs computes it. */
  async function wantedVersion(at: Io): Promise<string> {
    return serverVersion(await Promise.all(SERVER_FILES.map(file => at.readText(`${at.root}/${file}`))))
  }

  /** The running server, when one answers: its pid and whether it runs this mod's code. */
  async function runningServer(at: Io): Promise<{ pid: number; isCurrent: boolean } | undefined> {
    try {
      const res = await at.fetch(`${base}/health`)
      if (!res.ok || !res.text.includes('"design-map"')) return undefined
      const health = JSON.parse(res.text) as { pid: number; version?: string }
      return { pid: health.pid, isCurrent: health.version === (await wantedVersion(at)) }
    } catch {
      return undefined
    }
  }

  /** The page server, detached, its output appended to `log`: the drawer folder and where pages go. */
  function serverCommand(at: Io, log: string): string[] {
    return [
      '/bin/sh', '-c', 'log="$1"; shift; nohup "$@" >> "$log" 2>&1 < /dev/null &', 'design-map-server', log,
      nodePath, ...SERVER_FLAGS, `${at.root}/scripts/server.mjs`, String(port), pagesDir, mapsDir,
    ]
  }

  /** Starts the page server unless a current one already answers; several sessions share it. */
  async function ensureServer(at: Io): Promise<string | undefined> {
    const running = await runningServer(at)
    if (running?.isCurrent === true) {
      await at.server.put({ url: base, error: null })
      return base
    }
    // An older server keeps the old page and API: replace it. Its open pages reload themselves.
    if (running !== undefined) {
      await at.run(['kill', String(running.pid)])
      for (let i = 0; i < 10 && (await isServing(at)); i++) await at.sleep(100)
    }
    token = undefined
    const log = `${pagesDir}/server.log`
    // Detached and with its output in a file, so this call returns at once.
    await at.run(serverCommand(at, log))
    // Up to 5 seconds for it to listen: look first, then wait.
    for (let i = 0; i < 25; i++) {
      if (await isServing(at)) {
        await at.server.put({ url: base, error: null })
        return base
      }
      await at.sleep(200)
    }
    const error = `the page server did not start on port ${port}; see ${log}`
    await at.server.put({ url: null, error })
    return undefined
  }

  /**
   * Puts `session` and `label` on the session running now, and the poller with them.
   * A /branch forks a new session id under a live module without a session.start, so
   * everything that names this session to the server would otherwise keep the old id:
   * the server sees a session that no longer polls and the page reads "no session".
   */
  async function ensureSession(at: Io) {
    const id = await at.sessionId().catch(() => '')
    if (id === '' || id === session) return
    session = id
    label = `${cwd.split('/').filter(p => p !== '').at(-1) ?? '~'} · ${session.slice(0, 8)}`
    poller?.cancel()
    poller = at.every(POLL_MS, () => void pollFeedback(at))
  }

  /** Makes this session the one that receives the map's feedback. */
  async function own(at: Io, name: string) {
    await ensureSession(at)
    await api(at, `/api/${name}/own`, { session, label }).catch(() => undefined)
  }

  /** The session that receives the map's feedback now, when it is not this one and still listens. */
  async function otherOwner(at: Io, name: string): Promise<string | undefined> {
    await ensureSession(at)
    try {
      const res = await at.fetch(`${base}/api/${name}/feedback`)
      if (!res.ok) return undefined
      const state = JSON.parse(res.text) as { isListening: boolean; owner: { session: string; label: string } | null }
      return state.isListening && state.owner !== null && state.owner.session !== session ? state.owner.label : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Opens the map in the browser and takes its feedback: once per session unless `force`,
   * so tabs do not stack.
   */
  async function showInBrowser(at: Io, name: string, force = false): Promise<string> {
    const url = await ensureServer(at)
    if (url === undefined) return (await at.server.get()).error ?? 'the page server did not start'
    await own(at, name)
    if ((force || !shownInBrowser.has(name)) && !isBrowserOff) {
      await at.run(['open', pageUrl(name)])
      shownInBrowser.add(name)
    }
    return pageUrl(name)
  }

  // ------------------------------------------------------------ feedback

  /**
   * A POST to the page server with its token. A refused token is read again (the server was
   * replaced); a refused connection is tried again for a few seconds (it is being replaced).
   */
  async function api(at: Io, path: string, payload: unknown): Promise<HttpResponse> {
    let lastError: unknown
    for (let attempt = 0; attempt < 12; attempt++) {
      token ??= (await at.exists(`${pagesDir}/server.token`)) ? (await at.readText(`${pagesDir}/server.token`)).trim() : ''
      try {
        const res = await at.fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-design-map-token': token },
          body: JSON.stringify(payload),
        })
        if (res.status !== 403) return res
        token = undefined
        lastError = new Error('the page server refused the token')
      } catch (error) {
        lastError = error
      }
      await at.sleep(300)
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  async function settle(at: Io, name: string, id: number, change: { status?: FeedbackItem['status']; reply?: string; fallback?: string }) {
    await api(at, `/api/${name}/feedback/${id}`, change)
  }

  function descendantIds(map: DesignMap, id: string): Set<string> {
    const found = new Set<string>()
    let frontier = [id]
    while (frontier.length > 0) {
      const next = map.elements.filter(e => e.parent !== undefined && frontier.includes(e.parent) && !found.has(e.id)).map(e => e.id)
      for (const n of next) found.add(n)
      frontier = next
    }
    return found
  }

  /**
   * Opens one of an element's files in the user's editor. Only a path the map lists, inside its
   * repo once links are resolved: the model writes `files`, and code it read could steer that.
   */
  async function openInEditor(at: Io, map: DesignMap, entry: string): Promise<{ ok: string } | { error: string }> {
    if (map.repo === undefined) return { error: '지도에 repo가 없어서 파일 경로를 알 수 없어.' }
    if (![...map.elements, ...(map.messages ?? [])].some(e => (e.files ?? []).includes(entry))) return { error: `지도에 없는 파일이야: ${entry}` }
    const relative = filePath(entry)
    if (relative.startsWith('/') || relative.split('/').includes('..')) return { error: `repo 밖을 가리키는 경로야: ${entry}` }
    const repo = await at.realPath(map.repo)
    const file = await at.realPath(`${map.repo.replace(/\/$/, '')}/${relative}`)
    if (repo === undefined || file === undefined) return { error: `파일이 없어: ${relative}` }
    if (!file.startsWith(`${repo.replace(/\/$/, '')}/`)) return { error: `링크를 따라가면 repo 밖이야: ${relative}` }
    const command = editorCommand(editor, editorTemplate, file, fileLine(entry), home)
    if ('error' in command) return { error: command.error }
    const ran = await at.run(command.argv, { timeoutMs: 15_000 })
    if (ran.exitCode !== 0) return { error: `편집기를 열지 못했어 (${editor}): ${(ran.stderr || ran.stdout).trim().split('\n')[0] ?? ''}` }
    return { ok: `${relative}${fileLine(entry) === undefined ? '' : `:${fileLine(entry)}`}을(를) ${editor}로 열었어.` }
  }

  /**
   * Takes what the user left in the browser: view changes, picks and file opens land at once;
   * comments go to the session as one prompt once it is idle, or into the running turn when
   * the user chose to interrupt.
   */
  async function pollFeedback(at: Io) {
    const doc = await at.doc.get()
    const server = await at.server.get()
    if (doc === null || server.url === null || isPolling) return
    isPolling = true
    try {
      const turn = await at.turn.get()
      const isBusy = turn.isRunning || isSubmitting || (await at.now()) < holdUntil
      const res = await api(at, `/api/${doc.name}/claim`, { session, label, isBusy })
      if (!res.ok) return
      const { items } = JSON.parse(res.text) as { items: FeedbackItem[] }
      const forward: FeedbackItem[] = []
      for (const item of items) {
        if (item.action === 'open') {
          const current = await at.doc.get()
          if (current === null) continue
          const opened = await openInEditor(at, current.map, item.text)
          await settle(at, doc.name, item.id, 'ok' in opened ? { status: 'done', reply: opened.ok } : { status: 'failed', reply: opened.error })
          continue
        }
        const local = viewPatchOf(item)
        if (local !== undefined) {
          const current = await at.doc.get()
          if (current === null) continue
          // Unfolding means seeing inside: show what was hidden there too.
          if (item.action === 'expand' && item.target.kind === 'element') {
            const inside = descendantIds(current.map, item.target.id)
            const hidden = (current.view.hide ?? []).filter(id => inside.has(id))
            if (hidden.length > 0) local.patch.show = hidden
          }
          const { view, errors } = applyView(current.map, current.view, local.patch)
          if (errors.length > 0) await settle(at, doc.name, item.id, { status: 'failed', reply: errors.join('\n') })
          else {
            await writeView(at, current, view)
            schedulePage()
            await settle(at, doc.name, item.id, { status: 'done', reply: local.reply })
          }
          continue
        }
        // A leaning, a rejection reason or a blocker: written onto the map here, never forwarded.
        if ((DECISION_NOTES as readonly string[]).includes(item.action) && item.target.kind === 'decision') {
          const current = await at.doc.get()
          if (current === null) continue
          const latest = (await readJson<DesignMap>(at, current.path)) ?? current.map
          const note = decisionPatchOf(latest, item)
          if (note === undefined) {
            await settle(at, doc.name, item.id, { status: 'failed', reply: `결정 ${item.target.id}를 찾지 못했어.` })
            continue
          }
          const written = applyUpdate(latest, note.update)
          if (written.errors.length > 0) {
            await settle(at, doc.name, item.id, { status: 'failed', reply: written.errors.join('\n') })
            continue
          }
          await writeMap(at, current, { ...written.map, revision: (latest.revision ?? 0) + 1 })
          schedulePage()
          await settle(at, doc.name, item.id, { status: 'done', reply: note.reply })
          continue
        }
        if (item.action === 'decide' && item.target.kind === 'decision') {
          const current = await at.doc.get()
          if (current === null) continue
          const latest = (await readJson<DesignMap>(at, current.path)) ?? current.map
          const applied = applyUpdate(latest, { decisions: { upsert: [{ id: item.target.id, chosen: item.target.option ?? null, leaning: null }] } })
          if (applied.errors.length > 0) {
            await settle(at, doc.name, item.id, { status: 'failed', reply: applied.errors.join('\n') })
            continue
          }
          await writeMap(at, current, { ...applied.map, revision: (latest.revision ?? 0) + 1 })
          schedulePage()
        }
        forward.push(item)
      }
      if (forward.length === 0) return
      // The user interrupted a running turn: hand the items to it, closed when it ends.
      // If the session will not take the row, they wait for the turn like any other.
      const running = await at.turn.get()
      if (running.isRunning && running.turnId !== null) {
        const isTold = await at.tellModel(feedbackPrompt(doc.name, doc.map, forward, true)).then(() => true, () => false)
        if (isTold) {
          await at.tellPerson(`design-map: 브라우저 피드백 ${forward.map(i => `#${i.id}`).join(' ')}을(를) 진행 중인 작업에 전달했어.`).catch(() => undefined)
          await at.turn.change(t => ({ ...t, feedback: { name: doc.name, ids: [...(t.feedback?.ids ?? []), ...forward.map(i => i.id)] } }))
          return
        }
      }
      await submitFeedback(at, doc.name, forward)
    } catch {
      // The server went away; the next poll after it is back picks up where this left off.
    } finally {
      isPolling = false
    }
  }

  async function submitFeedback(at: Io, name: string, items: FeedbackItem[]) {
    const doc = await at.doc.get()
    if (doc === null) return
    isSubmitting = true
    let isTaken = false
    try {
      // Resolves once the turn starts: the session was idle, or this waits for it to be.
      const entered = await at.submit(feedbackPrompt(name, doc.map, items))
      isTaken = !(typeof entered === 'object' && entered !== null && 'drop' in entered && entered.drop !== undefined)
    } catch {
      isTaken = false
    } finally {
      isSubmitting = false
    }
    // Refused or failed: back to waiting, and a pause so a refusing session is not asked every second.
    if (!isTaken) {
      holdUntil = (await at.now()) + 10_000
      for (const item of items) await settle(at, name, item.id, { status: 'sent' }).catch(() => undefined)
    }
  }

  // ------------------------------------------------------------ focus

  /**
   * A path's place in the map's repo, relative, whether it is spelled through the repo as given
   * or through links (the workspace reads code via targets/ symlinks); undefined outside it.
   */
  async function inRepo(at: Io, map: DesignMap, path: string): Promise<string | undefined> {
    const repo = map.repo?.replace(/\/$/, '')
    if (repo === undefined) return undefined
    if (path.startsWith(`${repo}/`)) return path.slice(repo.length + 1)
    if (repoReal?.repo !== repo) repoReal = { repo, real: (await at.realPath(repo))?.replace(/\/$/, '') }
    const real = repoReal.real
    if (real === undefined) return undefined
    if (path.startsWith(`${real}/`)) return path.slice(real.length + 1)
    const resolved = await at.realPath(path)
    return resolved !== undefined && resolved.startsWith(`${real}/`) ? resolved.slice(real.length + 1) : undefined
  }

  /** Where a tool call is looking, as the page shows it: the elements owning its file, or a search. */
  async function focusOf(at: Io, map: DesignMap, tool: string, args: Record<string, unknown>, now: number): Promise<Focus | null> {
    const text = (key: string) => (typeof args[key] === 'string' ? (args[key] as string) : undefined)
    if (SEARCH_TOOLS.has(tool)) {
      const pattern = text('pattern')
      return { kind: 'search', tool, pattern, path: text('path'), ids: [], outside: false, at: now }
    }
    const kind = EDIT_TOOLS.has(tool) ? 'edit' : READ_TOOLS.has(tool) ? 'read' : undefined
    const path = text('file_path') ?? text('notebook_path')
    if (kind === undefined || path === undefined) return null
    const relative = await inRepo(at, map, path)
    const lines = await linesOf(at, map, tool, args, path)
    const ids = relative === undefined ? ownersOf(map, path, lines) : ownersOf(map, `${map.repo?.replace(/\/$/, '')}/${relative}`, lines)
    return { kind, tool, path: relative ?? path, ids, outside: ids.length === 0 && relative !== undefined, at: now }
  }

  /**
   * The lines a call reads or is about to edit, so a sequence map can light the one message whose
   * call site is there: Read's offset and limit, the place of Edit's old text (read before it runs).
   * Undefined for a whole-file read or write, and on class maps, which never need it.
   */
  async function linesOf(at: Io, map: DesignMap, tool: string, args: Record<string, unknown>, path: string): Promise<[number, number] | undefined> {
    if (map.diagram !== 'sequence' || !(map.messages ?? []).some(m => (m.files ?? []).some(f => fileLine(f) !== undefined))) return undefined
    if (tool === 'Read') {
      const offset = typeof args.offset === 'number' ? args.offset : undefined
      if (offset === undefined) return undefined
      return [offset, offset + (typeof args.limit === 'number' ? args.limit : 2000) - 1]
    }
    const olds = tool === 'Edit' ? [args.old_string]
      : tool === 'MultiEdit' && Array.isArray(args.edits) ? (args.edits as Record<string, unknown>[]).map(e => e?.old_string)
      : []
    const texts = olds.filter((t): t is string => typeof t === 'string' && t !== '')
    if (texts.length === 0) return undefined
    const source = await at.readText(path).catch(() => undefined)
    if (source === undefined) return undefined
    const ranges = texts.map(t => lineRangeOf(source, t)).filter(r => r !== undefined)
    if (ranges.length === 0) return undefined
    return [Math.min(...ranges.map(r => r[0])), Math.max(...ranges.map(r => r[1]))]
  }

  /** Tells the page what this session is doing; batched, since tool calls come in bursts. */
  function scheduleActivity() {
    const at = io
    if (at === undefined) return
    activityTimer?.cancel()
    activityTimer = at.after(150, () => void postActivity(at))
  }

  async function postActivity(at: Io) {
    const doc = await at.doc.get()
    const server = await at.server.get()
    if (doc === null || server.url === null) return
    const turn = await at.turn.get()
    const drift = await at.drift.get()
    await api(at, `/api/${doc.name}/activity`, {
      session,
      label,
      isRunning: turn.isRunning,
      isBusy: turn.isRunning || isSubmitting,
      current: turn.isRunning ? focus : null,
      trail,
      drift: drift !== null && drift.name === doc.name ? drift : null,
    }).catch(() => undefined)
  }

  // ------------------------------------------------------------ progress

  async function refreshProgress(at: Io) {
    const doc = await at.doc.get()
    if (doc === null) return
    const repo = doc.map.repo
    if (repo === undefined) {
      await at.progress.put(null)
      await showStatus(at)
      return
    }
    const previous = await at.progress.get()
    // Measure from where the branch left `base`, so commits that landed on base since are not counted.
    const forked = doc.map.base === undefined ? undefined : await at.run(['git', '-C', repo, 'merge-base', 'HEAD', doc.map.base])
    const from = forked?.exitCode === 0 ? forked.stdout.trim() : doc.map.base ?? 'HEAD'
    const diff = await at.run(['git', '-C', repo, 'diff', '--name-only', from])
    if (diff.exitCode !== 0) {
      const error = diff.stderr.trim().split('\n')[0] || 'git diff failed'
      await at.progress.put({ touched: [], outside: [], changed: 0, files: [], checkedAt: await at.now(), error })
      await showStatus(at)
      return
    }
    const untracked = await at.run(['git', '-C', repo, 'ls-files', '--others', '--exclude-standard'])
    const changed = [...new Set([...diff.stdout.split('\n'), ...untracked.stdout.split('\n')].map(s => s.trim()).filter(s => s !== ''))]
    const { touched, outside } = progressOf(doc.map, changed)
    const next: DesignMapProgress = { touched, outside, changed: changed.length, files: changed, checkedAt: await at.now() }
    await at.progress.put(next)
    // A map opened mid-turn: what was already changed now is not this turn's work.
    const turn = await at.turn.get()
    if (turn.isRunning && turn.changedAtStart === null) await at.turn.change(t => ({ ...t, changedAtStart: changed }))
    const isSame = [...touched].sort().join() === [...(previous?.touched ?? [])].sort().join()
      && outside.join() === (previous?.outside ?? []).join()
    if (!isSame) schedulePage()
    await showStatus(at)
  }

  function scheduleProgress() {
    const at = io
    if (at === undefined) return
    progressTimer?.cancel()
    progressTimer = at.after(800, () => void refreshProgress(at))
  }

  async function showStatus(at: Io) {
    const doc = await at.doc.get()
    if (doc === null) {
      at.status(undefined)
      return
    }
    const progress = await at.progress.get()
    at.status(summaryLine(shownMap(doc), progress?.touched ?? [], progress?.outside ?? []))
  }

  /**
   * Picks up another session's writes to the map (or a restore from the drawer), the name the
   * person gave it there, then the working tree's changes. A map the person put in the trash closes.
   */
  async function tick(at: Io) {
    const doc = await at.doc.get()
    if (doc === null) return
    if (!(await at.exists(doc.path))) {
      await deactivate(at)
      return
    }
    const mtimeMs = await at.mtime(doc.path)
    const map = mtimeMs === doc.mtimeMs ? doc.map : await readJson<DesignMap>(at, doc.path).catch(() => undefined)
    const title = await drawerTitle(at, doc.name, (map ?? doc.map).title)
    if (map !== undefined && (map !== doc.map || title !== doc.title)) {
      await at.doc.put({ ...doc, map, view: pruneView(map, doc.view), mtimeMs, title })
      if (map !== doc.map) schedulePage()
    }
    await refreshProgress(at)
  }

  /** The drawer's items by id: a design map wins over a stray diagram of the same id. */
  async function drawerItems(at: Io): Promise<Map<string, 'map' | 'diagram'>> {
    const entries = (await at.exists(mapsDir)) ? await at.list(mapsDir) : []
    const kinds = new Map<string, 'map' | 'diagram'>()
    for (const entry of entries) {
      const m = entry.kind === 'file' ? ITEM_FILE.exec(entry.name) : null
      if (m === null || m[1] === undefined) continue
      if (m[2] === 'json') kinds.set(m[1], 'map')
      else if (!kinds.has(m[1])) kinds.set(m[1], 'diagram')
    }
    return kinds
  }

  async function listText(at: Io): Promise<string> {
    const kinds = await drawerItems(at)
    if (kinds.size === 0) return `Nothing in the drawer yet (${mapsDir}). Ask Claude to open a design map or save a diagram.`
    const lines = await Promise.all([...kinds].map(async ([name, kind]) => {
      const own = kind === 'map' ? (await readJson<DesignMap>(at, mapPath(name)).catch(() => undefined))?.title ?? '(unreadable)' : undefined
      return `- ${name}: ${await drawerTitle(at, name, own)}${kind === 'diagram' ? ' (다이어그램)' : ''}`
    }))
    return [`Design maps and diagrams in ${mapsDir}:`, ...lines, '', 'Open one with /design-map <name>, the drawer with /design-map drawer (or dmap in a shell).'].join('\n')
  }

  // ------------------------------------------------------------ session

  on('session.start', async ($, e, next) => {
    io = {
      root: $.plugin.root,
      exists: path => $.fs.exists(path),
      readText: path => $.fs.read(path),
      writeText: (path, text) => $.fs.write(path, text),
      mtime: async path => (await $.fs.stat(path)).mtimeMs,
      realPath: async path => (await $.fs.stat(path, { resolve: true }).catch(() => undefined))?.realPath,
      list: path => $.fs.list(path),
      run: (argv, init) => $.process.run(argv, init),
      fetch: (url, init) => $.http.fetch(url, init),
      submit: text => $.prompt.submit({ text }),
      tellModel: text => $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } }),
      tellPerson: text => $.session.append({ message: { type: 'system', content: [{ type: 'text', text }] } }),
      now: () => $.clock.now(),
      sleep: ms => $.clock.sleep(ms),
      after: (ms, fn) => $.clock.after(ms, fn),
      every: (ms, fn) => $.clock.every(ms, fn),
      sessionId: () => $.session.id(),
      status: text => $.ui.status(text),
      remember: (key, value) => $.store.set(key, value),
      recall: key => $.store.get(key),
      doc: { get: () => read($, docAtom), put: v => update($, docAtom, () => v), change: fn => update($, docAtom, fn) },
      server: { get: () => read($, serverAtom), put: v => update($, serverAtom, () => v), change: fn => update($, serverAtom, fn) },
      progress: { get: () => read($, progressAtom), put: v => update($, progressAtom, () => v), change: fn => update($, progressAtom, fn) },
      turn: { get: async () => ({ ...NO_TURN, ...(await read($, turnAtom)) }), put: v => update($, turnAtom, () => v), change: fn => update($, turnAtom, t => fn({ ...NO_TURN, ...t })) },
      drift: { get: () => read($, driftAtom), put: v => update($, driftAtom, () => v), change: fn => update($, driftAtom, fn) },
    }
    const at = io
    cwd = e.cwd
    home = (await $.env.get('HOME')) ?? ''
    isBrowserOff = (await $.env.get('DESIGN_MAP_NO_BROWSER')) === '1'
    mapsDir = (await $.env.get('DESIGN_MAP_DIR')) || String(options.mapsDir ?? '') || `${home}/.claude/design-maps`
    pagesDir = `${home}/.cache/design-map`
    await $.process.run(['mkdir', '-p', mapsDir, pagesDir])
    // The shell's dmap starts the same server outside any session: leave it these settings.
    await $.fs.write(`${pagesDir}/launch.json`, `${JSON.stringify({ nodePath, port, mapsDir }, null, 2)}\n`)
    for (const tool of TOOLS) await $.tool.register(tool)
    await $.command.register({
      name: 'design-map',
      description: 'Design map: /design-map [name | list | drawer | browser | export <file.md> | close]',
    })
    session = await $.session.id()
    label = `${cwd.split('/').filter(p => p !== '').at(-1) ?? '~'} · ${session.slice(0, 8)}`
    ticker?.cancel()
    ticker = $.clock.every(TICK_MS, () => void tick(at))
    poller?.cancel()
    poller = $.clock.every(POLL_MS, () => void pollFeedback(at))
    // After a hot reload the map is still in $.state: bring the page up to date. Feedback this
    // session had taken stays taken: a reload can come mid-turn, while that turn handles it.
    const active = await read($, docAtom)
    if (active !== null) {
      await showStatus(at)
      schedulePage()
      // The server may be an older one (the mod's code just changed): swap it, off this start.
      if ((await read($, serverAtom)).url !== null) void ensureServer(at).catch(() => undefined)
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    ticker?.cancel()
    poller?.cancel()
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // A /branch forks a new session id without a session.start, leaving `session` on the
    // forked-from one: the server then waits on a session that never polls again. This turn
    // runs in the session that matters, so take its id here and put the poller back on it.
    const running = await $.session.id()
    if (running !== '' && running !== session && io !== undefined) {
      session = running
      label = `${cwd.split('/').filter(p => p !== '').at(-1) ?? '~'} · ${session.slice(0, 8)}`
      poller?.cancel()
      poller = $.clock.every(POLL_MS, () => void pollFeedback(io as Io))
    }
    const ids = feedbackIdsOf(e.text)
    const doc = await read($, docAtom)
    const progress = await read($, progressAtom)
    await update($, turnAtom, () => ({
      isRunning: true,
      turnId: e.turnId,
      feedback: ids.length > 0 && doc !== null ? { name: doc.name, ids } : null,
      edited: [],
      isMapChanged: false,
      changedAtStart: progress?.files ?? null,
    }))
    focus = null
    scheduleActivity()
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId !== undefined) return result
    // A turn value an older version of the mod wrote lacks the newer fields.
    const turn: DesignMapTurn = { ...NO_TURN, ...(await read($, turnAtom)) }
    await update($, turnAtom, () => NO_TURN)
    focus = null
    const at = io
    if (at === undefined) return result
    const doc = await read($, docAtom)
    if (doc !== null) {
      await refreshProgress(at)
      await checkDrift(at, turn, e.turnId)
    }
    scheduleActivity()
    // Close the loop even when no map_reply came: the turn's answer stands for the reply.
    if (turn.feedback !== null && turn.turnId === e.turnId) {
      const answer = e.isAborted ? '' : e.answer.trim()
      for (const id of turn.feedback.ids) {
        await settle(at, turn.feedback.name, id, e.isAborted
          ? { status: 'failed', reply: '턴이 중간에 멈췄어. 다시 보내 줘.' }
          : { status: 'answered', fallback: answer === '' ? '처리했어. 자세한 내용은 터미널의 답변을 봐 줘.' : answer }).catch(() => undefined)
      }
    }
    return result
  })

  /**
   * Code changed in the map's repo this turn and the map did not: tell the person (a notice)
   * and the model (a row it reads next), once per episode; the next map change ends it.
   */
  async function checkDrift(at: Io, turn: DesignMapTurn, turnId: string) {
    const doc = await at.doc.get()
    if (doc === null || doc.map.repo === undefined || turn.isMapChanged || turn.turnId !== turnId) return
    const progress = await at.progress.get()
    // No baseline means the map opened mid-turn: only the edit tools' own files are known to be this turn's.
    const before = turn.changedAtStart === null ? null : new Set(turn.changedAtStart)
    const files = [...new Set([...turn.edited, ...(before === null ? [] : (progress?.files ?? []).filter(f => !before.has(f)))])]
    if (files.length === 0) return
    const drift = await at.drift.get()
    const isNewEpisode = drift === null || drift.name !== doc.name
    await at.drift.put({ name: doc.name, files: [...new Set([...(isNewEpisode ? [] : drift?.files ?? []), ...files])], turnId })
    scheduleActivity()
    if (!isNewEpisode) return
    const list = files.slice(0, 8).join(', ')
    // Best effort: the browser shows the drift whether or not the rows land.
    await at.tellPerson(`design-map: 이번 턴에 코드 파일 ${files.length}개(${list})가 바뀌었는데 지도 "${doc.name}"은 그대로야.`).catch(() => undefined)
    await at.tellModel(`[design-map] 지난 턴에 지도 "${doc.name}"의 repo에서 코드 파일 ${files.length}개(${list})가 바뀌었는데 지도는 갱신되지 않았어. 지도에 반영할 게 있으면 map_update로 고쳐 줘. 반영할 게 없으면 그대로 둬도 돼.`).catch(() => undefined)
  }

  // Watches every tool call: where the session is looking (for the page), what it edits
  // (for progress and drift), and whether it changed the map. Records first, I/O later.
  on('tool.call', async ($, e, next) => {
    const tool = String(e.tool)
    const doc = await read($, docAtom)
    if (doc !== null && io !== undefined && (READ_TOOLS.has(tool) || EDIT_TOOLS.has(tool) || SEARCH_TOOLS.has(tool))) {
      const seen = await focusOf(io, doc.map, tool, e as unknown as Record<string, unknown>, Date.now())
      if (seen !== null) {
        focus = seen
        if (seen.ids.length > 0) {
          const last = trail.at(-1)
          if (last === undefined || last.ids.join() !== seen.ids.join() || last.kind !== seen.kind) trail = [...trail, { ids: seen.ids, kind: seen.kind, at: seen.at }].slice(-TRAIL)
        }
        scheduleActivity()
      }
    }
    const result = await next(e)
    if (doc === null) return result
    if (EDIT_TOOLS.has(tool)) {
      const path = String((e as unknown as Record<string, unknown>).file_path ?? (e as unknown as Record<string, unknown>).notebook_path ?? '')
      const relative = io === undefined ? undefined : await inRepo(io, doc.map, path)
      if (relative !== undefined) {
        await update($, turnAtom, t => ((t.edited ?? []).includes(relative) ? t : { ...NO_TURN, ...t, edited: [...(t.edited ?? []), relative] }))
      }
      scheduleProgress()
    }
    if (MAP_TOOLS.has(tool) && result.deny === undefined && result.isError !== true) {
      await update($, turnAtom, t => ({ ...t, isMapChanged: true }))
      await update($, driftAtom, () => null)
      scheduleActivity()
    }
    return result
  })

  // ------------------------------------------------------------ tools

  /** A tool that throws (a map file that does not parse, a write that fails) answers with the reason. */
  async function answer(work: (at: Io) => Promise<{ result: string } | { deny: string }>) {
    if (io === undefined) return { deny: 'design-map is still starting; try again.' }
    try {
      return await work(io)
    } catch (error) {
      return { deny: `design-map: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  const textArg = (value: unknown) => (typeof value === 'string' ? value : undefined)

  on('tool.call', { tool: `${TOOL_PREFIX}${TOOL.open}` }, async ($, e) => answer(async at => {
    const args = e as unknown as Record<string, unknown>
    const name = String(args.name ?? '').trim()
    if (!NAME.test(name)) return { deny: `name must be lowercase letters, digits, _ and - (got "${name}")` }
    const diagram = args.diagram === 'sequence' || args.diagram === 'class' ? args.diagram : undefined
    if (args.diagram !== undefined && diagram === undefined) return { deny: `diagram must be class or sequence (got "${String(args.diagram)}")` }
    const opened = await activate(at, name, {
      title: textArg(args.title),
      context: textArg(args.context),
      repo: textArg(args.repo),
      base: textArg(args.base),
      ...(diagram === undefined ? {} : { diagram }),
    })
    if ('error' in opened) return { deny: opened.error }
    const { doc, isNew } = opened
    // Another live session already shows this map to the user: stay out of its way.
    const server = await ensureServer(at)
    const other = server === undefined ? undefined : await otherOwner(at, name)
    const shown = other === undefined ? await showInBrowser(at, name) : pageUrl(name)
    const errors = validate(doc.map, doc.view)
    const { used, warnings } = toMermaid(doc.map, doc.view)
    const codeless = doc.map.elements.filter(e => e.kind !== 'group' && (e.files?.length ?? 0) === 0 && e.kind !== 'table' && e.kind !== 'external' && e.kind !== 'actor')
    const isSequence = doc.map.diagram === 'sequence'
    return {
      result: [
        guideOf(isSequence ? 'sequence' : 'class'),
        '',
        `## ${isNew ? 'Created' : 'Opened'} ${isSequence ? 'sequence map' : 'map'} "${name}" (${doc.path}), revision ${doc.map.revision ?? 0}`,
        shownMap(doc).title === doc.map.title ? '' : `The user renamed it "${shownMap(doc).title}" in their drawer; call it that.`,
        other === undefined
          ? `Browser: ${shown.startsWith('http') ? `${shown} (the user sees the diagram there; it updates on every change, and their feedback comes to this session)` : shown}.`
          : `Browser: another session (${other}) shows this map to the user and receives its feedback; this session only keeps the map up to date. /design-map moves the feedback here.`,
        doc.map.repo === undefined ? 'No repo: set repo (and files on code elements) so progress, the user\'s view of where you are looking, and opening files in their editor work.' : `Repo: ${doc.map.repo}${doc.map.base === undefined ? ' (no base: progress counts uncommitted changes only)' : `, base ${doc.map.base}`}.`,
        codeless.length > 0 ? `${isSequence ? 'Participants' : 'Elements'} with no files yet: ${codeless.map(e => e.id).join(', ')}.` : '',
        isSequence ? `Participants: ${used.boxes}, messages: ${doc.map.messages?.length ?? 0}.` : `Visible boxes: ${used.boxes}.`,
        errors.length > 0 ? `Validation errors to fix:\n- ${errors.join('\n- ')}` : 'Valid.',
        ...warnings.map(w => `Warning: ${w}`),
        `Map: ${JSON.stringify(doc.map)}`,
        `View: ${JSON.stringify(doc.view)}`,
      ].filter(line => line !== '').join('\n'),
    }
  }))

  on('tool.call', { tool: `${TOOL_PREFIX}${TOOL.update}` }, async ($, e) => answer(async at => {
    const doc = await at.doc.get()
    if (doc === null) return { deny: 'No design map is open: call map_open first.' }
    const { tool: _tool, tool_use_id: _id, ...change } = e as unknown as Record<string, unknown>
    // Always apply to the file as it is now: another session may have written it, or the user
    // restored an older revision in the drawer, or put the map in its trash.
    const latest = await readJson<DesignMap>(at, doc.path)
    if (latest === undefined) {
      await deactivate(at)
      return { deny: `The map "${doc.name}" is no longer in the drawer: the user moved it to the trash. Ask them before making it again.` }
    }
    const applied = applyUpdate(latest, change as MapUpdate)
    if (applied.errors.length > 0) {
      return { deny: `Nothing was written. Fix these and send the whole batch again:\n- ${applied.errors.join('\n- ')}` }
    }
    const revision = (latest.revision ?? 0) + 1
    const saved = await writeMap(at, doc, { ...applied.map, revision })
    if ('repo' in change || 'base' in change || 'elements' in change || 'messages' in change) await refreshProgress(at)
    schedulePage()
    const { used, warnings } = toMermaid(saved.map, saved.view)
    const messages = saved.map.messages?.length ?? 0
    return {
      result: [
        `Saved revision ${revision}.${(latest.revision ?? 0) !== (doc.map.revision ?? 0) ? ' Another session had changed the map; this applied on top of its version.' : ''}`,
        saved.map.diagram === 'sequence'
          ? `Participants: ${used.boxes}, messages: ${messages}${used.boxes > 8 || messages > 30 ? ' (past ~8 participants or ~30 messages: split the flow into another map)' : ''}.`
          : `Visible boxes: ${used.boxes}${used.boxes > 14 ? ' (over ~12: fold groups with map_view)' : ''}.`,
        ...applied.notes,
        ...warnings.map(w => `Warning: ${w}`),
      ].join('\n'),
    }
  }))

  on('tool.call', { tool: `${TOOL_PREFIX}${TOOL.view}` }, async ($, e) => answer(async at => {
    const doc = await at.doc.get()
    if (doc === null) return { deny: 'No design map is open: call map_open first.' }
    const { tool: _tool, tool_use_id: _id, ...patch } = e as unknown as Record<string, unknown>
    const { view, errors } = applyView(doc.map, doc.view, patch as ViewPatch)
    if (errors.length > 0) return { deny: `View not changed:\n- ${errors.join('\n- ')}` }
    const saved = await writeView(at, doc, view)
    schedulePage()
    const { used, warnings } = toMermaid(saved.map, saved.view)
    return { result: [`View: ${JSON.stringify(view)}`, `Visible boxes: ${used.boxes}.`, ...warnings.map(w => `Warning: ${w}`)].join('\n') }
  }))

  on('tool.call', { tool: `${TOOL_PREFIX}${TOOL.reply}` }, async ($, e) => answer(async at => {
    const doc = await at.doc.get()
    if (doc === null) return { deny: 'No design map is open: call map_open first.' }
    const args = e as unknown as { id?: unknown; text?: unknown }
    const ids = (Array.isArray(args.id) ? args.id : [args.id]).map(Number).filter(n => Number.isInteger(n) && n > 0)
    const text = typeof args.text === 'string' ? args.text.trim() : ''
    if (ids.length === 0 || text === '') return { deny: 'Give the feedback id (or ids) and a reply text.' }
    for (const id of ids) {
      const res = await api(at, `/api/${doc.name}/feedback/${id}`, { status: 'answered', reply: text })
      if (!res.ok) return { deny: `No feedback #${id} on map "${doc.name}".` }
    }
    return { result: `Replied to ${ids.map(i => `#${i}`).join(' ')}; the user sees it under the feedback in the browser.` }
  }))

  /**
   * The node to run, as a full path: mermaid-cli is found beside it (a global install). The
   * default `node` is looked up on PATH once; a node that cannot be found stays `node`.
   */
  let nodeFound: string | undefined
  async function resolvedNode(at: Io): Promise<string> {
    if (nodePath.includes('/')) return nodePath
    if (nodeFound === undefined) {
      const found = await at.run(['/bin/sh', '-c', `command -v ${nodePath}`], { timeoutMs: 5_000 }).catch(() => undefined)
      const path = found?.exitCode === 0 ? found.stdout.trim() : ''
      nodeFound = path.includes('/') ? path : nodePath
    }
    return nodeFound
  }

  /**
   * Whether Mermaid can draw a source: mermaid-cli renders it once (about a second). Only a
   * syntax error refuses the save; a renderer that does not run lets it through, unchecked.
   */
  async function checkMermaid(at: Io, source: string): Promise<{ error?: string; warning?: string }> {
    const stem = `${pagesDir}/check-${session.slice(0, 8) || 'session'}`
    await at.writeText(`${stem}.mmd`, source)
    const node = await resolvedNode(at)
    const cli = `${node.slice(0, node.lastIndexOf('/') + 1)}../lib/node_modules/@mermaid-js/mermaid-cli/src/cli.js`
    const ran = await at.run([node, cli, '-i', `${stem}.mmd`, '-o', `${stem}.svg`, '-q'], { timeoutMs: 30_000 }).catch(() => undefined)
    if (ran?.exitCode === 0) return {}
    const said = `${ran?.stderr ?? ''}\n${ran?.stdout ?? ''}`.trim()
    if (MERMAID_SYNTAX.test(said)) return { error: said.split('\n').filter(l => l.trim() !== '').slice(0, 6).join('\n') }
    return { warning: `Mermaid did not check it (${said.split('\n')[0] || 'mermaid-cli did not run'}); look at it in the browser.` }
  }

  on('tool.call', { tool: `${TOOL_PREFIX}${TOOL.save}` }, async ($, e) => answer(async at => {
    const args = e as unknown as Record<string, unknown>
    const name = String(args.name ?? '').trim()
    if (!NAME.test(name)) return { deny: `name must be lowercase letters, digits, _ and - (got "${name}")` }
    if (await at.exists(mapPath(name))) return { deny: `"${name}" is a design map; save the diagram under another name.` }
    const isNew = !(await at.exists(sourcePath(name)))
    const mermaid = textArg(args.mermaid)
    const title = textArg(args.title)?.trim()
    if (isNew && (mermaid === undefined || mermaid.trim() === '' || title === undefined || title === '')) {
      return { deny: `No diagram "${name}" yet: give a title and the Mermaid source to make it.` }
    }
    const checked = mermaid === undefined ? {} : await checkMermaid(at, mermaid)
    if (checked.error !== undefined) return { deny: `Nothing was saved: Mermaid cannot draw this source.\n${checked.error}` }
    if ((await ensureServer(at)) === undefined) return { deny: (await at.server.get()).error ?? 'the page server did not start' }
    const tags = Array.isArray(args.tags) ? args.tags.filter((t): t is string => typeof t === 'string') : undefined
    const res = await api(at, '/api/_library/save', { id: name, title, mermaid, tags, memo: textArg(args.memo) })
    const saved = JSON.parse(res.text) as { revision?: number; isNew?: boolean; error?: string }
    if (!res.ok) return { deny: `Not saved: ${saved.error ?? res.text}` }
    if (saved.isNew === true && !isBrowserOff) await at.run(['open', pageUrl(name)])
    return {
      result: [
        `${saved.isNew === true ? 'Saved the new diagram' : 'Saved'} "${name}" in the drawer, revision ${saved.revision ?? '?'}: ${pageUrl(name)}${saved.isNew === true ? ' (opened in the browser)' : ' (an open page updates by itself)'}.`,
        `Source file: ${sourcePath(name)}. The user can edit it, tag it and write a memo in the browser; read the file again before your next change.`,
        checked.warning ?? '',
      ].filter(line => line !== '').join('\n'),
    }
  }))

  // ------------------------------------------------------------ command

  on('command.run', { command: 'design-map' }, async ($, e) => {
    const at = io
    if (at === undefined) return { text: 'design-map is still starting; try again.' }
    const [verb = '', ...rest] = e.args.trim().split(/\s+/).filter(s => s !== '')
    if (verb === 'list') return { text: await listText(at) }
    if (verb === 'close') {
      await deactivate(at)
      return { text: 'Design map closed.' }
    }
    if (verb === 'export') {
      const doc = await at.doc.get()
      const target = rest.join(' ')
      if (doc === null) return { text: 'No design map is open.' }
      if (target === '') return { text: 'Usage: /design-map export <file.md>' }
      const existing = (await at.exists(target)) ? await at.readText(target) : ''
      await at.writeText(target, spliceBlock(existing, doc.name, exportBlock(doc.name, doc.map, doc.view)))
      return { text: `Exported "${doc.name}" to ${target}.` }
    }
    if (verb === 'browser') {
      const doc = await at.doc.get()
      if (doc === null) return { text: 'No design map is open.' }
      return { text: `Opened ${await showInBrowser(at, doc.name, true)}` }
    }
    if (verb === 'drawer') return { text: await openPage(at, `${base}/`, 'the drawer') }
    if (verb !== '' && !NAME.test(verb)) return { text: `No item "${verb}": names are lowercase letters, digits, _ and -.\n\n${await listText(at)}` }
    // A plain diagram is the drawer's own: its page opens, and no session takes its feedback.
    if ((await drawerItems(at)).get(verb) === 'diagram') return { text: await openPage(at, pageUrl(verb), `diagram "${verb}"`) }
    let doc = await at.doc.get()
    const wanted = verb !== '' ? verb : doc === null ? String((await at.recall(`last:${cwd}`)) ?? '') : ''
    if (wanted !== '' && wanted !== doc?.name) {
      const opened = await activate(at, wanted)
      if ('error' in opened) return { text: `${opened.error}\n\n${await listText(at)}` }
      doc = opened.doc
    }
    if (doc === null) return { text: await listText(at) }
    // The person asked for it here: this session takes the map's feedback.
    const shown = await showInBrowser(at, doc.name)
    return { text: `Design map "${doc.name}": ${shown} (feedback comes to this session)` }
  })

  /** Starts the page server if need be and shows one of its pages in the browser. */
  async function openPage(at: Io, url: string, what: string): Promise<string> {
    if ((await ensureServer(at)) === undefined) return (await at.server.get()).error ?? 'the page server did not start'
    if (!isBrowserOff) await at.run(['open', url])
    return `Opened ${what}: ${url}`
  }
}

