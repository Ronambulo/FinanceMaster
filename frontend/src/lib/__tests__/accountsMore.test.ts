import { describe, expect, it } from 'vitest'
import { accountSub, assetKind, assetMix, balanceSeries, positionsReturn, sharesLabel } from '../accounts'
import type { PortfolioPosition } from '../api'

const pos = (p: Partial<PortfolioPosition>) => ({ shares: 1, avg_buy_price: 100, total_invested: 100, market_value: 100, asset_class: 'STOCK', ...p }) as PortfolioPosition

describe('cuentas', () => {
  it('subtítulos', () => {
    expect(accountSub('n26')).toBe('Cuenta corriente')
    expect(accountSub('trade_republic')).toBe('Efectivo en broker')
  })
  it('tipo de activo', () => {
    expect(assetKind('FUND')).toBe('fund')
    expect(assetKind('ETF')).toBe('etf')
    expect(assetKind('CRYPTO')).toBe('crypto')
    expect(assetKind('STOCK')).toBe('stock')
    expect(assetKind(null)).toBe('other')
  })
  it('reparto suma 100 e incluye efectivo', () => {
    const m = assetMix([pos({ market_value: 58, asset_class: 'ETF' }), pos({ market_value: 22 }), pos({ market_value: 8, asset_class: 'CRYPTO' }), pos({ shares: 0, market_value: 999 })], 12)
    expect(m.map(s => s.kind)).toEqual(['etf', 'stock', 'cash', 'crypto'])
    expect(m.reduce((a, s) => a + s.pct, 0)).toBe(100)
    expect(assetMix([], 0)).toEqual([])
  })
  it('rentabilidad', () => {
    expect(positionsReturn([pos({ shares: 2, avg_buy_price: 50, market_value: 110 })])).toBeCloseTo(10)
    expect(positionsReturn([])).toBeNull()
  })
  it('serie de saldo hacia atrás', () => {
    expect(balanceSeries(100, [{ date: '2026-11-02', amount: -10 }, { date: '2026-11-01', amount: 50 }])).toEqual([60, 110, 100])
  })
  it('cantidades', () => {
    expect(sharesLabel(62, 'etf')).toBe('62 part.')
    expect(sharesLabel(0.021, 'crypto')).toBe('0,021')
  })
})
