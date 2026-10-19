import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '@/lib/api'
import { cn, formatCurrency, CHART_PALETTE } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import type { PortfolioPosition } from '@/lib/api'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts'

const PERIODS = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y',  label: '1A' },
  { value: '2y',  label: '2A' },
  { value: '5y',  label: '5A' },
]

// SVG ids cannot contain spaces or special chars — use a stable index-based id
function gradientId(index: number): string {
  return `cgr_${index}`
}

export function PriceChart({ positions, totalInvested = 0 }: { positions: PortfolioPosition[]; totalInvested?: number }) {
  const [period, setPeriod]         = useState('1y')
  const [cumulative, setCumulative] = useState(false)
  const [hiddenSymbols, setHiddenSymbols] = useState<Set<string>>(() => {
    const toHide = new Set<string>()
    if (positions.length > 5) {
      const sorted = [...positions].sort((a, b) => {
         const valA = (a as any).market_value ?? (a.shares * (a.current_price || 0))
         const valB = (b as any).market_value ?? (b.shares * (b.current_price || 0))
         return valB - valA
      })
      sorted.slice(5).forEach(p => toHide.add(p.symbol))
    }
    return toHide
  })

  const toggleSymbol = (sym: string) => {
    setHiddenSymbols(prev => {
      const next = new Set(prev)
      if (next.has(sym)) next.delete(sym)
      else next.add(sym)
      return next
    })
  }

  const [sinceMyBuy, setSinceMyBuy] = useState(false)

  const symbols    = positions.map(p => p.symbol)
  const nameOf     = useMemo(() => Object.fromEntries(positions.map(p => [p.symbol, p.name || p.symbol])), [positions])
  const sharesOf   = useMemo(() => Object.fromEntries(positions.map(p => [p.symbol, p.shares])), [positions])
  const priceEurOf = useMemo(() => Object.fromEntries(positions.map(p => [p.symbol, p.current_price])), [positions])
  const firstBuyOf    = useMemo(() => Object.fromEntries(positions.map(p => [p.symbol, p.first_purchase_date ?? null])), [positions])
  const buyDatesOf     = useMemo(() => Object.fromEntries(positions.map(p => [p.symbol, new Set(p.buy_dates)])), [positions])
  const allBuyDatesSet = useMemo(() => new Set(positions.flatMap(p => p.buy_dates)), [positions])
  const sellDatesOf    = useMemo(() => Object.fromEntries(positions.map(p => [p.symbol, new Set(p.sell_dates ?? [])])), [positions])
  const allSellDatesSet = useMemo(() => new Set(positions.flatMap(p => p.sell_dates ?? [])), [positions])

  // date → [{sym, event}] for tooltip detail
  const buyEventsByDate = useMemo(() => {
    const map = new Map<string, { sym: string; name: string; shares: number; price_eur: number; total_eur: number }[]>()
    for (const p of positions) {
      for (const ev of p.buy_events ?? []) {
        if (!map.has(ev.date)) map.set(ev.date, [])
        map.get(ev.date)!.push({ sym: p.symbol, name: p.name, shares: ev.shares, price_eur: ev.price_eur, total_eur: ev.total_eur })
      }
    }
    return map
  }, [positions])

  const sellEventsByDate = useMemo(() => {
    const map = new Map<string, { sym: string; name: string; shares: number; price_eur: number; total_eur: number }[]>()
    for (const p of positions) {
      for (const ev of p.sell_events ?? []) {
        if (!map.has(ev.date)) map.set(ev.date, [])
        map.get(ev.date)!.push({ sym: p.symbol, name: p.name, shares: ev.shares, price_eur: ev.price_eur, total_eur: ev.total_eur })
      }
    }
    return map
  }, [positions])

  // Per-symbol intervals where shares > 0, derived from buy/sell events.
  // Clamps running total to 0 (instead of going negative) to tolerate rounding
  // differences between estimated buys and actual sells.
  // Falls back to always-active ([]) only when the computed periods contradict the
  // current position (shares > 0 but no open period) — this means the data is too
  // incomplete to determine the history reliably.
  const activePeriodsOf = useMemo(() => {
    const result: Record<string, { from: string; to: string | null }[]> = {}
    for (const p of positions) {
      // Filter 0-share events — transactions with null shares in the DB produce
      // delta=0 entries that stall the running total.
      const events = [
        ...(p.buy_events  ?? []).map(e => ({ date: e.date, delta:  (e.shares > 0.0001 ? e.shares : 1) })),
        ...(p.sell_events ?? []).map(e => ({ date: e.date, delta: -(e.shares > 0.0001 ? e.shares : 1) })),
      ].sort((a, b) => a.date.localeCompare(b.date))

      if (!events.length) { result[p.symbol] = []; continue }

      let running = 0, start: string | null = null
      const periods: { from: string; to: string | null }[] = []

      for (const ev of events) {
        const wasActive = running > 0.0001
        running = Math.max(0, running + ev.delta)  // clamp — sells slightly exceeding buys is normal rounding
        const isActive = running > 0.0001
        if (!wasActive && isActive)  { start = ev.date }
        else if (wasActive && !isActive && start) { periods.push({ from: start, to: ev.date }); start = null }
      }
      if (start) periods.push({ from: start, to: null })

      // Sanity: position has shares today but algo computed no open period
      // → data too incomplete to be trusted → show line for all dates
      if (p.shares > 0.0001 && !periods.some(pp => pp.to === null)) {
        result[p.symbol] = []
        continue
      }

      result[p.symbol] = periods
    }
    return result
  }, [positions])

  // Stable per-symbol color derived from palette index (not hash) so colors stay distinct
  const colorOf    = useMemo(
    () => Object.fromEntries(symbols.map((sym, i) => [sym, CHART_PALETTE[i % CHART_PALETTE.length]])),
    [symbols]
  )

  const { data, isLoading, isError } = useQuery({
    queryKey: ['price-history', symbols.join(','), period],
    queryFn: () => portfolioApi.priceHistory(symbols, period),
    enabled: symbols.length > 0,
    staleTime: 0,
    gcTime: 0,
    retry: 1,
  })

  type ChartRow = Record<string, number | string | undefined>

  const chartData = useMemo((): ChartRow[] => {
    if (!data) return []
    const dateMap: Record<string, Record<string, number>> = {}
    for (const series of data) {
      for (const pt of series.points) {
        if (!dateMap[pt.date]) dateMap[pt.date] = {}
        dateMap[pt.date][series.symbol] = pt.close
      }
    }
    return Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals } as ChartRow))
  }, [data])

  // When sinceMyBuy is on, normalize each symbol from its own first-buy date
  const baseValues = useMemo(() => {
    if (!chartData.length) return {} as Record<string, number>
    const base: Record<string, number> = {}
    for (const sym of symbols) {
      const cutoff  = sinceMyBuy ? (firstBuyOf[sym] ?? null) : null
      const periods = activePeriodsOf[sym] ?? []
      const first = chartData.find(d => {
        const date = d.date as string
        if (d[sym] === undefined) return false
        if (cutoff && date < cutoff) return false
        if (periods.length > 0 && !periods.some(p => date >= p.from && (p.to === null || date <= p.to))) return false
        return true
      })
      if (first) base[sym] = first[sym] as number
    }
    return base
  }, [chartData, symbols, sinceMyBuy, firstBuyOf, activePeriodsOf])

  const normalisedData = useMemo((): ChartRow[] => {
    const lastNorm: Record<string, number> = {}
    return chartData.map(row => {
      const out: ChartRow = { date: row.date }
      const date = row.date as string
      for (const sym of symbols) {
        const base    = baseValues[sym]
        const val     = row[sym] as number | undefined
        const cutoff  = sinceMyBuy ? (firstBuyOf[sym] ?? null) : null
        const periods = activePeriodsOf[sym] ?? []
        const active  = periods.length === 0 || periods.some(p => date >= p.from && (p.to === null || date <= p.to))
        if (active && base && (!cutoff || date >= cutoff)) {
          if (val !== undefined) {
            const norm = parseFloat(((val / base) * 100).toFixed(2))
            lastNorm[sym] = norm
            out[sym] = norm
          } else if (lastNorm[sym] !== undefined) {
            // Active period but no price data for this date (exchange holiday mismatch):
            // carry-forward so we don't create false gaps.
            out[sym] = lastNorm[sym]
          }
        }
        // inactive → leave undefined → visual gap
      }
      return out
    })
  }, [chartData, baseValues, symbols, sinceMyBuy, firstBuyOf, activePeriodsOf])

  const fxOf = useMemo((): Record<string, number> => {
    if (!data) return {}
    const out: Record<string, number> = {}
    for (const series of data) {
      const eurPrice = priceEurOf[series.symbol]
      const last = series.points[series.points.length - 1]?.close
      if (eurPrice != null && last && last > 0) {
        out[series.symbol] = eurPrice / last
      } else {
        out[series.symbol] = 1
      }
    }
    return out
  }, [data, priceEurOf])

  const cumulativeData = useMemo((): ChartRow[] => {
    const lastSeen: Record<string, number> = {}
    const result: ChartRow[] = []
    for (const row of chartData) {
      const date = row.date as string
      // Update last-seen prices for gap-filling
      for (const sym of symbols) {
        const p = row[sym] as number | undefined
        if (p !== undefined && p > 0) lastSeen[sym] = p
      }
      let total = 0
      let hasAny = false
      for (const sym of symbols) {
        const cutoff  = sinceMyBuy ? (firstBuyOf[sym] ?? null) : null
        if (cutoff && date < cutoff) continue
        const periods = activePeriodsOf[sym] ?? []
        const active  = periods.length === 0 || periods.some(p => date >= p.from && (p.to === null || date <= p.to))
        if (!active) continue
        // Use today's price or fall back to last seen (carry-forward avoids gap spikes)
        const price = ((row[sym] as number | undefined) ?? lastSeen[sym])
        if (price !== undefined && price > 0) {
          total += sharesOf[sym] * price * (fxOf[sym] ?? 1)
          hasAny = true
        }
      }
      result.push({ date: row.date, total: hasAny ? parseFloat(total.toFixed(2)) : undefined })
    }
    return result
  }, [chartData, symbols, sharesOf, fxOf, sinceMyBuy, firstBuyOf])

  // Ghost key: index-based to avoid dots (Recharts uses dot-notation in dataKey).
  // "ghost0", "ghost1", ... — no external function, no closure risk.
  const ghostKeys = useMemo(
    () => Object.fromEntries(symbols.map((sym, idx) => [sym, `ghost${idx}`])),
    [symbols]
  )

  // Fallback ghost base: first price in chartData regardless of ownership period.
  // Used when baseValues[sym] is undefined (e.g. no active period in current chart range).
  const ghostBaseOf = useMemo(() => {
    const gb: Record<string, number> = {}
    for (const sym of symbols) {
      if (baseValues[sym] !== undefined) {
        gb[sym] = baseValues[sym]
        continue
      }
      const firstRow = chartData.find(r => r[sym] !== undefined)
      if (firstRow) gb[sym] = firstRow[sym] as number
    }
    return gb
  }, [chartData, symbols, baseValues])

  // Extends normalisedData with ghostN keys covering ALL dates where price data exists.
  const normalisedWithGhost = useMemo((): ChartRow[] => {
    const rows = chartData.map((rawRow, i) => {
      const out: ChartRow = { ...normalisedData[i] }
      const date = rawRow.date as string
      for (const sym of symbols) {
        const gk   = ghostKeys[sym]
        const base = ghostBaseOf[sym]
        const val  = rawRow[sym] as number | undefined
        if (gk && base && val !== undefined) {
          out[gk] = parseFloat(((val / base) * 100).toFixed(2))
        }
      }
      return out
    })
    return rows
  }, [chartData, normalisedData, ghostBaseOf, symbols, firstBuyOf, ghostKeys])

  const displayData = cumulative ? cumulativeData : normalisedWithGhost

  // Smart tick reducer: max 8 labels regardless of data density
  const xTicks = useMemo(() => {
    if (!displayData.length) return []
    const total = displayData.length
    if (total <= 8) return displayData.map(d => d.date as string)
    const step = Math.ceil(total / 7)
    return displayData
      .filter((_, i) => i === 0 || i === total - 1 || i % step === 0)
      .map(d => d.date as string)
  }, [displayData])

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    const date      = label as string
    const buyEvs    = buyEventsByDate.get(date) ?? []
    const sellEvs   = sellEventsByDate.get(date) ?? []
    const hasEvents = buyEvs.length > 0 || sellEvs.length > 0
    const dateLabel = (() => {
      try {
        return new Date(date + 'T00:00:00').toLocaleDateString('es-ES', {
          day: 'numeric', month: 'short', year: 'numeric',
        })
      } catch { return date }
    })()
    const fmtShares = (n: number) =>
      n % 1 === 0 ? String(n) : n.toFixed(n < 1 ? 4 : 2)
    return (
      <div className="rounded-xl border border-white/10 bg-[hsl(228_22%_6%)] p-3 text-xs shadow-2xl min-w-[200px] max-w-[260px]">
        {/* Header */}
        <p className="font-semibold text-foreground/60 mb-2 pb-1.5 border-b border-white/[0.07]">{dateLabel}</p>

        {/* Price rows */}
        <div className="space-y-1.5 mb-2">
          {payload.filter((p: any) => !String(p.dataKey).startsWith('ghost')).map((p: any) => (
            <div key={p.dataKey} className="flex items-center justify-between gap-4" style={{ color: p.stroke }}>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: p.stroke }} />
                <span className="truncate max-w-[110px] text-foreground/75">
                  {cumulative ? 'Cartera total' : (nameOf[p.dataKey] || p.dataKey)}
                </span>
              </span>
              <span className="font-bold tabular-nums">
                {cumulative
                  ? formatCurrency(p.value)
                  : `${p.value >= 100 ? '+' : ''}${(p.value - 100).toFixed(2)}%`}
              </span>
            </div>
          ))}
        </div>

        {/* Trade events */}
        {hasEvents && (
          <div className="pt-1.5 border-t border-white/[0.07] space-y-2">
            {buyEvs.map((ev, i) => (
              <div key={`buy-${i}`} className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                  <span className="font-semibold text-primary">Compra</span>
                  <span className="text-foreground/50 truncate">{ev.name}</span>
                </div>
                <div className="pl-3.5 text-foreground/60 tabular-nums">
                  {fmtShares(ev.shares)} acc. × {formatCurrency(ev.price_eur)}
                </div>
                <div className="pl-3.5 font-semibold text-foreground/80 tabular-nums">
                  Total {formatCurrency(ev.total_eur)}
                </div>
              </div>
            ))}
            {sellEvs.map((ev, i) => (
              <div key={`sell-${i}`} className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-orange-400 shrink-0" />
                  <span className="font-semibold text-orange-400">Venta</span>
                  <span className="text-foreground/50 truncate">{ev.name}</span>
                </div>
                <div className="pl-3.5 text-foreground/60 tabular-nums">
                  {fmtShares(ev.shares)} acc. × {formatCurrency(ev.price_eur)}
                </div>
                <div className="pl-3.5 font-semibold text-foreground/80 tabular-nums">
                  Total {formatCurrency(ev.total_eur)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (symbols.length === 0) {
    return <p className="py-8 text-center text-muted-foreground text-sm">Sin posiciones abiertas</p>
  }

  return (
    <div className="space-y-3">
      {/* ── Controls ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/20 p-0.5">
            <button
              onClick={() => setCumulative(false)}
              className={`text-xs px-3 py-2 rounded-md transition-all ${!cumulative ? 'bg-primary/20 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Comparativa
            </button>
            <button
              onClick={() => setCumulative(true)}
              className={`text-xs px-3 py-2 rounded-md transition-all ${cumulative ? 'bg-primary/20 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Valor total
            </button>
          </div>
          <button
            onClick={() => setSinceMyBuy(v => !v)}
            className={`text-xs px-3 py-2 rounded-lg border transition-all ${
              sinceMyBuy
                ? 'border-primary/40 bg-primary/15 text-primary font-semibold'
                : 'border-border bg-muted/20 text-muted-foreground hover:text-foreground'
            }`}
          >
            Desde mi compra
          </button>
        </div>
        <div className="flex gap-0.5 rounded-lg border border-border bg-muted/20 p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`text-xs px-2.5 py-2 rounded-md transition-all ${
                period === p.value
                  ? 'bg-primary/20 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Inline legend pills (comparativa only) ── */}
      {!cumulative && (
        <div className="flex flex-wrap gap-x-2 gap-y-2 px-1">
          {symbols.map(sym => {
            const isHidden = hiddenSymbols.has(sym)
            return (
              <button
                key={sym}
                onClick={() => toggleSymbol(sym)}
                className={cn(
                  "flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full border transition-all",
                  isHidden
                    ? "border-transparent text-muted-foreground opacity-50 hover:bg-white/[0.05]"
                    : "border-white/[0.08] bg-white/[0.02] text-foreground shadow-sm"
                )}
              >
                <span
                  className="inline-block w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: isHidden ? 'transparent' : colorOf[sym], border: isHidden ? `1px solid ${colorOf[sym]}` : 'none' }}
                />
                <span className="truncate max-w-[130px]">{nameOf[sym] || sym}</span>
              </button>
            )
          })}
        </div>
      )}



      {/* ── Chart ── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError || (!isLoading && chartData.length === 0) ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
          <p className="text-sm text-muted-foreground">
            {isError
              ? 'Error al cargar el historial de precios.'
              : 'No hay datos históricos para estas posiciones.'}
          </p>
          <p className="text-xs text-muted-foreground/60">
            Puede que algunos símbolos no estén mapeados a Yahoo Finance todavía.
          </p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={360}>
          <AreaChart data={displayData} margin={{ top: 8, right: 12, left: -4, bottom: 0 }}>
            <defs>
              <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35}/>
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
              </linearGradient>
              {symbols.map((sym, i) => (
                <linearGradient key={sym} id={gradientId(i)} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colorOf[sym]} stopOpacity={0.25}/>
                  <stop offset="95%" stopColor={colorOf[sym]} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid
              strokeDasharray="3 8"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              ticks={xTicks}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))', dy: 6 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickLine={false}
              tickFormatter={d => {
                const [y, m] = (d as string).split('-')
                return `${m}/${y.slice(2)}`
              }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={v => {
                if (!cumulative) {
                  const diff = v - 100
                  return `${diff >= 0 ? '+' : ''}${diff.toFixed(0)}%`
                }
                const a = Math.abs(v)
                if (a >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
                if (a >= 10_000)   return `${(v / 1_000).toFixed(0)}k`
                if (a >= 1_000)    return `${(v / 1_000).toFixed(1)}k`
                return String(Math.round(v))
              }}
              domain={['auto', 'auto']}
              width={50}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
            {cumulative ? (
              <>
                <ReferenceLine
                  y={totalInvested}
                  stroke="rgba(255,255,255,0.18)"
                  strokeDasharray="5 4"
                  ifOverflow="extendDomain"
                  label={{ value: `Invertido ${Math.round(totalInvested)} €`, position: 'insideTopRight', fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="total"
                  stroke="hsl(var(--primary))"
                  fill="url(#colorTotal)"
                  strokeWidth={2.5}
                  connectNulls={false}
                  dot={(props: any) => {
                    const date = props.payload?.date as string
                    const isBuy  = allBuyDatesSet.has(date)
                    const isSell = allSellDatesSet.has(date)
                    if (!isBuy && !isSell) return <g key={`nd-${date}`} />
                    const both = isBuy && isSell
                    return (
                      <g key={`dot-${date}`}>
                        <circle cx={props.cx} cy={props.cy} r={14} fill="transparent" stroke="none" />
                        {isBuy && (
                          <>
                            <circle cx={props.cx} cy={both ? props.cy - 7 : props.cy} r={8}
                              fill="hsl(var(--primary))" fillOpacity={0.15} stroke="none" />
                            <circle cx={props.cx} cy={both ? props.cy - 7 : props.cy} r={5}
                              fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth={2} />
                          </>
                        )}
                        {isSell && (
                          <>
                            <circle cx={props.cx} cy={both ? props.cy + 7 : props.cy} r={8}
                              fill="#f97316" fillOpacity={0.15} stroke="none" />
                            <circle cx={props.cx} cy={both ? props.cy + 7 : props.cy} r={5}
                              fill="#f97316" stroke="hsl(var(--background))" strokeWidth={2} />
                          </>
                        )}
                      </g>
                    )
                  }}
                  activeDot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                />
              </>
            ) : (
              <>
                <ReferenceLine y={100} stroke="rgba(255,255,255,0.12)" strokeDasharray="5 4" />
                {symbols.filter(sym => !hiddenSymbols.has(sym)).flatMap(sym => [
                  <Area
                    key={sym}
                    type="monotone"
                    dataKey={sym}
                    name={sym}
                    stroke={colorOf[sym]}
                    fill={`url(#${gradientId(symbols.indexOf(sym))})`}
                    strokeWidth={2}
                    connectNulls={false}
                    dot={(props: any) => {
                      const date = props.payload?.date as string
                      const isBuy  = buyDatesOf[sym]?.has(date)
                      const isSell = sellDatesOf[sym]?.has(date)
                      if (!isBuy && !isSell) return <g key={`nd-${sym}-${date}`} />
                      const both = isBuy && isSell
                      return (
                        <g key={`dot-${sym}-${date}`}>
                          <circle cx={props.cx} cy={props.cy} r={14} fill="transparent" stroke="none" />
                          {isBuy && (
                            <>
                              <circle cx={props.cx} cy={both ? props.cy - 7 : props.cy} r={8}
                                fill={colorOf[sym]} fillOpacity={0.15} stroke="none" />
                              <circle cx={props.cx} cy={both ? props.cy - 7 : props.cy} r={4.5}
                                fill={colorOf[sym]} stroke="hsl(var(--background))" strokeWidth={2} />
                            </>
                          )}
                          {isSell && (
                            <>
                              <circle cx={props.cx} cy={both ? props.cy + 7 : props.cy} r={8}
                                fill="#f97316" fillOpacity={0.15} stroke="none" />
                              <circle cx={props.cx} cy={both ? props.cy + 7 : props.cy} r={4.5}
                                fill="#f97316" stroke="hsl(var(--background))" strokeWidth={2} />
                            </>
                          )}
                        </g>
                      )
                    }}
                    activeDot={{ r: 4, fill: colorOf[sym], stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                  />,
                  <Area
                    key={`ghost-${sym}`}
                    type="monotone"
                    dataKey={ghostKeys[sym]}
                    stroke={colorOf[sym]}
                    strokeOpacity={0.45}
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    fill={colorOf[sym]}
                    fillOpacity={0}
                    dot={false}
                    activeDot={{ r: 0, strokeWidth: 0 }}
                    connectNulls={true}
                    legendType="none"
                    isAnimationActive={false}
                  />,
                ])}
              </>
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
