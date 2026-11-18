// Modelo de navegación del rediseño. Puro (sin React) para poder testearlo:
// a partir de las preferencias decide qué pestañas y qué entradas de "Más"
// existen. Un módulo apagado no deja rastro en la navegación.
import { isModuleOn, type ModuleId, type Preferences } from './preferences'

export type NavIcon =
  | 'home' | 'list' | 'wallet' | 'plan' | 'settings' | 'more'
  | 'chart-up' | 'repeat' | 'target' | 'debt' | 'calendar' | 'trophy'
  | 'tags' | 'import' | 'shield' | 'sparkle'

export interface NavItem {
  id: string
  label: string
  to: string
  icon: NavIcon
}

export const PLAN_MODULES: ModuleId[] = ['budgets', 'monthly', 'recurring', 'goals', 'debts']
export const ACCOUNT_MODULES: ModuleId[] = ['accounts', 'investments']

const INICIO: NavItem = { id: 'home', label: 'Inicio', to: '/', icon: 'home' }
const MOVIMIENTOS: NavItem = { id: 'movements', label: 'Movimientos', to: '/transacciones', icon: 'list' }
const CUENTAS: NavItem = { id: 'accounts', label: 'Cuentas', to: '/cuentas', icon: 'wallet' }
const PLAN: NavItem = { id: 'plan', label: 'Plan', to: '/plan', icon: 'plan' }
const AJUSTES: NavItem = { id: 'settings', label: 'Ajustes', to: '/ajustes', icon: 'settings' }

const MORE: { item: NavItem; module?: ModuleId }[] = [
  { item: { id: 'investments', label: 'Inversiones', to: '/portfolio', icon: 'chart-up' }, module: 'investments' },
  { item: { id: 'recurring', label: 'Recurrentes', to: '/recurrentes', icon: 'repeat' }, module: 'recurring' },
  { item: { id: 'goals', label: 'Objetivos', to: '/objetivos', icon: 'target' }, module: 'goals' },
  { item: { id: 'debts', label: 'Deudas', to: '/deudas', icon: 'debt' }, module: 'debts' },
  { item: { id: 'monthly', label: 'Mes a mes', to: '/monthly', icon: 'calendar' }, module: 'monthly' },
  { item: { id: 'achievements', label: 'Logros', to: '/logros', icon: 'trophy' }, module: 'achievements' },
  { item: { id: 'ai', label: 'Asistente', to: '/chat', icon: 'sparkle' }, module: 'ai' },
  { item: { id: 'categories', label: 'Categorías', to: '/ajustes/categorias', icon: 'tags' } },
  { item: { id: 'import', label: 'Importar', to: '/importar', icon: 'import' } },
  { item: AJUSTES },
]

// En ultra simple, si solo hay un módulo de planificación se enlaza directo.
const PLAN_DIRECT: Record<string, NavItem> = {
  budgets: { id: 'budgets', label: 'Presupuestos', to: '/presupuestos', icon: 'plan' },
  recurring: { id: 'recurring', label: 'Recurrentes', to: '/recurrentes', icon: 'repeat' },
  goals: { id: 'goals', label: 'Objetivos', to: '/objetivos', icon: 'target' },
  debts: { id: 'debts', label: 'Deudas', to: '/deudas', icon: 'debt' },
  monthly: { id: 'monthly', label: 'Mes a mes', to: '/monthly', icon: 'calendar' },
}
const INVERSIONES: NavItem = { id: 'investments', label: 'Inversiones', to: '/portfolio', icon: 'chart-up' }

const ADMIN: NavItem = { id: 'admin', label: 'Admin', to: '/admin', icon: 'shield' }

export function hasAccounts(p: Preferences): boolean {
  return ACCOUNT_MODULES.some(m => isModuleOn(p, m))
}

export function hasPlan(p: Preferences): boolean {
  return PLAN_MODULES.some(m => isModuleOn(p, m))
}

/** Pestañas fijas de la barra inferior (sin contar "Más"). */
export function primaryNav(p: Preferences): NavItem[] {
  if (p.ui_mode === 'ultra') {
    const items = [INICIO, MOVIMIENTOS]
    const plan = PLAN_MODULES.filter(m => isModuleOn(p, m))
    if (plan.length === 1) items.push(PLAN_DIRECT[plan[0]])
    else if (plan.length > 1) items.push(PLAN)
    if (isModuleOn(p, 'investments')) items.push(INVERSIONES)
    return [...items, AJUSTES]
  }
  const items = [INICIO, MOVIMIENTOS]
  if (hasAccounts(p)) items.push(CUENTAS)
  if (hasPlan(p)) items.push(PLAN)
  return items
}

/** Entradas del panel "Más". Vacío en modo ultra simple. */
export function moreNav(p: Preferences, opts: { isAdmin?: boolean } = {}): NavItem[] {
  if (p.ui_mode === 'ultra') return opts.isAdmin ? [ADMIN] : []
  const items = MORE.filter(e => !e.module || isModuleOn(p, e.module)).map(e => e.item)
  if (opts.isAdmin) items.push(ADMIN)
  return items
}

/** Todas las entradas, en orden, sin duplicados (barra lateral de PC y Ctrl K). */
export function allNav(p: Preferences, opts: { isAdmin?: boolean } = {}): NavItem[] {
  const seen = new Set<string>()
  return [...primaryNav(p), ...moreNav(p, opts)].filter(i => {
    if (seen.has(i.id)) return false
    seen.add(i.id)
    return true
  })
}

/** ¿Está activa esta entrada para la ruta actual? */
export function isActive(item: NavItem, pathname: string, search = ''): boolean {
  const [path, query] = item.to.split('?')
  if (query) return pathname === path && new URLSearchParams(search).toString().includes(query)
  if (path === '/') return pathname === '/'
  return pathname === path || pathname.startsWith(path + '/')
}
