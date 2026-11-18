import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PREFERENCES, HOME_CARD_IDS, applyPatch, isModuleOn, legacyMigration, sanitize,
} from '../preferences'

const store = (o: Record<string, string>) => ({ getItem: (k: string) => o[k] ?? null })

describe('sanitize', () => {
  it('da valores por defecto ante basura', () => {
    expect(sanitize(null)).toEqual(DEFAULT_PREFERENCES)
    expect(sanitize('x').ui_mode).toBe('normal')
  })
  it('ignora módulos desconocidos y valores no booleanos', () => {
    const p = sanitize({ ui_mode: 'ultra', theme: 'dark', modules: { ai: true, nope: true, debts: 'si' }, initialized: true })
    expect(p.ui_mode).toBe('ultra')
    expect(p.theme).toBe('dark')
    expect(p.modules.ai).toBe(true)
    expect(p.modules.debts).toBe(true)
    expect('nope' in p.modules).toBe(false)
    expect(p.initialized).toBe(true)
  })
  it('IA y logros apagados de serie', () => {
    expect(DEFAULT_PREFERENCES.modules.ai).toBe(false)
    expect(DEFAULT_PREFERENCES.modules.achievements).toBe(false)
  })
})

describe('applyPatch', () => {
  it('mezcla módulos sin perder el resto', () => {
    const p = applyPatch(DEFAULT_PREFERENCES, { modules: { debts: false } })
    expect(p.modules.debts).toBe(false)
    expect(p.modules.goals).toBe(true)
    expect(p.ui_mode).toBe('normal')
  })
})

describe('legacyMigration', () => {
  it('recoge los fm-feat-* y el tema antiguo', () => {
    const patch = legacyMigration(store({
      'fm-feat-debts': 'false', 'fm-feat-achievements': 'true', fm_theme: 'dark-blue',
    }))
    expect(patch.modules).toEqual({ debts: false, achievements: true })
    expect(patch.theme).toBe('dark')
  })
  it('el tema claro antiguo sigue siendo claro', () => {
    expect(legacyMigration(store({ fm_theme: 'light' })).theme).toBe('light')
  })
  it('sin nada guardado no cambia nada', () => {
    expect(legacyMigration(store({}))).toEqual({ modules: {} })
  })
})

describe('isModuleOn', () => {
  it('en ultra simple todos los módulos se ocultan', () => {
    const p = { ...DEFAULT_PREFERENCES, ui_mode: 'ultra' as const }
    expect(isModuleOn(p, 'budgets')).toBe(false)
    expect(isModuleOn(DEFAULT_PREFERENCES, 'budgets')).toBe(true)
    expect(isModuleOn(DEFAULT_PREFERENCES, 'ai')).toBe(false)
  })
})

describe('ultra_modules y cat_icons', () => {
  it('por defecto: nada extra en ultra y emojis', () => {
    expect(DEFAULT_PREFERENCES.ultra_modules.debts).toBe(false)
    expect(DEFAULT_PREFERENCES.cat_icons).toBe('emoji')
  })
  it('sanitize descarta claves y valores raros', () => {
    const p = sanitize({ ultra_modules: { debts: true, ai: true, goals: 'si' }, cat_icons: 'png' })
    expect(p.ultra_modules.debts).toBe(true)
    expect(p.ultra_modules.goals).toBe(false)
    expect('ai' in p.ultra_modules).toBe(false)
    expect(p.cat_icons).toBe('emoji')
  })
  it('en ultra solo se ve lo añadido a ese modo', () => {
    const p = applyPatch(DEFAULT_PREFERENCES, { ui_mode: 'ultra', ultra_modules: { debts: true } })
    expect(isModuleOn(p, 'debts')).toBe(true)
    expect(isModuleOn(p, 'goals')).toBe(false)
    expect(isModuleOn(applyPatch(p, { modules: { ai: true } }), 'ai')).toBe(false)
  })
})

describe('home_cards', () => {
  it('por defecto todas en orden y limpia valores raros', () => {
    expect(sanitize({}).home_cards).toEqual(HOME_CARD_IDS)
    expect(sanitize({ home_cards: ['goal', 'x', 'goal', 'worth'] }).home_cards).toEqual(['goal', 'worth'])
    expect(sanitize({ home_cards: [] }).home_cards).toEqual([])
  })
  it('applyPatch cambia el orden', () => {
    expect(applyPatch(DEFAULT_PREFERENCES, { home_cards: ['insights', 'month'] }).home_cards).toEqual(['insights', 'month'])
  })
})
