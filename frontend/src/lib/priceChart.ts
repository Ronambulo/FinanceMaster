// Gráfico de precio de una posición: tramos con y sin el activo, y marcas de
// compra y venta. Puro, sin React.
import type { TradeEvent } from './api'

export interface HeldPeriod { from: string; to: string | null }

const day = (d: string) => d.slice(0, 10)
const EPS = 1e-6

/**
 * Periodos en los que se tenía el activo, según las compras y ventas.
 * `null` = no se puede saber (sin movimientos o datos incoherentes): se trata
 * como si se hubiera tenido siempre.
 */
export function heldPeriods(buys: TradeEvent[] = [], sells: TradeEvent[] = [], shares = 0): HeldPeriod[] | null {
  const ev = [
    ...buys.map(e => ({ date: day(e.date), d: Math.abs(e.shares) })),
    ...sells.map(e => ({ date: day(e.date), d: -Math.abs(e.shares) })),
  ].sort((a, b) => (a.date === b.date ? b.d - a.d : a.date < b.date ? -1 : 1)) // el mismo día, compras primero
  if (ev.length === 0) return null
  const out: HeldPeriod[] = []
  // Si se vendió más de lo que consta comprado, faltan compras antiguas: se tenía desde antes.
  let run = Math.max(0, shares - ev.reduce((t, e) => t + e.d, 0))
  let open: string | null = run > EPS ? '0000-01-01' : null
  for (const e of ev) {
    run = Math.max(0, run + e.d)
    if (open == null && run > EPS) open = e.date
    else if (open != null && run <= EPS) { out.push({ from: open, to: e.date }); open = null }
  }
  if (open != null) out.push({ from: open, to: null })
  // Se tiene el activo pero las ventas lo dejaban a cero: faltan movimientos.
  if (shares > EPS && open == null) return null
  return out
}

export function isHeld(date: string, periods: HeldPeriod[] | null): boolean {
  if (periods == null) return true
  const d = day(date)
  return periods.some(p => d >= p.from && (p.to == null || d <= p.to))
}

export interface Run { held: boolean; from: number; to: number }

/** Tramos seguidos con el mismo estado; comparten el punto de unión para que la línea no se corte. Un tramo con from === to es un solo punto. */
export function heldRuns(dates: string[], periods: HeldPeriod[] | null): Run[] {
  const runs: Run[] = []
  dates.forEach((d, i) => {
    const held = isHeld(d, periods)
    const last = runs[runs.length - 1]
    if (last && last.held === held) last.to = i
    else if (!last) runs.push({ held, from: i, to: i })
    // El segmento entre dos puntos es discontinuo si alguno de los dos no se tenía
    else if (held) { last.to = i; runs.push({ held, from: i, to: i }) }
    else runs.push({ held, from: i - 1, to: i })
  })
  return runs
}

export interface Mark { index: number; buy: number; sell: number }

/** Compras y ventas dentro del periodo, pegadas al primer punto en o tras su fecha. */
export function tradeMarks(dates: string[], buys: TradeEvent[] = [], sells: TradeEvent[] = []): Mark[] {
  if (dates.length === 0) return []
  const first = day(dates[0])
  const last = day(dates[dates.length - 1])
  const by = new Map<number, Mark>()
  const add = (e: TradeEvent, kind: 'buy' | 'sell') => {
    const d = day(e.date)
    if (d < first || d > last) return
    const index = dates.findIndex(x => day(x) >= d)
    if (index < 0) return
    const m = by.get(index) ?? { index, buy: 0, sell: 0 }
    m[kind] += Math.abs(e.shares)
    by.set(index, m)
  }
  buys.forEach(e => add(e, 'buy'))
  sells.forEach(e => add(e, 'sell'))
  return [...by.values()].sort((a, b) => a.index - b.index)
}
