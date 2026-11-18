import { describe, expect, it } from 'vitest'
import { bestCycle, calendarCycles, cycleAverage, cycleDaysLeft, cycleEstimatedEnd, cycleLabel, cycleMonth, cycleRows, parseRangePeriod, previousSpendAligned } from '../cycles'
import type { MonthlyDetailRow } from '../api'

const row = (date: string, amount: number, extra: Partial<MonthlyDetailRow> = {}): MonthlyDetailRow => ({
  id: Math.random(), date, name: null, category_id: null, category_name: '', category_color: '', category_icon: '',
  amount, exclude_from_stats: false, recurring_group_id: null, ...extra,
})

const cycles = [
  { start: '2026-09-26', end: '2026-10-26', isOpen: false },
  { start: '2026-10-27', end: '2027-01-01', isOpen: true },
]

describe('cycles', () => {
  it('labels ranges', () => {
    expect(cycleLabel('2026-10-27', '2026-11-26', false)).toBe('27 oct – 26 nov')
    expect(cycleLabel('2026-10-27', '2027-01-01', true)).toBe('27 oct – hoy')
  })

  it('totals each cycle, skipping excluded rows', () => {
    const rows = [row('2026-09-26', 2000), row('2026-10-01', -500), row('2026-10-27', 2000), row('2026-11-02', -300), row('2026-11-03', -999, { exclude_from_stats: true })]
    const r = cycleRows(cycles, rows)
    expect(r.map(c => [c.income, c.expenses, c.savings])).toEqual([[2000, 500, 1500], [2000, 300, 1700]])
    expect(r[1].key).toBe('2026-10-27_2027-01-01')
  })

  it('compares the open cycle with the previous one at the same day', () => {
    const rows = [row('2026-09-28', -100), row('2026-10-20', -400), row('2026-10-29', -50)]
    const [prev, cur] = cycleRows(cycles, rows)
    // 6 días dentro del ciclo actual → del anterior solo cuenta hasta el 2 oct
    expect(previousSpendAligned(cur, prev, rows, new Date(2026, 10, 2, 12))).toBe(100)
    expect(previousSpendAligned({ ...cur, isOpen: false }, prev, rows, new Date(2026, 10, 2, 12))).toBe(500)
  })

  it('falls back to calendar months', () => {
    const c = calendarCycles(new Date(2026, 10, 17, 12), 3)
    expect(c).toEqual([
      { start: '2026-09-01', end: '2026-09-30', isOpen: false },
      { start: '2026-10-01', end: '2026-10-31', isOpen: false },
      { start: '2026-11-01', end: '2026-11-30', isOpen: true },
    ])
  })

  it('best and average use closed cycles only', () => {
    const r = [
      { key: 'a', savings: 300, isOpen: false }, { key: 'b', savings: 500, isOpen: false }, { key: 'c', savings: 2000, isOpen: true },
    ] as never
    expect(bestCycle(r)).toBe('b')
    expect(cycleAverage(r)).toBe(400)
  })

  it('parses range periods', () => {
    expect(parseRangePeriod('2026-10-27_2026-11-26')).toEqual({ date_from: '2026-10-27', date_to: '2026-11-26' })
    expect(parseRangePeriod('2026-10')).toBeNull()
  })
})

describe('calendarCycles con día fijo', () => {
  it('starts each cycle on the chosen day', () => {
    expect(calendarCycles(new Date(2026, 10, 17, 12), 2, 25)).toEqual([
      { start: '2026-09-25', end: '2026-10-24', isOpen: false },
      { start: '2026-10-25', end: '2026-11-24', isOpen: true },
    ])
    expect(calendarCycles(new Date(2026, 10, 25, 12), 1, 25)).toEqual([{ start: '2026-11-25', end: '2026-12-24', isOpen: true }])
    expect(calendarCycles(new Date(2026, 0, 3, 12), 1, 10)).toEqual([{ start: '2025-12-10', end: '2026-01-09', isOpen: true }])
  })
})

describe('mes y días que quedan de un ciclo', () => {
  it('el mes de un ciclo es el de su punto medio', () => {
    expect(cycleMonth({ start: '2026-09-27', end: '2026-10-27' })).toBe('2026-10')
    expect(cycleMonth({ start: '2026-11-01', end: '2026-11-30' })).toBe('2026-11')
    // Abierto: su fin aún no se sabe, cuenta como un mes de largo
    expect(cycleMonth({ start: '2026-10-28', end: '2026-12-31', isOpen: true })).toBe('2026-11')
  })
  it('días que quedan', () => {
    const cycles = [
      { start: '2026-09-27', end: '2026-10-26', isOpen: false },
      { start: '2026-10-27', end: '2027-01-01', isOpen: true },
    ]
    // Ciclo de 30 días desde el 27 oct: acaba el 25 nov
    expect(cycleDaysLeft(cycles, new Date(2026, 10, 18))).toBe(8)
    expect(cycleDaysLeft([], new Date(2026, 10, 18))).toBe(0)
    expect(cycleDaysLeft([{ start: '2026-11-01', end: '2026-11-30', isOpen: false }], new Date(2026, 10, 30))).toBe(1)
  })
  it('fin estimado del ciclo', () => {
    const cycles = [
      { start: '2026-09-27', end: '2026-10-26', isOpen: false },
      { start: '2026-10-27', end: '2027-01-01', isOpen: true },
    ]
    expect(cycleEstimatedEnd(cycles)).toBe('2026-11-25')
    expect(cycleEstimatedEnd(cycles, 0)).toBe('2026-10-26')
    expect(cycleEstimatedEnd([{ start: '2026-11-01', end: '2026-12-31', isOpen: true }])).toBe('2026-11-30')
    expect(cycleEstimatedEnd([])).toBe('')
  })
})
