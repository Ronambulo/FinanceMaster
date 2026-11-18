import { describe, expect, it } from 'vitest'
import { needsReview } from '../movements'
import type { Transaction } from '../api'

const now = Date.parse('2026-11-18T12:00:00Z')
const tx = (p: Partial<Transaction>): Transaction => ({
  id: 1, source: 'n26', amount: -10, date: '2026-11-17', description: 'x', is_internal_transfer: false,
  is_auto_categorized: true, is_ai_categorized: false, category_id: 3, created_at: '2026-11-17T10:00:00', ...p,
} as unknown as Transaction)

describe('needsReview', () => {
  it('marca lo nuevo con categoría automática', () => {
    expect(needsReview(tx({}), now)).toBe(true)
    expect(needsReview(tx({ is_auto_categorized: false, is_ai_categorized: true }), now)).toBe(true)
    expect(needsReview(tx({ is_auto_categorized: false, category_id: null }), now)).toBe(true)
  })
  it('no marca lo confirmado, lo viejo ni los traspasos', () => {
    expect(needsReview(tx({ is_auto_categorized: false }), now)).toBe(false)
    expect(needsReview(tx({ created_at: '2026-09-01T10:00:00' }), now)).toBe(false)
    expect(needsReview(tx({ created_at: null }), now)).toBe(false)
    expect(needsReview(tx({ is_internal_transfer: true }), now)).toBe(false)
  })
  it('no marca lo que viene de regla, historial o marca conocida', () => {
    for (const s of ['rule', 'history', 'catalog']) expect(needsReview(tx({ category_source: s }), now)).toBe(false)
    for (const s of ['mcc', 'type', 'ai', null]) expect(needsReview(tx({ category_source: s }), now)).toBe(true)
    expect(needsReview(tx({ category_source: 'catalog', is_ai_categorized: true }), now)).toBe(true)
  })
})
