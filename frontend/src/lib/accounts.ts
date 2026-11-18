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

export type AssetKind = 'fund' | 'etf' | 'etc' | 'stock' | 'derivative' | 'cash' | 'crypto' | 'other'
export const ASSET_LABEL: Record<AssetKind, string> = { fund: 'Fondos indexados', etf: 'ETF', etc: 'ETC', stock: 'Acciones', derivative: 'Derivados', cash: 'Efectivo', crypto: 'Cripto', other: 'Otros' }
export const ASSET_COLOR: Record<AssetKind, string> = { fund: 'var(--c-8cc6ff)', etf: 'var(--c-8b85ff)', etc: 'var(--c-e0bc9a)', stock: 'var(--c-7fdbe3)', derivative: 'var(--c-ff9ccf)', cash: 'var(--c-6fe0a5)', crypto: 'var(--c-ffc979)', other: 'var(--c-9a9fb0)' }

// Trade Republic no manda el tipo de activo y el servidor pone STOCK por
// defecto, así que se deduce del nombre y el ticker.
const ETC_TICKERS = new Set(['EGLN', 'SGLN', 'IGLN', 'PHAU', 'PHAG', 'SSLN', '4GLD', 'XAD5', 'GZUR', 'VZLD', 'EWG2'])
const ETF_TICKERS = new Set(['IWDA', 'EUNL', 'SXR8', 'CSPX', 'VWCE', 'VWRL', 'VUSA', 'VUAA', 'EQQQ', 'CNDX', 'SXRV', 'EMIM', 'IS3N', 'XDWD', 'MEUD', 'SPPW', 'SSAC', 'IUSQ', 'ZPRV', 'ZPRX'])
const CRYPTO_NAMES = /^(bitcoin|ethereum|solana|cardano|xrp|ripple|dogecoin|litecoin|polkadot|chainlink|avalanche|polygon|tron|stellar|bitcoin cash|ethereum classic)$/i

function guessKind(name: string, symbol: string): AssetKind | null {
  const t = symbol.toUpperCase().replace(/\..*$/, '')
  if (ETC_TICKERS.has(t) || /\bETC\b|physical\s+(gold|silver|platinum|palladium|precious|metals?)|^(gold|silver|platinum|palladium)\b/i.test(name)) return 'etc'
  if (/^(long|short|turbo|call|put|mini|faktor|factor)\b|knock[- ]?out|warrant|optionsschein/i.test(name)) return 'derivative'
  if (CRYPTO_NAMES.test(name.trim()) || /-(EUR|USD)$/.test(symbol.toUpperCase())) return 'crypto'
  if (ETF_TICKERS.has(t) || /\bETF\b|UCITS|\((acc|dist)\)|^(core |ishares|vanguard|xtrackers|amundi|spdr|invesco|lyxor|wisdomtree|vaneck)/i.test(name)) return 'etf'
  return null
}

export function assetKind(assetClass: string | null | undefined, name?: string | null, symbol?: string | null): AssetKind {
  const a = (assetClass ?? '').toUpperCase()
  if (a.includes('CRYPTO')) return 'crypto'
  if (a.includes('ETC') || a.includes('COMMODITY')) return 'etc'
  if (a.includes('ETF')) return 'etf'
  if (a.includes('FUND')) return 'fund'
  if (a.includes('DERIVATIVE') || a.includes('WARRANT')) return 'derivative'
  // Sin tipo fiable: STOCK puede ser el valor por defecto del servidor.
  if (!a || a.includes('STOCK') || a.includes('EQUITY') || a === 'SHARES') {
    const g = guessKind(name ?? '', symbol ?? '')
    if (g) return g
    return a ? 'stock' : (name || symbol ? 'stock' : 'other')
  }
  return 'other'
}

/** Tipo de una posición: el que da el servidor (deducido o elegido a mano) y, si no lo da, se adivina. */
export function positionKind(p: Pick<PortfolioPosition, 'asset_class' | 'asset_class_auto' | 'asset_class_manual' | 'name' | 'symbol'>): AssetKind {
  if (p.asset_class_manual || p.asset_class_auto) return assetKind(p.asset_class)
  return assetKind(p.asset_class, p.name, p.symbol)
}

/** Tipos que se pueden elegir a mano, con el valor que guarda el servidor. */
export const KIND_CLASS: [AssetKind, string][] = [['stock', 'STOCK'], ['etf', 'ETF'], ['etc', 'ETC'], ['fund', 'FUND'], ['crypto', 'CRYPTO'], ['derivative', 'DERIVATIVE'], ['other', 'OTHER']]

export interface AssetSlice { kind: AssetKind; value: number; pct: number }

/** Reparto por tipo de activo (más el efectivo), en % enteros que suman 100. */
export function assetMix(positions: PortfolioPosition[], cash = 0): AssetSlice[] {
  const sum = new Map<AssetKind, number>()
  for (const p of positions) {
    if (!(p.shares > 0.0001)) continue
    const k = positionKind(p)
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
  if (kind === 'etf' || kind === 'etc' || kind === 'fund') return `${n} part.`
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
