#!/usr/bin/env node
// The design map's browser side: a small server on 127.0.0.1 that serves the
// diagram drawer (every design map and plain Mermaid diagram in the maps folder,
// with the person's titles, tags, pins and memos, versions and trash), one page
// per item, pushes each change to the open pages, carries the user's feedback
// from a map's page to the Claude session that owns the map (which claims it)
// and the replies back, and relays what each session is looking at right now.
//
//   node --experimental-strip-types server.mjs <port> <pages-dir> <maps-dir>
//   node --experimental-strip-types server.mjs --version
//
// In <maps-dir>, for an item <id> (no dots, so no id is another's sidecar):
//   <id>.json           a design map; the mod writes it, and <id>.view.json its view
//   <id>.mmd            a plain Mermaid diagram; only this server writes it
//   <id>.meta.json      the drawer's record (title, tags, pin, memo); only this server writes it
//   <id>.feedback.json  a map's feedback thread and its owner session
//   .history/<id>/<n>.json|mmd   each revision;  .trash/<id>~<ms>/   what the person threw away
// The mod writes <pages-dir>/<id>.page.json for a map a session has open (with
// its progress); any other revision this server draws itself with hooks/model.ts.
// Several sessions share one server; it exits after IDLE_MS with no page open
// and no request.
//
// Every request must name this server as its Host (no DNS rebinding), and
// every POST must carry the token from <pages-dir>/server.token in a custom
// header and no foreign Origin: other web pages cannot turn requests into
// prompts for a session that can run commands.

import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmdirSync, statSync, unlinkSync, utimesSync, watch, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { fileLine, filePath, pageOf, pruneView } from '../hooks/model.ts'

const here = dirname(fileURLToPath(import.meta.url))
const ownSource = readFileSync(fileURLToPath(import.meta.url), 'utf8')
const page = readFileSync(join(here, 'page.html'), 'utf8')
const library = readFileSync(join(here, 'library.html'), 'utf8')
const modelSource = readFileSync(join(here, '..', 'hooks', 'model.ts'), 'utf8')

// Keep identical to hooks/version.ts: two installed copies with the same code agree on it.
function fnv1a(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
/** Which code this is, over SERVER_FILES in hooks/version.ts: a starter replaces a server whose version is not its files'. */
const VERSION = fnv1a([ownSource, page, library, modelSource].join('\n'))
if (process.argv[2] === '--version') {
  console.log(VERSION)
  process.exit(0)
}

const [portArg, pagesDir, mapsDir] = process.argv.slice(2)
const port = Number(portArg)
if (!Number.isInteger(port) || pagesDir === undefined || mapsDir === undefined) {
  console.error('usage: server.mjs <port> <pages-dir> <maps-dir>')
  process.exit(2)
}

const IDLE_MS = 30 * 60_000
/** An owner that has not polled for this long is not listening. */
const LISTEN_MS = 4_000
/** A session silent this long is gone: what it took goes back to waiting. */
const GONE_MS = 60_000
/** Activity older than this is dropped from the page. */
const ACTIVITY_MS = 10 * 60_000
const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/
const ITEM_FILE = /^([a-z0-9][a-z0-9_-]{0,63})\.(json|mmd)$/
const TRASH_ENTRY = /^([a-z0-9][a-z0-9_-]{0,63})~(\d{1,16})$/
/** Every file an item has beside its history, by what follows the id. */
const ITEM_SUFFIXES = ['.json', '.view.json', '.mmd', '.meta.json', '.feedback.json']
const LOCAL_ACTIONS = new Set(['expand', 'collapse', 'hide', 'reset', 'decide', 'open', 'lean', 'reject', 'blocked', 'scope'])
const ACTIONS = new Set([...LOCAL_ACTIONS, 'comment', 'explain', 'propose'])
/**
 * Applied to the map or the view and then gone from the thread: folds, and the three notes a
 * person leaves while thinking (leaning toward an option, why a path was not taken, what the
 * decision is waiting on). None of them is a question, so none of them starts a Claude turn.
 */
const VIEW_ONLY = new Set(['expand', 'collapse', 'lean', 'reject', 'blocked', 'scope'])
const MAX_SOURCE = 200_000
const MAX_MEMO = 100_000
/** What "new diagram" starts from, by kind. */
const TEMPLATES = {
  sequence: 'sequenceDiagram\n  participant C as 클라이언트\n  participant S as 서버\n  C->>S: 요청\n  S-->>C: 응답\n',
  flowchart: 'flowchart TB\n  A[시작] --> B{조건}\n  B -->|예| C[처리]\n  B -->|아니오| D[끝]\n',
  class: 'classDiagram\n  class Order\n  class Payment\n  Order --> Payment : 결제\n',
  state: 'stateDiagram-v2\n  state "대기" as Waiting\n  state "진행" as Running\n  [*] --> Waiting\n  Waiting --> Running : 시작\n  Running --> [*] : 완료\n',
}

const cliDir = process.env.DESIGN_MAP_MERMAID_CLI
  ?? join(dirname(process.execPath), '..', 'lib', 'node_modules', '@mermaid-js', 'mermaid-cli')
const mermaidJs = join(cliDir, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js')
const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
const origins = new Set([...hosts].map(h => `http://${h}`))

// Written once this server listens: a starter that loses the port must not replace the live token.
const token = randomBytes(24).toString('hex')
const tokenFile = join(pagesDir, 'server.token')
mkdirSync(pagesDir, { recursive: true })
mkdirSync(mapsDir, { recursive: true })

/** Open pages, by item id: each an event stream. */
const streams = new Map()
/** Open drawer pages. */
const libraryStreams = new Set()
/** Feedback, by map id: `{ nextId, items, owner }`, written through to disk. */
const feedback = new Map()
/** Every session that polled: `{ at, isBusy, label }`, by session id. */
const presence = new Map()
/** What each session is doing, by map id then session id. */
const activities = new Map()
const startedAt = Date.now()
let lastActivity = Date.now()

// ---------------------------------------------------------------- files

/** Quick Look reads at most this much of a file, and sends at most this many lines around the one asked for. */
const PEEK_BYTES = 2_000_000
const PEEK_LINES = 4000
/**
 * One of a map's files, for Quick Look. The same fence as opening it in the editor: only a path
 * the map lists, inside the map's repo once links are resolved. The model writes `files`, and
 * code it read could steer that.
 */
function peekFile(map, entry) {
  if (typeof map.repo !== 'string') return { error: '지도에 repo가 없어서 파일 경로를 알 수 없어.' }
  if (![...(map.elements ?? []), ...(map.messages ?? [])].some(e => (e.files ?? []).includes(entry))) return { error: `지도에 없는 파일이야: ${entry}` }
  const relative = filePath(entry)
  if (relative.startsWith('/') || relative.split('/').includes('..')) return { error: `repo 밖을 가리키는 경로야: ${entry}` }
  let repo
  let file
  try {
    repo = realpathSync(map.repo).replace(/\/$/, '')
    file = realpathSync(join(map.repo, relative))
  } catch {
    return { error: `파일이 없어: ${relative}` }
  }
  if (!file.startsWith(`${repo}/`)) return { error: `링크를 따라가면 repo 밖이야: ${relative}` }
  const stat = statSync(file)
  if (stat.isDirectory()) return { error: `폴더라서 미리 볼 수 없어: ${relative}` }
  if (stat.size > PEEK_BYTES) return { error: `파일이 너무 커서 미리 볼 수 없어: ${relative}` }
  const text = readFileSync(file, 'utf8')
  if (text.includes('\u0000')) return { error: `텍스트 파일이 아니야: ${relative}` }
  const lines = text.split('\n')
  const line = fileLine(entry)
  const from = line === undefined || lines.length <= PEEK_LINES ? 1 : Math.max(1, Math.min(line - PEEK_LINES / 2, lines.length - PEEK_LINES + 1))
  return { file: relative, line: line ?? null, from, total: lines.length, lines: lines.slice(from - 1, from - 1 + PEEK_LINES) }
}

const pagePath = id => join(pagesDir, `${id}.page.json`)
const mapFile = id => join(mapsDir, `${id}.json`)
const viewFile = id => join(mapsDir, `${id}.view.json`)
const sourceFile = id => join(mapsDir, `${id}.mmd`)
const metaFile = id => join(mapsDir, `${id}.meta.json`)
const feedbackPath = id => join(mapsDir, `${id}.feedback.json`)
const historyDir = id => join(mapsDir, '.history', id)
const trashRoot = join(mapsDir, '.trash')

function writeAtomic(path, text) {
  const partial = `${path}.partial`
  writeFileSync(partial, text)
  renameSync(partial, path)
}
const readJson = path => JSON.parse(readFileSync(path, 'utf8'))
function readJsonOr(path, fallback) {
  try {
    return readJson(path)
  } catch {
    return fallback
  }
}
/** A map as the mod writes it, so the file reads the same whoever wrote it last. */
const mapText = map => `${JSON.stringify(map, null, 2)}\n`

/** 'map' or 'diagram'; a map wins over a stray source of the same id: one id is one kind. */
function kindOf(id) {
  if (existsSync(mapFile(id))) return 'map'
  if (existsSync(sourceFile(id))) return 'diagram'
  return undefined
}
const contentFile = (id, kind) => (kind === 'map' ? mapFile(id) : sourceFile(id))

function metaOf(id) {
  const meta = readJsonOr(metaFile(id), {})
  return meta !== null && typeof meta === 'object' && !Array.isArray(meta) ? meta : {}
}
function writeMeta(id, meta) {
  writeAtomic(metaFile(id), `${JSON.stringify(meta, null, 2)}\n`)
}
/** The person's title wins; then the map's own; then the id. */
const titleOf = (meta, contentTitle, id) => (typeof meta.title === 'string' && meta.title.trim() !== '' ? meta.title : contentTitle || id)

/** When an item was made: what the drawer recorded, else when its file was born. */
function createdAtOf(id, kind, meta) {
  if (Number(meta.createdAt) > 0) return Number(meta.createdAt)
  const stat = statSync(contentFile(id, kind))
  return stat.birthtimeMs || stat.mtimeMs
}

/** The first word of a Mermaid source, past front matter and comments: sequenceDiagram, flowchart… */
function typeOf(source) {
  let isFront = false
  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (line === '---') {
      isFront = !isFront
      continue
    }
    if (isFront || line === '' || line.startsWith('%%')) continue
    return line.split(/\s+/)[0]
  }
  return 'diagram'
}

/** Everything a search can find in a map besides its title: ids, labels, members, messages, notes, files, decisions. */
function mapWords(map) {
  const parts = [map.title, map.context]
  for (const e of map.elements ?? []) parts.push(e.id, e.label, e.note, ...(e.members ?? []).map(m => m.text), ...(e.files ?? []))
  for (const r of map.relations ?? []) parts.push(r.label)
  for (const m of map.messages ?? []) parts.push(m.id, m.label, m.note, ...(m.files ?? []))
  for (const f of map.fragments ?? []) parts.push(f.id, f.label, ...(f.branches ?? []).map(b => b.label))
  for (const d of map.decisions ?? []) parts.push(d.question, d.rationale, ...(d.options ?? []).map(o => o.text))
  return parts.filter(p => typeof p === 'string' && p !== '').join('\n')
}

/** A design map's page: the session's copy (it has progress) while it is of this revision, else drawn here. */
function mapPage(id) {
  const map = readJson(mapFile(id))
  const written = readJsonOr(pagePath(id), undefined)
  if (written !== undefined && (written.revision ?? 0) === (map.revision ?? 0)) return { map, page: written }
  const view = pruneView(map, readJsonOr(viewFile(id), {}) ?? {})
  return { map, page: pageOf(id, map, view, [], [], statSync(mapFile(id)).mtimeMs) }
}

/** What a drawer card says about a map at a glance: decisions still open, steps done, whether Claude is on it. */
function mapStatus(id, map, drawn) {
  const steps = drawn.steps ?? []
  const { isListening, isBusy } = listening(id)
  return {
    open: (map.decisions ?? []).filter(d => d.chosen === undefined).length,
    steps: { done: steps.filter(s => s.state === 'done').length, total: steps.length },
    session: isBusy ? 'busy' : isListening ? 'on' : null,
  }
}

/** Every map's status, for the drawer to refresh in place without drawing its cards again. */
function liveStatuses() {
  const out = {}
  for (const id of itemIds()) {
    if (kindOf(id) !== 'map') continue
    try {
      const { map, page: drawn } = mapPage(id)
      out[id] = mapStatus(id, map, drawn)
    } catch {}
  }
  return out
}

/** One card of the drawer. A file that does not parse still shows, with its error. */
function itemOf(id, kind) {
  const meta = metaOf(id)
  const base = {
    id,
    kind,
    tags: Array.isArray(meta.tags) ? meta.tags.filter(t => typeof t === 'string') : [],
    pinned: meta.pinned === true,
    memo: typeof meta.memo === 'string' ? meta.memo : '',
  }
  try {
    const stat = statSync(contentFile(id, kind))
    const times = { createdAt: createdAtOf(id, kind, meta), updatedAt: Math.max(stat.mtimeMs, Number(meta.editedAt) || 0) }
    if (kind === 'map') {
      const { map, page: drawn } = mapPage(id)
      return { ...base, ...times, type: map.diagram === 'sequence' ? 'map-sequence' : 'map', title: titleOf(meta, map.title, id), revision: map.revision ?? 0, mermaid: drawn.mermaid, text: mapWords(map), status: mapStatus(id, map, drawn) }
    }
    const source = readFileSync(sourceFile(id), 'utf8')
    return { ...base, ...times, type: typeOf(source), title: titleOf(meta, undefined, id), revision: Number(meta.revision) || 1, mermaid: source, text: source }
  } catch (error) {
    return { ...base, type: kind, title: titleOf(meta, undefined, id), revision: 0, createdAt: 0, updatedAt: 0, mermaid: '', text: '', error: String(error?.message ?? error) }
  }
}

function itemIds() {
  if (!existsSync(mapsDir)) return []
  const ids = new Set()
  for (const file of readdirSync(mapsDir)) {
    const m = ITEM_FILE.exec(file)
    if (m !== null) ids.add(m[1])
  }
  return [...ids]
}

function listItems() {
  return itemIds().map(id => ({ id, kind: kindOf(id) })).filter(i => i.kind !== undefined).map(i => itemOf(i.id, i.kind))
}

function allTags() {
  const counts = new Map()
  for (const id of itemIds()) {
    for (const tag of metaOf(id).tags ?? []) if (typeof tag === 'string') counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

function trashItems() {
  if (!existsSync(trashRoot)) return []
  return readdirSync(trashRoot).map(entry => {
    const m = TRASH_ENTRY.exec(entry)
    if (m === null) return undefined
    const dir = join(trashRoot, entry)
    const id = m[1]
    const kind = existsSync(join(dir, `${id}.json`)) ? 'map' : existsSync(join(dir, `${id}.mmd`)) ? 'diagram' : undefined
    if (kind === undefined) return undefined
    const meta = readJsonOr(join(dir, `${id}.meta.json`), {}) ?? {}
    const content = kind === 'map' ? readJsonOr(join(dir, `${id}.json`), {}) ?? {} : {}
    return { entry, id, kind, title: titleOf(meta, content.title, id), trashedAt: Number(m[2]) }
  }).filter(item => item !== undefined).sort((a, b) => b.trashedAt - a.trashedAt)
}

// ---------------------------------------------------------------- history

/** Keeps one revision of an item, dated `at` when it was saved earlier; a kept revision is never rewritten. */
function snapshot(id, revision, ext, text, at) {
  const dir = historyDir(id)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `${revision}.${ext}`)
  if (existsSync(path)) return
  writeAtomic(path, text)
  if (at !== undefined) utimesSync(path, at / 1000, at / 1000)
}

/** Makes sure the item's current revision is kept, whoever wrote it. */
function keepCurrent(id, kind) {
  const savedAt = statSync(contentFile(id, kind)).mtimeMs
  if (kind === 'map') {
    const text = readFileSync(mapFile(id), 'utf8')
    snapshot(id, JSON.parse(text).revision ?? 0, 'json', text, savedAt)
    return
  }
  const meta = metaOf(id)
  if (!(Number(meta.revision) > 0)) {
    meta.revision = 1
    meta.createdAt ??= createdAtOf(id, kind, meta)
    writeMeta(id, meta)
  }
  snapshot(id, meta.revision, 'mmd', readFileSync(sourceFile(id), 'utf8'), savedAt)
}

function historyOf(id) {
  const dir = historyDir(id)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map(f => /^(\d+)\.(json|mmd)$/.exec(f))
    .filter(m => m !== null)
    .map(m => ({ revision: Number(m[1]), at: statSync(join(dir, m[0])).mtimeMs }))
    .sort((a, b) => b.revision - a.revision)
}

/** Writes a plain diagram's source as its next revision; nothing when it is unchanged. */
function saveSource(id, source, meta) {
  const current = existsSync(sourceFile(id)) ? readFileSync(sourceFile(id), 'utf8') : undefined
  if (current !== undefined) {
    meta.revision = Number(meta.revision) || 1
    snapshot(id, meta.revision, 'mmd', current)
    if (current === source) return meta.revision
  }
  meta.revision = current === undefined ? 1 : meta.revision + 1
  writeAtomic(sourceFile(id), source)
  snapshot(id, meta.revision, 'mmd', source)
  return meta.revision
}

// ---------------------------------------------------------------- ids and moves

/** `wanted`, or `wanted-2`, `-3`…: an id no item has. */
function freeId(wanted) {
  const base = wanted.slice(0, 56).replace(/[-_]+$/, '') || 'diagram'
  if (kindOf(base) === undefined && !existsSync(historyDir(base))) return base
  for (let n = 2; ; n++) {
    const id = `${base}-${n}`
    if (kindOf(id) === undefined && !existsSync(historyDir(id))) return id
  }
}

function newDiagramId() {
  const d = new Date()
  const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return freeId(`d-${day}-${randomBytes(2).toString('hex')}`)
}

/** Moves an item's files, renamed to another id if need be, and its history. */
function moveItem(fromDir, fromId, fromHistory, toDir, toId, toHistory) {
  for (const suffix of ITEM_SUFFIXES) {
    const from = join(fromDir, `${fromId}${suffix}`)
    if (existsSync(from)) renameSync(from, join(toDir, `${toId}${suffix}`))
  }
  if (existsSync(fromHistory)) {
    mkdirSync(dirname(toHistory), { recursive: true })
    renameSync(fromHistory, toHistory)
  }
}

// ---------------------------------------------------------------- feedback

function feedbackOf(id) {
  let store = feedback.get(id)
  if (store === undefined) {
    try {
      store = readJson(feedbackPath(id))
    } catch {
      store = { nextId: 1, items: [] }
    }
    store.owner ??= null
    forgetViewOnly(store)
    feedback.set(id, store)
  }
  return store
}

/** Drops applied folds and unfolds, and hands back the numbers nothing after them took. */
function forgetViewOnly(store) {
  store.items = store.items.filter(i => !(VIEW_ONLY.has(i.action) && i.status === 'done'))
  store.nextId = Math.max(0, ...store.items.map(i => i.id)) + 1
}

function saveFeedback(id) {
  writeAtomic(feedbackPath(id), JSON.stringify(feedbackOf(id)))
  broadcast(id, 'feedback')
}

/** A session never heard from counts as seen at this server's start: a restart is no proof it left. */
const lastSeen = session => presence.get(session)?.at ?? startedAt

function listening(id) {
  const owner = feedbackOf(id).owner
  const at = owner === null ? undefined : presence.get(owner.session)
  const isListening = at !== undefined && Date.now() - at.at < LISTEN_MS
  return { isListening, isBusy: isListening && at.isBusy === true, owner }
}

function touch(input) {
  const session = String(input.session ?? '')
  presence.set(session, { at: Date.now(), isBusy: input.isBusy === true, label: String(input.label ?? session.slice(0, 8)) })
  return session
}

// ---------------------------------------------------------------- pushing changes

function broadcast(id, event) {
  for (const res of streams.get(id) ?? []) res.write(`event: ${event}\ndata: {}\n\n`)
}

let libraryTimer
function scheduleLibrary() {
  clearTimeout(libraryTimer)
  libraryTimer = setTimeout(() => {
    for (const res of libraryStreams) res.write('event: library\ndata: {}\n\n')
  }, 80)
}

/** An item changed: its open pages and the drawer hear of it once the writes settle. */
const pending = new Map()
function notify(id) {
  clearTimeout(pending.get(id))
  pending.set(id, setTimeout(() => {
    pending.delete(id)
    broadcast(id, 'update')
  }, 60))
  scheduleLibrary()
}

// ---------------------------------------------------------------- requests

function send(res, status, type, body) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}
const json = (res, status, value) => send(res, status, 'application/json', JSON.stringify(value))
const fill = (html, id) => html.replaceAll('__NAME__', id).replaceAll('__TOKEN__', token).replaceAll('__VERSION__', VERSION)

async function body(req) {
  let text = ''
  for await (const chunk of req) {
    text += chunk
    if (text.length > 512_000) throw new Error('too large')
  }
  return text === '' ? {} : JSON.parse(text)
}

function cleanTags(tags) {
  if (!Array.isArray(tags)) return undefined
  const seen = new Set()
  const out = []
  for (const raw of tags) {
    const tag = String(raw ?? '').replace(/[,#\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)
    if (tag === '' || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    out.push(tag)
    if (out.length >= 30) break
  }
  return out
}

/** The person's edits to an item's record; a title or memo edit counts as an update of the item. */
function patchMeta(id, kind, input) {
  const meta = metaOf(id)
  const now = Date.now()
  if (!(Number(meta.createdAt) > 0)) meta.createdAt = existsSync(contentFile(id, kind)) ? createdAtOf(id, kind, meta) : now
  if (typeof input.title === 'string') {
    const title = input.title.replace(/\s+/g, ' ').trim().slice(0, 200)
    if (title === '') delete meta.title
    else meta.title = title
    meta.editedAt = now
  }
  const tags = cleanTags(input.tags)
  if (tags !== undefined) meta.tags = tags
  if (typeof input.pinned === 'boolean') meta.pinned = input.pinned
  if (typeof input.memo === 'string') {
    meta.memo = input.memo.slice(0, MAX_MEMO)
    meta.editedAt = now
  }
  return meta
}

function sourceOf(input) {
  if (typeof input.mermaid !== 'string') return undefined
  const source = input.mermaid.replace(/\r\n/g, '\n')
  if (source.length > MAX_SOURCE) throw new Error('diagram too large')
  return source.endsWith('\n') ? source : `${source}\n`
}

/** The drawer's own requests: the list, the trash, a new diagram, a diagram saved by Claude, a restore from the trash. */
async function handleLibrary(req, res, sub) {
  if (sub === undefined && req.method === 'GET') return json(res, 200, { items: listItems(), trashCount: trashItems().length })
  if (sub === 'tags' && req.method === 'GET') return json(res, 200, { tags: allTags() })
  if (sub === 'live' && req.method === 'GET') return json(res, 200, { items: liveStatuses() })
  if (sub === 'trash' && req.method === 'GET') return json(res, 200, { items: trashItems() })

  // POST /api/_library/new: the person starts a plain diagram from a template.
  if (sub === 'new' && req.method === 'POST') {
    const input = await body(req)
    const id = newDiagramId()
    const meta = patchMeta(id, 'diagram', { title: String(input.title ?? '').trim() || '새 다이어그램', tags: input.tags })
    saveSource(id, TEMPLATES[input.type] ?? TEMPLATES.flowchart, meta)
    writeMeta(id, meta)
    notify(id)
    return json(res, 200, { id })
  }

  // POST /api/_library/save: Claude keeps a plain diagram (the mod checked its syntax).
  if (sub === 'save' && req.method === 'POST') {
    const input = await body(req)
    const id = String(input.id ?? '')
    if (!NAME.test(id)) return json(res, 400, { error: `id must be lowercase letters, digits, _ and - (got "${id}")` })
    const kind = kindOf(id)
    if (kind === 'map') return json(res, 409, { error: `"${id}" is a design map; save the diagram under another id` })
    const source = sourceOf(input)
    const isNew = kind === undefined
    if (isNew && (source === undefined || typeof input.title !== 'string' || input.title.trim() === '')) {
      return json(res, 400, { error: 'a new diagram needs a title and its Mermaid source' })
    }
    const meta = patchMeta(id, 'diagram', { title: input.title, tags: input.tags, memo: input.memo })
    const revision = source === undefined ? Number(meta.revision) || 1 : saveSource(id, source, meta)
    writeMeta(id, meta)
    notify(id)
    return json(res, 200, { id, revision, isNew })
  }

  // POST /api/_library/untrash: an item comes back from the trash, under a free id if its own was taken.
  if (sub === 'untrash' && req.method === 'POST') {
    const input = await body(req)
    const entry = String(input.entry ?? '')
    const m = TRASH_ENTRY.exec(entry)
    const dir = join(trashRoot, entry)
    if (m === null || !existsSync(dir)) return json(res, 404, { error: 'not in the trash' })
    const id = freeId(m[1])
    moveItem(dir, m[1], join(dir, 'history'), mapsDir, id, historyDir(id))
    try {
      rmdirSync(dir)
    } catch {}
    feedback.delete(id)
    notify(id)
    return json(res, 200, { id })
  }
  return send(res, 404, 'text/plain', 'not found')
}

async function handle(req, res) {
  lastActivity = Date.now()
  if (!hosts.has(req.headers.host ?? '')) return send(res, 403, 'text/plain', 'wrong host')
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`)
  const parts = url.pathname.split('/').filter(p => p !== '')
  const [head, name, sub, idText] = parts

  if (req.method === 'POST') {
    const origin = req.headers.origin
    if (origin !== undefined && !origins.has(origin)) return send(res, 403, 'text/plain', 'foreign origin')
    if (req.headers['x-design-map-token'] !== token) return send(res, 403, 'text/plain', 'bad token')
  } else if (req.method !== 'GET') {
    return send(res, 405, 'text/plain', 'method not allowed')
  }

  if (url.pathname === '/health') return json(res, 200, { app: 'design-map', pid: process.pid, version: VERSION })
  if (url.pathname === '/mermaid.js') {
    if (!existsSync(mermaidJs)) return send(res, 500, 'text/plain', `mermaid not found at ${mermaidJs}`)
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'max-age=86400' })
    return res.end(readFileSync(mermaidJs))
  }
  if (url.pathname === '/' && req.method === 'GET') return send(res, 200, 'text/html; charset=utf-8', fill(library, ''))
  if (head === 'events' && name === '_library' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    res.write(`retry: 1000\nevent: hello\ndata: ${JSON.stringify({ version: VERSION })}\n\n`)
    libraryStreams.add(res)
    req.on('close', () => libraryStreams.delete(res))
    return
  }
  if (head === 'api' && name === '_library' && idText === undefined) return handleLibrary(req, res, sub)
  if (name === undefined || !NAME.test(name)) return send(res, 404, 'text/plain', 'not found')

  if (head === 'map' && req.method === 'GET') return send(res, 200, 'text/html; charset=utf-8', fill(page, name))
  if (head === 'events' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    res.write(`retry: 1000\nevent: hello\ndata: ${JSON.stringify({ version: VERSION })}\n\n`)
    const open = streams.get(name) ?? new Set()
    open.add(res)
    streams.set(name, open)
    req.on('close', () => open.delete(res))
    return
  }
  if (head !== 'api') return send(res, 404, 'text/plain', 'not found')

  // GET /api/<id>: what the page draws, with the drawer's record.
  if (sub === undefined && req.method === 'GET') {
    const kind = kindOf(name)
    if (kind === undefined) return json(res, 404, { error: 'gone' })
    const meta = metaOf(name)
    if (kind === 'map') {
      const { map, page: drawn } = mapPage(name)
      return json(res, 200, { ...drawn, kind, title: titleOf(meta, map.title, name), contentTitle: map.title, meta })
    }
    const source = readFileSync(sourceFile(name), 'utf8')
    return json(res, 200, {
      kind, name, type: typeOf(source), title: titleOf(meta, undefined, name), revision: Number(meta.revision) || 1,
      updatedAt: statSync(sourceFile(name)).mtimeMs, mermaid: source, meta,
    })
  }

  // ------------------------------------------------------------ the drawer's record of one item

  if (['meta', 'source', 'history', 'future', 'restore', 'duplicate', 'trash'].includes(sub)) {
    const kind = kindOf(name)
    if (kind === undefined) return json(res, 404, { error: 'gone' })

    // POST /api/<id>/meta: title, tags, pin, memo.
    if (sub === 'meta' && req.method === 'POST') {
      const meta = patchMeta(name, kind, await body(req))
      writeMeta(name, meta)
      notify(name)
      return json(res, 200, { meta })
    }

    // POST /api/<id>/source: the person saves a plain diagram's source, from the revision they edited.
    if (sub === 'source' && req.method === 'POST') {
      if (kind !== 'diagram') return json(res, 400, { error: 'a design map changes through Claude' })
      const input = await body(req)
      const source = sourceOf(input)
      if (source === undefined) return json(res, 400, { error: 'no source' })
      const meta = metaOf(name)
      const current = Number(meta.revision) || 1
      if (input.base !== undefined && Number(input.base) !== current) {
        return json(res, 409, { error: 'changed meanwhile', revision: current, mermaid: readFileSync(sourceFile(name), 'utf8') })
      }
      const revision = saveSource(name, source, meta)
      writeMeta(name, meta)
      notify(name)
      return json(res, 200, { revision })
    }

    // GET /api/<id>/history: its revisions, newest first; /history/<n>: one of them, drawn.
    if (sub === 'history' && req.method === 'GET') {
      keepCurrent(name, kind)
      if (idText === undefined) return json(res, 200, { items: historyOf(name) })
      const revision = Number(idText)
      const file = join(historyDir(name), `${revision}.${kind === 'map' ? 'json' : 'mmd'}`)
      if (!Number.isInteger(revision) || !existsSync(file)) return json(res, 404, { error: 'no such revision' })
      const at = statSync(file).mtimeMs
      if (kind === 'diagram') return json(res, 200, { kind, revision, at, mermaid: readFileSync(file, 'utf8') })
      const map = readJson(file)
      const view = pruneView(map, readJsonOr(viewFile(name), {}) ?? {})
      return json(res, 200, { ...pageOf(name, map, view, [], [], at), kind, at })
    }

    // GET /api/<id>/future/<option>: the map drawn as if that option had been chosen, so the
    // browser can move between the futures of an open decision instead of describing them.
    if (sub === 'future' && req.method === 'GET' && kind === 'map') {
      const option = String(idText ?? '')
      const map = readJson(mapFile(name))
      const owner = (map.decisions ?? []).find(d => (d.options ?? []).some(o => o.id === option))
      if (owner === undefined) return json(res, 404, { error: 'no such option' })
      const futures = (map.decisions ?? []).map(d => (d.id === owner.id ? { ...d, chosen: option, leaning: undefined } : d))
      const view = pruneView(map, readJsonOr(viewFile(name), {}) ?? {})
      const drawn = pageOf(name, { ...map, decisions: futures }, view, [], [], Date.now())
      return json(res, 200, { option, decision: owner.id, mermaid: drawn.mermaid, boxes: drawn.boxes })
    }

    // POST /api/<id>/restore: an old revision becomes the newest; nothing is lost.
    if (sub === 'restore' && req.method === 'POST') {
      const revision = Number((await body(req)).revision)
      const file = join(historyDir(name), `${revision}.${kind === 'map' ? 'json' : 'mmd'}`)
      if (!Number.isInteger(revision) || !existsSync(file)) return json(res, 404, { error: 'no such revision' })
      keepCurrent(name, kind)
      if (kind === 'map') {
        const current = readJson(mapFile(name))
        const restored = { ...readJson(file), revision: (current.revision ?? 0) + 1 }
        const text = mapText(restored)
        writeAtomic(mapFile(name), text)
        snapshot(name, restored.revision, 'json', text)
        notify(name)
        return json(res, 200, { revision: restored.revision })
      }
      const meta = metaOf(name)
      const next = saveSource(name, readFileSync(file, 'utf8'), meta)
      writeMeta(name, meta)
      notify(name)
      return json(res, 200, { revision: next })
    }

    // POST /api/<id>/duplicate: a copy to change freely, with its own history from here on.
    if (sub === 'duplicate' && req.method === 'POST') {
      const meta = metaOf(name)
      const copy = freeId(`${name}-copy`)
      const now = Date.now()
      let title
      if (kind === 'map') {
        const text = readFileSync(mapFile(name), 'utf8')
        const map = JSON.parse(text)
        title = titleOf(meta, map.title, name)
        writeAtomic(mapFile(copy), text)
        if (existsSync(viewFile(name))) copyFileSync(viewFile(name), viewFile(copy))
        snapshot(copy, map.revision ?? 0, 'json', text)
      } else {
        const source = readFileSync(sourceFile(name), 'utf8')
        title = titleOf(meta, undefined, name)
        writeAtomic(sourceFile(copy), source)
        snapshot(copy, 1, 'mmd', source)
      }
      writeMeta(copy, {
        title: `${title} 사본`, tags: Array.isArray(meta.tags) ? meta.tags : [], memo: typeof meta.memo === 'string' ? meta.memo : '',
        createdAt: now, editedAt: now, ...(kind === 'diagram' ? { revision: 1 } : {}),
      })
      notify(copy)
      return json(res, 200, { id: copy })
    }

    // POST /api/<id>/trash: the item, its record, thread and history move to the trash together.
    if (sub === 'trash' && req.method === 'POST') {
      const entry = `${name}~${Date.now()}`
      const dir = join(trashRoot, entry)
      mkdirSync(dir, { recursive: true })
      moveItem(mapsDir, name, historyDir(name), dir, name, join(dir, 'history'))
      feedback.delete(name)
      notify(name)
      return json(res, 200, { entry })
    }
    return send(res, 404, 'text/plain', 'not found')
  }

  // ------------------------------------------------------------ a map's feedback and activity

  // GET /api/<id>/peek?file=<entry>: one of the map's files, for Quick Look. It hands out file
  // contents, so unlike the other reads it wants the page's token too.
  if (sub === 'peek' && req.method === 'GET') {
    if (req.headers['x-design-map-token'] !== token) return send(res, 403, 'text/plain', 'bad token')
    if (kindOf(name) !== 'map') return json(res, 404, { error: 'peek is for design maps' })
    const peeked = peekFile(readJson(mapFile(name)), String(url.searchParams.get('file') ?? ''))
    return json(res, 'error' in peeked ? 400 : 200, peeked)
  }

  // GET /api/<id>/feedback: the thread, and its owner. Open requests and folds are no
  // conversation; a fold that failed stays, so the user sees why nothing moved.
  if (sub === 'feedback' && idText === undefined && req.method === 'GET') {
    const items = feedbackOf(name).items.filter(i => i.action !== 'open' && !(VIEW_ONLY.has(i.action) && i.status !== 'failed'))
    return json(res, 200, { items, ...listening(name) })
  }

  // POST /api/<id>/feedback: the page sends one.
  if (sub === 'feedback' && idText === undefined && req.method === 'POST') {
    if (kindOf(name) !== 'map') return json(res, 404, { error: 'feedback goes to design maps' })
    const input = await body(req)
    const action = ACTIONS.has(input.action) ? input.action : 'comment'
    const text = String(input.text ?? '').slice(0, 4000).trim()
    if (text === '' && (action === 'comment' || action === 'open')) return json(res, 400, { error: 'empty' })
    const target = typeof input.target === 'object' && input.target !== null ? input.target : { kind: 'map' }
    const store = feedbackOf(name)
    const item = { id: store.nextId, at: Date.now(), target, action, text, status: 'sent', ...(input.urgent === true ? { urgent: true } : {}) }
    store.nextId += 1
    store.items.push(item)
    saveFeedback(name)
    return json(res, 200, item)
  }

  // POST /api/<id>/own: this session takes the map's feedback (the user opened it there).
  if (sub === 'own' && req.method === 'POST') {
    const input = await body(req)
    const session = touch(input)
    const store = feedbackOf(name)
    store.owner = { session, label: presence.get(session).label }
    saveFeedback(name)
    return json(res, 200, { owner: store.owner })
  }

  // POST /api/<id>/claim: the owner takes what it can handle now, and says it is listening.
  // A busy owner takes only what it applies itself or what the user sent to interrupt it.
  // A map with no owner yet is owned by its first claimer; any other session gets nothing.
  if (sub === 'claim' && req.method === 'POST') {
    const input = await body(req)
    const before = JSON.stringify(listening(name))
    const session = touch(input)
    const store = feedbackOf(name)
    if (store.owner === null) {
      store.owner = { session, label: presence.get(session).label }
      saveFeedback(name)
    }
    if (store.owner.session !== session) {
      if (JSON.stringify(listening(name)) !== before) broadcast(name, 'feedback')
      return json(res, 200, { items: [], isOwner: false, owner: store.owner })
    }
    const isBusy = input.isBusy === true
    const claimed = store.items.filter(i => i.status === 'sent' && (!isBusy || LOCAL_ACTIONS.has(i.action) || i.urgent === true))
    for (const item of claimed) {
      item.status = 'working'
      item.session = session
    }
    if (claimed.length > 0) saveFeedback(name)
    else if (JSON.stringify(listening(name)) !== before) broadcast(name, 'feedback')
    return json(res, 200, { items: claimed, isOwner: true, owner: store.owner })
  }

  // POST /api/<id>/feedback/<n>: the session moves an item on and may answer it.
  // `fallback` answers only an item nobody answered yet (the end of the turn it rode in).
  if (sub === 'feedback' && idText !== undefined && req.method === 'POST') {
    const input = await body(req)
    const store = feedbackOf(name)
    const item = store.items.find(i => String(i.id) === idText)
    if (item === undefined) return json(res, 404, { error: 'no such feedback' })
    if (['sent', 'working', 'answered', 'done', 'failed'].includes(input.status)) item.status = input.status
    if (typeof input.reply === 'string' && input.reply.trim() !== '') item.reply = input.reply.slice(0, 8000)
    else if (typeof input.fallback === 'string' && item.reply === undefined && input.fallback.trim() !== '') item.reply = input.fallback.slice(0, 1500)
    if (item.reply !== undefined) item.repliedAt ??= Date.now()
    if (VIEW_ONLY.has(item.action) && item.status === 'done') forgetViewOnly(store)
    saveFeedback(name)
    return json(res, 200, item)
  }

  // POST /api/<id>/activity: what a session is reading or editing now, and the trail behind it.
  if (sub === 'activity' && req.method === 'POST') {
    const input = await body(req)
    const session = touch(input)
    const forMap = activities.get(name) ?? new Map()
    forMap.set(session, {
      session,
      label: presence.get(session).label,
      isRunning: input.isRunning === true,
      current: input.current ?? null,
      trail: Array.isArray(input.trail) ? input.trail.slice(-20) : [],
      drift: input.drift ?? null,
      at: Date.now(),
    })
    activities.set(name, forMap)
    broadcast(name, 'activity')
    return json(res, 200, {})
  }

  // GET /api/<id>/activity: every session's recent activity, the owner's first.
  if (sub === 'activity' && req.method === 'GET') {
    const owner = feedbackOf(name).owner
    const sessions = [...(activities.get(name)?.values() ?? [])]
      .filter(a => Date.now() - a.at < ACTIVITY_MS)
      .map(a => ({ ...a, isOwner: owner?.session === a.session }))
      .sort((a, b) => Number(b.isOwner) - Number(a.isOwner) || b.at - a.at)
    return json(res, 200, { sessions })
  }

  return send(res, 404, 'text/plain', 'not found')
}

const server = createServer((req, res) => {
  handle(req, res).catch(error => {
    if (!res.headersSent) send(res, 400, 'text/plain', String(error?.message ?? error))
  })
})

// A page file (the mod's) or an item's file (anyone's) changed: tell its open pages and the drawer.
watch(pagesDir, (_event, file) => {
  if (typeof file === 'string' && file.endsWith('.page.json')) notify(file.slice(0, -'.page.json'.length))
})
watch(mapsDir, (_event, file) => {
  const m = typeof file === 'string' ? /^([a-z0-9][a-z0-9_-]{0,63})\.(json|mmd|view\.json|meta\.json)$/.exec(file) : null
  if (m !== null) notify(m[1])
})

// Keep streams alive, tell pages when the owner stops listening, hand back what a gone
// session had taken, and leave when nobody looks.
const lastListening = new Map()
setInterval(() => {
  for (const [id, store] of feedback) {
    const orphans = store.items.filter(i => i.status === 'working' && Date.now() - lastSeen(i.session) > GONE_MS)
    for (const item of orphans) item.status = 'sent'
    if (orphans.length > 0) saveFeedback(id)
  }
  let open = libraryStreams.size
  for (const res of libraryStreams) res.write(': ping\n\n')
  for (const [id, set] of streams) {
    for (const res of set) res.write(': ping\n\n')
    open += set.size
    if (set.size === 0 || kindOf(id) !== 'map') continue
    const now = JSON.stringify(listening(id))
    if (lastListening.get(id) !== now) {
      lastListening.set(id, now)
      broadcast(id, 'feedback')
    }
  }
  if (open > 0) lastActivity = Date.now()
  if (Date.now() - lastActivity > IDLE_MS) process.exit(0)
}, 2_000)

/** Threads kept beside the page cache by older versions move next to their maps. */
function adoptOldFeedback() {
  for (const file of readdirSync(pagesDir)) {
    const m = /^([a-z0-9][a-z0-9_-]{0,63})\.feedback\.json$/.exec(file)
    if (m === null || kindOf(m[1]) === undefined || existsSync(feedbackPath(m[1]))) continue
    try {
      renameSync(join(pagesDir, file), feedbackPath(m[1]))
    } catch {
      try {
        copyFileSync(join(pagesDir, file), feedbackPath(m[1]))
        unlinkSync(join(pagesDir, file))
      } catch {}
    }
  }
}

server.on('error', error => {
  console.error(`design-map server: ${error.message}`)
  process.exit(1)
})
server.listen(port, '127.0.0.1', () => {
  // The port is ours: only now is this the server, so only now its token and its upkeep.
  writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 })
  chmodSync(tokenFile, 0o600)
  adoptOldFeedback()
  for (const id of itemIds()) {
    const kind = kindOf(id)
    try {
      if (kind !== undefined) keepCurrent(id, kind)
    } catch (error) {
      console.error(`design-map server: ${id}: ${error?.message ?? error}`)
    }
  }
  console.log(`design-map server ${VERSION} on http://127.0.0.1:${port} (pid ${process.pid}, maps ${mapsDir})`)
})
