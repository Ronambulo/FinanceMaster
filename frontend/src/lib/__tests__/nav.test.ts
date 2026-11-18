import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, applyPatch, type Preferences } from '../preferences'
import { allNav, isActive, moreNav, primaryNav } from '../nav'

const ids = (xs: { id: string }[]) => xs.map(x => x.id)
const allOff: Preferences = applyPatch(DEFAULT_PREFERENCES, {
  modules: { accounts: false, investments: false, budgets: false, monthly: false, recurring: false, goals: false, debts: false, achievements: false, ai: false },
})

describe('primaryNav', () => {
  it('modo normal por defecto: Inicio, Movimientos, Cuentas, Plan', () => {
    expect(ids(primaryNav(DEFAULT_PREFERENCES))).toEqual(['home', 'movements', 'accounts', 'plan'])
  })
  it('modo ultra: Inicio, Movimientos, Ajustes', () => {
    const p = applyPatch(DEFAULT_PREFERENCES, { ui_mode: 'ultra' })
    expect(ids(primaryNav(p))).toEqual(['home', 'movements', 'settings'])
  })
  it('modo ultra con Deudas añadida enlaza directo a Deudas', () => {
    const p = applyPatch(DEFAULT_PREFERENCES, { ui_mode: 'ultra', ultra_modules: { debts: true } })
    expect(ids(primaryNav(p))).toEqual(['home', 'movements', 'debts', 'settings'])
  })
  it('modo ultra con varios de planificación e inversiones', () => {
    const p = applyPatch(DEFAULT_PREFERENCES, { ui_mode: 'ultra', ultra_modules: { debts: true, goals: true, investments: true } })
    expect(ids(primaryNav(p))).toEqual(['home', 'movements', 'plan', 'investments', 'settings'])
  })
  it('los módulos de ultra no cambian el modo normal', () => {
    const p = applyPatch(allOff, { ultra_modules: { debts: true } })
    expect(ids(primaryNav(p))).toEqual(['home', 'movements'])
  })
  it('sin módulos no aparecen Cuentas ni Plan', () => {
    expect(ids(primaryNav(allOff))).toEqual(['home', 'movements'])
  })
  it('Cuentas aparece solo con inversiones', () => {
    const p = applyPatch(allOff, { modules: { investments: true } })
    expect(ids(primaryNav(p))).toContain('accounts')
  })
  it('Plan aparece con un solo módulo de planificación', () => {
    const p = applyPatch(allOff, { modules: { goals: true } })
    expect(ids(primaryNav(p))).toContain('plan')
  })
})

describe('moreNav', () => {
  it('filtra por módulos y deja lo básico', () => {
    expect(ids(moreNav(allOff))).toEqual(['categories', 'import', 'settings'])
  })
  it('inversiones usa el icono de gráfica', () => {
    expect(moreNav(DEFAULT_PREFERENCES).find(i => i.id === 'investments')?.icon).toBe('chart-up')
  })
  it('logros solo si está activo', () => {
    expect(ids(moreNav(DEFAULT_PREFERENCES))).not.toContain('achievements')
    const p = applyPatch(DEFAULT_PREFERENCES, { modules: { achievements: true } })
    expect(ids(moreNav(p))).toContain('achievements')
  })
  it('admin solo para administradores', () => {
    expect(ids(moreNav(DEFAULT_PREFERENCES))).not.toContain('admin')
    expect(ids(moreNav(DEFAULT_PREFERENCES, { isAdmin: true })).slice(-1)).toEqual(['admin'])
  })
  it('modo ultra no tiene Más salvo admin', () => {
    const p = applyPatch(DEFAULT_PREFERENCES, { ui_mode: 'ultra' })
    expect(moreNav(p)).toEqual([])
    expect(ids(moreNav(p, { isAdmin: true }))).toEqual(['admin'])
  })
})

describe('allNav', () => {
  it('no duplica Ajustes en modo ultra', () => {
    const p = applyPatch(DEFAULT_PREFERENCES, { ui_mode: 'ultra' })
    expect(ids(allNav(p, { isAdmin: true }))).toEqual(['home', 'movements', 'settings', 'admin'])
  })
})

describe('isActive', () => {
  const [home, mov] = primaryNav(DEFAULT_PREFERENCES)
  it('Inicio solo en la raíz', () => {
    expect(isActive(home, '/')).toBe(true)
    expect(isActive(home, '/transacciones')).toBe(false)
  })
  it('rutas hijas cuentan como activas', () => {
    expect(isActive(mov, '/transacciones')).toBe(true)
    expect(isActive(mov, '/transacciones/comercio/x')).toBe(true)
    expect(isActive(mov, '/transaccionesx')).toBe(false)
  })
  it('entradas con query exigen el parámetro', () => {
    const item = { id: 'x', label: 'X', to: '/ajustes?tab=categories', icon: 'tags' as const }
    expect(isActive(item, '/ajustes', '?tab=categories')).toBe(true)
    expect(isActive(item, '/ajustes', '')).toBe(false)
    const cats = moreNav(DEFAULT_PREFERENCES).find(i => i.id === 'categories')!
    expect(isActive(cats, '/ajustes/categorias')).toBe(true)
  })
})

describe('asistente', () => {
  it('appears in Más only when the ai module is on', () => {
    expect(ids(moreNav(allOff))).not.toContain('ai')
    const p = { ...allOff, modules: { ...allOff.modules, ai: true } }
    expect(moreNav(p).find(i => i.id === 'ai')?.to).toBe('/chat')
    expect(ids(moreNav({ ...p, ui_mode: 'ultra' }))).not.toContain('ai')
  })
})
