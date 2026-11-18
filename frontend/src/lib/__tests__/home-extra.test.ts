import { describe, expect, it } from 'vitest'
import { spendingPace, spendingProfile } from '../home'
import type { CategoryBreakdown } from '../api'

const cat = (category_name: string, total: number) => ({ category_name, total, category_id: 1, category_color: '', category_icon: '', count: 1, percentage: 0 }) as unknown as CategoryBreakdown

describe('spendingPace', () => {
  it('proyecta el gasto al final del periodo', () => {
    const p = spendingPace(300, '2026-11-01', '2026-11-30', new Date(2026, 10, 10))!
    expect(p.elapsed).toBe(10)
    expect(p.days).toBe(30)
    expect(p.perDay).toBe(30)
    expect(p.projected).toBe(900)
  })
  it('no pasa del final ni baja de un día', () => {
    expect(spendingPace(100, '2026-11-01', '2026-11-30', new Date(2026, 11, 20))!.elapsed).toBe(30)
    expect(spendingPace(100, '2026-11-01', '2026-11-30', new Date(2026, 9, 20))!.elapsed).toBe(1)
    expect(spendingPace(100, '', '', new Date())).toBeNull()
  })
})

describe('spendingProfile', () => {
  it('detecta gastar más de lo que entra', () => {
    expect(spendingProfile([], 1000, 1200)!.id).toBe('spender')
  })
  it('detecta ahorro alto', () => {
    expect(spendingProfile([], 2000, 1000)!.id).toBe('saver')
  })
  it('detecta comer fuera', () => {
    expect(spendingProfile([cat('Restaurantes', 400), cat('Vivienda', 600)], 1200, 1000)!.id).toBe('foodie')
  })
  it('equilibrado por defecto y nulo sin datos', () => {
    expect(spendingProfile([cat('Vivienda', 500), cat('Salud', 500)], 1200, 1000)!.id).toBe('balanced')
    expect(spendingProfile([], 0, 0)).toBeNull()
  })
})
