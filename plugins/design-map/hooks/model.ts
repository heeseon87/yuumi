// The design map: durable facts (elements, relations, decisions, progress)
// kept apart from the view (what is collapsed or hidden right now), and
// turned into a Mermaid class diagram colored by how much each box touches
// existing code (PALETTE below), or, for a sequence map,
// into a sequence diagram of its participants and messages.
//
// Pure: no engine, no Node. The mod and scripts/render-fixture.ts both import it.

import type {
  Change,
  Decision,
  DesignMap,
  Diagram,
  Direction,
  Element,
  ElementKind,
  Fragment,
  FragmentKind,
  MapView,
  Member,
  Message,
  MessageKind,
  Relation,
  RelationKind,
} from '../types'

export type {
  Change,
  Decision,
  DecisionOption,
  DesignMap,
  Diagram,
  Direction,
  Element,
  ElementKind,
  Fragment,
  FragmentKind,
  MapView,
  Member,
  Message,
  MessageKind,
  Relation,
  RelationKind,
} from '../types'

// ---------------------------------------------------------------- validate

const ID = /^[A-Za-z][A-Za-z0-9_]*$/
const DECISION_ID = /^D\d+$/
const MEMBER_LEAD = /^[+\-#~]/
const KINDS: readonly ElementKind[] = ['group', 'class', 'interface', 'enum', 'table', 'resource', 'external']
const PARTICIPANT_KINDS: readonly ElementKind[] = ['class', 'interface', 'enum', 'table', 'resource', 'external', 'actor']
const DIAGRAMS: readonly Diagram[] = ['class', 'sequence']
const MESSAGE_KINDS: readonly MessageKind[] = ['call', 'reply', 'async', 'note']
const FRAGMENT_KINDS: readonly FragmentKind[] = ['alt', 'opt', 'loop', 'par', 'section']
/** Words Mermaid's sequence grammar takes for its own, in any case (each one tried, 12.1). */
const SEQUENCE_KEYWORDS = new Set([
  'note', 'end', 'alt', 'else', 'opt', 'loop', 'par', 'and', 'rect', 'box', 'actor', 'participant', 'over',
  'activate', 'deactivate', 'autonumber', 'title', 'critical', 'break', 'option', 'create', 'destroy',
])
const CHANGES: readonly Change[] = ['keep', 'result', 'modify', 'delete', 'add']
const MEMBER_CHANGES = ['modify', 'add', 'delete'] as const
const RELATION_KINDS: readonly RelationKind[] = [
  'association', 'dependency', 'inheritance', 'realization', 'composition', 'aggregation',
]
const DIRECTIONS: readonly Direction[] = ['TB', 'LR', 'BT', 'RL']

const isString = (v: unknown): v is string => typeof v === 'string'
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString)

export function validate(map: DesignMap, view: MapView = {}): string[] {
  const errors: string[] = []
  const byId = new Map<string, Element>()

  if (map.schema !== 1) errors.push(`schema must be 1, got ${String(map.schema)}`)
  if (map.diagram !== undefined && !DIAGRAMS.includes(map.diagram)) errors.push(`diagram must be one of ${DIAGRAMS.join(', ')}`)
  const isSequence = map.diagram === 'sequence'
  if (!isString(map.title) || map.title.trim() === '') errors.push('title must be a non-empty string')
  if (map.direction !== undefined && !DIRECTIONS.includes(map.direction)) errors.push(`direction must be one of ${DIRECTIONS.join(', ')}`)
  if (map.repo !== undefined && (!isString(map.repo) || !map.repo.startsWith('/'))) errors.push('repo must be an absolute path')
  if (map.scope !== undefined && (!Array.isArray(map.scope) || map.scope.some(p => !isString(p) || p.trim() === '' || p.startsWith('/') || p.split('/').includes('..')))) {
    errors.push('scope must be a list of repo-relative folders (no leading / and no ..); [] counts nothing outside the map')
  }
  if (!Array.isArray(map.elements)) return [...errors, 'elements must be a list']
  if (!Array.isArray(map.relations)) return [...errors, 'relations must be a list']

  for (const el of map.elements) {
    if (!isString(el.id) || !ID.test(el.id)) {
      errors.push(`element id "${String(el.id)}" must be ASCII: a letter, then letters, digits or _`)
      continue
    }
    if (byId.has(el.id)) errors.push(`element id "${el.id}" is used twice`)
    byId.set(el.id, el)
    if (el.id.startsWith('Lg')) errors.push(`element id "${el.id}": ids starting with Lg are kept for the legend`)
    if (el.label !== undefined && (!isString(el.label) || /["\n]/.test(el.label))) errors.push(`${el.id}: label must be a string without " or a newline`)
    const kinds = isSequence ? PARTICIPANT_KINDS : KINDS
    if (el.kind !== undefined && !kinds.includes(el.kind)) errors.push(`${el.id}: kind must be one of ${kinds.join(', ')}${isSequence ? ' in a sequence map' : ''}`)
    if (isSequence) {
      if (SEQUENCE_KEYWORDS.has(el.id.toLowerCase())) errors.push(`${el.id}: "${el.id}" is a Mermaid sequence keyword; pick another id (NoteTable, not Note)`)
      if (el.parent !== undefined) errors.push(`${el.id}: a sequence map has no groups, so no parent`)
      if ((el.members?.length ?? 0) > 0) errors.push(`${el.id}: a participant has no members; put what changes on its messages`)
    }
    if (el.change !== undefined && !CHANGES.includes(el.change)) errors.push(`${el.id}: change must be one of ${CHANGES.join(', ')}`)
    if (el.done !== undefined && typeof el.done !== 'boolean') errors.push(`${el.id}: done must be true or false`)
    if (el.note !== undefined && !isString(el.note)) errors.push(`${el.id}: note must be a string`)
    errors.push(...filesErrors(el.id, el.files))
    if (el.members !== undefined && !Array.isArray(el.members)) errors.push(`${el.id}: members must be a list`)
    for (const m of Array.isArray(el.members) ? el.members : []) {
      if (!isString(m?.text)) {
        errors.push(`${el.id}: every member needs a text`)
        continue
      }
      if (m.change !== undefined && !MEMBER_CHANGES.includes(m.change)) errors.push(`${el.id}: member change must be modify, add or delete`)
      if (/[{}:"\n]/.test(m.text)) errors.push(`${el.id}: member "${m.text}" must not contain { } : " or a newline`)
      if (/[$*]\s*$/.test(m.text)) errors.push(`${el.id}: member "${m.text}" must not end with $ or * (Mermaid reads them as static or abstract)`)
      if (m.change === undefined && MEMBER_LEAD.test(m.text)) {
        errors.push(`${el.id}: member "${m.text}" must not start with + - # ~ (Mermaid reads them as visibility)`)
      }
    }
    errors.push(...stepsErrors(el.id, el.steps))
  }

  const children = childrenOf(map)
  for (const el of map.elements) {
    if (!isString(el.id)) continue
    if (el.parent !== undefined) {
      const parent = byId.get(el.parent)
      if (parent === undefined) errors.push(`${el.id}: parent "${el.parent}" does not exist`)
      else if ((parent.kind ?? 'class') !== 'group') errors.push(`${el.id}: parent "${el.parent}" must be kind "group"`)
    }
    if (el.kind === 'group' && (el.members?.length ?? 0) > 0) errors.push(`${el.id}: a group has no members`)
    if (el.kind === 'group' && (children.get(el.id)?.length ?? 0) === 0) errors.push(`${el.id}: a group needs at least one child`)
    // A cycle would loop forever when walking up.
    const seen = new Set<string>()
    for (let at: Element | undefined = el; at?.parent !== undefined; at = byId.get(at.parent)) {
      if (seen.has(at.id)) {
        errors.push(`${el.id}: parent chain loops`)
        break
      }
      seen.add(at.id)
    }
  }

  const decisions = new Map<string, Decision>()
  for (const d of map.decisions ?? []) {
    if (!isString(d.id) || !DECISION_ID.test(d.id)) errors.push(`decision id "${String(d.id)}" must look like D1`)
    if (decisions.has(d.id)) errors.push(`decision id "${d.id}" is used twice`)
    decisions.set(d.id, d)
    if (!isString(d.question) || d.question.trim() === '') errors.push(`${d.id}: question must be a non-empty string`)
    if (d.chosen !== undefined && d.options !== undefined && !d.options.some(o => o.id === d.chosen)) {
      errors.push(`${d.id}: chosen "${d.chosen}" is not one of its options`)
    }
    if (d.leaning !== undefined && d.options !== undefined && !d.options.some(o => o.id === d.leaning)) {
      errors.push(`${d.id}: leaning "${d.leaning}" is not one of its options`)
    }
    if (d.leaning !== undefined && d.chosen !== undefined) errors.push(`${d.id}: a chosen decision has no leaning; clear one of them`)
    if (d.axes !== undefined && !isStringList(d.axes)) errors.push(`${d.id}: axes must be a list of column names`)
    for (const o of d.options ?? []) {
      if (o.by === undefined) continue
      if (!isStringList(o.by)) errors.push(`${d.id}: option "${String(o.id)}" by must be a list of values`)
      else if (o.by.length !== (d.axes?.length ?? 0)) errors.push(`${d.id}: option "${o.id}" has ${o.by.length} values for ${d.axes?.length ?? 0} axes`)
    }
  }
  for (const el of map.elements) {
    if (el.decision !== undefined && !decisions.has(el.decision)) errors.push(`${el.id}: decision "${el.decision}" does not exist`)
    errors.push(...optionErrors(el.id, el.decision, el.option, decisions))
  }
  if (isSequence) errors.push(...sequenceErrors(map, byId, decisions))
  else if ((map.messages?.length ?? 0) > 0 || (map.fragments?.length ?? 0) > 0) errors.push('messages and fragments belong to sequence maps; this is a class map')

  if (isSequence && map.relations.length > 0) errors.push('a sequence map has no relations: draw calls as messages')
  for (const r of map.relations) {
    const name = `relation ${String(r.from)} -> ${String(r.to)}`
    if (!byId.has(r.from)) errors.push(`${name}: "${String(r.from)}" does not exist`)
    if (!byId.has(r.to)) errors.push(`${name}: "${String(r.to)}" does not exist`)
    if (r.from === r.to) errors.push(`${name}: points at itself`)
    if (r.kind !== undefined && !RELATION_KINDS.includes(r.kind)) errors.push(`${name}: kind must be one of ${RELATION_KINDS.join(', ')}`)
    if (r.label !== undefined && (!isString(r.label) || /[:"\n]/.test(r.label))) errors.push(`${name}: label must be a string without : " or a newline`)
    if (r.decision !== undefined && !decisions.has(r.decision)) errors.push(`${name}: decision "${r.decision}" does not exist`)
    errors.push(...optionErrors(name, r.decision, r.option, decisions))
  }

  if (isSequence) {
    if (view.collapse !== undefined || view.hide !== undefined) errors.push('view.collapse and view.hide: a sequence map shows every participant; there is nothing to fold or hide')
    if (view.direction !== undefined) errors.push('view.direction: a sequence map always runs top to bottom')
    if (map.direction !== undefined) errors.push('direction: a sequence map always runs top to bottom')
    return errors
  }
  for (const id of view.collapse ?? []) {
    if (byId.get(id)?.kind !== 'group') errors.push(`view.collapse: "${id}" is not a group`)
  }
  for (const id of view.hide ?? []) {
    if (!byId.has(id)) errors.push(`view.hide: "${id}" does not exist`)
  }
  if (view.direction !== undefined && !DIRECTIONS.includes(view.direction)) errors.push(`view.direction must be one of ${DIRECTIONS.join(', ')}`)

  return errors
}

/** `option` says which path of its decision an item belongs to, so it needs that decision. */
function optionErrors(owner: string, decision: string | undefined, option: string | undefined, decisions: Map<string, Decision>): string[] {
  if (option === undefined) return []
  if (decision === undefined) return [`${owner}: option "${option}" needs a decision on the same item`]
  const d = decisions.get(decision)
  if (d === undefined) return []
  if (d.options !== undefined && !d.options.some(o => o.id === option)) return [`${owner}: option "${option}" is not one of ${decision}'s options`]
  return []
}

function filesErrors(owner: string, files: unknown): string[] {
  if (files === undefined) return []
  if (!isStringList(files)) return [`${owner}: files must be a list of paths`]
  const errors: string[] = []
  for (const f of files) {
    if (f.startsWith('/')) errors.push(`${owner}: file "${f}" must be relative to the map's repo`)
    if (filePath(f).split('/').includes('..')) errors.push(`${owner}: file "${f}" must not climb out of the repo with ..`)
  }
  return errors
}

function stepsErrors(owner: string, steps: unknown): string[] {
  if (steps === undefined) return []
  if (!Array.isArray(steps)) return [`${owner}: steps must be a list of numbers`]
  return steps.filter(s => !Number.isInteger(s) || s < 1).map(s => `${owner}: step ${String(s)} must be a whole number from 1`)
}

/** Messages and fragments: ids shared with the participants, ends that exist, frames that nest. */
function sequenceErrors(map: DesignMap, participants: Map<string, Element>, decisions: Map<string, Decision>): string[] {
  const errors: string[] = []
  const messages = map.messages ?? []
  const fragments = map.fragments ?? []
  if (!Array.isArray(messages)) return ['messages must be a list']
  if (!Array.isArray(fragments)) return ['fragments must be a list']
  const ids = new Set(participants.keys())
  const claim = (id: unknown, what: string): id is string => {
    if (!isString(id) || !ID.test(id)) {
      errors.push(`${what} id "${String(id)}" must be ASCII: a letter, then letters, digits or _`)
      return false
    }
    if (ids.has(id)) errors.push(`${what} id "${id}" is already used by a participant, message or fragment`)
    ids.add(id)
    return true
  }
  const textErrors = (owner: string, field: string, text: unknown) =>
    text !== undefined && (!isString(text) || /\n/.test(text)) ? [`${owner}: ${field} must be a string without a newline`] : []

  const at = new Map<string, number>()
  messages.forEach((m, i) => {
    if (!claim(m?.id, 'message')) return
    at.set(m.id, i)
    const kind = m.kind ?? 'call'
    if (!MESSAGE_KINDS.includes(kind)) errors.push(`${m.id}: kind must be one of ${MESSAGE_KINDS.join(', ')}`)
    if (!participants.has(m.from)) errors.push(`${m.id}: from "${String(m.from)}" is not a participant`)
    if (m.to === undefined) {
      if (kind !== 'note') errors.push(`${m.id}: a ${kind} needs to (a participant; the same as from for a self call)`)
    } else if (!participants.has(m.to)) errors.push(`${m.id}: to "${String(m.to)}" is not a participant`)
    errors.push(...textErrors(m.id, 'label', m.label), ...filesErrors(m.id, m.files), ...stepsErrors(m.id, m.steps))
    if (m.change !== undefined && !CHANGES.includes(m.change)) errors.push(`${m.id}: change must be one of ${CHANGES.join(', ')}`)
    if (m.done !== undefined && typeof m.done !== 'boolean') errors.push(`${m.id}: done must be true or false`)
    if (m.note !== undefined && !isString(m.note)) errors.push(`${m.id}: note must be a string`)
    if (m.decision !== undefined && !decisions.has(m.decision)) errors.push(`${m.id}: decision "${m.decision}" does not exist`)
    errors.push(...optionErrors(m.id, m.decision, m.option, decisions))
  })

  type Span = { id: string; start: number; end: number; cuts: number[] }
  const spans: Span[] = []
  for (const f of fragments) {
    if (!claim(f?.id, 'fragment')) continue
    if (!FRAGMENT_KINDS.includes(f.kind)) errors.push(`${f.id}: kind must be one of ${FRAGMENT_KINDS.join(', ')}`)
    errors.push(...textErrors(f.id, 'label', f.label))
    if (f.change !== undefined && !CHANGES.includes(f.change)) errors.push(`${f.id}: change must be one of ${CHANGES.join(', ')}`)
    if (f.decision !== undefined && !decisions.has(f.decision)) errors.push(`${f.id}: decision "${f.decision}" does not exist`)
    errors.push(...optionErrors(f.id, f.decision, f.option, decisions))
    const start = at.get(f.first)
    const end = at.get(f.last)
    if (start === undefined) errors.push(`${f.id}: first "${String(f.first)}" is not a message`)
    if (end === undefined) errors.push(`${f.id}: last "${String(f.last)}" is not a message`)
    if (start === undefined || end === undefined) continue
    if (start > end) {
      errors.push(`${f.id}: first "${f.first}" comes after last "${f.last}"`)
      continue
    }
    const cuts: number[] = []
    if (f.branches !== undefined) {
      if (f.kind !== 'alt' && f.kind !== 'par') errors.push(`${f.id}: only alt (else) and par (and) have branches`)
      for (const b of Array.isArray(f.branches) ? f.branches : []) {
        errors.push(...textErrors(f.id, 'branch label', b?.label))
        const cut = at.get(b?.at)
        if (cut === undefined) errors.push(`${f.id}: branch at "${String(b?.at)}" is not a message`)
        else if (cut <= start || cut > end) errors.push(`${f.id}: branch at "${b.at}" must be a later message inside ${f.first}..${f.last}`)
        else if (cut <= (cuts.at(-1) ?? -1)) errors.push(`${f.id}: branches must be in message order, one per message`)
        else cuts.push(cut)
      }
    }
    spans.push({ id: f.id, start, end, cuts })
  }
  // Frames nest or stay apart, and one inside an alt or par stays inside one branch.
  for (const a of spans) {
    for (const b of spans) {
      if (a === b) continue
      const isCrossing = a.start < b.start && b.start <= a.end && a.end < b.end
      if (isCrossing) errors.push(`fragments ${a.id} and ${b.id} overlap without one holding the other`)
      // Two frames over the same messages: the one listed first is the outer one.
      const isInside = a.start <= b.start && b.end <= a.end && (a.start < b.start || b.end < a.end || spans.indexOf(a) < spans.indexOf(b))
      if (isInside && a.cuts.some(c => b.start < c && c <= b.end)) errors.push(`fragment ${b.id} crosses a branch of ${a.id}`)
    }
  }
  return errors
}

// ---------------------------------------------------------------- update

/** A field set to `null` is removed; one left out is kept. */
export type Patch<T> = { [K in keyof T]?: T[K] | null }
export type ElementPatch = { id: string } & Patch<Omit<Element, 'id'>>
export type DecisionPatch = { id: string } & Patch<Omit<Decision, 'id'>>
export type RelationRef = { from: string; to: string; kind?: RelationKind }
/** `after` or `before` (a message id) places a new message, or moves one; neither: a new one goes last. */
export type MessagePatch = { id: string; after?: string; before?: string } & Patch<Omit<Message, 'id'>>
export type FragmentPatch = { id: string } & Patch<Omit<Fragment, 'id'>>

export type MapUpdate = {
  title?: string
  context?: string | null
  direction?: Direction | null
  repo?: string | null
  base?: string | null
  scope?: string[] | null
  elements?: { upsert?: ElementPatch[]; remove?: string[] }
  relations?: { add?: Relation[]; remove?: RelationRef[] }
  messages?: { upsert?: MessagePatch[]; remove?: string[] }
  fragments?: { upsert?: FragmentPatch[]; remove?: string[] }
  decisions?: { upsert?: DecisionPatch[]; remove?: string[] }
}

export type Applied = { map: DesignMap; errors: string[]; notes: string[] }

/** Applies a batch of changes to a copy; the caller writes it only when `errors` is empty. */
export function applyUpdate(map: DesignMap, update: MapUpdate): Applied {
  const errors: string[] = []
  const notes: string[] = []
  const next = clone(map)
  const top = next as unknown as Record<string, unknown>
  const isSequence = map.diagram === 'sequence'

  if ('diagram' in update && (update as { diagram?: unknown }).diagram !== (map.diagram ?? 'class')) {
    errors.push(`diagram cannot change: this is a ${map.diagram ?? 'class'} map; open a new map for the other kind`)
  }
  if (!isSequence && (update.messages !== undefined || update.fragments !== undefined)) {
    errors.push('messages and fragments belong to sequence maps; this is a class map')
  }

  for (const key of ['title', 'context', 'direction', 'repo', 'base', 'scope'] as const) {
    if (!(key in update)) continue
    const value = update[key]
    if (value === null || value === undefined) {
      if (key === 'title') errors.push('title cannot be removed')
      else delete top[key]
    } else {
      top[key] = value
    }
  }

  const sameRelation = (a: RelationRef, b: Relation) =>
    a.from === b.from && a.to === b.to && (a.kind === undefined || a.kind === (b.kind ?? 'association'))

  for (const patch of update.elements?.upsert ?? []) {
    if (!isString(patch?.id)) {
      errors.push('elements.upsert: every element needs an id')
      continue
    }
    const existing = next.elements.find(e => e.id === patch.id)
    if (existing !== undefined) merge(existing, patch)
    else next.elements.push(merge({ id: patch.id }, patch))
  }

  const removing = new Set(update.elements?.remove ?? [])
  for (const id of removing) {
    if (!next.elements.some(e => e.id === id)) errors.push(`elements.remove: "${id}" does not exist`)
  }
  for (const el of next.elements) {
    if (el.parent !== undefined && removing.has(el.parent) && !removing.has(el.id)) {
      errors.push(`elements.remove: "${el.parent}" still has child "${el.id}"; remove or move it too`)
    }
  }
  if (isSequence) {
    const kept = new Set(update.messages?.remove ?? [])
    for (const id of removing) {
      const left = (next.messages ?? []).filter(m => !kept.has(m.id) && (m.from === id || m.to === id)).map(m => m.id)
      if (left.length > 0) errors.push(`elements.remove: participant "${id}" still has messages ${left.join(', ')}; remove them in the same batch`)
    }
  }
  if (removing.size > 0) {
    next.elements = next.elements.filter(e => !removing.has(e.id))
    const before = next.relations.length
    next.relations = next.relations.filter(r => !removing.has(r.from) && !removing.has(r.to))
    if (next.relations.length < before) notes.push(`removed ${before - next.relations.length} relation(s) of removed elements`)
  }

  for (const ref of update.relations?.remove ?? []) {
    const before = next.relations.length
    next.relations = next.relations.filter(r => !sameRelation(ref, r))
    if (next.relations.length === before) errors.push(`relations.remove: no relation ${ref.from} -> ${ref.to}${ref.kind === undefined ? '' : ` (${ref.kind})`}`)
  }
  for (const r of update.relations?.add ?? []) {
    // Adding one that exists updates its label or decision instead of doubling it.
    const existing = next.relations.find(o => sameRelation({ ...r, kind: r.kind ?? 'association' }, o))
    if (existing === undefined) next.relations.push(clone(r))
    else merge(existing, { ...(r.label === undefined ? {} : { label: r.label }), ...(r.decision === undefined ? {} : { decision: r.decision }) })
  }

  if (isSequence) {
    const messages = next.messages ?? []
    for (const id of update.messages?.remove ?? []) {
      const index = messages.findIndex(m => m.id === id)
      if (index < 0) errors.push(`messages.remove: "${id}" does not exist`)
      else messages.splice(index, 1)
    }
    for (const patch of update.messages?.upsert ?? []) {
      if (!isString(patch?.id)) {
        errors.push('messages.upsert: every message needs an id')
        continue
      }
      const { after, before, ...fields } = patch
      const index = messages.findIndex(m => m.id === patch.id)
      const existing = messages[index]
      const message: Message = existing === undefined ? merge({ id: patch.id } as Message, fields) : merge(existing, fields)
      const anchor = after ?? before
      if (index >= 0 && anchor === undefined) continue
      if (index >= 0) messages.splice(index, 1)
      if (anchor === undefined) {
        messages.push(message)
        continue
      }
      const at = messages.findIndex(m => m.id === anchor)
      if (at < 0) {
        errors.push(`messages.upsert ${patch.id}: ${after !== undefined ? 'after' : 'before'} "${anchor}" is not a message`)
        messages.push(message)
        continue
      }
      messages.splice(after !== undefined ? at + 1 : at, 0, message)
    }
    if (messages.length > 0) next.messages = messages
    else delete next.messages

    const fragments = next.fragments ?? []
    for (const id of update.fragments?.remove ?? []) {
      const index = fragments.findIndex(f => f.id === id)
      if (index < 0) errors.push(`fragments.remove: "${id}" does not exist`)
      else fragments.splice(index, 1)
    }
    for (const patch of update.fragments?.upsert ?? []) {
      if (!isString(patch?.id)) {
        errors.push('fragments.upsert: every fragment needs an id')
        continue
      }
      const existing = fragments.find(f => f.id === patch.id)
      if (existing !== undefined) merge(existing, patch)
      else fragments.push(merge({ id: patch.id } as Fragment, patch))
    }
    if (fragments.length > 0) next.fragments = fragments
    else delete next.fragments
  }

  const decisions = next.decisions ?? []
  for (const patch of update.decisions?.upsert ?? []) {
    if (!isString(patch?.id)) {
      errors.push('decisions.upsert: every decision needs an id')
      continue
    }
    const existing = decisions.find(d => d.id === patch.id)
    if (existing !== undefined) merge(existing, patch)
    else decisions.push(merge({ id: patch.id, question: '' }, patch))
  }
  for (const id of update.decisions?.remove ?? []) {
    const index = decisions.findIndex(d => d.id === id)
    if (index < 0) {
      errors.push(`decisions.remove: "${id}" does not exist`)
      continue
    }
    decisions.splice(index, 1)
    for (const holder of [...next.elements, ...next.relations, ...(next.messages ?? []), ...(next.fragments ?? [])]) {
      if (holder.decision === id) {
        delete holder.decision
        notes.push(`cleared decision ${id} from ${'id' in holder ? holder.id : `${holder.from} -> ${holder.to}`}`)
      }
    }
  }
  if (decisions.length > 0) next.decisions = decisions
  else delete next.decisions

  errors.push(...validate(next))
  return { map: next, errors, notes }
}

export type ViewPatch = {
  collapse?: string[]
  expand?: string[]
  hide?: string[]
  show?: string[]
  direction?: Direction | null
  legend?: boolean
  reset?: boolean
}

export function applyView(map: DesignMap, view: MapView, patch: ViewPatch): { view: MapView; errors: string[] } {
  const next: MapView = patch.reset === true ? {} : clone(view)
  const edit = (list: string[] | undefined, add: string[] = [], remove: string[] = []) => {
    const set = new Set(list ?? [])
    for (const id of add) set.add(id)
    for (const id of remove) set.delete(id)
    return set.size === 0 ? undefined : [...set]
  }
  const collapse = edit(next.collapse, patch.collapse, patch.expand)
  const hide = edit(next.hide, patch.hide, patch.show)
  if (collapse === undefined) delete next.collapse
  else next.collapse = collapse
  if (hide === undefined) delete next.hide
  else next.hide = hide
  if (patch.direction === null) delete next.direction
  else if (patch.direction !== undefined) next.direction = patch.direction
  if (patch.legend !== undefined) next.legend = patch.legend
  return { view: next, errors: validate(map, next).filter(e => e.startsWith('view.')) }
}

/** Drops view entries naming elements that no longer exist (after a removal). */
export function pruneView(map: DesignMap, view: MapView): MapView {
  const ids = new Set(map.elements.filter(e => e.kind === 'group').map(e => e.id))
  const all = new Set(map.elements.map(e => e.id))
  const next = clone(view)
  if (next.collapse !== undefined) next.collapse = next.collapse.filter(id => ids.has(id))
  if (next.hide !== undefined) next.hide = next.hide.filter(id => all.has(id))
  if (next.collapse?.length === 0) delete next.collapse
  if (next.hide?.length === 0) delete next.hide
  return next
}

// ---------------------------------------------------------------- progress

/**
 * Which elements own a changed file, and which changed files no element owns.
 * Paths are repo-relative; a file entry ending in `/` owns everything under it.
 * A message counts only when it changes: most calls start from one service file,
 * and a change there would otherwise mark every arrow out of it.
 */
export function progressOf(map: DesignMap, changed: readonly string[]): { touched: string[]; outside: string[] } {
  const touched = new Set<string>()
  const covered = new Set<string>()
  const norm = (p: string) => filePath(p).replace(/^\.\//, '')
  // The map's territory: changes elsewhere in the repo are some other work, not "outside the map".
  const folders = map.scope?.map(p => norm(p).replace(/\/+$/, ''))
  const isMine = (c: string) => folders === undefined || folders.some(d => c === d || c.startsWith(`${d}/`))
  for (const el of [...map.elements, ...changingMessages(map)]) {
    for (const file of el.files ?? []) {
      const f = norm(file)
      for (const c of changed) {
        const isOwned = f.endsWith('/')
          ? c.startsWith(f) || c.includes(`/${f}`)
          : c === f || c.endsWith(`/${f}`) || f.endsWith(`/${c}`)
        if (isOwned) {
          touched.add(el.id)
          covered.add(c)
        }
      }
    }
  }
  return { touched: [...touched], outside: changed.filter(c => !covered.has(c) && isMine(c)) }
}

// ---------------------------------------------------------------- render

type Palette = { fill: string; stroke: string; width: string; color: string }

export const PALETTE: Record<Change, Palette> = {
  keep: { fill: '#efebe4', stroke: '#c8c0b2', width: '1px', color: '#6b665e' },
  result: { fill: '#f2edfa', stroke: '#cbbde4', width: '1px', color: '#463e58' },
  modify: { fill: '#e4d9f6', stroke: '#b5a2d9', width: '1px', color: '#3e3456' },
  delete: { fill: '#fadedb', stroke: '#e5aca6', width: '1px', color: '#5b3833' },
  add: { fill: '#d8f0e1', stroke: '#9fd1b1', width: '1px', color: '#2e4b3a' },
}

export const LEGEND: Record<Change, string> = {
  delete: '🗑 코드 삭제',
  modify: '코드 수정',
  add: '새 코드',
  result: '코드 그대로 · 저장값 변경',
  keep: '코드 그대로 · 값도 그대로',
}

/** A folded group takes its strongest descendant's color. */
const STRENGTH: Change[] = ['keep', 'result', 'add', 'modify', 'delete']

const MEMBER_MARK = { modify: '✏', add: '➕', delete: '➖' } as const

/** The mark of an element whose files changed in the working tree but is not done yet. */
export const WORKING = '🔧'

const ARROW: Record<RelationKind, string> = {
  association: '-->',
  dependency: '..>',
  inheritance: '--|>',
  realization: '..|>',
  composition: '--*',
  aggregation: '--o',
}

const STEREOTYPE: Partial<Record<ElementKind, string>> = {
  interface: 'interface',
  enum: 'enumeration',
  table: 'table',
  resource: 'resource',
  external: 'external',
}

// Lines and box borders are all 1px and soft violet-grey: the pastel fill alone tells the change.
const INIT = '%%{init: {"themeVariables": {"clusterBkg": "#faf6ef", "clusterBorder": "#dcd3c4", "nodeBorder": "#dcd3c4", "lineColor": "#8e889e", "strokeWidth": 1}}}%%'

/** What the drawing holds, for a legend drawn outside it. */
export type Used = {
  changes: Change[]
  hasDone: boolean
  hasSteps: boolean
  hasOpen: boolean
  hasWorking: boolean
  boxes: number
}

/** Each drawn box's look, by its id: a box whose signature changed was redrawn. */
/** A line as drawn, between the boxes its relations were lifted to, in the order Mermaid numbers them. */
export type DrawnEdge = { from: string; to: string; label: string; sources: { from: string; to: string }[] }

/**
 * What a sequence drawing holds, in the order Mermaid puts each kind in the SVG: lines in source
 * order, notes in source order (a section's title note is the section's id), frames as they close.
 */
export type SequenceOrder = { lines: string[]; notes: string[]; frames: string[] }

export type Rendered = {
  mermaid: string
  warnings: string[]
  used: Used
  boxes: Record<string, string>
  /** Class maps: whether each drawn box is done or being worked on, for the page to show. */
  states?: Record<string, BoxState>
  edges: DrawnEdge[]
  order?: SequenceOrder
}

export type BoxState = { isDone: boolean; isWorking: boolean }

export type RenderOptions = {
  /** Elements whose files changed and are not done: marked 🔧. */
  touched?: readonly string[]
  /** The browser page stamps done boxes and lets working ones breathe: ✅ and 🔧 stay out of box titles. */
  isPage?: boolean
}

/** A box as drawn: an element, or a collapsed group standing for its descendants. */
type Box = {
  id: string
  label: string
  change: Change
  isDashed: boolean
  isDone: boolean
  isWorking: boolean
  hasSteps: boolean
  stereotype?: string
  members: Member[]
}

/**
 * Once a decision is chosen, the options it did not take are no longer part of the design:
 * anything tagged with a losing `option` stops being drawn. While the decision is still open,
 * every path is drawn, because that is the thing being decided.
 */
export function isRuledOut(decisions: readonly Decision[], item: { decision?: string; option?: string }): boolean {
  if (item.option === undefined || item.decision === undefined) return false
  const d = decisions.find(x => x.id === item.decision)
  return d?.chosen !== undefined && d.chosen !== item.option
}

export function toMermaid(map: DesignMap, view: MapView = {}, options: RenderOptions = {}): Rendered {
  if (map.diagram === 'sequence') return toSequence(map, options)
  const warnings: string[] = []
  const byId = new Map(map.elements.map(el => [el.id, el]))
  const children = childrenOf(map)
  const collapsed = new Set(view.collapse ?? [])
  const hidden = new Set(view.hide ?? [])
  const touched = new Set(options.touched ?? [])
  const open = new Set((map.decisions ?? []).filter(d => d.chosen === undefined).map(d => d.id))

  const ancestors = (id: string): Element[] => {
    const chain: Element[] = []
    for (let at = byId.get(byId.get(id)?.parent ?? ''); at !== undefined; at = byId.get(at.parent ?? '')) {
      chain.push(at)
    }
    return chain
  }
  const ruledOut = new Set(map.elements.filter(el => isRuledOut(map.decisions ?? [], el)).map(el => el.id))
  const isHidden = (id: string) => hidden.has(id) || ruledOut.has(id) || ancestors(id).some(a => hidden.has(a.id) || ruledOut.has(a.id))
  /** The box an element is drawn in: itself, or its outermost collapsed ancestor. */
  const drawnAs = (id: string): string | undefined => {
    if (isHidden(id)) return undefined
    const outer = ancestors(id).filter(a => collapsed.has(a.id)).at(-1)
    if (outer !== undefined) return outer.id
    const el = byId.get(id)
    // An expanded group is a namespace; Mermaid cannot attach an edge to it,
    // unless everything inside is hidden and it is drawn as a box.
    if (el?.kind === 'group' && !collapsed.has(id)) {
      const isEmpty = (children.get(id) ?? []).every(k => isHidden(k.id))
      return isEmpty ? id : undefined
    }
    return id
  }
  const descendants = (id: string): Element[] =>
    (children.get(id) ?? []).flatMap(c => [c, ...descendants(c.id)])

  const tag = (decision: string | undefined) => (decision !== undefined && open.has(decision) ? ` [${decision}]` : '')
  const isWorking = (el: Element) => touched.has(el.id) && el.done !== true
  const lead = (isDone: boolean, working: boolean) => options.isPage === true ? '' : `${isDone ? '✅ ' : ''}${working ? `${WORKING} ` : ''}`

  const boxOf = (el: Element): Box => {
    if (el.kind === 'group') {
      const leaves = descendants(el.id).filter(d => d.kind !== 'group')
      const inside = leaves.filter(d => !isHidden(d.id))
      const hiddenCount = leaves.length - inside.length
      const change = inside.reduce<Change>(
        (strongest, d) => (STRENGTH.indexOf(d.change ?? 'keep') > STRENGTH.indexOf(strongest) ? d.change ?? 'keep' : strongest),
        el.change ?? 'keep',
      )
      const stepped = inside.filter(d => (d.steps?.length ?? 0) > 0)
      const isDone = stepped.length > 0 && stepped.every(d => d.done === true)
      const working = !isDone && inside.some(isWorking)
      const steps = [...new Set(stepped.flatMap(d => d.steps ?? []))].sort((a, b) => a - b)
      const decisions = [...new Set(inside.map(d => d.decision).filter(d => d !== undefined && open.has(d)))]
      return {
        id: el.id,
        label: `${lead(isDone, working)}${shown(el.label ?? el.id)} (${inside.length}개${hiddenCount > 0 ? `, 숨김 ${hiddenCount}개` : ''})${stepLabel(steps)}${decisions.map(d => ` [${d}]`).join('')}`,
        change,
        isDashed: decisions.length > 0,
        isDone,
        isWorking: working,
        hasSteps: steps.length > 0,
        stereotype: 'group',
        members: [],
      }
    }
    const working = isWorking(el)
    return {
      id: el.id,
      label: `${lead(el.done === true, working)}${el.change === 'delete' ? '🗑 ' : ''}${shown(el.label ?? el.id)}${stepLabel(el.steps ?? [])}${tag(el.decision)}`,
      change: el.change ?? 'keep',
      isDashed: el.decision !== undefined && open.has(el.decision),
      isDone: el.done === true,
      isWorking: working,
      hasSteps: (el.steps?.length ?? 0) > 0,
      stereotype: STEREOTYPE[el.kind ?? 'class'],
      members: el.members ?? [],
    }
  }

  const lines: string[] = [INIT, 'classDiagram', `    direction ${view.direction ?? map.direction ?? 'TB'}`, '']
  const boxes: Box[] = []

  const emitBox = (box: Box, indent: string) => {
    boxes.push(box)
    // ✅ leads: after `pay()` Mermaid would read it as a return type (`pay() : ✅`).
    const body = box.members.map(m => {
      const mark = m.change === undefined ? '' : `${MEMBER_MARK[m.change]} `
      return `${indent}    ${m.done === true ? '✅ ' : ''}${mark}${shown(m.text)}`
    })
    lines.push(body.length === 0
      ? `${indent}class ${box.id}["${box.label}"]`
      : [`${indent}class ${box.id}["${box.label}"] {`, ...body, `${indent}}`].join('\n'))
  }

  const emit = (el: Element, indent: string) => {
    if (isHidden(el.id)) return
    if (el.kind === 'group' && !collapsed.has(el.id)) {
      const kids = (children.get(el.id) ?? []).filter(k => !isHidden(k.id))
      // Everything inside is hidden: keep the group on screen as one box rather than lose it.
      if (kids.length === 0) {
        emitBox(boxOf(el), indent)
        return
      }
      lines.push(`${indent}namespace ${el.id} {`)
      for (const kid of kids) emit(kid, `${indent}    `)
      lines.push(`${indent}}`)
      return
    }
    emitBox(boxOf(el), indent)
  }

  for (const el of map.elements.filter(e => e.parent === undefined)) emit(el, '    ')

  const used: Used = {
    changes: (['delete', 'modify', 'add', 'result', 'keep'] as const).filter(c => boxes.some(b => b.change === c)),
    hasDone: boxes.some(b => b.isDone),
    hasSteps: boxes.some(b => b.hasSteps),
    hasOpen: boxes.some(b => b.isDashed),
    hasWorking: boxes.some(b => b.isWorking),
    boxes: boxes.length,
  }

  const showsLegend = view.legend !== false
  if (showsLegend) {
    lines.push('', '    namespace Legend {')
    for (const change of used.changes) lines.push(`        class Lg_${change}["${LEGEND[change]}"]`)
    if (used.hasDone || used.hasSteps) lines.push('        class Lg_done["✅ 구현 완료 · (스텝 N) 구현 순서"]')
    if (used.hasWorking) lines.push(`        class Lg_working["${WORKING} 작업 중 (파일 변경 감지)"]`)
    if (used.hasOpen) lines.push('        class Lg_open["점선 · [D번호] 결정 대기"]')
    lines.push('    }')
  }

  // Relations, lifted to the boxes that are drawn, deduplicated.
  lines.push('')
  const edges = new Map<string, { from: string; to: string; arrow: string; labels: string[]; unlabeled: number; sources: { from: string; to: string }[] }>()
  for (const r of map.relations) {
    if (isRuledOut(map.decisions ?? [], r)) continue
    const from = drawnAs(r.from)
    const to = drawnAs(r.to)
    if (from === undefined || to === undefined) {
      const why = [r.from, r.to].find(id => byId.get(id)?.kind === 'group' && !isHidden(id) && drawnAs(id) === undefined)
      if (why !== undefined) warnings.push(`relation ${r.from} -> ${r.to} not drawn: group "${why}" is expanded`)
      continue
    }
    if (from === to) continue
    const arrow = ARROW[r.kind ?? 'association']
    const key = `${from} ${arrow} ${to}`
    const edge = edges.get(key) ?? { from, to, arrow, labels: [], unlabeled: 0, sources: [] }
    edge.sources.push({ from: r.from, to: r.to })
    const label = `${shown(r.label ?? '')}${tag(r.decision)}`.trim()
    if (label === '') edge.unlabeled += 1
    else if (!edge.labels.includes(label)) edge.labels.push(label)
    edges.set(key, edge)
  }
  // A merged edge says how many relations it stands for, so a lone label
  // does not read as the only interaction: `취소 외 1건`, or `2건` with none.
  const drawn: DrawnEdge[] = []
  for (const e of edges.values()) {
    const isMerged = e.labels.length + e.unlabeled > 1
    const rest = isMerged && e.unlabeled > 0 ? `${e.unlabeled}건` : ''
    const text = e.labels.length === 0 ? rest : rest === '' ? e.labels.join(' · ') : `${e.labels.join(' · ')} 외 ${rest}`
    lines.push(`    ${e.from} ${e.arrow} ${e.to}${text === '' ? '' : ` : ${text}`}`)
    drawn.push({ from: e.from, to: e.to, label: text, sources: e.sources })
  }

  // Stereotypes go after the class lines: `<<x>> Id` on a labelled class.
  const typed = boxes.filter(b => b.stereotype !== undefined)
  if (typed.length > 0) lines.push('', ...typed.map(b => `    <<${b.stereotype}>> ${b.id}`))

  lines.push('')
  for (const b of boxes) lines.push(`    style ${b.id} ${styleOf(b.change, b.isDashed)}`)
  if (showsLegend) {
    for (const change of used.changes) lines.push(`    style Lg_${change} ${styleOf(change, false)}`)
    if (used.hasDone || used.hasSteps) lines.push('    style Lg_done fill:#ffffff,stroke:#9fd1b1,stroke-width:1px,color:#000')
    if (used.hasWorking) lines.push('    style Lg_working fill:#ffffff,stroke:#a29cad,stroke-width:1px,color:#000')
    if (used.hasOpen) lines.push('    style Lg_open fill:#ffffff,stroke:#a29cad,stroke-width:1px,color:#000,stroke-dasharray:6 4')
  }

  const signatures = Object.fromEntries(boxes.map(b => [b.id, JSON.stringify([b.label, b.change, b.isDashed, b.members, b.isDone, b.isWorking])]))
  const states = Object.fromEntries(boxes.map(b => [b.id, { isDone: b.isDone, isWorking: b.isWorking }]))
  return { mermaid: `${lines.join('\n')}\n`, warnings, used, boxes: signatures, states, edges: drawn }
}

// ---------------------------------------------------------------- sequence

/**
 * Plain cream participants and notes: Mermaid 12's default theme gives every participant its own
 * color and notes a yellow one, which would read as change colors. The page paints changes itself.
 */
const SEQUENCE_INIT = `%%{init: {"theme": "default", "themeVariables": {${[
  ['actorBkg', PALETTE.keep.fill], ['actorBorder', PALETTE.keep.stroke], ['actorTextColor', '#3b3a40'], ['actorLineColor', '#c8c0b2'],
  ['signalColor', '#8e889e'], ['signalTextColor', '#3b3a40'],
  ['labelBoxBkgColor', '#ffffff'], ['labelBoxBorderColor', '#dcd3c4'], ['labelTextColor', '#4a4850'], ['loopTextColor', '#4a4850'],
  ['noteBkgColor', '#fffdf8'], ['noteBorderColor', '#dcd3c4'], ['noteTextColor', '#4a4850'],
].map(([k, v]) => `"${k}": "${v}"`).join(', ')}}}}%%`

/** A section's band, the namespace cream of class maps. */
const SECTION_BAND = 'rgb(250,246,239)'

const ARROW_OF: Record<Exclude<MessageKind, 'note'>, string> = { call: '->>', reply: '-->>', async: '-)' }

/** ➕ ✏ 🗑 before a changed participant, message or frame: the exported Markdown has no other color for them. */
const CHANGE_MARK: Partial<Record<Change, string>> = { add: '➕ ', modify: '✏ ', delete: '🗑 ' }

function band(change: Change): string {
  const hex = PALETTE[change].fill
  return `rgb(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')})`
}

/**
 * Sequence text: `;` ends a statement and `#` starts an entity code, so both (and `%`, which
 * Mermaid eats) go in as entity codes in one pass; angle brackets as in class maps.
 */
export function sequenceText(text: string): string {
  return shown(text).replace(/[#;%]/g, c => `#${c.charCodeAt(0)};`)
}

function toSequence(map: DesignMap, options: RenderOptions): Rendered {
  const touched = new Set(options.touched ?? [])
  const open = new Set((map.decisions ?? []).filter(d => d.chosen === undefined).map(d => d.id))
  const tag = (decision: string | undefined) => (decision !== undefined && open.has(decision) ? ` [${decision}]` : '')
  // A decided question leaves its losing paths out, participants and the messages that need them alike.
  const ruled = (item: { decision?: string; option?: string }) => isRuledOut(map.decisions ?? [], item)
  const elements = map.elements.filter(el => !ruled(el))
  const here = new Set(elements.map(el => el.id))
  const messages = (map.messages ?? []).filter(m => !ruled(m) && here.has(m.from) && here.has(m.to ?? m.from))
  const kept = new Set(messages.map(m => m.id))
  const fragments = (map.fragments ?? []).filter(f => !ruled(f) && kept.has(f.first) && kept.has(f.last))
  const signatures: Record<string, string> = {}
  const changes = new Set<Change>()
  let hasDone = false
  let hasSteps = false
  let hasOpen = false
  let hasWorking = false

  const labelOf = (item: { id: string; label?: string; change?: Change; decision?: string; steps?: number[]; done?: boolean }, fallback: string) => {
    const isWorking = touched.has(item.id) && item.done !== true
    changes.add(item.change ?? 'keep')
    hasDone ||= item.done === true
    hasSteps ||= (item.steps?.length ?? 0) > 0
    hasOpen ||= tag(item.decision) !== ''
    hasWorking ||= isWorking
    const text = `${item.done === true ? '✅ ' : ''}${isWorking ? `${WORKING} ` : ''}${CHANGE_MARK[item.change ?? 'keep'] ?? ''}${item.label ?? fallback}${stepLabel(item.steps ?? [])}${tag(item.decision)}`
    signatures[item.id] = JSON.stringify([text, item.change ?? 'keep'])
    return sequenceText(text)
  }

  const lines: string[] = [SEQUENCE_INIT, 'sequenceDiagram', '    autonumber']
  const place = new Map(elements.map((el, i) => [el.id, i]))
  for (const el of elements) {
    lines.push(`    ${el.kind === 'actor' ? 'actor' : 'participant'} ${el.id} as ${labelOf(el, el.id)}`)
  }

  const index = new Map(messages.map((m, i) => [m.id, i]))
  const opens = new Map<number, Fragment[]>()
  const closes = new Map<number, Fragment[]>()
  const cuts = new Map<number, { fragment: Fragment; label?: string }[]>()
  for (const f of fragments) {
    const start = index.get(f.first)
    const end = index.get(f.last)
    if (start === undefined || end === undefined) continue
    opens.set(start, [...(opens.get(start) ?? []), f])
    closes.set(end, [f, ...(closes.get(end) ?? [])])
    for (const b of f.branches ?? []) {
      const at = index.get(b.at)
      if (at !== undefined) cuts.set(at, [...(cuts.get(at) ?? []), { fragment: f, ...(b.label === undefined ? {} : { label: b.label }) }])
    }
  }
  const length = (f: Fragment) => (index.get(f.last) ?? 0) - (index.get(f.first) ?? 0)
  // Outer frames open first and close last; over the same messages, the one listed first is outer.
  for (const list of opens.values()) list.sort((a, b) => length(b) - length(a) || fragments.indexOf(a) - fragments.indexOf(b))
  for (const list of closes.values()) list.sort((a, b) => length(a) - length(b) || fragments.indexOf(b) - fragments.indexOf(a))

  const order: SequenceOrder = { lines: [], notes: [], frames: [] }
  let depth = 1
  let bandOf: Change | null = null
  const pad = () => '    '.repeat(depth)
  const endBand = () => {
    if (bandOf === null) return
    depth -= 1
    lines.push(`${pad()}end`)
    bandOf = null
  }
  /** The participants a run of messages touches, leftmost and rightmost: where a title note spans. */
  const span = (from: number, to: number) => {
    const at = messages.slice(from, to + 1).flatMap(m => [m.from, m.to ?? m.from]).map(id => place.get(id) ?? 0)
    const ids = [Math.min(...at), Math.max(...at)].map(i => elements[i]?.id).filter(id => id !== undefined)
    return [...new Set(ids)].join(',')
  }

  messages.forEach((m, i) => {
    for (const cut of cuts.get(i) ?? []) {
      endBand()
      depth -= 1
      lines.push(`${pad()}${cut.fragment.kind === 'par' ? 'and' : 'else'}${cut.label === undefined ? '' : ` ${sequenceText(cut.label)}`}`)
      depth += 1
    }
    for (const f of opens.get(i) ?? []) {
      endBand()
      const label = labelOf(f, '')
      if (f.kind === 'section') {
        lines.push(`${pad()}rect ${SECTION_BAND}`)
        depth += 1
        if (label !== '') {
          lines.push(`${pad()}Note over ${span(index.get(f.first) ?? i, index.get(f.last) ?? i)}: ${label}`)
          order.notes.push(f.id)
        }
      } else {
        lines.push(`${pad()}${f.kind}${label === '' ? '' : ` ${label}`}`)
        depth += 1
      }
    }
    const change = m.change ?? 'keep'
    if (change !== bandOf) {
      endBand()
      if (change !== 'keep') {
        lines.push(`${pad()}rect ${band(change)}`)
        depth += 1
        bandOf = change
      }
    }
    const text = labelOf(m, '')
    if ((m.kind ?? 'call') === 'note') {
      lines.push(`${pad()}Note over ${m.to === undefined || m.to === m.from ? m.from : `${m.from},${m.to}`}: ${text}`)
      order.notes.push(m.id)
    } else {
      lines.push(`${pad()}${m.from}${ARROW_OF[(m.kind ?? 'call') as Exclude<MessageKind, 'note'>]}${m.to}: ${text}`)
      order.lines.push(m.id)
    }
    const closing = closes.get(i) ?? []
    if (closing.length > 0) endBand()
    for (const f of closing) {
      depth -= 1
      lines.push(`${pad()}end`)
      if (f.kind !== 'section') order.frames.push(f.id)
    }
  })
  endBand()

  const used: Used = {
    changes: (['delete', 'modify', 'add', 'result', 'keep'] as const).filter(c => changes.has(c)),
    hasDone,
    hasSteps,
    hasOpen,
    hasWorking,
    boxes: map.elements.length,
  }
  return { mermaid: `${lines.join('\n')}\n`, warnings: [], used, boxes: signatures, edges: [], order }
}

// ---------------------------------------------------------------- browser page

export type PageElement = Element & { working: boolean }
export type PageMessage = Message & { working: boolean; number?: number }

export type Page = {
  name: string
  diagram: Diagram
  title: string
  context?: string
  repo?: string
  /** The folders whose changes count as this map's (see DesignMap.scope). */
  scope?: string[]
  view: MapView
  revision: number
  updatedAt: number
  mermaid: string
  warnings: string[]
  elements: Record<string, PageElement>
  decisions: Decision[]
  steps: { step: number; state: 'done' | 'working' | 'todo'; items: { id: string; label: string; state: StepRow['state'] }[] }[]
  outside: string[]
  legend: { text: string; fill: string; stroke: string; dashed?: boolean }[]
  changeNames: Record<Change, string>
  boxes: Record<string, string>
  /** Class maps: each drawn box's done and working state, which the page shows as a stamp and a breath. */
  states: Record<string, BoxState>
  /** The lines as drawn, in Mermaid's order: a click on the n-th line is edges[n - 1]. */
  edges: DrawnEdge[]
  relations: Relation[]
  /** Sequence maps: messages (with their autonumber), fragments, and where each sits in the SVG. */
  messages?: Record<string, PageMessage>
  fragments?: Record<string, Fragment>
  order?: SequenceOrder
  /** Sequence maps: the page paints each participant in its change color, which Mermaid cannot. */
  palette?: Record<Change, Palette>
}

/** What the browser page draws: the diagram (legend outside it) and everything beside it. */
export function pageOf(name: string, map: DesignMap, view: MapView, touched: readonly string[], outside: readonly string[], updatedAt: number): Page {
  const { mermaid, warnings, used, boxes, states, edges, order } = toMermaid(map, { ...view, legend: false }, { touched, isPage: true })
  const isClass = map.diagram !== 'sequence'
  const working = new Set(touched)
  const rows = stepRows(map, touched)
  const stepNumbers = [...new Set(rows.map(r => r.step))]
  const legend: Page['legend'] = used.changes.map(c => ({ text: LEGEND[c], fill: PALETTE[c].fill, stroke: PALETTE[c].stroke }))
  if (used.hasDone || used.hasSteps) legend.push({ text: isClass ? '완료 도장 · (스텝 N) 구현 순서' : '✅ 구현 완료 · (스텝 N) 구현 순서', fill: '#ffffff', stroke: '#9fd1b1' })
  if (used.hasWorking) legend.push({ text: isClass ? '숨 쉬는 상자 · 작업 중 (파일 변경 감지)' : `${WORKING} 작업 중 (파일 변경 감지)`, fill: '#ffffff', stroke: '#a29cad' })
  if (used.hasOpen) legend.push({ text: '천천히 빛남 · [D번호] 결정 대기', fill: '#ffffff', stroke: '#d99a06', dashed: true })
  if ((map.fragments ?? []).some(f => f.kind === 'section')) legend.push({ text: '크림색 띠 · 구간', fill: '#faf6ef', stroke: '#dcd3c4' })
  const numbers = new Map((order?.lines ?? []).map((id, i) => [id, i + 1]))
  return {
    name,
    diagram: map.diagram ?? 'class',
    title: map.title,
    ...(map.context === undefined ? {} : { context: map.context }),
    ...(map.repo === undefined ? {} : { repo: map.repo }),
    ...(map.scope === undefined ? {} : { scope: map.scope }),
    view,
    revision: map.revision ?? 0,
    updatedAt,
    mermaid,
    warnings,
    elements: Object.fromEntries(map.elements.map(e => [e.id, { ...e, working: working.has(e.id) && e.done !== true }])),
    decisions: map.decisions ?? [],
    steps: stepNumbers.map(step => {
      const items = rows.filter(r => r.step === step)
      const state = items.every(r => r.state === 'done') ? 'done' : items.some(r => r.state !== 'todo') ? 'working' : 'todo'
      return { step, state, items: items.map(r => ({ id: r.id, label: r.label, state: r.state })) }
    }),
    outside: [...outside],
    legend,
    changeNames: LEGEND,
    boxes,
    states: states ?? {},
    edges,
    relations: map.relations,
    ...(map.diagram === 'sequence'
      ? {
          messages: Object.fromEntries((map.messages ?? []).map(m => [m.id, {
            ...m,
            working: working.has(m.id) && m.done !== true,
            ...(numbers.has(m.id) ? { number: numbers.get(m.id) } : {}),
          }])),
          fragments: Object.fromEntries((map.fragments ?? []).map(f => [f.id, f])),
          ...(order === undefined ? {} : { order }),
          palette: PALETTE,
        }
      : {}),
  }
}

// ---------------------------------------------------------------- text views

/** Open decisions first, each with its options; then the settled ones. */
export function decisionsMarkdown(map: DesignMap): string {
  const decisions = map.decisions ?? []
  if (decisions.length === 0) return '_결정 사항이 없어요._'
  const open = decisions.filter(d => d.chosen === undefined)
  const settled = decisions.filter(d => d.chosen !== undefined)
  const owners = (id: string) => [
    ...map.elements.filter(e => e.decision === id).map(e => shown(e.label ?? e.id)),
    ...map.relations.filter(r => r.decision === id).map(r => `${r.from} → ${r.to}`),
    ...(map.messages ?? []).filter(m => m.decision === id).map(m => shown(messageName(m))),
    ...(map.fragments ?? []).filter(f => f.decision === id).map(f => shown(f.label ?? f.id)),
  ]
  const lines: string[] = []
  if (open.length > 0) {
    lines.push(`### 열린 결정 ${open.length}`)
    for (const d of open) {
      lines.push('', `**${d.id}** ${shown(d.question)}${d.oneWay === true ? ' (되돌리기 어려움)' : ''}`)
      for (const o of d.options ?? []) lines.push(`- \`${o.id}\` ${shown(o.text)}${o.id === d.leaning ? ' ← 기울어짐' : ''}${o.impact === undefined ? '' : `  \n  영향: ${shown(o.impact)}`}`)
      if (d.blocked !== undefined) lines.push(`- 이걸 알면 정할 수 있다: ${shown(d.blocked)}`)
      lines.push(...compareTable(d))
      const held = owners(d.id)
      if (held.length > 0) lines.push(`- 걸린 곳: ${held.join(', ')}`)
    }
  }
  if (settled.length > 0) {
    lines.push('', `### 확정 ${settled.length}`)
    for (const d of settled) {
      const chosen = d.options?.find(o => o.id === d.chosen)
      lines.push(`- **${d.id}** ${shown(d.question)}: \`${d.chosen}\`${chosen === undefined ? '' : ` ${shown(chosen.text)}`}${d.rationale === undefined ? '' : ` (${shown(d.rationale)})`}`)
      // The paths not taken stay written down: coming back, the first thing needed is why not.
      for (const o of d.options ?? []) {
        if (o.id === d.chosen || o.rejected === undefined) continue
        lines.push(`  - 접은 길 \`${o.id}\` ${shown(o.text)}: ${shown(o.rejected)}`)
      }
    }
  }
  return lines.join('\n')
}

/** The options side by side on the decision's own axes; nothing when it declares none. */
function compareTable(d: Decision): string[] {
  const axes = d.axes ?? []
  const options = (d.options ?? []).filter(o => (o.by?.length ?? 0) === axes.length)
  if (axes.length === 0 || options.length < 2) return []
  return [
    '',
    `| | ${axes.map(a => shown(a)).join(' | ')} |`,
    `| --- | ${axes.map(() => '---').join(' | ')} |`,
    ...options.map(o => `| \`${o.id}\` ${shown(o.text)} | ${(o.by ?? []).map(v => shown(v)).join(' | ')} |`),
    '',
  ]
}

export type StepRow = { step: number; id: string; label: string; state: 'done' | 'working' | 'todo' }

export function stepRows(map: DesignMap, touched: readonly string[] = []): StepRow[] {
  const working = new Set(touched)
  const rows: StepRow[] = []
  const named = [...map.elements.map(e => ({ item: e, label: e.label ?? e.id })), ...(map.messages ?? []).map(m => ({ item: m, label: messageName(m) }))]
  for (const { item, label } of named) {
    for (const step of item.steps ?? []) {
      rows.push({
        step,
        id: item.id,
        label,
        state: item.done === true ? 'done' : working.has(item.id) ? 'working' : 'todo',
      })
    }
  }
  return rows.sort((a, b) => a.step - b.step || a.id.localeCompare(b.id))
}

export function progressMarkdown(map: DesignMap, touched: readonly string[], outside: readonly string[]): string {
  const rows = stepRows(map, touched)
  const mark = { done: '✅', working: WORKING, todo: '⬜' } as const
  const lines: string[] = []
  if (rows.length === 0) lines.push('_구현 스텝이 아직 없어요._')
  else {
    const steps = [...new Set(rows.map(r => r.step))]
    const stateOf = (at: StepRow[]) =>
      at.every(r => r.state === 'done') ? 'done' : at.some(r => r.state !== 'todo') ? 'working' : 'todo'
    const doneCount = steps.filter(s => stateOf(rows.filter(r => r.step === s)) === 'done').length
    lines.push(`### 구현 스텝 ${doneCount}/${steps.length}`)
    for (const step of steps) {
      const at = rows.filter(r => r.step === step)
      const state = stateOf(at)
      // A step half done marks each box; a whole one needs only the step's mark.
      const names = at.map(r => `${state === 'working' ? `${mark[r.state]} ` : ''}${shown(r.label)}`)
      lines.push(`- ${mark[state]} 스텝 ${step}: ${names.join(', ')}`)
    }
  }
  const unstepped = [...map.elements.map(e => ({ item: e, label: e.label ?? e.id })), ...(map.messages ?? []).map(m => ({ item: m, label: messageName(m) }))]
    .filter(({ item }) => (item.steps?.length ?? 0) === 0 && touched.includes(item.id) && item.done !== true)
  if (unstepped.length > 0) lines.push('', `### 스텝 없이 작업 중 ${unstepped.length}`, ...unstepped.map(u => `- ${WORKING} ${shown(u.label)}`))
  if (outside.length > 0) {
    lines.push('', `### 지도 밖 변경 ${outside.length}`, '_지도의 어느 요소에도 속하지 않은 변경 파일이에요. 지도에 넣거나 이유를 확인하세요._')
    for (const f of outside.slice(0, 30)) lines.push(`- \`${f}\``)
    if (outside.length > 30) lines.push(`- … 외 ${outside.length - 30}개`)
  }
  return lines.join('\n')
}

/** One line for the status bar. */
export function summaryLine(map: DesignMap, touched: readonly string[], outside: readonly string[]): string {
  const open = (map.decisions ?? []).filter(d => d.chosen === undefined).length
  const rows = stepRows(map, touched)
  const steps = new Set(rows.map(r => r.step))
  const doneSteps = [...steps].filter(s => rows.filter(r => r.step === s).every(r => r.state === 'done')).length
  return [
    `🗺 ${map.title}`,
    open > 0 ? `결정 ${open}개 열림` : undefined,
    steps.size > 0 ? `스텝 ${doneSteps}/${steps.size}` : undefined,
    touched.length > 0 ? `${WORKING} ${touched.length}` : undefined,
    outside.length > 0 ? `지도 밖 ${outside.length}` : undefined,
  ].filter(s => s !== undefined).join(' · ')
}

// ---------------------------------------------------------------- export

const START = (name: string) => `<!-- design-map:start ${name} -->`
const END = '<!-- design-map:end -->'

/** A markdown block for the wiki: the diagram with its legend, then the decisions and steps. */
export function exportBlock(name: string, map: DesignMap, view: MapView): string {
  const { mermaid, used } = toMermaid(map, { ...view, legend: true })
  return [
    START(name),
    '```mermaid',
    mermaid.trimEnd(),
    '```',
    ...(map.diagram === 'sequence' ? ['', sequenceLegend(used)] : []),
    '',
    decisionsMarkdown(map),
    '',
    progressMarkdown(map, [], []),
    END,
  ].join('\n')
}

/** Replaces this map's block in `document`, or appends it. */
export function spliceBlock(document: string, name: string, block: string): string {
  const start = document.indexOf(START(name))
  const end = start < 0 ? -1 : document.indexOf(END, start)
  if (start >= 0 && end >= 0) return `${document.slice(0, start)}${block}${document.slice(end + END.length)}`
  return `${document.replace(/\s*$/, '')}\n\n${block}\n`
}

/** A sequence diagram has no room for a legend inside it: one line under it instead. */
function sequenceLegend(used: Used): string {
  const parts: string[] = []
  const bands: Record<Change, string> = { add: '➕ 초록 띠 새 코드', modify: '✏ 보라 띠 코드 수정', delete: '🗑 빨강 띠 코드 삭제', result: '연보라 띠 코드 그대로 · 저장값 변경', keep: '' }
  for (const c of used.changes) if (bands[c] !== '') parts.push(bands[c])
  parts.push('크림색 띠 구간')
  if (used.hasDone || used.hasSteps) parts.push('✅ 구현 완료 · (스텝 N) 구현 순서')
  if (used.hasOpen) parts.push('[D번호] 결정 대기')
  return `_범례: ${parts.join(' · ')}_`
}

/** How a message reads in text: its label, or who calls whom. */
export function messageName(m: Message): string {
  return m.label ?? `${m.from} → ${m.to ?? m.from}`
}

// ---------------------------------------------------------------- helpers

/** A `files` entry may carry a line: `src/A.kt:120`. These split it. */
export function filePath(entry: string): string {
  return entry.replace(/:\d+$/, '')
}

/** The lines (1-based, inclusive) where `needle` first sits in `text`; undefined when it is not there. */
export function lineRangeOf(text: string, needle: string): [number, number] | undefined {
  const at = text.indexOf(needle)
  if (at < 0 || needle === '') return undefined
  const start = text.slice(0, at).split('\n').length
  return [start, start + needle.split('\n').length - 1]
}

export function fileLine(entry: string): number | undefined {
  const m = /:(\d+)$/.exec(entry)
  return m === null ? undefined : Number(m[1])
}

/**
 * The elements whose `files` own an absolute path, when the map has a repo to resolve them in.
 * A message entry with a line (`path:line`, its call site) owns the path only when `lines`, the
 * range a tool call reads or edits, holds that line; one without a line owns the whole file.
 */
export function ownersOf(map: DesignMap, absolute: string, lines?: readonly [number, number]): string[] {
  const repo = map.repo?.replace(/\/$/, '')
  const owners: string[] = []
  const isOwned = (entry: string) => {
    const f = filePath(entry).replace(/^\.\//, '')
    return f.endsWith('/')
      ? (repo !== undefined && absolute.startsWith(`${repo}/${f}`)) || absolute.includes(`/${f}`)
      : (repo !== undefined && absolute === `${repo}/${f}`) || absolute.endsWith(`/${f}`)
  }
  for (const el of map.elements) {
    if ((el.files ?? []).some(isOwned)) owners.push(el.id)
  }
  for (const m of map.messages ?? []) {
    const isHere = (m.files ?? []).some(entry => {
      if (!isOwned(entry)) return false
      const line = fileLine(entry)
      return line === undefined || (lines !== undefined && lines[0] - 2 <= line && line <= lines[1] + 2)
    })
    if (isHere) owners.push(m.id)
  }
  return owners
}

/** Messages whose call changes: the only ones progress marks. */
function changingMessages(map: DesignMap): Message[] {
  return (map.messages ?? []).filter(m => (m.change ?? 'keep') !== 'keep')
}

/**
 * Mermaid drops `<...>` as HTML wherever it appears, so `List<Swing>` would
 * show as `List`. Angle quotes look the same and survive; `->` and `=>` stay.
 */
export function shown(text: string): string {
  return text.replace(/</g, '‹').replace(/(?<![-=])>/g, '›')
}

function styleOf(change: Change, isDashed: boolean): string {
  const p = PALETTE[change]
  return `fill:${p.fill},stroke:${p.stroke},stroke-width:${p.width},color:${p.color}${isDashed ? ',stroke-dasharray:6 4' : ''}`
}

function stepLabel(steps: number[]): string {
  return steps.length === 0 ? '' : ` (스텝 ${steps.join('·')})`
}

function childrenOf(map: DesignMap): Map<string, Element[]> {
  const children = new Map<string, Element[]>()
  for (const el of map.elements) {
    if (el.parent === undefined) continue
    children.set(el.parent, [...(children.get(el.parent) ?? []), el])
  }
  return children
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Sets each field of `patch` on `target`; `null` removes the field. */
function merge<T extends object>(target: T, patch: object): T {
  const into = target as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'id') continue
    if (value === null) delete into[key]
    else into[key] = clone(value)
  }
  return target
}
