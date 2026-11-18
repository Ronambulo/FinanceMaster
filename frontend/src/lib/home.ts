// Cálculos de la pantalla Inicio. Puros, sin React.
import type { CategoryBreakdown, MonthlyDetailRow, NetWorthPoint } from './api'

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** Cabecera: "Martes 17" sobre "Noviembre". */
export function dateHeading(d: Date): { day: string; month: string } {
  return { day: `${WEEKDAYS[d.getDay()]} ${d.getDate()}`, month: MONTHS[d.getMonth()] }
}

/** Fecha corta con día de la semana: "Jueves 19". */
export function weekdayDay(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`
}

export interface PeriodTotals { income: number; expenses: number; left: number; spentRatio: number }

/** Entró / Salió / Te quedan del periodo, ignorando lo excluido de estadísticas. */
export function periodTotals(rows: MonthlyDetailRow[]): PeriodTotals {
  let income = 0
  let expenses = 0
  for (const r of rows) {
    if (r.exclude_from_stats) continue
    if (r.amount > 0) income += r.amount
    else expenses += -r.amount
  }
  income = Math.round(income * 100) / 100
  expenses = Math.round(expenses * 100) / 100
  const left = Math.round((income - expenses) * 100) / 100
  const spentRatio = income > 0 ? Math.min(1, expenses / income) : expenses > 0 ? 1 : 0
  return { income, expenses, left, spentRatio }
}

export interface CategoryBar { name: string; icon: string; color: string; total: number; ratio: number }

/** Las N categorías con más gasto, con la barra relativa a la mayor. */
export function categoryBars(rows: CategoryBreakdown[], n = 4): CategoryBar[] {
  const top = [...rows].filter(r => r.total > 0).sort((a, b) => b.total - a.total).slice(0, n)
  const max = top[0]?.total ?? 0
  return top.map(r => ({
    name: r.category_name,
    icon: r.category_icon,
    color: r.category_color,
    total: r.total,
    ratio: max > 0 ? r.total / max : 0,
  }))
}

/** Variación del patrimonio en el histórico disponible (en %), o null si no hay base. */
export function worthChangePct(history: NetWorthPoint[], months = 12): number | null {
  const slice = history.slice(-months - 1)
  if (slice.length < 2) return null
  const first = slice[0].net_worth
  const last = slice[slice.length - 1].net_worth
  if (first <= 0) return null
  return Math.round(((last - first) / first) * 1000) / 10
}

/** Ruta SVG de una línea suave para el mini gráfico; `area` cierra por abajo. */
export function sparkPath(values: number[], width: number, height: number, pad = 4): { line: string; area: string; end: [number, number] | null } {
  if (values.length === 0) return { line: '', area: '', end: null }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0
  const pts = values.map((v, i) => [
    pad + i * step,
    pad + (1 - (v - min) / span) * (height - pad * 2),
  ] as [number, number])
  const fmt = (n: number) => n.toFixed(1)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`).join(' ')
  const last = pts[pts.length - 1]
  const area = `${line} L${fmt(last[0])} ${height} L${fmt(pts[0][0])} ${height} Z`
  return { line, area, end: last }
}
