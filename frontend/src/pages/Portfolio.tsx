import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, trApi } from '@/lib/api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Pencil, Check, X, Radio, Plus, Trash2, Search } from 'lucide-react'
import { useState, useEffect, useRef, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { PortfolioPosition, StockSearchResult } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts'

const ASSET_LABELS: Record<string, string> = {
  STOCK: '📈 Acciones',
  FUND: '🌍 Fondos',
  DERIVATIVE: '⚡ Derivados',
}

const PRICE_OVERRIDES_KEY = 'fm_price_overrides'

function getPriceOverrides(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(PRICE_OVERRIDES_KEY) || '{}') } catch { return {} }
}

function setPriceOverride(symbol: string, price: number | null) {
  const overrides = getPriceOverrides()
  if (price === null) {
    delete overrides[symbol]
  } else {
    overrides[symbol] = price
  }
  localStorage.setItem(PRICE_OVERRIDES_KEY, JSON.stringify(overrides))
}

function EditablePrice({ symbol, currentPrice, onSave }: { symbol: string; currentPrice: number | null; onSave: () => void }) {
  const overrides = getPriceOverrides()
  const overrideVal = overrides[symbol]
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(overrideVal ?? currentPrice ?? ''))

  const displayed = overrideVal != null ? overrideVal : currentPrice

  if (editing) {
    return (
      <div className="flex items-center gap-1 justify-end">
        <Input
          type="number"
          step="0.01"
          value={val}
          onChange={e => setVal(e.target.value)}
          className="h-6 w-24 text-xs text-right"
          autoFocus
        />
        <button
          className="text-primary hover:text-primary/80"
          onClick={() => {
            const n = parseFloat(val)
            if (!isNaN(n) && n > 0) {
              setPriceOverride(symbol, n)
            } else {
              setPriceOverride(symbol, null)
            }
            setEditing(false)
            onSave()
          }}
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button className="text-muted-foreground hover:text-foreground" onClick={() => setEditing(false)}>
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 justify-end group/price">
      <span className={overrideVal != null ? 'text-amber-400' : ''}>
        {displayed != null ? formatCurrency(displayed) : <span className="text-muted-foreground text-xs">—</span>}
      </span>
      {overrideVal != null && <span className="text-xs text-amber-400/60" title="Precio manual">✎</span>}
      <button
        className="opacity-0 group-hover/price:opacity-100 transition-opacity ml-0.5 text-muted-foreground hover:text-foreground"
        onClick={() => { setVal(String(overrideVal ?? currentPrice ?? '')); setEditing(true) }}
        title="Editar precio actual"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  )
}

/* ─── Price history chart ─────────────────────────────────────── */
const PERIODS = [
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y',  label: '1A' },
  { value: '2y',  label: '2A' },
  { value: '5y',  label: '5A' },
]

// Distinct palette – ensures visually separated colors even with many positions
const CHART_PALETTE = [
  '#818cf8', // indigo
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f472b6', // pink
  '#38bdf8', // sky
  '#fb923c', // orange
  '#a78bfa', // violet
  '#4ade80', // green
  '#f87171', // red
  '#22d3ee', // cyan
  '#e879f9', // fuchsia
  '#facc15', // yellow
]

function symbolColor(sym: string): string {
  let hash = 0
  for (let i = 0; i < sym.length; i++) hash = sym.charCodeAt(i) + ((hash << 5) - hash)
  return CHART_PALETTE[Math.abs(hash) % CHART_PALETTE.length]
}

// SVG ids cannot contain spaces or special chars — use a stable index-based id
function gradientId(index: number): string {
  return `cgr_${index}`
}

function PriceChart({ positions, totalInvested = 0 }: { positions: PortfolioPosition[]; totalInvested?: number }) {
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
    // Debug: log state for each symbol so we can identify failures in the browser console
    for (const sym of symbols) {
      const gk   = ghostKeys[sym]
      const base = ghostBaseOf[sym]
      const firstBuy = firstBuyOf[sym]
      const gapRow = chartData.find(r => {
        const d = r.date as string
        return d > '2025-11-30' && d < '2026-06-01'
      })
      console.log(`[ghost:${sym}] gk=${gk} base=${base} firstBuy=${firstBuy}`, {
        gapDate: gapRow?.date,
        gapRawVal: gapRow ? gapRow[sym] : 'NO_GAP_ROW_IN_DATE_RANGE',
        ghostInGap: gapRow ? rows.find(r => r.date === gapRow.date)?.[gk ?? ''] : 'N/A',
        totalRows: rows.length,
        rowsWithGhost: rows.filter(r => r[gk ?? ''] !== undefined).length,
      })
    }
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
              className={`text-xs px-3 py-1.5 rounded-md transition-all ${!cumulative ? 'bg-primary/20 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Comparativa
            </button>
            <button
              onClick={() => setCumulative(true)}
              className={`text-xs px-3 py-1.5 rounded-md transition-all ${cumulative ? 'bg-primary/20 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Valor total
            </button>
          </div>
          <button
            onClick={() => setSinceMyBuy(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-all ${
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
              className={`text-xs px-2.5 py-1.5 rounded-md transition-all ${
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

function applyOverrides(positions: PortfolioPosition[]): PortfolioPosition[] {
  const overrides = getPriceOverrides()
  return positions.map(p => {
    const override = overrides[p.symbol]
    if (override != null && p.shares > 0.0001) {
      const market_value = round2(p.shares * override)
      const unrealized_pnl = round2(market_value - p.total_invested)
      const unrealized_pnl_pct = p.total_invested > 0 ? round2((unrealized_pnl / p.total_invested) * 100) : 0
      return { ...p, current_price: override, market_value, unrealized_pnl, unrealized_pnl_pct }
    }
    return p
  })
}

function round2(v: number) { return Math.round(v * 100) / 100 }

function AddManualPositionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [query, setQuery]           = useState('')
  const [results, setResults]       = useState<StockSearchResult[]>([])
  const [searching, setSearching]   = useState(false)
  const [selected, setSelected]     = useState<StockSearchResult | null>(null)
  const [shares, setShares]         = useState('')
  const [avgPrice, setAvgPrice]     = useState('')
  const [saving, setSaving]         = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout>>()

  const addMutation = useMutation({
    mutationFn: portfolioApi.addManualPosition,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] })
      qc.invalidateQueries({ queryKey: ['portfolio-live'] })
      toast('Posición añadida correctamente', 'success')
      handleClose()
    },
    onError: () => toast('Error al añadir la posición', 'error'),
  })

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await portfolioApi.searchStocks(query)
        setResults(data)
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 350)
    return () => clearTimeout(debounce.current)
  }, [query])

  function handleSelect(r: StockSearchResult) {
    setSelected(r)
    setQuery(r.name)
    setResults([])
  }

  function handleClose() {
    setQuery(''); setResults([]); setSelected(null)
    setShares(''); setAvgPrice(''); setSaving(false)
    onClose()
  }

  function handleSubmit() {
    if (!selected || !shares || !avgPrice) return
    const sharesNum = parseFloat(shares.replace(',', '.'))
    const priceNum  = parseFloat(avgPrice.replace(',', '.'))
    if (isNaN(sharesNum) || isNaN(priceNum) || sharesNum <= 0 || priceNum <= 0) {
      toast('Introduce valores válidos', 'error'); return
    }
    addMutation.mutate({ ticker: selected.ticker, name: selected.name, shares: sharesNum, avg_price_eur: priceNum, currency: selected.currency })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/[0.08] bg-card shadow-2xl p-6 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Añadir posición manual</h2>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">Buscar acción / ETF</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Apple, MSCI World, AAPL…"
              value={query}
              onChange={e => { setQuery(e.target.value); if (selected) setSelected(null) }}
              autoFocus
            />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          {/* Results dropdown */}
          {results.length > 0 && (
            <div className="rounded-xl border border-white/[0.08] bg-popover shadow-xl overflow-hidden">
              {results.map(r => (
                <button
                  key={r.ticker}
                  onClick={() => handleSelect(r)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.05] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    <p className="text-[11px] text-muted-foreground">{r.ticker} · {r.exchange} · {r.currency}</p>
                  </div>
                  {r.type_disp && (
                    <span className="shrink-0 text-[10px] text-muted-foreground/60 border border-border rounded px-1.5 py-0.5">
                      {r.type_disp}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Fields — shown once a ticker is selected */}
        {selected && (
          <>
            <div className="rounded-xl border border-primary/20 bg-primary/[0.06] px-3 py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{selected.name}</p>
                <p className="text-[11px] text-muted-foreground">{selected.ticker} · {selected.exchange}</p>
              </div>
              <button onClick={() => { setSelected(null); setQuery('') }} className="text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Nº de acciones</label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="10"
                  value={shares}
                  onChange={e => setShares(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground font-medium">Precio medio (€/acción)</label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="150.00"
                  value={avgPrice}
                  onChange={e => setAvgPrice(e.target.value)}
                />
              </div>
            </div>

            {shares && avgPrice && (
              <p className="text-xs text-muted-foreground">
                Coste total estimado: <span className="text-foreground font-medium">
                  {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(
                    parseFloat(shares.replace(',', '.')) * parseFloat(avgPrice.replace(',', '.'))
                  )}
                </span>
              </p>
            )}
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={handleClose}>Cancelar</Button>
          <Button
            className="flex-1"
            disabled={!selected || !shares || !avgPrice || addMutation.isPending}
            onClick={handleSubmit}
          >
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Añadir posición'}
          </Button>
        </div>
      </div>
    </div>
  )
}


export function Portfolio() {
  const { data: trStatus } = useQuery({ queryKey: ['tr-status'], queryFn: trApi.status, staleTime: 30_000 })
  const trConnected = trStatus?.connected ?? false

  // Always load calculated portfolio from DB
  const { data: calcPerf, isLoading } = useQuery({
    queryKey: ['portfolio'],
    queryFn: portfolioApi.performance,
    staleTime: 60_000,
  })

  // When TR is connected, also fetch live positions and overlay them
  const { data: livePerf } = useQuery({
    queryKey: ['portfolio-live'],
    queryFn: portfolioApi.livePerformance,
    enabled: trConnected,
    staleTime: 60_000,
    retry: false,
  })

  const perf = livePerf ?? calcPerf

  const { data: history } = useQuery({ queryKey: ['portfolio-history'], queryFn: () => portfolioApi.history({ page_size: 50 }) })
  const [tab, setTab] = useState('charts')
  const [, refresh] = useState(0)
  const [addModalOpen, setAddModalOpen] = useState(false)
  const { toast } = useToast()
  const qc = useQueryClient()

  // ── SSE live price stream ──────────────────────────────────────────────────
  const [livePrices, setLivePrices] = useState<Record<string, number>>({})
  const [liveConnected, setLiveConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('fm_token')
    if (!token) return

    function connect() {
      const es = new EventSource(`/api/portfolio/stream-prices?token=${token}`)
      esRef.current = es

      es.onopen = () => setLiveConnected(true)
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.prices) setLivePrices(prev => ({ ...prev, ...data.prices }))
        } catch {}
      }
      es.onerror = () => {
        setLiveConnected(false)
        es.close()
        // Reconnect after 30s
        setTimeout(connect, 30_000)
      }
    }

    connect()
    return () => {
      esRef.current?.close()
      setLiveConnected(false)
    }
  }, [])

  if (isLoading) return (
    <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  )

  const rawPositions = perf?.positions || []
  // Apply live prices on top of server prices
  const rawWithLive = rawPositions.map(p => {
    const live = livePrices[p.symbol]
    if (!live) return p
    const market_value = live * p.shares
    return {
      ...p,
      current_price: live,
      market_value,
      unrealized_pnl: market_value - p.total_invested,
      unrealized_pnl_pct: p.total_invested > 0 ? ((market_value - p.total_invested) / p.total_invested) * 100 : 0,
    }
  })
  const positions = applyOverrides(rawWithLive)

  // Show positions with cost > 0 even if shares are unknown (null from TR sync)
  const openPositions = positions.filter(p => p.shares > 0.0001 || p.total_invested > 0)
  const closedPositions = positions.filter(p => p.shares <= 0.0001 && p.total_invested <= 0 && p.realized_pnl !== 0)

  const totalMarketValue = openPositions.reduce((s, p) => s + (p.market_value ?? p.total_invested), 0)
  const totalUnrealized = openPositions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Portfolio de Inversiones</h1>
          <p className="text-sm text-muted-foreground">Seguimiento de tus activos financieros</p>
        </div>
        {/* Actions + live indicator */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Añadir posición</span>
          </Button>
          {livePerf && (
            <span className="text-xs text-emerald-400/70 bg-emerald-500/10 px-2 py-1 rounded-full">
              Posiciones de TR
            </span>
          )}
          <div className={cn(
            'flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
            liveConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[0.05] text-muted-foreground'
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', liveConnected ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground/40')} />
            {liveConnected ? 'Live' : 'Offline'}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
          <div className="pointer-events-none absolute -top-8 -right-8 h-32 w-32 rounded-full bg-primary/[0.05] blur-2xl" />
          <CardContent className="relative z-10 p-5">
          <p className="text-xs text-muted-foreground mb-1">Valor de mercado actual</p>
          <p className="text-xl font-semibold tracking-tight">{totalMarketValue > 0 ? formatCurrency(totalMarketValue) : '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">Coste: {formatCurrency(perf?.total_invested ?? 0)}</p>
        </CardContent></Card>
        <Card className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
          <div className="pointer-events-none absolute -top-8 -right-8 h-32 w-32 rounded-full bg-primary/[0.05] blur-2xl" />
          <CardContent className="relative z-10 p-5">
          <p className="text-xs text-muted-foreground mb-1">P&L No realizado</p>
          <p className={`text-xl font-semibold tracking-tight ${totalUnrealized >= 0 ? 'text-positive' : 'text-negative'}`}>
            {totalMarketValue > 0
              ? `${totalUnrealized >= 0 ? '+' : ''}${formatCurrency(totalUnrealized)}`
              : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">P&L Realizado: {(perf?.total_realized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(perf?.total_realized_pnl ?? 0)}</p>
        </CardContent></Card>
        <Card className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
          <div className="pointer-events-none absolute -top-8 -right-8 h-32 w-32 rounded-full bg-positive/[0.05] blur-2xl" />
          <CardContent className="relative z-10 p-5">
          <p className="text-xs text-muted-foreground mb-1">Dividendos recibidos</p>
          <p className="text-xl font-semibold tracking-tight text-positive">+{formatCurrency(perf?.total_dividends ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">Comisiones: -{formatCurrency(perf?.total_fees ?? 0)}</p>
        </CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Scrollable tab list on mobile */}
        <div className="overflow-x-auto pb-0.5">
          <TabsList className="w-max min-w-full sm:w-auto">
            <TabsTrigger value="charts">📈 Gráficas</TabsTrigger>
            <TabsTrigger value="dividends">Dividendos</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
          </TabsList>
        </div>


        <TabsContent value="dividends">
          <Card className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
            <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/[0.04] blur-3xl" />
            <CardContent className="relative z-10 p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-4 py-3 font-medium">Activo</th>
                      <th className="text-right px-4 py-3 font-medium">Pagos</th>
                      <th className="text-right px-4 py-3 font-medium">Total recibido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perf?.dividends_by_asset.map(d => (
                      <tr key={d.symbol} className="border-b border-border/50">
                        <td className="px-4 py-3">
                          <p className="font-medium">{d.name}</p>
                          <Badge variant="muted" className="text-xs">{d.symbol}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">{d.count}</td>
                        <td className="px-4 py-3 text-right font-semibold text-positive">+{formatCurrency(d.total)}</td>
                      </tr>
                    ))}
                    {(perf?.dividends_by_asset.length === 0) && (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Sin dividendos registrados</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
            <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/[0.04] blur-3xl" />
            <CardContent className="relative z-10 p-0">
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-border/50">
                {history?.items.map(tx => (
                  <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-medium text-sm truncate">{tx.name}</p>
                        <Badge variant={tx.type === 'BUY' ? 'default' : tx.type === 'SELL' ? 'destructive' : 'success'} className="text-xs">
                          {tx.type === 'BUY' ? 'Compra' : tx.type === 'SELL' ? 'Venta' : tx.type}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDate(tx.date)}</span>
                    </div>
                    <p className={`text-sm font-semibold shrink-0 ${tx.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                    </p>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-4 py-3 font-medium">Fecha</th>
                      <th className="text-left px-4 py-3 font-medium">Operación</th>
                      <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Acciones</th>
                      <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Precio</th>
                      <th className="text-right px-4 py-3 font-medium">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history?.items.map(tx => (
                      <tr key={tx.id} className="border-b border-border/50 hover:bg-accent/30">
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{tx.name}</p>
                          <div className="flex gap-1 mt-0.5">
                            <Badge variant={tx.type === 'BUY' ? 'default' : tx.type === 'SELL' ? 'destructive' : 'success'} className="text-xs">
                              {tx.type === 'BUY' ? 'Compra' : tx.type === 'SELL' ? 'Venta' : tx.type}
                            </Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{tx.shares?.toFixed(4)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{tx.price ? formatCurrency(tx.price) : '—'}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${tx.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
                          {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="charts">
          <div className="grid gap-4 grid-cols-1 md:grid-cols-[3fr_2fr]">
            {/* Gráfica — columna izquierda */}
            <Card className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
              <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/[0.04] blur-3xl" />
              <CardContent className="relative z-10 p-5">
                <PriceChart positions={openPositions.filter(p => p.shares > 0.0001)} totalInvested={perf?.total_invested ?? 0} />
              </CardContent>
            </Card>

            {/* Posiciones — columna derecha */}
            <Card className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
              <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/[0.04] blur-3xl" />
              <CardHeader className="relative z-10 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Posiciones abiertas
                </CardTitle>
              </CardHeader>
              <CardContent className="relative z-10 p-0">
                <div className="divide-y divide-border/50">
                  {openPositions.map(p => {
                    const sharesKnown = p.shares > 0.0001
                    return (
                    <div key={p.symbol} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          {p.is_manual && (
                            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-primary/70 border border-primary/20 rounded px-1 py-0.5">manual</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Badge variant="muted" className="text-xs">{p.symbol}</Badge>
                          <span className="text-xs text-muted-foreground">
                            {sharesKnown ? `${p.shares.toFixed(6)} acc.` : '? acc.'}
                          </span>
                          {!sharesKnown && !p.is_manual && (
                            <span className="text-xs text-amber-400/70" title="Reconecta TR para ver acciones">sync pendiente</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">
                          {sharesKnown && p.market_value != null
                            ? formatCurrency(p.market_value)
                            : formatCurrency(p.total_invested)}
                        </p>
                        {sharesKnown && p.unrealized_pnl != null && (
                          <p className={`text-xs font-medium ${p.unrealized_pnl >= 0 ? 'text-positive' : 'text-negative'}`}>
                            {p.unrealized_pnl >= 0 ? '+' : ''}{formatCurrency(p.unrealized_pnl)}
                            {p.unrealized_pnl_pct != null && (
                              <span className="opacity-70 ml-1">({p.unrealized_pnl_pct >= 0 ? '+' : ''}{p.unrealized_pnl_pct.toFixed(1)}%)</span>
                            )}
                          </p>
                        )}
                      </div>
                      {p.is_manual && p.manual_id != null && (
                        <button
                          onClick={() => portfolioApi.deleteManualPosition(p.manual_id!).then(() => {
                            qc.invalidateQueries({ queryKey: ['portfolio'] })
                            qc.invalidateQueries({ queryKey: ['portfolio-live'] })
                            toast('Posición eliminada', 'success')
                          }).catch(() => toast('Error al eliminar', 'error'))}
                          className="shrink-0 p-1.5 rounded-lg text-muted-foreground/50 hover:text-negative hover:bg-negative/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    )
                  })}
                  {openPositions.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sin posiciones abiertas</p>
                  )}
                </div>

                {/* Totales */}
                {openPositions.length > 0 && (
                  <div className="border-t border-border px-4 py-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Total</span>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatCurrency(totalMarketValue)}</p>
                        <p className={`text-xs font-medium ${totalUnrealized >= 0 ? 'text-positive' : 'text-negative'}`}>
                          {totalUnrealized >= 0 ? '+' : ''}{formatCurrency(totalUnrealized)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <AddManualPositionModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />
    </div>
  )
}
