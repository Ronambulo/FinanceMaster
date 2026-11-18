// Cálculos puros de la pantalla Cuentas.
import type { AccountBalance, PortfolioPosition } from './api'

export interface WorthSplit { total: number; cashPct: number; investedPct: number }

/** Reparto efectivo/invertido. Los negativos cuentan como 0 en la barra. */
export function worthSplit(cash: number, invested: number): WorthSplit {
  const total = Math.round((cash + invested) * 100) / 100
  const c = Math.max(cash, 0)
  const i = Math.max(invested, 0)
  const base = c + i
  if (base === 0) return { total, cashPct: 0, investedPct: 0 }
  const cashPct = Math.round((c / base) * 100)
  return { total, cashPct, investedPct: 100 - cashPct }
}

export interface BrokerHolding { broker: string; value: number; positions: number }

/** Misma clave de agrupación que la lista de posiciones del portfolio. */
export function brokerKey(p: Pick<PortfolioPosition, 'broker' | 'is_manual'>): string {
  return p.broker || (p.is_manual ? 'manual' : 'other')
}

/** Valor de mercado por bróker (posiciones abiertas), de mayor a menor. */
export function holdingsByBroker(positions: PortfolioPosition[]): BrokerHolding[] {
  const map = new Map<string, BrokerHolding>()
  for (const p of positions) {
    if (!(p.shares > 0.0001)) continue
    const value = p.market_value ?? p.total_invested ?? 0
    const key = brokerKey(p)
    const h = map.get(key) ?? { broker: key, value: 0, positions: 0 }
    h.value += value
    h.positions += 1
    map.set(key, h)
  }
  return [...map.values()]
    .map(h => ({ ...h, value: Math.round(h.value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
}

/** Cuentas con saldo visible: se ocultan las vacías sin movimientos. */
export function visibleAccounts(accounts: AccountBalance[]): AccountBalance[] {
  return accounts.filter(a => a.count > 0 && Math.abs(a.balance) >= 0.005)
}

export const BROKERS = ['trade_republic', 'myinvestor']

/** Subtítulo de una cuenta de efectivo. */
export function accountSub(source: string): string {
  if (BROKERS.includes(source)) return 'Efectivo en broker'
  if (source === 'manual') return 'Efectivo'
  return 'Cuenta corriente'
}

/** Subtítulo de un bróker en la lista de invertido. */
export function brokerSub(broker: string): string {
  if (broker === 'myinvestor') return 'Fondos indexados'
  if (broker === 'trade_republic') return 'Acciones y ETF'
  if (broker === 'manual') return 'Posiciones manuales'
  return 'Inversiones'
}

export type AssetKind = 'fund' | 'etf' | 'stock' | 'cash' | 'crypto' | 'other'
export const ASSET_LABEL: Record<AssetKind, string> = { fund: 'Fondos indexados', etf: 'ETF', stock: 'Acciones', cash: 'Efectivo', crypto: 'Cripto', other: 'Otros' }
export const ASSET_COLOR: Record<AssetKind, string> = { fund: 'var(--c-8cc6ff)', etf: 'var(--c-8b85ff)', stock: 'var(--c-7fdbe3)', cash: 'var(--c-6fe0a5)', crypto: 'var(--c-ffc979)', other: 'var(--c-9a9fb0)' }

export function assetKind(assetClass: string | null | undefined): AssetKind {
  const a = (assetClass ?? '').toUpperCase()
  if (a.includes('CRYPTO')) return 'crypto'
  if (a.includes('ETF')) return 'etf'
  if (a.includes('FUND')) return 'fund'
  if (a.includes('STOCK') || a.includes('EQUITY') || a === 'SHARES') return 'stock'
  return 'other'
}

export interface AssetSlice { kind: AssetKind; value: number; pct: number }

/** Reparto por tipo de activo (más el efectivo), en % enteros que suman 100. */
export function assetMix(positions: PortfolioPosition[], cash = 0): AssetSlice[] {
  const sum = new Map<AssetKind, number>()
  for (const p of positions) {
    if (!(p.shares > 0.0001)) continue
    const k = assetKind(p.asset_class)
    sum.set(k, (sum.get(k) ?? 0) + Math.max(p.market_value ?? p.total_invested ?? 0, 0))
  }
  if (cash > 0) sum.set('cash', cash)
  const total = [...sum.values()].reduce((a, b) => a + b, 0)
  if (total <= 0) return []
  const slices = [...sum.entries()].map(([kind, value]) => ({ kind, value, pct: Math.round((value / total) * 100) })).sort((a, b) => b.value - a.value)
  const drift = 100 - slices.reduce((a, s) => a + s.pct, 0)
  if (slices.length) slices[0].pct += drift
  return slices
}

/** Rentabilidad latente en % de un conjunto de posiciones abiertas. */
export function positionsReturn(positions: PortfolioPosition[]): number | null {
  let inv = 0, val = 0
  for (const p of positions) {
    if (!(p.shares > 0.0001) || p.market_value == null) continue
    inv += p.shares * p.avg_buy_price
    val += p.market_value
  }
  return inv > 0 ? ((val - inv) / inv) * 100 : null
}

/** Saldo al final de cada uno de los últimos `points` días con datos, desde el saldo actual hacia atrás. */
export function balanceSeries(balance: number, txs: { date: string; amount: number }[], points = 12): number[] {
  const byDay = new Map<string, number>()
  for (const t of txs) { const d = t.date.slice(0, 10); byDay.set(d, (byDay.get(d) ?? 0) + t.amount) }
  const days = [...byDay.keys()].sort().reverse()
  const out = [balance]
  let b = balance
  for (const d of days.slice(0, points - 1)) { b -= byDay.get(d) ?? 0; out.push(Math.round(b * 100) / 100) }
  return out.reverse()
}

/** Etiqueta corta de cantidad: "62 part.", "8 acc." o el número con decimales. */
export function sharesLabel(shares: number, kind: AssetKind): string {
  const n = Number.isInteger(Math.round(shares * 1000) / 1000) ? String(Math.round(shares)) : shares.toLocaleString('es-ES', { maximumFractionDigits: 4 })
  if (kind === 'stock') return `${n} acc.`
  if (kind === 'etf' || kind === 'fund') return `${n} part.`
  return n
}

/** Días desde la última sincronización; null si nunca se sincronizó. */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000))
}

/** Texto del aviso de Trade Republic, o null si no hace falta avisar. */
export function trWarning(s: { connected: boolean; last_sync: string | null } | undefined, hasTR: boolean, now: Date = new Date()): string | null {
  if (!s || !hasTR) return null
  if (!s.connected) return 'Trade Republic desconectado'
  const d = daysSince(s.last_sync, now)
  if (d == null || d < 2) return null
  return `Trade Republic sin sincronizar desde hace ${d} días`
}
