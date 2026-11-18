// Preferencias de interfaz (modo, tema y módulos). Se guardan en el servidor
// por usuario; aquí solo hay lógica pura para poder probarla sin red.
import { normalizeTheme, type ThemeMode } from './theme'

export type UiMode = 'normal' | 'ultra'

export const CURRENCIES = {
  EUR: { label: 'Euro', symbol: '€' },
  USD: { label: 'Dólar', symbol: '$' },
  GBP: { label: 'Libra', symbol: '£' },
  CHF: { label: 'Franco suizo', symbol: 'CHF' },
  MXN: { label: 'Peso mexicano', symbol: 'MX$' },
} as const
export type Currency = keyof typeof CURRENCIES
/** Primer día del periodo: 0 = cuando entra la nómina; 1..28 = ese día del mes. */
export const MONTH_START_MAX = 28

export const MODULES = {
  accounts:     { label: 'Cuentas',      desc: 'Bancos y brokers conectados',       default: true  },
  investments:  { label: 'Inversión',    desc: 'Cartera y posiciones abiertas',     default: true  },
  budgets:      { label: 'Presupuestos', desc: 'Límites de gasto por categoría',    default: true  },
  monthly:      { label: 'Mes a mes',    desc: 'Resumen y comparativa de cada mes', default: true  },
  recurring:    { label: 'Recurrentes',  desc: 'Suscripciones y pagos fijos',       default: true  },
  goals:        { label: 'Objetivos',    desc: 'Metas de ahorro e inversión',       default: true  },
  debts:        { label: 'Deudas',       desc: 'Préstamos y créditos',              default: true  },
  achievements: { label: 'Logros',       desc: 'Retos y gamificación',              default: false },
  ai:           { label: 'Asistente IA', desc: 'Preguntas sobre tus finanzas',      default: false },
  shared:       { label: 'Gastos compartidos', desc: 'Lo que te deben de gastos a medias', default: false },
} as const

export type ModuleId = keyof typeof MODULES
export const MODULE_IDS = Object.keys(MODULES) as ModuleId[]

/** Módulos que se pueden añadir al modo ultra simple (apagados de serie). */
export const ULTRA_MODULES = ['investments', 'budgets', 'recurring', 'goals', 'debts', 'monthly'] as const
export type UltraModuleId = typeof ULTRA_MODULES[number]
export type UltraModules = Record<UltraModuleId, boolean>
export const isUltraModule = (id: string): id is UltraModuleId => (ULTRA_MODULES as readonly string[]).includes(id)
const noUltraModules = (): UltraModules => Object.fromEntries(ULTRA_MODULES.map(id => [id, false])) as UltraModules

/** Avisos push que el usuario puede apagar uno a uno. */
export const NOTIFY_KINDS = {
  recurring: 'Cargo recurrente mañana',
  budget:    'Presupuesto al 80 %',
  payroll:   'Nómina recibida',
} as const
export type NotifyKind = keyof typeof NOTIFY_KINDS
export type NotifyPrefs = Record<NotifyKind, boolean>
const allNotify = (): NotifyPrefs => ({ recurring: true, budget: true, payroll: true })

/** Iconos de categoría: el emoji de cada categoría o el dibujo de la app. */
export type CatIcons = 'emoji' | 'dibujo'

/** Tarjetas de Inicio que se pueden ordenar u ocultar (en el orden de serie). */
export const HOME_CARDS = {
  hero:        'Lo que te queda',
  worth:       'Patrimonio',
  month:       'Este mes',
  pending:     'Cargos pendientes',
  next:        'Próximo cargo',
  goal:        'Objetivo principal',
  insights:    'Avisos',
  recent:      'Últimos movimientos',
} as const
/** Versión de la lista: las anteriores a la 2 no tenían 'hero' ni 'recent' (siempre visibles). */
export const HOME_V = 2
export type HomeCard = keyof typeof HOME_CARDS
export const HOME_CARD_IDS = Object.keys(HOME_CARDS) as HomeCard[]

/** Visibles en orden, sin repetidas ni desconocidas. */
export function sanitizeCards(v: unknown, version: unknown): HomeCard[] {
  if (!Array.isArray(v)) return [...HOME_CARD_IDS]
  const out: HomeCard[] = []
  for (const c of v) if (typeof c === 'string' && c in HOME_CARDS && !out.includes(c as HomeCard)) out.push(c as HomeCard)
  if (version !== HOME_V) return ['hero', ...out.filter(c => c !== 'hero' && c !== 'recent'), 'recent']
  return out
}

export interface Preferences {
  ui_mode: UiMode
  theme: ThemeMode
  modules: Record<ModuleId, boolean>
  currency: Currency
  month_start: number
  ultra_modules: UltraModules
  cat_icons: CatIcons
  home_cards: HomeCard[]
  home_v: number
  notify: NotifyPrefs
  initialized: boolean
}

export type PreferencesPatch = Partial<{
  ui_mode: UiMode
  theme: ThemeMode
  modules: Partial<Record<ModuleId, boolean>>
  currency: Currency
  month_start: number
  ultra_modules: Partial<UltraModules>
  cat_icons: CatIcons
  home_cards: HomeCard[]
  notify: Partial<NotifyPrefs>
}>

export function defaultModules(): Record<ModuleId, boolean> {
  return Object.fromEntries(MODULE_IDS.map(id => [id, MODULES[id].default])) as Record<ModuleId, boolean>
}

export const DEFAULT_PREFERENCES: Preferences = {
  ui_mode: 'normal',
  theme: 'system',
  modules: defaultModules(),
  currency: 'EUR',
  month_start: 0,
  ultra_modules: noUltraModules(),
  cat_icons: 'emoji',
  home_cards: [...HOME_CARD_IDS],
  home_v: HOME_V,
  notify: allNotify(),
  initialized: false,
}

const validDay = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MONTH_START_MAX

/** Normaliza lo que venga (servidor, caché local corrupta…) a unas preferencias válidas. */
export function sanitize(raw: unknown): Preferences {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const mods = defaultModules()
  if (r.modules && typeof r.modules === 'object') {
    for (const [k, v] of Object.entries(r.modules as Record<string, unknown>)) {
      if (k in MODULES && typeof v === 'boolean') mods[k as ModuleId] = v
    }
  }
  const ultra = noUltraModules()
  if (r.ultra_modules && typeof r.ultra_modules === 'object') {
    for (const [k, v] of Object.entries(r.ultra_modules as Record<string, unknown>)) {
      if (isUltraModule(k) && typeof v === 'boolean') ultra[k] = v
    }
  }
  const notify = allNotify()
  if (r.notify && typeof r.notify === 'object') {
    for (const [k, v] of Object.entries(r.notify as Record<string, unknown>)) {
      if (k in NOTIFY_KINDS && typeof v === 'boolean') notify[k as NotifyKind] = v
    }
  }
  return {
    ui_mode: r.ui_mode === 'ultra' ? 'ultra' : 'normal',
    theme: r.theme === 'light' || r.theme === 'dark' || r.theme === 'system' ? r.theme : 'system',
    modules: mods,
    currency: typeof r.currency === 'string' && r.currency in CURRENCIES ? r.currency as Currency : 'EUR',
    month_start: validDay(r.month_start) ? r.month_start : 0,
    ultra_modules: ultra,
    cat_icons: r.cat_icons === 'dibujo' ? 'dibujo' : 'emoji',
    home_cards: sanitizeCards(r.home_cards, r.home_v),
    home_v: HOME_V,
    notify,
    initialized: r.initialized === true,
  }
}

export function applyPatch(p: Preferences, patch: PreferencesPatch): Preferences {
  return {
    ...p,
    ...(patch.ui_mode ? { ui_mode: patch.ui_mode } : {}),
    ...(patch.theme ? { theme: patch.theme } : {}),
    ...(patch.currency ? { currency: patch.currency } : {}),
    ...(validDay(patch.month_start) ? { month_start: patch.month_start } : {}),
    ...(patch.cat_icons ? { cat_icons: patch.cat_icons } : {}),
    ...(patch.home_cards ? { home_cards: sanitizeCards(patch.home_cards, HOME_V) } : {}),
    modules: { ...p.modules, ...(patch.modules || {}) },
    ultra_modules: { ...p.ultra_modules, ...(patch.ultra_modules || {}) },
    notify: { ...p.notify, ...(patch.notify || {}) },
  }
}

// Claves que usaba la versión anterior en el navegador.
export const LEGACY_FEATURE_KEYS: Partial<Record<ModuleId, string>> = {
  achievements: 'fm-feat-achievements',
  debts:        'fm-feat-debts',
  goals:        'fm-feat-goals',
  recurring:    'fm-feat-recurring',
}

type KeyReader = { getItem: (key: string) => string | null }

/** Lo que el usuario tenía configurado en este navegador antes del rediseño,
 *  para subirlo la primera vez que el servidor no tiene nada guardado. */
export function legacyMigration(storage: KeyReader): PreferencesPatch {
  const modules: Partial<Record<ModuleId, boolean>> = {}
  for (const [id, key] of Object.entries(LEGACY_FEATURE_KEYS) as [ModuleId, string][]) {
    const v = storage.getItem(key)
    if (v === 'true' || v === 'false') modules[id] = v === 'true'
  }
  const patch: PreferencesPatch = { modules }
  const theme = storage.getItem('fm_theme')
  if (theme) patch.theme = normalizeTheme(theme)
  return patch
}

/** En modo ultra simple solo quedan Inicio, Movimientos y Ajustes, más los
 *  módulos que el usuario haya añadido expresamente a ese modo. */
export function isModuleOn(p: Preferences, id: ModuleId): boolean {
  if (p.ui_mode === 'ultra') return isUltraModule(id) && !!p.ultra_modules?.[id]
  return !!p.modules[id]
}
