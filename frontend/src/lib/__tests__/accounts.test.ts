import { describe, expect, it } from 'vitest'
import { brokerKey, holdingsByBroker, visibleAccounts, worthSplit } from '../accounts'
import type { PortfolioPosition } from '../api'

const pos = (o: Partial<PortfolioPosition>) => ({ shares: 1, market_value: 100, total_invested: 90, broker: 'trade_republic', ...o }) as PortfolioPosition

describe('worthSplit', () => {
  it('reparte en porcentajes que suman 100', () => {
    expect(worthSplit(3568.4, 20750)).toEqual({ total: 24318.4, cashPct: 15, investedPct: 85 })
  })
  it('sin patrimonio no divide por cero', () => {
    expect(worthSplit(0, 0)).toEqual({ total: 0, cashPct: 0, investedPct: 0 })
  })
  it('efectivo negativo no rompe la barra', () => {
    const s = worthSplit(-200, 1000)
    expect(s.total).toBe(800)
    expect(s.cashPct).toBe(0)
    expect(s.investedPct).toBe(100)
  })
})

describe('holdingsByBroker', () => {
  it('suma por bróker e ignora posiciones cerradas', () => {
    const r = holdingsByBroker([
      pos({ market_value: 100 }),
      pos({ market_value: 50.555 }),
      pos({ broker: 'myinvestor', market_value: 500 }),
      pos({ shares: 0, market_value: 999 }),
    ])
    expect(r).toEqual([
      { broker: 'myinvestor', value: 500, positions: 1 },
      { broker: 'trade_republic', value: 150.56, positions: 2 },
    ])
  })
  it('usa lo invertido si no hay precio', () => {
    expect(holdingsByBroker([pos({ market_value: null })])[0].value).toBe(90)
  })
  it('manuales y desconocidos', () => {
    expect(brokerKey({ broker: null, is_manual: true })).toBe('manual')
    expect(brokerKey({ broker: null })).toBe('other')
  })
})

describe('visibleAccounts', () => {
  it('oculta cuentas a cero', () => {
    const r = visibleAccounts([
      { source: 'bbva', label: 'BBVA', balance: 10, count: 2, last_date: null },
      { source: 'n26', label: 'N26', balance: 0, count: 4, last_date: null },
    ])
    expect(r.map(a => a.source)).toEqual(['bbva'])
  })
})
