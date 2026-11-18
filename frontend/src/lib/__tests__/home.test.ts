import { describe, expect, it } from 'vitest'
import { categoryBars, dateHeading, periodTotals, sparkPath, weekdayDay, worthChangePct } from '../home'
import type { CategoryBreakdown, MonthlyDetailRow, NetWorthPoint } from '../api'

const row = (amount: number, exclude = false) => ({ amount, exclude_from_stats: exclude }) as MonthlyDetailRow

describe('inicio', () => {
  it('cabecera con día y mes', () => {
    expect(dateHeading(new Date(2026, 10, 17))).toEqual({ day: 'Martes 17', month: 'Noviembre' })
    expect(weekdayDay('2026-11-19')).toBe('Jueves 19')
  })
  it('entró, salió y te quedan', () => {
    const t = periodTotals([row(1875), row(-620), row(-347.68), row(-500, true)])
    expect(t).toEqual({ income: 1875, expenses: 967.68, left: 907.32, spentRatio: 967.68 / 1875 })
  })
  it('sin ingresos el gasto llena la barra', () => {
    expect(periodTotals([row(-10)]).spentRatio).toBe(1)
    expect(periodTotals([]).spentRatio).toBe(0)
  })
  it('categorías: top N relativo a la mayor', () => {
    const c = (name: string, total: number) => ({ category_name: name, category_icon: '', category_color: '#fff', total }) as CategoryBreakdown
    const bars = categoryBars([c('Ocio', 50), c('Vivienda', 200), c('Comida', 100), c('Nada', 0)], 2)
    expect(bars.map(b => [b.name, b.ratio])).toEqual([['Vivienda', 1], ['Comida', 0.5]])
  })
  it('variación del patrimonio', () => {
    const p = (n: number) => ({ net_worth: n }) as NetWorthPoint
    expect(worthChangePct([p(1000), p(1100), p(1076)])).toBe(7.6)
    expect(worthChangePct([p(1000)])).toBeNull()
    expect(worthChangePct([p(0), p(10)])).toBeNull()
  })
  it('línea del mini gráfico', () => {
    const s = sparkPath([0, 10], 20, 10, 0)
    expect(s.line).toBe('M0.0 10.0 L20.0 0.0')
    expect(s.end).toEqual([20, 0])
    expect(sparkPath([], 10, 10).line).toBe('')
  })
})
