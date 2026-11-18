import { describe, expect, it } from 'vitest'
import { formatAmount, formatEuro, formatPct } from '../format'

describe('formatAmount', () => {
  it('agrupa miles también con cuatro cifras', () => {
    expect(formatAmount(2904.12)).toBe('2.904,12')
    expect(formatAmount(24318.4)).toBe('24.318,40')
    expect(formatAmount(1234567.891)).toBe('1.234.567,89')
  })
  it('signos', () => {
    expect(formatAmount(-40)).toBe('−40,00')
    expect(formatAmount(40, { sign: true })).toBe('+40,00')
    expect(formatAmount(-0.001)).toBe('0,00')
    expect(formatAmount(0, { sign: true })).toBe('0,00')
  })
  it('sin decimales', () => {
    expect(formatAmount(1999.6, { decimals: 0 })).toBe('2.000')
  })
})

describe('formatEuro / formatPct', () => {
  it('añade el símbolo con espacio', () => {
    expect(formatEuro(907.32)).toBe('907,32 €')
    expect(formatPct(14.6)).toBe('15 %')
  })
})
