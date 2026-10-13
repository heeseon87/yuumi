// Feedback the user leaves on the browser page, as pure data and text: what
// the mod applies itself and the prompt that carries the rest to the session.

import type { DesignMap } from '../types'
import type { ViewPatch } from './model'

export type FeedbackTarget =
  | { kind: 'map' }
  | { kind: 'element'; id: string }
  | { kind: 'decision'; id: string; option?: string }
  /** A line as drawn: between boxes, which may be folded groups. */
  | { kind: 'relation'; from: string; to: string; label?: string }
  /** A sequence map's message, note or fragment, by id. */
  | { kind: 'message'; id: string }

/** `open` asks the session to open `text` (an element's file) in the user's editor. */
export type FeedbackAction = 'comment' | 'explain' | 'expand' | 'collapse' | 'hide' | 'reset' | 'decide' | 'open'

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

function targetText(map: DesignMap, target: FeedbackTarget): string {
  if (target.kind === 'map') return '지도 전체'
  if (target.kind === 'decision') return `결정 ${target.id}`
  if (target.kind === 'relation') return `관계 ${target.from} → ${target.to}${target.label === undefined || target.label === '' ? '' : ` (${target.label})`}`
  if (target.kind === 'message') return sequenceTargetText(map, target.id)
  const el = map.elements.find(e => e.id === target.id)
  return el === undefined ? target.id : el.label !== undefined && el.label !== el.id ? `${el.id} (${el.label})` : el.id
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
    return [
      `${target.id}${decision === undefined ? '' : `(${decision.question})`}를 ${target.option ?? '?'}${option === undefined ? '' : `(${option.text})`}로 결정했어.`,
      '지도에는 이미 확정으로 표시했어. 이 결정에 맞게 영향받는 요소와 관계를 고쳐 줘.',
      ...(item.text === '' ? [] : [item.text]),
    ].join('\n')
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
