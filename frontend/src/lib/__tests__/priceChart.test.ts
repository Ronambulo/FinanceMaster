import { describe, expect, it } from 'vitest'
import { heldPeriods, heldRuns, isHeld, tradeMarks } from '../priceChart'

const ev = (date: string, shares: number) => ({ date, shares, price_eur: 1, total_eur: shares })

describe('gráfico de precio', () => {
  it('periodos con el activo', () => {
    const p = heldPeriods([ev('2024-01-10', 2), ev('2024-06-01', 1)], [ev('2024-03-01', 2), ev('2024-09-01', 1)], 0)
    expect(p).toEqual([{ from: '2024-01-10', to: '2024-03-01' }, { from: '2024-06-01', to: '2024-09-01' }])
    expect(isHeld('2024-04-01', p)).toBe(false)
    expect(isHeld('2024-02-01', p)).toBe(true)
  })
  it('posición abierta y casos sin datos', () => {
    expect(heldPeriods([ev('2024-01-10T09:00:00', 2)], [], 2)).toEqual([{ from: '2024-01-10', to: null }])
    expect(heldPeriods([], [], 3)).toBeNull()
    // Faltan compras antiguas: se tenía desde antes de la primera venta
    expect(heldPeriods([], [ev('2024-02-10', 3)], 0)).toEqual([{ from: '0000-01-01', to: '2024-02-10' }])
    expect(heldPeriods([ev('2024-01-10', 1)], [ev('2024-02-10', 1)], 5)).toEqual([{ from: '0000-01-01', to: null }])
    expect(isHeld('2020-01-01', null)).toBe(true)
  })
  it('tramos comparten el punto de unión', () => {
    const dates = ['2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01', '2024-05-01']
    const runs = heldRuns(dates, [{ from: '2024-02-01', to: '2024-03-01' }])
    expect(runs).toEqual([
      { held: false, from: 0, to: 1 },
      { held: true, from: 1, to: 2 },
      { held: false, from: 2, to: 4 },
    ])
  })
  it('marcas de compra y venta', () => {
    const dates = ['2024-01-01', '2024-01-08', '2024-01-15']
    const m = tradeMarks(dates, [ev('2024-01-03', 2), ev('2024-01-08', 1), ev('2023-12-01', 9)], [ev('2024-01-05', 1)])
    expect(m).toEqual([{ index: 1, buy: 3, sell: 1 }])
  })
})
