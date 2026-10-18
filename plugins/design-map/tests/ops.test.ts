import { describe, expect, test } from 'claude-code/testing'

import { applyUpdate, applyView, progressOf, pruneView, spliceBlock, stepRows } from '../hooks/model'
import type { DesignMap } from '../hooks/model'

const BASE: DesignMap = {
  schema: 1,
  title: 't',
  elements: [
    { id: 'G', kind: 'group' },
    { id: 'A', parent: 'G', change: 'modify', label: 'A 라벨', files: ['src/A.kt'], decision: 'D1' },
    { id: 'B', parent: 'G' },
    { id: 'C', files: ['lib/'] },
  ],
  relations: [{ from: 'A', to: 'B', label: '호출' }, { from: 'B', to: 'C' }],
  decisions: [{ id: 'D1', question: 'q' }],
}

describe('applyUpdate', () => {
  test('merges a patch, removes a field set to null, and leaves the input alone', () => {
    const { map, errors } = applyUpdate(BASE, { elements: { upsert: [{ id: 'A', label: null, done: true, steps: [2] }] } })
    expect(errors).toEqual([])
    expect(map.elements[1]).toEqual({ id: 'A', parent: 'G', change: 'modify', files: ['src/A.kt'], decision: 'D1', done: true, steps: [2] })
    expect(BASE.elements[1]?.label).toBe('A 라벨')
  })

  test('removing an element takes its relations along, and refuses to orphan children', () => {
    const removed = applyUpdate(BASE, { elements: { remove: ['B'] } })
    expect(removed.errors).toEqual([])
    expect(removed.map.relations).toEqual([])
    expect(removed.notes[0]).toContain('removed 2 relation')
    expect(applyUpdate(BASE, { elements: { remove: ['G'] } }).errors.join()).toContain('"G" still has child "A"')
  })

  test('adding a relation that exists updates its label instead of doubling it', () => {
    const { map } = applyUpdate(BASE, { relations: { add: [{ from: 'A', to: 'B', label: '조회' }] } })
    expect(map.relations.filter(r => r.from === 'A')).toEqual([{ from: 'A', to: 'B', label: '조회' }])
    const kept = applyUpdate(BASE, { relations: { add: [{ from: 'A', to: 'B' }] } })
    expect(kept.map.relations[0]?.label).toBe('호출')
  })

  test('removing a decision clears it from what it tagged; a missing relation is an error', () => {
    const { map, errors } = applyUpdate(BASE, { decisions: { remove: ['D1'] } })
    expect(errors).toEqual([])
    expect(map.elements[1]?.decision).toBeUndefined()
    expect(map.decisions).toBeUndefined()
    expect(applyUpdate(BASE, { relations: { remove: [{ from: 'C', to: 'A' }] } }).errors.join()).toContain('no relation C -> A')
  })

  test('wrong types from the model come back as errors, not as a broken file', () => {
    const { errors } = applyUpdate(BASE, {
      elements: { upsert: [{ id: 'A', steps: '1' as unknown as number[] }, { id: 'B', change: 'changed' as never }] },
    })
    expect(errors.join('\n')).toContain('A: steps must be a list of numbers')
    expect(errors.join('\n')).toContain('B: change must be one of')
  })
})

describe('view and progress', () => {
  test('applyView adds and removes, and refuses a fold of a non-group', () => {
    const folded = applyView(BASE, {}, { collapse: ['G'], hide: ['C'], direction: 'LR' })
    expect(folded).toEqual({ view: { collapse: ['G'], hide: ['C'], direction: 'LR' }, errors: [] })
    expect(applyView(BASE, folded.view, { expand: ['G'], show: ['C'], direction: null }).view).toEqual({})
    expect(applyView(BASE, {}, { collapse: ['A'] }).errors).toEqual(['view.collapse: "A" is not a group'])
  })

  test('pruneView forgets elements that are gone', () => {
    const map = applyUpdate(BASE, { elements: { remove: ['C'] } }).map
    expect(pruneView(map, { collapse: ['G'], hide: ['C'] })).toEqual({ collapse: ['G'] })
  })

  test('progressOf matches by path suffix and by folder', () => {
    expect(progressOf(BASE, ['src/A.kt', 'lib/x/y.kt', 'README.md'])).toEqual({ touched: ['A', 'C'], outside: ['README.md'] })
    expect(progressOf(BASE, ['module/src/A.kt']).touched).toEqual(['A'])
  })

  test('scope keeps other work in the repo out of "outside the map"; [] counts nothing outside', () => {
    const changed = ['src/A.kt', 'wiki/a.md', 'wiki/b/c.md', 'scripts/x.sh', 'wikis.md']
    expect(progressOf({ ...BASE, scope: ['wiki/'] }, changed)).toEqual({ touched: ['A'], outside: ['wiki/a.md', 'wiki/b/c.md'] })
    expect(progressOf({ ...BASE, scope: ['./wiki', 'scripts'] }, changed).outside).toEqual(['wiki/a.md', 'wiki/b/c.md', 'scripts/x.sh'])
    expect(progressOf({ ...BASE, scope: [] }, changed)).toEqual({ touched: ['A'], outside: [] })
    expect(applyUpdate({ ...BASE, scope: ['wiki'] }, { scope: null }).map.scope).toBeUndefined()
    expect(applyUpdate(BASE, { scope: ['../etc'] }).errors.join()).toContain('scope must be a list of repo-relative folders')
    expect(applyUpdate(BASE, { scope: ['/abs'] }).errors.join()).toContain('scope must be a list of repo-relative folders')
  })

  test('stepRows orders by step and says what is done or under way', () => {
    const map = applyUpdate(BASE, { elements: { upsert: [{ id: 'A', steps: [2] }, { id: 'B', steps: [1], done: true }] } }).map
    expect(stepRows(map, ['A']).map(r => `${r.step}:${r.id}:${r.state}`)).toEqual(['1:B:done', '2:A:working'])
  })

  test('spliceBlock replaces only its own block', () => {
    const once = spliceBlock('# doc\n', 'm', '<!-- design-map:start m -->\nv1\n<!-- design-map:end -->')
    const twice = spliceBlock(`${once}\nafter\n`, 'm', '<!-- design-map:start m -->\nv2\n<!-- design-map:end -->')
    expect(twice).toBe('# doc\n\n<!-- design-map:start m -->\nv2\n<!-- design-map:end -->\n\nafter\n')
  })
})
