import { describe, expect, it } from 'vitest'
import { recurringMonthDays } from '../plan'

const g = (next: string, period: number | null, active = true) => ({ next_expected_date: next, period_days: period, is_active: active, avg_amount: -10 })

describe('recurringMonthDays', () => {
  it('proyecta un mensual al mismo día del mes', () => {
    const m = recurringMonthDays([g('2026-12-17', 30)], 2026, 10)
    expect([...m.keys()]).toEqual([17])
  })
  it('recorta al último día en meses cortos', () => {
    const m = recurringMonthDays([g('2027-01-31', 31)], 2027, 1)
    expect([...m.keys()]).toEqual([28])
  })
  it('repite los semanales en todo el mes', () => {
    const m = recurringMonthDays([g('2026-11-22', 7)], 2026, 10)
    expect([...m.keys()].sort((a, b) => a - b)).toEqual([1, 8, 15, 22, 29])
  })
  it('ignora inactivos y sin fecha', () => {
    const m = recurringMonthDays([g('2026-11-10', 30, false), { ...g('', 30), next_expected_date: null }], 2026, 10)
    expect(m.size).toBe(0)
  })
  it('agrupa varios en el mismo día', () => {
    const m = recurringMonthDays([g('2026-11-22', 30), g('2026-11-22', 30)], 2026, 10)
    expect(m.get(22)?.length).toBe(2)
  })
})
