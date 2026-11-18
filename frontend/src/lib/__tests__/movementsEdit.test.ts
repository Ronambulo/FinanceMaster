import { describe, expect, it } from 'vitest'
import { amountText, equalParts, isManualTx, typeKey } from '../movements'

describe('isManualTx', () => {
  it('detecta manuales y importados', () => {
    expect(isManualTx({ source: 'manual', external_id: null } as never)).toBe(true)
    expect(isManualTx({ source: null, external_id: null } as never)).toBe(true)
    expect(isManualTx({ source: 'n26', external_id: 'x' } as never)).toBe(false)
  })
})

describe('amountText', () => {
  it('formatea sin signo con coma', () => {
    expect(amountText(-42.15)).toBe('42,15')
    expect(amountText(3)).toBe('3,00')
  })
})

describe('equalParts', () => {
  it('reparte en céntimos y suma el total', () => {
    expect(equalParts(10, 3)).toEqual([3.34, 3.33, 3.33])
    expect(equalParts(-42.15, 2)).toEqual([21.08, 21.07])
    expect(equalParts(5, 0)).toEqual([])
  })
})

describe('typeKey', () => {
  it('escribe dígitos y quita el cero inicial', () => {
    expect(typeKey('', '5')).toBe('5')
    expect(typeKey('0', '7')).toBe('7')
    expect(typeKey('12', '3')).toBe('123')
  })
  it('una sola coma y máximo dos decimales', () => {
    expect(typeKey('', ',')).toBe('0,')
    expect(typeKey('3,', '.')).toBe('3,')
    expect(typeKey('3,5', '0')).toBe('3,50')
    expect(typeKey('3,50', '1')).toBe('3,50')
  })
  it('borra y limita la parte entera', () => {
    expect(typeKey('3,5', '⌫')).toBe('3,')
    expect(typeKey('', '⌫')).toBe('')
    expect(typeKey('1234567', '8')).toBe('1234567')
    expect(typeKey('12', 'x')).toBe('12')
  })
})
