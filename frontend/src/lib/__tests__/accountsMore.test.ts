import { describe, expect, it } from 'vitest'
import { accountSub, assetKind, assetMix, balanceSeries, positionKind, positionsReturn, sharesLabel } from '../accounts'
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
  it('deduce el tipo cuando el bróker no lo manda', () => {
    expect(assetKind('STOCK', 'Physical Gold USD (Acc)', 'EGLN.L')).toBe('etc')
    expect(assetKind(null, 'Core MSCI World USD (Acc)', 'IWDA.AS')).toBe('etf')
    expect(assetKind('STOCK', 'Core S&P 500 USD (Acc)', 'SXR8.DE')).toBe('etf')
    expect(assetKind('STOCK', 'Long 3.768,288 $', 'FMDFLX')).toBe('derivative')
    expect(assetKind('STOCK', 'Bitcoin', 'BTC-EUR')).toBe('crypto')
    expect(assetKind('STOCK', 'Take-Two Interactive', 'TTWO')).toBe('stock')
    expect(assetKind('STOCK', 'Barrick Gold', 'GOLD')).toBe('stock')
    expect(assetKind('FUND', 'MyInvestor Nasdaq 100 FI', 'ES0165265002')).toBe('fund')
  })
  it('manda el tipo del servidor, también el elegido a mano', () => {
    expect(positionKind(pos({ name: 'Physical Gold USD (Acc)', symbol: 'EGLN.L', asset_class: 'ETC', asset_class_auto: 'ETC' }))).toBe('etc')
    // Elegido a mano como acción: no se vuelve a adivinar por el nombre
    expect(positionKind(pos({ name: 'Core MSCI World USD (Acc)', symbol: 'IWDA.AS', asset_class: 'STOCK', asset_class_auto: 'ETF', asset_class_manual: true }))).toBe('stock')
    expect(positionKind(pos({ name: 'Algo', asset_class: 'OTHER', asset_class_auto: 'STOCK', asset_class_manual: true }))).toBe('other')
    // Servidor antiguo sin clasificar: se adivina
    expect(positionKind(pos({ name: 'Long 3.768,288 $', symbol: 'FMDFLX' }))).toBe('derivative')
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
