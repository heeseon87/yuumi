import { describe, expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { feedbackPrompt } from '../hooks/feedback'
import { applyUpdate, applyView, exportBlock, lineRangeOf, ownersOf, pageOf, progressOf, sequenceText, stepRows, toMermaid, validate } from '../hooks/model'
import type { DesignMap } from '../hooks/model'
import { MAPS, REPO, world } from './world'

const SEQ: DesignMap = {
  schema: 1,
  diagram: 'sequence',
  title: '노트 작성',
  repo: REPO,
  elements: [
    { id: 'App', kind: 'actor', label: '앱' },
    { id: 'Svc', change: 'modify', steps: [1], files: ['src/Svc.kt'] },
    { id: 'NoteTable', kind: 'table', label: 'note 테이블' },
    { id: 'Tr', change: 'add', decision: 'D1' },
  ],
  relations: [],
  messages: [
    { id: 'm_post', from: 'App', to: 'Svc', label: 'POST' },
    { id: 'm_find', from: 'Svc', to: 'NoteTable', label: '조회', change: 'add', files: ['src/Svc.kt:40'] },
    { id: 'm_save', from: 'Svc', to: 'NoteTable', label: '저장', change: 'modify', steps: [1], done: true, files: ['src/Svc.kt:52'] },
    { id: 'n_lang', kind: 'note', from: 'Svc', label: 'lang은 비워 둔다' },
    { id: 'm_tr', from: 'Svc', to: 'Tr', kind: 'async', label: '번역', change: 'add', steps: [2], decision: 'D1' },
    { id: 'm_reply', from: 'Svc', to: 'App', kind: 'reply', label: '201' },
  ],
  fragments: [
    { id: 'tx1', kind: 'section', label: '트랜잭션 1', first: 'm_find', last: 'n_lang' },
    { id: 'dup', kind: 'alt', label: '이미 있음', first: 'm_find', last: 'n_lang', branches: [{ at: 'm_save', label: '새 노트' }] },
    { id: 'langs', kind: 'loop', label: '언어마다', first: 'm_tr', last: 'm_tr' },
  ],
  decisions: [{ id: 'D1', question: '번역을 비동기로?' }],
}

describe('validate a sequence map', () => {
  test('accepts a well-formed one', () => {
    expect(validate(SEQ)).toEqual([])
  })

  test('rejects what Mermaid or the order cannot take', () => {
    const broken: DesignMap = {
      ...SEQ,
      elements: [{ id: 'Note' }, { id: 'G', kind: 'group' }, { id: 'A', members: [{ text: 'x' }] }, { id: 'B' }],
      relations: [{ from: 'A', to: 'B' }],
      messages: [
        { id: 'm1', from: 'A', to: 'B' },
        { id: 'm2', from: 'A' },
        { id: 'm3', from: 'A', to: 'Ghost' },
        { id: 'A', from: 'A', to: 'B' },
      ],
      fragments: [
        { id: 'f1', kind: 'loop', first: 'm1', last: 'm2' },
        { id: 'f2', kind: 'opt', first: 'm2', last: 'm3' },
        { id: 'f3', kind: 'loop', first: 'm1', last: 'm1', branches: [{ at: 'm1' }] },
        { id: 'f4', kind: 'alt', first: 'm3', last: 'm1' },
      ],
      decisions: [],
    }
    const errors = validate(broken).join('\n')
    expect(errors).toContain('"Note" is a Mermaid sequence keyword')
    expect(errors).toContain('G: kind must be one of')
    expect(errors).toContain('A: a participant has no members')
    expect(errors).toContain('a sequence map has no relations')
    expect(errors).toContain('m2: a call needs to')
    expect(errors).toContain('m3: to "Ghost" is not a participant')
    expect(errors).toContain('message id "A" is already used')
    expect(errors).toContain('fragments f1 and f2 overlap')
    expect(errors).toContain('f3: only alt (else) and par (and) have branches')
    expect(errors).toContain('f4: first "m3" comes after last "m1"')
  })

  test('a frame inside an alt stays inside one branch; a class map takes no messages', () => {
    const crossing: DesignMap = { ...SEQ, fragments: [...SEQ.fragments ?? [], { id: 'wide', kind: 'opt', first: 'm_find', last: 'm_save' }] }
    expect(validate(crossing).join('\n')).toContain('fragment wide crosses a branch of dup')
    const classMap: DesignMap = { schema: 1, title: 'c', elements: [{ id: 'A' }], relations: [], messages: [{ id: 'm', from: 'A', to: 'A' }] }
    expect(validate(classMap).join('\n')).toContain('messages and fragments belong to sequence maps')
    expect(validate({ ...classMap, messages: undefined, elements: [{ id: 'A', kind: 'actor' }] }).join('\n')).toContain('A: kind must be one of')
  })
})

describe('draw a sequence map', () => {
  test('participants, bands, frames and notes, in the order Mermaid draws them', () => {
    const { mermaid, order, used } = toMermaid(SEQ)
    expect(mermaid).toContain('"theme": "default"')
    expect(mermaid).toContain('sequenceDiagram\n    autonumber\n')
    expect(mermaid).toContain('    actor App as 앱\n')
    expect(mermaid).toContain('    participant Svc as ✏ Svc (스텝 1)\n')
    expect(mermaid).toContain('    participant Tr as ➕ Tr [D1]\n')
    // The section opens outside the alt over the same messages: it is listed first.
    expect(mermaid).toContain([
      '    rect rgb(250,246,239)',
      '        Note over Svc,NoteTable: 트랜잭션 1',
      '        alt 이미 있음',
      '            rect rgb(216,240,225)',
      '                Svc->>NoteTable: ➕ 조회',
      '            end',
      '        else 새 노트',
      '            rect rgb(228,217,246)',
      '                Svc->>NoteTable: ✅ ✏ 저장 (스텝 1)',
      '            end',
      '            Note over Svc: lang은 비워 둔다',
      '        end',
      '    end',
      '    loop 언어마다',
      '        rect rgb(216,240,225)',
      '            Svc-)Tr: ➕ 번역 (스텝 2) [D1]',
      '        end',
      '    end',
      '    Svc-->>App: 201',
    ].join('\n'))
    expect(order).toEqual({
      lines: ['m_post', 'm_find', 'm_save', 'm_tr', 'm_reply'],
      notes: ['tx1', 'n_lang'],
      frames: ['dup', 'langs'],
    })
    expect(used.changes).toEqual(['modify', 'add', 'keep'])
    expect(used.hasOpen).toBe(true)
  })

  test('frames close inside out, the way Mermaid writes them into the SVG', () => {
    const nested: DesignMap = {
      ...SEQ,
      fragments: [
        { id: 'outer', kind: 'loop', first: 'm_post', last: 'm_tr' },
        { id: 'inner', kind: 'opt', first: 'm_find', last: 'm_save' },
        { id: 'tail', kind: 'opt', first: 'm_reply', last: 'm_reply' },
      ],
    }
    expect(toMermaid(nested).order?.frames).toEqual(['inner', 'outer', 'tail'])
  })

  test('text that would end a statement or start an entity goes in as entity codes', () => {
    expect(sequenceText('채번 #1; 100% List<X>')).toBe('채번 #35;1#59; 100#37; List‹X›')
    const odd: DesignMap = { ...SEQ, messages: [{ id: 'm', from: 'App', to: 'Svc', label: 'a;b' }], fragments: [] }
    expect(toMermaid(odd).mermaid).toContain('App->>Svc: a#59;b')
  })

  test('the page numbers the lines, carries the palette, and the export has a legend line', () => {
    const page = pageOf('seq', SEQ, {}, ['m_find', 'Svc'], [], 0)
    expect(page.diagram).toBe('sequence')
    expect(page.messages?.m_save).toMatchObject({ number: 3, working: false })
    expect(page.messages?.m_find).toMatchObject({ number: 2, working: true })
    expect(page.messages?.n_lang?.number).toBeUndefined()
    expect(page.palette?.add.fill).toBe('#d8f0e1')
    expect(page.legend.map(l => l.text)).toContain('크림색 띠 · 구간')
    expect(page.mermaid).toContain('🔧 ➕ 조회')
    const block = exportBlock('seq', SEQ, {})
    expect(block).toContain('_범례: ✏ 보라 띠 코드 수정 · ➕ 초록 띠 새 코드 · 크림색 띠 구간')
  })
})

describe('change a sequence map', () => {
  test('a new message goes after or before another, or last; an existing one moves', () => {
    const { map, errors } = applyUpdate(SEQ, {
      messages: {
        upsert: [
          { id: 'm_first', from: 'App', to: 'Svc', label: '인증', before: 'm_post' },
          { id: 'm_mid', from: 'Svc', to: 'NoteTable', label: '잠금', after: 'm_find' },
          { id: 'm_last', from: 'Svc', to: 'App', kind: 'reply', label: '끝' },
          { id: 'm_post', label: 'POST /notes' },
        ],
      },
    })
    expect(errors).toEqual([])
    expect(map.messages?.map(m => m.id)).toEqual(['m_first', 'm_post', 'm_find', 'm_mid', 'm_save', 'n_lang', 'm_tr', 'm_reply', 'm_last'])
    expect(map.messages?.[1]).toEqual({ id: 'm_post', from: 'App', to: 'Svc', label: 'POST /notes' })
    expect(map.messages?.[0]).not.toHaveProperty('before')

    const moved = applyUpdate(SEQ, { messages: { upsert: [{ id: 'm_reply', after: 'm_post' }] } })
    expect(moved.map.messages?.map(m => m.id)).toEqual(['m_post', 'm_reply', 'm_find', 'm_save', 'n_lang', 'm_tr'])
  })

  test('refuses what would leave the map broken', () => {
    expect(applyUpdate(SEQ, { elements: { remove: ['Tr'] } }).errors.join('\n')).toContain('participant "Tr" still has messages m_tr')
    expect(applyUpdate(SEQ, { elements: { remove: ['Tr'] }, messages: { remove: ['m_tr'] } }).errors.join('\n')).toContain('langs: first "m_tr" is not a message')
    expect(applyUpdate(SEQ, { elements: { remove: ['Tr'] }, messages: { remove: ['m_tr'] }, fragments: { remove: ['langs'] } }).errors).toEqual([])
    expect(applyUpdate(SEQ, { diagram: 'class' } as never).errors.join('\n')).toContain('diagram cannot change')
    expect(applyUpdate({ schema: 1, title: 'c', elements: [], relations: [] }, { messages: { upsert: [] } }).errors.join('\n')).toContain('belong to sequence maps')
    expect(applyUpdate(SEQ, { messages: { upsert: [{ id: 'x', from: 'App', to: 'Svc', after: 'nope' }] } }).errors.join('\n')).toContain('after "nope" is not a message')
  })

  test('removing a decision clears it from messages too; a sequence view folds nothing', () => {
    const { map, notes } = applyUpdate(SEQ, { decisions: { remove: ['D1'] } })
    expect(map.messages?.find(m => m.id === 'm_tr')?.decision).toBeUndefined()
    expect(notes).toContain('cleared decision D1 from m_tr')
    expect(applyView(SEQ, {}, { collapse: ['Svc'] }).errors.join('\n')).toContain('nothing to fold or hide')
    expect(applyView(SEQ, {}, { reset: true }).errors).toEqual([])
  })
})

describe('progress and where the session looks, on a sequence map', () => {
  test('a changed file marks the participants and the messages that change, not every arrow out of it', () => {
    const { touched, outside } = progressOf({ ...SEQ, messages: [...SEQ.messages ?? [], { id: 'm_keep', from: 'Svc', to: 'App', files: ['src/Svc.kt:90'] }] }, ['src/Svc.kt', 'README.md'])
    expect(touched.sort()).toEqual(['Svc', 'm_find', 'm_save'])
    expect(outside).toEqual(['README.md'])
  })

  test('a line range lights the message whose call site is in it; no range, only the participant', () => {
    expect(ownersOf(SEQ, `${REPO}/src/Svc.kt`)).toEqual(['Svc'])
    expect(ownersOf(SEQ, `${REPO}/src/Svc.kt`, [48, 60])).toEqual(['Svc', 'm_save'])
    expect(ownersOf(SEQ, `${REPO}/src/Svc.kt`, [1, 41])).toEqual(['Svc', 'm_find'])
    expect(lineRangeOf('a\nb\nc\nd', 'c\nd')).toEqual([3, 4])
    expect(lineRangeOf('a\nb', 'x')).toBeUndefined()
  })

  test('steps list messages beside participants', () => {
    expect(stepRows(SEQ).map(r => `${r.step}:${r.id}:${r.state}`)).toEqual(['1:m_save:done', '1:Svc:todo', '2:m_tr:todo'])
  })

  test('feedback on a message names it by its number and id', () => {
    const text = feedbackPrompt('seq', SEQ, [{ id: 3, at: 0, target: { kind: 'message', id: 'm_save' }, action: 'comment', text: '이건 upsert로', status: 'sent' }])
    expect(text).toContain('#3 · 3번 메시지 m_save (Svc → NoteTable: 저장)\n이건 upsert로')
    const frame = feedbackPrompt('seq', SEQ, [{ id: 4, at: 0, target: { kind: 'message', id: 'dup' }, action: 'explain', text: '', status: 'sent' }])
    expect(frame).toContain('#4 · alt 프레임 dup (이미 있음) · 설명 요청')
  })
})

const SESSION = { cwd: '/Users/test/work', surface: 'terminal', isInteractive: true } as const

async function openedSequence($: Parameters<TestBody>[0], on: Parameters<TestBody>[1]) {
  const w = world(on)
  await $.session.start(SESSION)
  const opened = await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', title: '흐름', diagram: 'sequence', repo: REPO } as never)
  return { w, opened }
}

describe('sequence maps through the tools', () => {
  test('open creates one with the sequence guide; it keeps its kind', async ($, on) => {
    const { w, opened } = await openedSequence($, on)
    expect(opened.deny).toBeUndefined()
    expect(String(opened.result)).toContain('## A sequence map')
    expect(String(opened.result)).not.toContain('## Granularity')
    expect(String(opened.result)).toContain('Created sequence map "demo"')
    expect(JSON.parse(w.files.get(`${MAPS}/demo.json`) ?? '{}')).toMatchObject({ diagram: 'sequence', title: '흐름', elements: [], relations: [] })

    const again = await $.tool.call({ tool: 'mcp__design-map__map_open', name: 'demo', diagram: 'class' } as never)
    expect(again.deny).toContain('is a sequence map and stays one')
  })

  test('update takes participants, messages and frames; view refuses a fold', async ($, on) => {
    const { w } = await openedSequence($, on)
    const saved = await $.tool.call({
      tool: 'mcp__design-map__map_update',
      elements: { upsert: SEQ.elements },
      messages: { upsert: SEQ.messages },
      fragments: { upsert: SEQ.fragments },
      decisions: { upsert: SEQ.decisions },
    } as never)
    expect(saved.deny).toBeUndefined()
    expect(String(saved.result)).toContain('Participants: 4, messages: 6.')
    await w.clock.advance(100)
    const page = w.page() as { diagram: string; mermaid: string; order: { lines: string[] } }
    expect(page.diagram).toBe('sequence')
    expect(page.mermaid).toContain('Svc-)Tr: ➕ 번역 (스텝 2) [D1]')
    expect(page.order.lines.length).toBe(5)

    const folded = await $.tool.call({ tool: 'mcp__design-map__map_view', collapse: ['Svc'] } as never)
    expect(folded.deny).toContain('nothing to fold or hide')
  })

  test('an edit near a message call site lights that message', async ($, on) => {
    const { w } = await openedSequence($, on)
    await $.tool.call({ tool: 'mcp__design-map__map_update', elements: { upsert: SEQ.elements }, messages: { upsert: SEQ.messages }, decisions: { upsert: SEQ.decisions } } as never)
    w.write(`${REPO}/src/Svc.kt`, `${Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n')}\n`)
    await w.clock.advance(100)
    await $.turn.start({ text: '고치자', turnId: 't1' })
    await $.tool.call({ tool: 'Edit', file_path: `${REPO}/src/Svc.kt`, old_string: 'line 51\nline 52', new_string: 'x' } as never)
    await w.clock.advance(200)
    expect((w.activity.at(-1) as { current: { kind: string; ids: string[] } }).current).toMatchObject({ kind: 'edit', ids: ['Svc', 'm_save'] })

    await $.tool.call({ tool: 'Read', file_path: `${REPO}/src/Svc.kt` })
    await w.clock.advance(200)
    expect((w.activity.at(-1) as { current: { ids: string[] } }).current.ids).toEqual(['Svc'])
  })
})
