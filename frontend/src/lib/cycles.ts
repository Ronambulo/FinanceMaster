import type { MonthlyDetailRow } from '@/lib/api'
import type { PayrollCycle } from '@/hooks/usePayrollCycle'
import { periodTotals } from '@/lib/home'

export interface CycleRow {
  key: string          // "YYYY-MM-DD_YYYY-MM-DD", también el periodo de Movimientos
  start: string
  end: string
  isOpen: boolean
  label: string        // "27 oct – 26 nov" o "27 oct – hoy"
  income: number
  expenses: number
  savings: number
}

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => new Date(s + 'T12:00:00')
const shortDay = (s: string) => { const d = parse(s); return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` }

export function cycleLabel(start: string, end: string, isOpen: boolean): string {
  return `${shortDay(start)} – ${isOpen ? 'hoy' : shortDay(end)}`
}

/** Sin nómina detectada: los meses naturales hacen de ciclos. */
export function calendarCycles(today: Date, n: number, day = 1): PayrollCycle[] {
  // Ciclos que empiezan el día `day` (1 = meses naturales; Perfil permite 1..28).
  const d = Math.min(Math.max(1, Math.round(day)), 28)
  const base = today.getMonth() + (today.getDate() >= d ? 0 : -1)
  const out: PayrollCycle[] = []
  for (let i = n - 1; i >= 0; i--) {
    const first = new Date(today.getFullYear(), base - i, d, 12)
    const last = new Date(today.getFullYear(), base - i + 1, d - 1, 12)
    out.push({ start: iso(first), end: iso(last), isOpen: i === 0 })
  }
  return out
}

/** Mes (YYYY-MM) al que pertenece un ciclo: el de su punto medio. Un ciclo
 *  abierto se cuenta como de un mes de largo (su fin real aún no se sabe). */
export function cycleMonth(c: { start: string; end: string; isOpen?: boolean }): string {
  const a = parse(c.start)
  const b = c.isOpen ? new Date(a.getTime() + 29 * 86_400_000) : parse(c.end)
  return iso(new Date((a.getTime() + b.getTime()) / 2)).slice(0, 7)
}

type CycleLike = { start: string; end: string; isOpen?: boolean }

/** Fin estimado de un ciclo (YYYY-MM-DD). El abierto no tiene fin conocido:
 *  se estima con la duración media de los cerrados (o 30 días). */
export function cycleEstimatedEnd(cycles: CycleLike[], idx = cycles.length - 1): string {
  const cur = cycles[idx]
  if (!cur) return ''
  if (!cur.isOpen) return cur.end
  const day = 86_400_000
  const closed = cycles.filter(c => !c.isOpen).slice(-6)
  const len = closed.length
    ? Math.round(closed.reduce((s, c) => s + (parse(c.end).getTime() - parse(c.start).getTime()) / day + 1, 0) / closed.length)
    : 30
  return iso(new Date(parse(cur.start).getTime() + (len - 1) * day))
}

/** Días que quedan del ciclo actual (hoy incluido). */
export function cycleDaysLeft(cycles: CycleLike[], today: Date): number {
  const end = cycleEstimatedEnd(cycles)
  if (!end) return 0
  return Math.max(1, Math.round((parse(end).getTime() - parse(iso(today)).getTime()) / 86_400_000) + 1)
}

/** Totales de cada ciclo (más antiguo primero) a partir de las filas de todo el rango. */
export function cycleRows(cycles: PayrollCycle[], rows: MonthlyDetailRow[]): CycleRow[] {
  return cycles.map(c => {
    const t = periodTotals(rows.filter(r => r.date >= c.start && r.date <= c.end))
    return {
      key: `${c.start}_${c.end}`, start: c.start, end: c.end, isOpen: c.isOpen,
      label: cycleLabel(c.start, c.end, c.isOpen),
      income: t.income, expenses: t.expenses, savings: Math.round((t.income - t.expenses) * 100) / 100,
    }
  })
}

/**
 * Gasto del ciclo anterior hasta el mismo día del ciclo. Un ciclo abierto se
 * compara a estas alturas; uno cerrado, entero contra el anterior entero.
 */
export function previousSpendAligned(cur: CycleRow, prev: CycleRow, rows: MonthlyDetailRow[], today: Date): number {
  if (!cur.isOpen) return prev.expenses
  const elapsed = Math.round((parse(iso(today)).getTime() - parse(cur.start).getTime()) / 86_400_000)
  const lim = parse(prev.start)
  lim.setDate(lim.getDate() + Math.max(0, elapsed))
  const until = iso(lim) < prev.end ? iso(lim) : prev.end
  return periodTotals(rows.filter(r => r.date >= prev.start && r.date <= until)).expenses
}

/** Ciclo con más ahorro entre los cerrados (hacen falta dos). */
export function bestCycle(rows: CycleRow[]): string | null {
  const closed = rows.filter(r => !r.isOpen)
  if (closed.length < 2) return null
  let best = closed[0]
  for (const r of closed) if (r.savings > best.savings) best = r
  return best.savings > 0 ? best.key : null
}

/** Ahorro medio de los ciclos cerrados (el abierto aún no ha terminado). */
export function cycleAverage(rows: CycleRow[]): number {
  const closed = rows.filter(r => !r.isOpen)
  const base = closed.length ? closed : rows
  if (!base.length) return 0
  return Math.round(base.reduce((s, r) => s + r.savings, 0) / base.length)
}

const RANGE = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/

/** Periodo de Movimientos con rango de fechas exacto (un ciclo). */
export function parseRangePeriod(period: string): { date_from: string; date_to: string } | null {
  const m = RANGE.exec(period)
  return m ? { date_from: m[1], date_to: m[2] } : null
}

export function rangePeriodLabel(period: string, today: Date): string | null {
  const r = parseRangePeriod(period)
  return r ? cycleLabel(r.date_from, r.date_to, r.date_to >= iso(today)) : null
}

/** Textos del periodo: "ciclo" si va de nómina a nómina o desde un día fijo, "mes" si son meses naturales. */
export function periodWords(isCycle: boolean) {
  return isCycle
    ? { isCycle, unit: 'ciclo', Unit: 'Ciclo', this: 'este ciclo', This: 'Este ciclo', last: 'Ciclo pasado', three: '3 ciclos', each: 'Ciclo a ciclo', none: 'Aún no hay ciclos' }
    : { isCycle, unit: 'mes', Unit: 'Mes', this: 'este mes', This: 'Este mes', last: 'Mes pasado', three: '3 meses', each: 'Mes a mes', none: 'Aún no hay meses' }
}
export type PeriodWords = ReturnType<typeof periodWords>

/** Cambio de un importe frente al periodo anterior, en % redondeado (null si antes no había nada). */
export function changePct(cur: number, prev: number): number | null {
  if (!(prev > 0)) return null
  return Math.round(((cur - prev) / prev) * 100)
}

/** "+12 %", "−5 %" o "igual". */
export function changeText(pct: number): string {
  if (pct === 0) return 'igual'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/** Fechas del enlace del aviso de nómina; null si faltan o no tienen sentido. */
export function parseCloseRange(start: string | null, end: string | null): { start: string; end: string } | null {
  if (!start || !end || !ISO_RE.test(start) || !ISO_RE.test(end)) return null
  if (isNaN(parse(start).getTime()) || isNaN(parse(end).getTime()) || end < start) return null
  return { start, end }
}
