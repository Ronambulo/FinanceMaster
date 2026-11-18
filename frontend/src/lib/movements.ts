import { cycleMonth, parseRangePeriod, rangePeriodLabel } from '@/lib/cycles'
// Cálculos de la pantalla Movimientos. Puros, sin React.
import type { Category, Transaction, TxGroup } from './api'
import { BANK_NAMES } from './utils'
import { weekdayDay } from './home'

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export const INCOME_TYPES = ['TRANSFER_INBOUND', 'CUSTOMER_INPAYMENT', 'INTEREST', 'DIVIDEND', 'REFUND']

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Importe que cuenta: el neto del grupo enlazado si lo hay. */
export function txNet(tx: Pick<Transaction, 'amount' | 'effective_amount'>): number {
  return tx.effective_amount ?? tx.amount
}

/** "Hoy", "Ayer" o "Domingo 15". */
export function dayLabel(iso: string, today: Date): string {
  const day = iso.slice(0, 10)
  if (day === isoDay(today)) return 'Hoy'
  const y = new Date(today)
  y.setDate(y.getDate() - 1)
  if (day === isoDay(y)) return 'Ayer'
  return weekdayDay(day)
}

export interface DayGroup { day: string; label: string; net: number; items: Transaction[] }

/** Agrupa por día (en el orden recibido) con el neto de cada día. */
export function groupByDay(txs: Transaction[], today: Date): DayGroup[] {
  const out: DayGroup[] = []
  const index = new Map<string, DayGroup>()
  for (const tx of txs) {
    const day = tx.date.slice(0, 10)
    let g = index.get(day)
    if (!g) {
      g = { day, label: dayLabel(day, today), net: 0, items: [] }
      index.set(day, g)
      out.push(g)
    }
    g.items.push(tx)
    g.net = Math.round((g.net + txNet(tx)) * 100) / 100
  }
  return out
}

/** Nombre de la cuenta para la fila. */
export function accountName(source: string | null | undefined): string {
  if (!source) return 'Manual'
  return BANK_NAMES[source] ?? source.replace(/_/g, ' ')
}

/** Título visible de un movimiento. */
export function txTitle(tx: Pick<Transaction, 'name' | 'description' | 'counterparty_name'>): string {
  return (tx.name || tx.counterparty_name || tx.description || 'Sin nombre').trim()
}

/** Gasto, ingreso o traspaso, para el selector de la hoja de edición. */
export type TxKind = 'expense' | 'income' | 'transfer'

export function txKind(tx: Pick<Transaction, 'amount' | 'is_internal_transfer'>): TxKind {
  if (tx.is_internal_transfer) return 'transfer'
  return tx.amount > 0 ? 'income' : 'expense'
}

const KIND_CATEGORY_TYPES: Record<TxKind, string[]> = {
  expense: ['expense'],
  income: ['income'],
  transfer: ['transfer', 'internal', 'investment'],
}

/** Categorías que encajan con la clase del movimiento (todas si ninguna encaja). */
export function categoriesFor(categories: Category[], kind: TxKind): Category[] {
  const fit = categories.filter(c => KIND_CATEGORY_TYPES[kind].includes(c.type))
  return fit.length ? fit : categories
}

/** Tipo de backend que corresponde a cada clase al editar a mano. */
export function kindToType(kind: TxKind, current?: string): string {
  if (kind === 'income') return current && INCOME_TYPES.includes(current) ? current : 'TRANSFER_INBOUND'
  if (kind === 'transfer') return 'TRANSFER_OUTBOUND'
  return current && !INCOME_TYPES.includes(current) && current !== 'TRANSFER_OUTBOUND' ? current : 'CARD_TRANSACTION'
}

/** Importe firmado según la clase: gasto y traspaso en negativo. */
export function signedAmount(abs: number, kind: TxKind): number {
  const a = Math.abs(abs)
  return kind === 'income' ? a : -a
}

/** "1.042,15" → 1042.15; acepta coma o punto decimal. */
export function parseAmount(text: string): number | null {
  const t = text.replace(/\s|€/g, '')
  if (!t) return null
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

// ── Meses ─────────────────────────────────────────────────────────────────

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthName(ym: string): string {
  return MONTHS[Number(ym.slice(5, 7)) - 1] ?? ym
}

/** Primer y último día del mes "YYYY-MM". */
export function monthRange(ym: string): { date_from: string; date_to: string } {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return { date_from: `${ym}-01`, date_to: `${ym}-${String(last).padStart(2, '0')}` }
}

/** Los últimos n meses, del actual hacia atrás. */
export function recentMonths(today: Date, n = 12): string[] {
  const out: string[] = []
  const d = new Date(today.getFullYear(), today.getMonth(), 1)
  for (let i = 0; i < n; i++) {
    out.push(monthKey(d))
    d.setMonth(d.getMonth() - 1)
  }
  return out
}

// ── Agrupar ───────────────────────────────────────────────────────────────

export type GroupMode = 'day' | 'category' | 'merchant' | 'account'

export type SectionGroup = TxGroup & { net: number }
export interface GroupSection { kind: 'expense' | 'income' | 'all'; total: number; groups: SectionGroup[] }

const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Secciones de la vista agrupada. Con `split`, una de gastos y otra de
 * ingresos (un grupo con ambos aparece en las dos con su parte); sin él,
 * una sola con el neto de cada grupo.
 */
export function groupSections(groups: TxGroup[], split: boolean): GroupSection[] {
  const sum = (xs: { net: number }[]) => r2(xs.reduce((s, g) => s + g.net, 0))
  if (!split) {
    const gs = groups.map(g => ({ ...g, net: r2(g.income - g.expense) }))
    return gs.length ? [{ kind: 'all', total: sum(gs), groups: gs }] : []
  }
  const exp = groups.filter(g => g.expense > 0).map(g => ({ ...g, net: -g.expense })).sort((a, b) => a.net - b.net)
  const inc = groups.filter(g => g.income > 0).map(g => ({ ...g, net: g.income })).sort((a, b) => b.net - a.net)
  const out: GroupSection[] = []
  if (exp.length) out.push({ kind: 'expense', total: sum(exp), groups: exp })
  if (inc.length) out.push({ kind: 'income', total: sum(inc), groups: inc })
  return out
}

/** Filtros de lista que corresponden a un grupo (para cargar sus filas). */
export function groupFilter(mode: Exclude<GroupMode, 'day'>, g: Pick<TxGroup, 'key' | 'label'>): Record<string, string | number | undefined> {
  if (mode === 'category') return { category_id: g.key === 'none' ? 0 : Number(g.key) }
  if (mode === 'merchant') return { search: g.label }
  return { source: g.key }
}

export function countLabel(n: number): string {
  return n === 1 ? '1 movimiento' : `${n} movimientos`
}

// ── Comercio ──────────────────────────────────────────────────────────────

export interface MonthBar { month: string; label: string; value: number; ratio: number; current: boolean }

/** Barras de gasto de los últimos n meses, con huecos a cero. */
export function merchantBars(byMonth: TxGroup[], today: Date, n = 6): MonthBar[] {
  const map = new Map(byMonth.map(g => [g.key, g.expense]))
  const months = recentMonths(today, n).reverse()
  const values = months.map(m => map.get(m) ?? 0)
  const max = Math.max(...values, 0)
  const cur = monthKey(today)
  return months.map((m, i) => ({
    month: m,
    label: SHORT[Number(m.slice(5, 7)) - 1],
    value: values[i],
    ratio: max > 0 ? values[i] / max : 0,
    current: m === cur,
  }))
}

/** Barras de gasto de un comercio por ciclo de nómina (los `n` últimos). */
export function merchantCycleBars(items: Transaction[], cycles: (CycleSpan & { isOpen?: boolean })[], n = 6): MonthBar[] {
  const last = cycles.slice(-n)
  const values = last.map(c => r2(items.reduce((s, t) => {
    const v = txNet(t)
    return t.date >= c.start && t.date <= c.end && v < 0 ? s - v : s
  }, 0)))
  const max = Math.max(...values, 0)
  return last.map((c, i) => {
    const m = cycleMonth(c)
    return { month: `${c.start}_${c.end}`, label: SHORT[Number(m.slice(5, 7)) - 1], value: values[i], ratio: max > 0 ? values[i] / max : 0, current: i === last.length - 1 }
  })
}

/** Gasto medio por movimiento. */
export function averageTicket(total: number, count: number): number {
  return count > 0 ? r2(Math.abs(total) / count) : 0
}

// ── Filtros de Movimientos (hoja "Filtros") ─────────────────────────────────

export type FilterKind = '' | 'expense' | 'income' | 'transfer'
/** 'this' | 'last' | '3m' | '' (todo) | 'YYYY-MM' (un mes concreto). */
export type FilterPeriod = string

export interface MovFilters {
  kind: FilterKind
  period: FilterPeriod
  sources: string[]
  categoryIds: number[]
  min: string
  max: string
}

export const EMPTY_FILTERS: MovFilters = { kind: '', period: 'this', sources: [], categoryIds: [], min: '', max: '' }

const toNumber = (s: string) => {
  const n = Number(s.replace(/\./g, '').replace(',', '.'))
  return s.trim() && Number.isFinite(n) ? Math.abs(n) : undefined
}

/** Un ciclo de nómina (de usePayrollCycle), del más antiguo al más reciente. */
export interface CycleSpan { start: string; end: string }

/** Rango de fechas de un periodo de la hoja de filtros. Con ciclos de nómina,
 *  "este mes", "mes pasado" y "3 meses" van por ciclo (como en Inicio);
 *  sin ellos, y para un mes elegido a mano, por mes natural. */
export function periodRange(period: FilterPeriod, today: Date, cycles: CycleSpan[] = []): { date_from?: string; date_to?: string } {
  const n = cycles.length
  const span = (c: CycleSpan) => ({ date_from: c.start, date_to: c.end })
  if (n) {
    if (period === 'this') return span(cycles[n - 1])
    if (period === 'last' && n >= 2) return span(cycles[n - 2])
    if (period === '3m' && n >= 3) return { date_from: cycles[n - 3].start, date_to: cycles[n - 1].end }
  }
  const cur = monthKey(today)
  if (period === 'this') return monthRange(cur)
  if (period === 'last') return monthRange(recentMonths(today, 2)[1])
  if (period === '3m') return { date_from: monthRange(recentMonths(today, 3)[2]).date_from, date_to: monthRange(cur).date_to }
  if (/^\d{4}-\d{2}$/.test(period)) return monthRange(period)
  const range = parseRangePeriod(period)
  if (range) return range
  return {}
}

/** Etiqueta corta del periodo (chip de la lista). */
export function periodLabel(period: FilterPeriod, w = { This: 'Este mes', last: 'Mes pasado', three: '3 meses' }): string {
  if (period === 'this') return w.This
  if (period === 'last') return w.last
  if (period === '3m') return w.three
  if (/^\d{4}-\d{2}$/.test(period)) return monthName(period)
  return rangePeriodLabel(period, new Date()) ?? 'Todo'
}

/** Parámetros de la API para unos filtros (los vacíos no se envían). */
export function filterParams(f: MovFilters, today: Date, cycles: CycleSpan[] = []): Record<string, string | number | undefined> {
  return {
    type_group: f.kind || undefined,
    source: f.sources.length ? f.sources.join(',') : undefined,
    category_ids: f.categoryIds.length ? f.categoryIds.join(',') : undefined,
    amount_min: toNumber(f.min),
    amount_max: toNumber(f.max),
    ...periodRange(f.period, today, cycles),
  }
}

/** Cuántos filtros "extra" hay puestos (para marcar el botón). */
export function activeFilterCount(f: MovFilters): number {
  return (f.kind ? 1 : 0) + (f.period !== 'this' ? 1 : 0) + (f.sources.length ? 1 : 0)
    + (f.categoryIds.length ? 1 : 0) + (f.min.trim() || f.max.trim() ? 1 : 0)
}

// ── Editar / añadir ───────────────────────────────────────────────────────

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

/** "17 nov". */
export function shortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return `${d.getDate()} ${SHORT[d.getMonth()].toLowerCase()}`
}

/** "Martes 17 nov · 13:42" (sin hora si no la hay). */
export function longDateTime(date: string, datetime?: string | null): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00`)
  const base = `${WEEKDAYS[d.getDay()]} ${shortDate(date)}`
  const time = datetime?.match(/T(\d{2}:\d{2})/)?.[1]
  return time && time !== '00:00' ? `${base} · ${time}` : base
}

/** Fecha corta del chip de "Nuevo movimiento": Hoy, Ayer o "17 nov". */
export function chipDate(iso: string, today: Date): string {
  const l = dayLabel(iso, today)
  return l === 'Hoy' || l === 'Ayer' ? l : shortDate(iso)
}

/** Pulsación del teclado numérico sobre el importe escrito ("24,9"). */
export function keypadInput(text: string, key: string): string {
  if (key === 'back') return text.slice(0, -1)
  if (key === ',') return text.includes(',') ? text : (text || '0') + ','
  if (!/^\d$/.test(key)) return text
  const [int, dec] = text.split(',')
  if (dec !== undefined && dec.length >= 2) return text
  if (dec === undefined && int.length >= 7) return text
  if (text === '0') return key
  return text + key
}

/** La regla que categoriza a este comercio, si la hay. */
export function ruleFor<R extends { keyword: string }>(rules: R[], merchant: string): R | undefined {
  const m = merchant.toLowerCase()
  return rules.find(r => r.keyword.trim() && m.includes(r.keyword.trim().toLowerCase()))
}

/** Movimiento añadido a mano: se puede cambiar importe, fecha, tipo y cuenta. */
export function isManualTx(tx: Pick<Transaction, 'source' | 'external_id'> & { is_manual?: boolean | null }): boolean {
  return !!tx.is_manual || tx.source === 'manual' || (!tx.source && !tx.external_id)
}

/** 30.15 → "30,15" para escribir en un campo de importe. */
export function amountText(n: number): string {
  return Math.abs(n).toFixed(2).replace('.', ',')
}

/** Reparte un total en n partes iguales a céntimos; el resto va a la primera. */
export function equalParts(total: number, n: number): number[] {
  if (n <= 0) return []
  const cents = Math.round(Math.abs(total) * 100)
  const base = Math.floor(cents / n)
  return Array.from({ length: n }, (_, i) => (base + (i === 0 ? cents - base * n : 0)) / 100)
}

/** Teclado del importe: dígitos, una coma y como mucho 2 decimales. "⌫" borra. */
export function typeKey(current: string, key: string): string {
  if (key === '⌫') return current.slice(0, -1)
  if (key === ',' || key === '.') return current.includes(',') ? current : (current || '0') + ','
  if (!/^\d$/.test(key)) return current
  const [int, dec] = current.split(',')
  if (dec !== undefined) return dec.length >= 2 ? current : current + key
  if (int.length >= 7) return current
  return int === '0' ? key : current + key
}

/** Días durante los que un movimiento recién llegado cuenta como "nuevo". */
export const NEW_DAYS = 21

/** Movimiento recién llegado cuya categoría se puso sola (o no tiene) y nadie ha revisado aún. */
export function needsReview(
  tx: Pick<Transaction, 'is_auto_categorized' | 'is_ai_categorized' | 'category_id' | 'is_internal_transfer' | 'type'> & { created_at?: string | null; is_manual?: boolean | null; split_parent_id?: number | null },
  now: number = Date.now(),
): boolean {
  if (tx.is_internal_transfer || tx.is_manual || tx.split_parent_id || tx.type === 'BUY' || tx.type === 'SELL') return false
  if (!(tx.is_auto_categorized || tx.is_ai_categorized || tx.category_id == null)) return false
  if (!tx.created_at) return false
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(tx.created_at) ? tx.created_at : `${tx.created_at}Z`)
  return Number.isFinite(t) && now - t < NEW_DAYS * 86400_000
}
