// Feedback the user leaves on the browser page, as pure data and text: what
// the mod applies itself and the prompt that carries the rest to the session.

import type { DesignMap } from '../types'
import type { MapUpdate, ViewPatch } from './model'

export type FeedbackTarget =
  | { kind: 'map' }
  | { kind: 'element'; id: string }
  | { kind: 'decision'; id: string; option?: string }
  /** A line as drawn: between boxes, which may be folded groups. */
  | { kind: 'relation'; from: string; to: string; label?: string }
  /** A sequence map's message, note or fragment, by id. */
  | { kind: 'message'; id: string }
  /** Several boxes at once: the user drew a loop around them on the map. */
  | { kind: 'elements'; ids: string[] }

/** `open` asks the session to open `text` (an element's file) in the user's editor. */
export type FeedbackAction =
  | 'comment' | 'explain' | 'expand' | 'collapse' | 'hide' | 'reset' | 'decide' | 'open'
  /** Notes left while deciding: leaning toward an option, why a path was not taken, what it waits on. */
  | 'lean' | 'reject' | 'blocked'
  /** Neither option works: the user says what is missing and Claude reshapes the decision. */
  | 'propose'
  /** Where the map's territory ends (`text`: a JSON list of folders, [] or null); applied here. */
  | 'scope'

/** The three that are written onto the map here and never reach a model turn. */
export const DECISION_NOTES = ['lean', 'reject', 'blocked'] as const

export type FeedbackItem = {
  id: number
  at: number
  target: FeedbackTarget
  action: FeedbackAction
  text: string
  status: 'sent' | 'working' | 'answered' | 'done' | 'failed'
  reply?: string
  /** Sent with "지금 끼어들기": reaches a running turn instead of waiting for it to end. */
  urgent?: boolean
}

/** The header every feedback prompt starts with; turn.start finds the ids in it. */
export const PROMPT_TAG = '[design-map 피드백'

/** View changes the mod makes itself, with no model turn; undefined for the rest. */
export function viewPatchOf(item: FeedbackItem): { patch: ViewPatch; reply: string } | undefined {
  const id = item.target.kind === 'element' ? item.target.id : undefined
  if (item.action === 'reset') return { patch: { reset: true }, reply: '보기를 처음 상태로 돌렸어.' }
  if (id === undefined) return undefined
  if (item.action === 'expand') return { patch: { expand: [id] }, reply: `${id}를 펼쳤어.` }
  if (item.action === 'collapse') return { patch: { collapse: [id] }, reply: `${id}를 접었어.` }
  if (item.action === 'hide') return { patch: { hide: [id] }, reply: `${id}를 숨겼어. 보기 초기화로 다시 보여.` }
  return undefined
}

/**
 * Thinking out loud about a decision, written straight onto the map. None of these is a
 * question for the model: a leaning is free to take back, and a reason is worth nothing if
 * the user has to wait for a turn to record it. `map` must be the latest on disk, because
 * `reject` rewrites the whole options list.
 */
export function decisionPatchOf(map: DesignMap, item: FeedbackItem): { update: MapUpdate; reply: string } | undefined {
  const target = item.target
  if (target.kind !== 'decision') return undefined
  const decision = map.decisions?.find(d => d.id === target.id)
  if (decision === undefined) return undefined
  const text = item.text.trim()
  if (item.action === 'lean') {
    if (target.option === undefined || target.option === '') {
      return { update: { decisions: { upsert: [{ id: decision.id, leaning: null }] } }, reply: `${decision.id}의 기울어짐을 지웠어.` }
    }
    return {
      update: { decisions: { upsert: [{ id: decision.id, leaning: target.option }] } },
      reply: `${decision.id}는 ${target.option} 쪽으로 기울었어. 확정은 아니야.`,
    }
  }
  if (item.action === 'blocked') {
    return {
      update: { decisions: { upsert: [{ id: decision.id, blocked: text === '' ? null : text }] } },
      reply: text === '' ? `${decision.id}의 대기 이유를 지웠어.` : `${decision.id}는 "${text}"를 알면 정할 수 있어.`,
    }
  }
  if (item.action === 'reject') {
    if (target.option === undefined) return undefined
    const options = (decision.options ?? []).map(o => {
      if (o.id !== target.option) return o
      const { rejected: _was, ...rest } = o
      return text === '' ? rest : { ...rest, rejected: text }
    })
    return {
      update: { decisions: { upsert: [{ id: decision.id, options }] } },
      reply: text === '' ? `${target.option}의 기각 사유를 지웠어.` : `${target.option}를 접은 이유를 남겼어.`,
    }
  }
  return undefined
}

/**
 * The map's territory, set from the browser: which changed files count as "outside the map".
 * `text` is JSON: a list of repo-relative folders, [] for a design-only map, null for the whole repo.
 */
export function scopePatchOf(item: FeedbackItem): { scope: string[] | null; reply: string } | { error: string } {
  let value: unknown
  try {
    value = JSON.parse(item.text)
  } catch {
    return { error: '범위를 읽지 못했어.' }
  }
  if (value === null) return { scope: null, reply: '지도 밖 변경을 repo 전체에서 다시 셀게.' }
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) return { error: '범위는 폴더 목록이어야 해.' }
  const scope = [...new Set(value.map(v => v.trim().replace(/^\.\//, '').replace(/\/+$/, '')).filter(v => v !== ''))]
  if (scope.length === 0) return { scope: [], reply: '이 지도는 설계 전용으로 둘게. 지도 밖 변경은 세지 않아.' }
  return { scope, reply: `지도 밖 변경은 ${scope.map(s => `${s}/`).join(', ')} 안에서만 셀게.` }
}

function targetText(map: DesignMap, target: FeedbackTarget): string {
  if (target.kind === 'map') return '지도 전체'
  if (target.kind === 'decision') return `결정 ${target.id}`
  if (target.kind === 'relation') return `관계 ${target.from} → ${target.to}${target.label === undefined || target.label === '' ? '' : ` (${target.label})`}`
  if (target.kind === 'message') return sequenceTargetText(map, target.id)
  if (target.kind === 'elements') return `상자 ${target.ids.length}개: ${target.ids.map(id => elementText(map, id)).join(', ')}`
  return elementText(map, target.id)
}

function elementText(map: DesignMap, id: string): string {
  const el = map.elements.find(e => e.id === id)
  return el === undefined ? id : el.label !== undefined && el.label !== el.id ? `${el.id} (${el.label})` : el.id
}

/** A message as the user sees it: by its autonumber, which the prompt pairs with its id. */
function sequenceTargetText(map: DesignMap, id: string): string {
  const lines = (map.messages ?? []).filter(m => (m.kind ?? 'call') !== 'note')
  const message = (map.messages ?? []).find(m => m.id === id)
  if (message !== undefined) {
    const what = message.label ?? `${message.from} → ${message.to ?? message.from}`
    if ((message.kind ?? 'call') === 'note') return `노트 ${id} (${what})`
    return `${lines.indexOf(message) + 1}번 메시지 ${id} (${message.from} → ${message.to ?? message.from}: ${what})`
  }
  const fragment = (map.fragments ?? []).find(f => f.id === id)
  if (fragment !== undefined) return `${fragment.kind === 'section' ? '구간' : `${fragment.kind} 프레임`} ${id}${fragment.label === undefined ? '' : ` (${fragment.label})`}`
  return id
}

function body(map: DesignMap, item: FeedbackItem): string {
  const { target } = item
  if (item.action === 'decide' && target.kind === 'decision') {
    const decision = map.decisions?.find(d => d.id === target.id)
    const option = decision?.options?.find(o => o.id === target.option)
    const others = (decision?.options ?? []).filter(o => o.id !== target.option)
    return [
      `${target.id}${decision === undefined ? '' : `(${decision.question})`}를 ${target.option ?? '?'}${option === undefined ? '' : `(${option.text})`}로 결정했어.`,
      '지도에는 이미 확정으로 표시했어. 이 결정에 맞게 영향받는 요소와 관계를 고쳐 줘.',
      ...(item.text === '' ? [] : [`고른 이유: ${item.text}`]),
      // The reasons the other paths lost are what keeps the question from being reopened later.
      ...(others.length === 0 ? [] : [
        `rationale에 고른 이유를 적고, 접은 길(${others.map(o => o.id).join(', ')})에는 각각 rejected로 왜 아닌지를 적어 줘.`
        + ' 사용자가 브라우저에서 이미 적은 rejected는 그대로 두고.',
      ]),
      '이 결정의 option 태그가 붙은 요소 중 고르지 않은 쪽은 지도에서 지워 줘.',
    ].join('\n')
  }
  if (item.action === 'propose' && target.kind === 'decision') {
    const decision = map.decisions?.find(d => d.id === target.id)
    const had = (decision?.options ?? []).map(o => `${o.id} ${o.text}`).join(' / ')
    return [
      `${target.id}${decision === undefined ? '' : `(${decision.question})`}의 선택지로는 못 정하겠대. 사용자 말: ${item.text}`,
      had === '' ? '' : `지금 선택지: ${had}`,
      '이게 새로운 길이면 선택지를 하나 더 만들어서 영향까지 적고, 질문 자체가 틀렸으면 질문을 다시 세워 줘.'
        + ' 기존 선택지를 지우기 전에 왜 지우는지 한 줄로 말해 주고. 확정은 사용자가 한다.',
    ].filter(line => line !== '').join('\n')
  }
  if (item.action === 'explain' && target.kind === 'elements') {
    return item.text === '' ? '이 상자들이 각각 하는 일과 서로 어떻게 엮여 있는지 설명해 줘.' : `이 상자들에 대해 설명해 줘: ${item.text}`
  }
  if (item.action === 'explain') return item.text === '' ? '이 요소가 하는 일과 왜 이렇게 생겼는지 설명해 줘.' : `설명해 줘: ${item.text}`
  return item.text
}

/**
 * One prompt for every item claimed together, in the order they were left. `isMidTurn`: it
 * joins a running turn (the user interrupted), not one of its own.
 */
export function feedbackPrompt(name: string, map: DesignMap, items: readonly FeedbackItem[], isMidTurn = false): string {
  const ids = items.map(i => `#${i.id}`).join(' ')
  return [
    isMidTurn
      ? `${PROMPT_TAG} ${ids} · 작업 중 전달] 사용자가 지금 작업을 지켜보다가 브라우저의 설계 지도 "${name}"에 남긴 피드백이야. 하던 일에 바로 반영해 줘.`
      : `${PROMPT_TAG} ${ids}] 사용자가 브라우저의 설계 지도 "${name}"에서 남긴 피드백이야.`,
    ...items.flatMap(i => ['', `#${i.id} · ${targetText(map, i.target)}${i.action === 'explain' ? ' · 설명 요청' : i.action === 'decide' ? ' · 결정' : ''}`, body(map, i)]),
    '',
    '각 항목을 처리해 줘. 지도에 반영할 게 있으면 map_update로 고치고, 끝나면 map_reply로 항목마다 짧게 답해 줘. 답은 브라우저의 해당 피드백 아래에 보여.',
  ].join('\n')
}

/** The feedback ids a turn's prompt carries, from its header. */
export function feedbackIdsOf(text: string): number[] {
  const at = text.indexOf(PROMPT_TAG)
  if (at < 0) return []
  const header = text.slice(at, text.indexOf(']', at) + 1)
  return [...header.matchAll(/#(\d+)/g)].map(m => Number(m[1]))
}
