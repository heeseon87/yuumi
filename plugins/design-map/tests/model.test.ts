import { describe, expect, test } from 'claude-code/testing'

import { toMermaid, validate } from '../hooks/model'
import type { DesignMap } from '../hooks/model'

const MAP: DesignMap = {
  schema: 1,
  title: 'test',
  elements: [
    { id: 'Domain', kind: 'group' },
    { id: 'OrderService', parent: 'Domain', change: 'modify', steps: [1] },
    { id: 'Payment', kind: 'group', parent: 'Domain' },
    { id: 'PaymentService', parent: 'Payment', change: 'modify', decision: 'D1', steps: [2], done: true,
      members: [{ text: 'pay(order)', change: 'modify', done: true }] },
    { id: 'RefundPolicy', parent: 'Payment', change: 'add', decision: 'D1', steps: [3] },
    { id: 'Legacy', parent: 'Payment', change: 'delete' },
    { id: 'Client', kind: 'interface', change: 'result' },
  ],
  relations: [
    { from: 'OrderService', to: 'PaymentService', label: '결제' },
    { from: 'OrderService', to: 'RefundPolicy', label: '결제' },
    { from: 'PaymentService', to: 'RefundPolicy' },
    { from: 'PaymentService', to: 'Client' },
    { from: 'OrderService', to: 'Payment', kind: 'dependency' },
  ],
  decisions: [{ id: 'D1', question: 'who decides refunds?' }],
}

describe('validate', () => {
  test('accepts a well-formed map', () => {
    expect(validate(MAP)).toEqual([])
  })

  test('a resource is a file the code reads, drawn with its own stereotype', () => {
    const map = { schema: 1, title: 't', elements: [{ id: 'Prompt', kind: 'resource', label: 'system.txt', change: 'add', files: ['src/main/resources/system.txt'] }], relations: [] } as DesignMap
    expect(validate(map)).toEqual([])
    expect(toMermaid(map, { legend: false }).mermaid).toContain('<<resource>> Prompt')
  })

  test('rejects what breaks Mermaid or the hierarchy', () => {
    const broken: DesignMap = {
      schema: 1,
      title: 'broken',
      elements: [
        { id: '주문' },
        { id: 'A', members: [{ text: 'a: b' }, { text: '+x' }, { text: 'total$', change: 'add' }] },
        { id: 'B', parent: 'A' },
        { id: 'C', decision: 'D9' },
      ],
      relations: [{ from: 'A', to: 'C', label: 'x: y' }],
    }
    const errors = validate(broken).join('\n')
    expect(errors).toContain('"주문" must be ASCII')
    expect(errors).toContain('member "a: b"')
    expect(errors).toContain('member "+x" must not start')
    expect(errors).toContain('member "total$" must not end with $ or *')
    expect(errors).toContain('parent "A" must be kind "group"')
    expect(errors).toContain('decision "D9" does not exist')
    expect(errors).toContain('label must be a string without :')
  })
})

describe('toMermaid', () => {
  test('expanded: namespaces, dashed open decisions, a relation to an expanded group is a warning', () => {
    const { mermaid, warnings } = toMermaid(MAP)
    expect(mermaid).toContain('namespace Domain {')
    expect(mermaid).toContain('namespace Payment {')
    expect(mermaid).toContain('class PaymentService["✅ PaymentService (스텝 2) [D1]"] {')
    expect(mermaid).toContain('✅ ✏ pay(order)')
    expect(mermaid).toContain('class Legacy["🗑 Legacy"]')
    expect(mermaid).toMatch(/style PaymentService fill:#e4d9f6[^\n]*stroke-dasharray:6 4/)
    expect(mermaid).toContain('<<interface>> Client')
    expect(warnings).toEqual(['relation OrderService -> Payment not drawn: group "Payment" is expanded'])
  })

  test('collapsed: one box in the strongest color, edges lifted, deduplicated, inner ones dropped', () => {
    const { mermaid, warnings } = toMermaid(MAP, { collapse: ['Payment'] })
    expect(warnings).toEqual([])
    expect(mermaid).toContain('class Payment["Payment (3개) (스텝 2·3) [D1]"]')
    expect(mermaid).toMatch(/style Payment fill:#fadedb[^\n]*stroke-dasharray:6 4/)
    // Two labelled edges into the group fold into one; the group-level relation now draws.
    expect(mermaid.match(/OrderService --> Payment/g)?.length).toBe(1)
    expect(mermaid).toContain('OrderService --> Payment : 결제')
    expect(mermaid).toContain('OrderService ..> Payment')
    expect(mermaid).toContain('Payment --> Client')
    expect(mermaid).not.toContain('Payment --> Payment')
  })

  test('generics keep their brackets as angle quotes; arrows stay', () => {
    const generic: DesignMap = {
      schema: 1,
      title: 'generic',
      elements: [
        { id: 'Loader', label: 'Loader<Swing>', members: [{ text: 'byClub Map<Club, List<Swing>>', change: 'add' }, { text: 'a -> b' }] },
        { id: 'Sink' },
      ],
      relations: [{ from: 'Loader', to: 'Sink', label: 'List<X> 전달' }],
    }
    const { mermaid } = toMermaid(generic)
    expect(mermaid).toContain('class Loader["Loader‹Swing›"]')
    expect(mermaid).toContain('➕ byClub Map‹Club, List‹Swing››')
    expect(mermaid).toContain('a -> b')
    expect(mermaid).toContain('Loader --> Sink : List‹X› 전달')
  })

  test('a merged edge counts the relations its labels leave out', () => {
    const merged: DesignMap = {
      ...MAP,
      relations: [
        { from: 'PaymentService', to: 'Client' },
        { from: 'RefundPolicy', to: 'Client', label: '취소' },
        { from: 'Legacy', to: 'Client', kind: 'dependency' },
        { from: 'OrderService', to: 'Legacy', kind: 'dependency' },
      ],
    }
    const { mermaid } = toMermaid(merged, { collapse: ['Payment'] })
    expect(mermaid).toContain('Payment --> Client : 취소 외 1건')
    expect(mermaid).toMatch(/Payment \.\.> Client\n/)
    expect(mermaid).toMatch(/OrderService \.\.> Payment\n/)
    const { mermaid: two } = toMermaid({ ...merged, relations: merged.relations.slice(0, 1).concat({ from: 'Legacy', to: 'Client' }) }, { collapse: ['Payment'] })
    expect(two).toContain('Payment --> Client : 2건')
  })

  test('a chosen decision draws solid and untagged', () => {
    const decided: DesignMap = { ...MAP, decisions: [{ id: 'D1', question: 'q', chosen: 'D1-a', options: [{ id: 'D1-a', text: 'a' }] }] }
    const { mermaid } = toMermaid(decided)
    expect(mermaid).not.toContain('stroke-dasharray')
    expect(mermaid).not.toContain('[D1]')
  })

  test('an unfolded group whose inside is all hidden stays on screen as one box', () => {
    const map: DesignMap = {
      schema: 1,
      title: 't',
      elements: [{ id: 'Api', kind: 'group' }, { id: 'Controller', parent: 'Api' }, { id: 'Svc' }],
      relations: [{ from: 'Controller', to: 'Svc' }],
    }
    const { mermaid } = toMermaid(map, { hide: ['Controller'] })
    expect(mermaid).toContain('class Api["Api (0개, 숨김 1개)"]')
    expect(mermaid).not.toContain('namespace Api')
    expect(mermaid).toContain('class Svc["Svc"]')
  })

  test('hide drops the element, its descendants and their relations', () => {
    const { mermaid } = toMermaid(MAP, { hide: ['Payment'], legend: false })
    expect(mermaid).not.toContain('PaymentService')
    expect(mermaid).not.toContain('namespace Legend')
    expect(mermaid).toContain('class Client["Client"]')
    expect(mermaid).not.toContain('--> Client')
  })
})
