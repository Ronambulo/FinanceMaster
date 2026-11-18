// Resúmenes de una línea para las tarjetas de la pantalla Plan. Puros.
import type { BudgetStatus, Debt, Goal, MonthlyTrend, UpcomingRecurring } from './api'
import { formatEuro } from './format'

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const WEEKDAYS = ['el domingo', 'el lunes', 'el martes', 'el miércoles', 'el jueves', 'el viernes', 'el sábado']

const monthIdx = (ym: string) => Number(ym.slice(5, 7)) - 1

export function shortMonth(ym: string): string {
  const s = MONTHS_SHORT[monthIdx(ym)] ?? ym
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function longMonth(ym: string): string {
  const s = MONTHS_LONG[monthIdx(ym)] ?? ym
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface SpendBar { month: string; label: string; value: number; ratio: number; current: boolean }

/** Barras de gasto por mes, normalizadas al máximo. La última es el mes actual. */
export function spendBars(trend: MonthlyTrend[]): SpendBar[] {
  const max = Math.max(0, ...trend.map(t => t.expenses))
  return trend.map((t, i) => ({
    month: t.month,
    label: shortMonth(t.month),
    value: t.expenses,
    ratio: max > 0 ? t.expenses / max : 0,
    current: i === trend.length - 1,
  }))
}

/** Variación del gasto del último mes frente al anterior, p. ej. "−18 % vs oct". */
export function spendChange(trend: MonthlyTrend[]): { text: string; better: boolean } | null {
  if (trend.length < 2) return null
  const cur = trend[trend.length - 1]
  const prev = trend[trend.length - 2]
  if (prev.expenses <= 0) return null
  const pct = Math.round(((cur.expenses - prev.expenses) / prev.expenses) * 100)
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : ''
  return { text: `${sign}${Math.abs(pct)} % vs ${MONTHS_SHORT[monthIdx(prev.month)]}`, better: pct <= 0 }
}

export function monthlySummary(trend: MonthlyTrend[]): string {
  if (trend.length < 2) return 'Compara tus meses'
  const cur = trend[trend.length - 1]
  const prev = trend[trend.length - 2]
  const name = MONTHS_LONG[monthIdx(prev.month)]
  if (cur.savings > prev.savings) return `Mejor que ${name}`
  if (cur.savings < prev.savings) return `Peor que ${name}`
  return `Igual que ${name}`
}

export function budgetsSummary(status: BudgetStatus[]): string {
  if (status.length === 0) return 'Sin presupuestos'
  const ok = status.filter(b => b.pct_used <= 100).length
  return `${ok} de ${status.length} en verde`
}

function dayDiff(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / 86_400_000)
}

/** "hoy", "mañana", "el jueves" (esta semana) o "el 3 dic". */
export function relativeDay(iso: string, today: Date): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  const diff = dayDiff(today, d)
  if (diff === 0) return 'hoy'
  if (diff === 1) return 'mañana'
  if (diff > 1 && diff < 7) return WEEKDAYS[d.getDay()]
  return `el ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

export function nextRecurring(upcoming: UpcomingRecurring[]): UpcomingRecurring | null {
  return upcoming
    .filter(u => u.next_expected_date)
    .sort((a, b) => a.next_expected_date!.localeCompare(b.next_expected_date!))[0] ?? null
}

export function recurringSummary(upcoming: UpcomingRecurring[], today: Date): string {
  const next = nextRecurring(upcoming)
  if (!next) return 'Nada próximo'
  return `${next.display_name} ${relativeDay(next.next_expected_date!, today)}`
}

export function topGoal(goals: Goal[]): Goal | null {
  const active = goals.filter(g => g.is_active)
  return [...active].sort((a, b) => b.progress_pct - a.progress_pct)[0] ?? null
}

export function goalsSummary(goals: Goal[]): string {
  const top = topGoal(goals)
  if (!top) return 'Sin objetivos'
  return `${Math.round(top.progress_pct)} % ${top.name}`
}

export function debtsSummary(debts: Debt[]): string {
  let owedToMe = 0
  let iOwe = 0
  for (const d of debts) {
    if (d.is_settled) continue
    if (d.direction === 'OWED_TO_ME') owedToMe += d.remaining_amount
    else iOwe += d.remaining_amount
  }
  if (owedToMe === 0 && iOwe === 0) return 'Todo al día'
  const net = Math.round((owedToMe - iOwe) * 100) / 100
  const fmt = (n: number) => formatEuro(n, { decimals: Number.isInteger(n) ? 0 : 2 })
  if (net > 0) return `Te deben ${fmt(net)}`
  if (net < 0) return `Debes ${fmt(-net)}`
  return 'Estáis en paz'
}

// ── Pantallas de Plan ───────────────────────────────────────────────────────

export type BudgetTone = 'green' | 'amber' | 'red'
/** Verde por debajo del 80 %, ámbar hasta el 100 % y rojo si se pasa. */
export function budgetTone(pct: number): BudgetTone {
  if (pct > 100) return 'red'
  if (pct >= 80) return 'amber'
  return 'green'
}
export const TONE_COLORS: Record<BudgetTone, { bg: string; fg: string }> = {
  green: { bg: 'var(--c-12301f)', fg: 'var(--c-6fe0a5)' },
  amber: { bg: 'var(--c-3a2e14)', fg: 'var(--c-ffc979)' },
  red: { bg: 'var(--c-3a1a1e)', fg: 'var(--c-ff9b9b)' },
}

export function budgetTotals(status: BudgetStatus[]): { budgeted: number; spent: number; ratio: number } {
  const budgeted = status.reduce((s, b) => s + b.budgeted, 0)
  const spent = status.reduce((s, b) => s + b.spent, 0)
  return { budgeted, spent, ratio: budgeted > 0 ? spent / budgeted : 0 }
}

/** Días que quedan del mes, contando hoy. */
export function daysLeftInMonth(today: Date): number {
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  return last - today.getDate() + 1
}

interface RecurringLike { avg_amount: number | null; period_days: number | null; is_active: boolean }
/** Coste mensual de los recurrentes activos (en positivo). */
export function recurringMonthly(groups: RecurringLike[]): number {
  let total = 0
  for (const g of groups) {
    if (!g.is_active || !g.avg_amount) continue
    const p = g.period_days && g.period_days > 0 ? g.period_days : 30
    total += Math.abs(g.avg_amount) * (30 / p)
  }
  return Math.round(total * 100) / 100
}

const WEEKDAY_CAP = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function periodText(days: number | null): string {
  if (!days) return 'cada mes'
  if (days <= 8) return 'cada semana'
  if (days <= 16) return 'cada 2 semanas'
  if (days <= 45) return 'cada mes'
  if (days <= 100) return 'cada 3 meses'
  if (days <= 200) return 'cada 6 meses'
  return 'cada año'
}

/** "Jueves 19" si cae esta semana; si no, "Día 15 · cada mes". */
export function recurringWhen(next: string | null, periodDays: number | null, today: Date): string {
  if (!next) return periodText(periodDays).replace(/^c/, 'C')
  const d = new Date(`${next.slice(0, 10)}T00:00:00`)
  const diff = dayDiff(today, d)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff > 1 && diff < 7) return `${WEEKDAY_CAP[d.getDay()]} ${d.getDate()}`
  return `Día ${d.getDate()} · ${periodText(periodDays)}`
}

/** Importe objetivo de una meta en euros (las de porcentaje no tienen). */
export function goalTarget(g: Pick<Goal, 'type' | 'target_amount'>): number | null {
  return g.type === 'EURO_TARGET' && g.target_amount ? g.target_amount : null
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
}

/** "Julio 2027 · 95 €/mes", "Diciembre · 60 €/mes" o "Sin fecha". */
export function goalSub(g: Pick<Goal, 'type' | 'target_amount' | 'current_amount' | 'deadline' | 'target_percent'>, today: Date): string {
  if (g.type === 'PERCENT') return `${g.target_percent ?? 0} % de lo que ahorras`
  if (!g.deadline) return 'Sin fecha'
  const d = new Date(`${g.deadline.slice(0, 10)}T00:00:00`)
  const name = MONTHS_LONG[d.getMonth()].charAt(0).toUpperCase() + MONTHS_LONG[d.getMonth()].slice(1)
  const when = d.getFullYear() === today.getFullYear() ? name : `${name} ${d.getFullYear()}`
  const left = Math.max(0, (g.target_amount ?? 0) - g.current_amount)
  if (left <= 0) return `${when} · conseguido`
  const months = Math.max(1, monthsBetween(today, d))
  return `${when} · ${formatEuro(Math.ceil(left / months), { decimals: 0 })}/mes`
}

export function debtTotals(debts: Debt[]): { owedToMe: number; iOwe: number } {
  let owedToMe = 0
  let iOwe = 0
  for (const d of debts) {
    if (d.is_settled) continue
    if (d.direction === 'OWED_TO_ME') owedToMe += d.remaining_amount
    else iOwe += d.remaining_amount
  }
  return { owedToMe, iOwe }
}

export function savingsAverage(trend: MonthlyTrend[]): number {
  if (trend.length === 0) return 0
  return Math.round(trend.reduce((s, t) => s + t.savings, 0) / trend.length)
}

/** Mes con más ahorro (solo si hay al menos dos meses con datos). */
export function bestMonth(trend: MonthlyTrend[]): string | null {
  if (trend.length < 2) return null
  let best = trend[0]
  for (const t of trend) if (t.savings > best.savings) best = t
  return best.savings > 0 ? best.month : null
}

/** Puntos de la línea de ahorro para un SVG de ancho w y alto h. */
export function linePoints(values: number[], w: number, h: number, pad = 4): [number, number][] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0
  return values.map((v, i) => [pad + i * step, pad + (h - pad * 2) * (1 - (v - min) / span)])
}

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Días seguidos con algún movimiento apuntado, terminando hoy o ayer. */
export function streakDays(dates: string[], today: Date): number {
  const set = new Set(dates.map(d => d.slice(0, 10)))
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (!set.has(dayKey(d))) d.setDate(d.getDate() - 1)
  let n = 0
  while (set.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1) }
  return n
}

/** Racha más larga dentro de las fechas dadas. */
export function longestStreak(dates: string[]): number {
  const days = [...new Set(dates.map(d => d.slice(0, 10)))].sort()
  let best = 0
  let run = 0
  let prev: Date | null = null
  for (const s of days) {
    const d = new Date(`${s}T00:00:00`)
    run = prev && dayDiff(prev, d) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return best
}

export interface Badge { id: string; icon: 'flame' | 'trophy' | 'safe-open' | 'cat-inversion' | 'medal' | 'badge'; title: string; sub: string; unlocked: boolean }

export function badges(input: {
  streak: number; greenMonth: string | null; goals: number; hasBroker: boolean; txCount: number; debts: Debt[]
}): Badge[] {
  const owes = input.debts.some(d => d.direction === 'I_OWE' && !d.is_settled)
  const hadDebt = input.debts.some(d => d.direction === 'I_OWE')
  return [
    { id: 'streak', icon: 'flame', title: `Racha ${input.streak}`, sub: 'días apuntando', unlocked: input.streak > 0 },
    { id: 'green', icon: 'trophy', title: 'Mes en verde', sub: input.greenMonth ? MONTHS_LONG[monthIdx(input.greenMonth)] : 'bloqueado', unlocked: !!input.greenMonth },
    { id: 'goal', icon: 'safe-open', title: 'Primera hucha', sub: input.goals > 0 ? 'creada' : 'bloqueado', unlocked: input.goals > 0 },
    { id: 'broker', icon: 'cat-inversion', title: 'Inversor', sub: input.hasBroker ? 'primer broker' : 'bloqueado', unlocked: input.hasBroker },
    { id: 'tx', icon: 'medal', title: '100 movs', sub: input.txCount >= 100 ? 'registrados' : `${input.txCount} de 100`, unlocked: input.txCount >= 100 },
    { id: 'debt', icon: 'badge', title: 'Sin deudas', sub: hadDebt && !owes ? 'conseguido' : 'bloqueado', unlocked: hadDebt && !owes },
  ]
}

/** Último mes cerrado con ahorro positivo (el actual no cuenta). */
export function lastGreenMonth(trend: MonthlyTrend[]): string | null {
  for (let i = trend.length - 2; i >= 0; i--) if (trend[i].savings > 0) return trend[i].month
  return null
}
