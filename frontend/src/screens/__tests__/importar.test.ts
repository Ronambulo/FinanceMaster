import { describe, expect, it } from 'vitest'
import { agoLabel, reviewRows } from '../Importar'

describe('agoLabel', () => {
  const now = new Date(2026, 10, 17, 12)
  it('hoy, ayer y días', () => {
    expect(agoLabel(new Date(2026, 10, 17, 9).toISOString(), now)).toBe('Hoy')
    expect(agoLabel(new Date(2026, 10, 16, 9).toISOString(), now)).toBe('Ayer')
    expect(agoLabel(new Date(2026, 10, 14, 9).toISOString(), now)).toBe('Hace 3 días')
  })
  it('vacío sin fecha', () => expect(agoLabel(null, now)).toBe(''))
})

describe('reviewRows', () => {
  const base = { date: '2026-11-01', name: 'A', amount: -5 } as never
  it('usa rows si existen', () => {
    const rows = [{ ...(base as object), key: 7, status: 'new', category_id: 2, is_internal_transfer: false }]
    expect(reviewRows({ new: [], duplicates: [], errors: [], rows } as never)[0].key).toBe(7)
  })
  it('compatibilidad sin rows', () => {
    const r = reviewRows({ new: [base], duplicates: [{ ...(base as object), will_update: true }], errors: [] } as never)
    expect(r.map(x => [x.key, x.status])).toEqual([[0, 'new'], [1, 'update']])
  })
})
