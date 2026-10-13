import { describe, expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { feedbackIdsOf, feedbackPrompt } from '../hooks/feedback'
import type { DesignMap } from '../hooks/model'
import { MAPS, world } from './world'

const SESSION = { cwd: '/Users/test/work', surface: 'terminal', isInteractive: true } as const

const MAP_UPDATE = {
  elements: {
    upsert: [
      { id: 'Domain', kind: 'group' },
      { id: 'OrderService', parent: 'Domain', change: 'modify' },
      { id: 'RefundPolicy', parent: 'Domain', change: 'add', decision: 'D1' },
    ],
  },
  decisions: { upsert: [{ id: 'D1', question: '환불 판단은 누가?', options: [{ id: 'D1-a', text: '새 정책 클래스' }, { id: 'D1-b', text: 'OrderService 안' }] }] },
}

const done = (answer: string, turnId: string) => ({ answer, durationMs: 1, isAborted: false, turnId, reason: 'answer' as const })

describe('the prompt', () => {
  test('carries every item with its target, and its ids come back out of the header', () => {
    const map = { schema: 1, title: 't', elements: [{ id: 'OrderService', label: '주문 서비스' }], relations: [] } as DesignMap
    const text = feedbackPrompt('demo', map, [
      { id: 3, at: 0, target: { kind: 'element', id: 'OrderService' }, action: 'explain', text: '', status: 'working' },
      { id: 4, at: 0, target: { kind: 'map' }, action: 'comment', text: '전체적으로 너무 복잡해', status: 'working' },
    ])
    expect(text.startsWith('[design-map 피드백 #3 #4] 사용자가 브라우저의 설계 지도 "demo"에서 남긴 피드백이야.')).toBe(true)
    expect(text).toContain('#3 · OrderService (주문 서비스) · 설명 요청')
    expect(text).toContain('#4 · 지도 전체\n전체적으로 너무 복잡해')
    expect(text).toContain('map_reply')
    expect(feedbackIdsOf(text)).toEqual([3, 4])
    expect(feedbackIdsOf('그냥 질문')).toEqual([])
  })

  test('names a relation by its drawn ends, and marks feedback sent into a running turn', () => {
    const map = { schema: 1, title: 't', elements: [], relations: [] } as DesignMap
    const items = [{ id: 7, at: 0, target: { kind: 'relation' as const, from: 'Api', to: 'Svc', label: '호출' }, action: 'comment' as const, text: '이 호출은 없애자', status: 'working' as const }]
    expect(feedbackPrompt('demo', map, items)).toContain('#7 · 관계 Api → Svc (호출)\n이 호출은 없애자')
    const midTurn = feedbackPrompt('demo', map, items, true)
    expect(midTurn.startsWith('[design-map 피드백 #7 · 작업 중 전달]')).toBe(true)
    expect(feedbackIdsOf(midTurn)).toEqual([7])
  })
})

describe('the loop', () => {
  async function opened($: Parameters<TestBody>[0], on: Parameters<TestBody>[1]) {
    const w = world(on)
    await $.session.start(SESSION)
    await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '데모' })
    await $.tool.call({ tool: 'mcp__design-map__map_update', ...MAP_UPDATE })
    await w.clock.advance(100)
    return w
  }

  test('a comment becomes one prompt; the turn it starts closes it with its answer', async ($, on) => {
    const w = await opened($, on)
    w.leave({ target: { kind: 'element', id: 'OrderService' }, action: 'comment', text: '이거 왜 수정해야 해?' })
    w.leave({ target: { kind: 'map' }, action: 'explain', text: '' })
    await w.clock.advance(1_000)
    expect(w.submitted.length).toBe(1)
    expect(w.submitted[0]).toContain('[design-map 피드백 #1 #2]')
    expect(w.feedback.map(i => i.status)).toEqual(['working', 'working'])

    // The session runs the turn; Claude answers #1 itself and leaves #2 to the fallback.
    await $.turn.start({ text: w.submitted[0] ?? '', turnId: 't1' })
    const replied = await $.tool.call({ tool: 'mcp__design-map__map_reply', id: 1, text: '환불 판단이 여기로 들어와서야.' })
    expect(String(replied.result)).toContain('Replied to #1')
    await $.turn.complete(done('정리하면 이래.', 't1'))
    expect(w.feedback.map(i => [i.status, i.reply])).toEqual([
      ['answered', '환불 판단이 여기로 들어와서야.'],
      ['answered', '정리하면 이래.'],
    ])
  })

  test('while a turn runs only view changes are taken; comments wait for the turn to end', async ($, on) => {
    const w = await opened($, on)
    await $.turn.start({ text: '다른 일 해 줘', turnId: 't0' })
    w.leave({ target: { kind: 'map' }, action: 'comment', text: '나중에 봐 줘' })
    w.leave({ target: { kind: 'element', id: 'Domain' }, action: 'collapse', text: '' })
    await w.clock.advance(1_000)
    expect(w.submitted.length).toBe(0)
    expect(w.feedback.map(i => i.status)).toEqual(['sent', 'done'])
    expect(JSON.parse(w.files.get(`${MAPS}/demo.view.json`) ?? '{}')).toEqual({ collapse: ['Domain'] })
    await w.clock.advance(100)
    expect(w.page()?.mermaid).toContain('class Domain["Domain (2개) [D1]"]')

    await $.turn.complete(done('끝', 't0'))
    await w.clock.advance(1_000)
    expect(w.submitted.length).toBe(1)
    expect(w.feedback[0]?.status).toBe('working')
  })

  test('unfolding a group from the browser also shows what was hidden inside it', async ($, on) => {
    const w = await opened($, on)
    w.leave({ target: { kind: 'element', id: 'OrderService' }, action: 'hide', text: '' })
    w.leave({ target: { kind: 'element', id: 'Domain' }, action: 'collapse', text: '' })
    await w.clock.advance(1_000)
    expect(JSON.parse(w.files.get(`${MAPS}/demo.view.json`) ?? '{}')).toEqual({ collapse: ['Domain'], hide: ['OrderService'] })
    w.leave({ target: { kind: 'element', id: 'Domain' }, action: 'expand', text: '' })
    await w.clock.advance(1_000)
    expect(JSON.parse(w.files.get(`${MAPS}/demo.view.json`) ?? '{}')).toEqual({})
    expect(w.submitted.length).toBe(0)
  })

  test('picking an option marks the decision chosen at once, then asks Claude to follow through', async ($, on) => {
    const w = await opened($, on)
    w.leave({ target: { kind: 'decision', id: 'D1', option: 'D1-a' }, action: 'decide', text: '' })
    await w.clock.advance(1_000)
    const map = JSON.parse(w.files.get(`${MAPS}/demo.json`) ?? '{}')
    expect(map.decisions[0].chosen).toBe('D1-a')
    expect(w.submitted[0]).toContain('D1(환불 판단은 누가?)를 D1-a(새 정책 클래스)로 결정했어.')
    await w.clock.advance(100)
    expect(w.page()?.mermaid).not.toContain('[D1]')
  })

  test('a reload in the middle of a feedback turn neither hands its items back nor sends new ones', async ($, on) => {
    const w = await opened($, on)
    w.leave({ target: { kind: 'map' }, action: 'comment', text: '첫 번째' })
    await w.clock.advance(1_000)
    await $.turn.start({ text: w.submitted[0] ?? '', turnId: 't3' })
    // The mod's own tool call reloads it mid-turn: session.start runs again.
    await $.session.start(SESSION)
    w.leave({ target: { kind: 'map' }, action: 'comment', text: '두 번째' })
    await w.clock.advance(2_000)
    expect(w.submitted.length).toBe(1)
    expect(w.feedback.map(i => i.status)).toEqual(['working', 'sent'])
    await $.turn.complete(done('첫 번째 답', 't3'))
    expect(w.feedback[0]?.status).toBe('answered')
    await w.clock.advance(1_000)
    expect(w.submitted.length).toBe(2)
    expect(w.submitted[1]).toContain('[design-map 피드백 #2]')
  })

  test('a refused submit puts the items back and waits before trying again', async ($, on) => {
    const w = await opened($, on)
    w.isSubmitRefused = true
    w.leave({ target: { kind: 'map' }, action: 'comment', text: '되나?' })
    await w.clock.advance(1_000)
    expect(w.feedback[0]?.status).toBe('sent')
    w.isSubmitRefused = false
    await w.clock.advance(3_000)
    expect(w.submitted.length).toBe(0)
    await w.clock.advance(10_000)
    expect(w.submitted.length).toBe(1)
  })

  test('an interrupted turn marks its feedback failed instead of leaving it working', async ($, on) => {
    const w = await opened($, on)
    w.leave({ target: { kind: 'map' }, action: 'comment', text: '해 줘' })
    await w.clock.advance(1_000)
    await $.turn.start({ text: w.submitted[0] ?? '', turnId: 't2' })
    await $.turn.complete({ ...done('', 't2'), isAborted: true, reason: 'aborted' })
    expect(w.feedback[0]?.status).toBe('failed')
  })
})
