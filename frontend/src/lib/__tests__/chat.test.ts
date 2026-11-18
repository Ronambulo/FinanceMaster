import { describe, expect, it } from 'vitest'
import { chatSuggestions, historyFor, parseSSE } from '../chat'

describe('parseSSE', () => {
  it('splits complete events and keeps the partial rest', () => {
    const r = parseSSE('data: {"type":"delta","text":"Hola"}\n\ndata: {"type":"delta","text":" mun')
    expect(r.events).toEqual([{ type: 'delta', text: 'Hola' }])
    expect(r.rest).toBe('data: {"type":"delta","text":" mun')
    const r2 = parseSSE(r.rest + 'do"}\n\ndata: {"type":"done"}\n\n')
    expect(r2.events).toEqual([{ type: 'delta', text: ' mundo' }, { type: 'done' }])
    expect(r2.rest).toBe('')
  })
  it('ignores broken lines', () => {
    expect(parseSSE('data: {roto\n\n').events).toEqual([])
  })
})

describe('chat helpers', () => {
  it('suggests the previous month', () => {
    expect(chatSuggestions(new Date(2026, 10, 17))).toContain('Resumen de octubre')
    expect(chatSuggestions(new Date(2026, 0, 5))).toContain('Resumen de diciembre')
  })
  it('history drops empty turns and keeps the last ones', () => {
    const turns = Array.from({ length: 20 }, (_, i) => ({ role: 'user' as const, content: i === 19 ? '' : `m${i}` }))
    const h = historyFor(turns, 5)
    expect(h).toHaveLength(5)
    expect(h[4].content).toBe('m18')
  })
})
