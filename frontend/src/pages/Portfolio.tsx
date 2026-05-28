import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Pencil, Check, X } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { PortfolioPosition } from '@/lib/api'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
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

/* ─── Deterministic HSL color from ticker symbol ─────────────── */
function symbolColor(sym: string): string {
  let hash = 0
  for (let i = 0; i < sym.length; i++) hash = sym.charCodeAt(i) + ((hash << 5) - hash)
  const h = Math.abs(hash) % 360
  return `hsl(${h}, 70%, 60%)`
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

function PriceChart({ symbols }: { symbols: string[] }) {
  const [period, setPeriod] = useState('1y')

  const { data, isLoading } = useQuery({
    queryKey: ['price-history', symbols.join(','), period],
    queryFn: () => portfolioApi.priceHistory(symbols, period),
    enabled: symbols.length > 0,
    staleTime: 5 * 60_000, // 5 min — Yahoo Finance data
  })

  type ChartRow = Record<string, number | string>

  // Merge all series into one array keyed by date
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

  // Normalised (base-100) chart data so different-priced stocks are comparable
  const baseValues: Record<string, number> = useMemo(() => {
    if (!chartData.length) return {}
    const base: Record<string, number> = {}
    for (const sym of symbols) {
      const first = chartData.find(d => d[sym] !== undefined)
      if (first) base[sym] = first[sym] as number
    }
    return base
  }, [chartData, symbols])

  const normalised = useMemo((): ChartRow[] =>
    chartData.map(row => {
      const out: ChartRow = { date: row.date }
      for (const sym of symbols) {
        const base = baseValues[sym]
        const val  = row[sym] as number | undefined
        if (base && val !== undefined) out[sym] = parseFloat(((val / base) * 100).toFixed(2))
      }
      return out
    }), [chartData, baseValues, symbols])

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="rounded-lg border border-white/10 bg-[hsl(228_22%_7%)] p-3 text-xs shadow-xl">
        <p className="font-medium text-foreground/70 mb-1.5">{label}</p>
        {payload.map((p: any) => (
          <p key={p.dataKey} className="flex items-center gap-1.5" style={{ color: p.stroke }}>
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.stroke }} />
            {p.dataKey}: <span className="font-semibold ml-auto pl-3">{p.value}%</span>
          </p>
        ))}
      </div>
    )
  }

  if (symbols.length === 0) {
    return <p className="py-8 text-center text-muted-foreground text-sm">Sin posiciones abiertas</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Rendimiento relativo base 100 — comparativa entre activos</p>
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                period === p.value
                  ? 'bg-primary/20 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={normalised} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false} tickLine={false}
              tickFormatter={d => d.slice(5)} // show MM-DD
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false} tickLine={false}
              tickFormatter={v => `${v}`}
              domain={['auto', 'auto']}
            />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }} />
            {symbols.map(sym => (
              <Line
                key={sym}
                type="monotone"
                dataKey={sym}
                stroke={symbolColor(sym)}
                strokeWidth={1.8}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
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

export function Portfolio() {
  const { data: perf, isLoading } = useQuery({ queryKey: ['portfolio'], queryFn: portfolioApi.performance })
  const { data: history } = useQuery({ queryKey: ['portfolio-history'], queryFn: () => portfolioApi.history({ page_size: 50 }) })
  const [tab, setTab] = useState('positions')
  const [, refresh] = useState(0)

  if (isLoading) return (
    <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  )

  const rawPositions = perf?.positions || []
  const positions = applyOverrides(rawPositions)

  const openPositions = positions.filter(p => p.shares > 0.0001)
  const closedPositions = positions.filter(p => p.shares <= 0.0001 && p.realized_pnl !== 0)

  const totalMarketValue = openPositions.reduce((s, p) => s + (p.market_value ?? p.total_invested), 0)
  const totalUnrealized = openPositions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Portfolio de Inversiones</h1>
        <p className="text-sm text-muted-foreground">Seguimiento de tus activos financieros</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Valor de mercado actual</p>
          <p className="text-xl font-semibold tracking-tight">{totalMarketValue > 0 ? formatCurrency(totalMarketValue) : '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">Coste: {formatCurrency(perf?.total_invested ?? 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">P&L No realizado</p>
          <p className={`text-xl font-semibold tracking-tight ${totalUnrealized >= 0 ? 'text-positive' : 'text-negative'}`}>
            {totalMarketValue > 0
              ? `${totalUnrealized >= 0 ? '+' : ''}${formatCurrency(totalUnrealized)}`
              : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">P&L Realizado: {(perf?.total_realized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(perf?.total_realized_pnl ?? 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Dividendos recibidos</p>
          <p className="text-xl font-semibold tracking-tight text-positive">+{formatCurrency(perf?.total_dividends ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">Comisiones: -{formatCurrency(perf?.total_fees ?? 0)}</p>
        </CardContent></Card>
      </div>

      <div className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
        💡 Los precios en tiempo real se obtienen de Yahoo Finance y se convierten automáticamente a EUR. Puedes editar el precio haciendo hover sobre la columna "Precio actual (€)" y clicando el lápiz — se muestra en amarillo.
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        {/* Scrollable tab list on mobile */}
        <div className="overflow-x-auto pb-0.5">
          <TabsList className="w-max min-w-full sm:w-auto">
            <TabsTrigger value="positions">Posiciones ({openPositions.length})</TabsTrigger>
            <TabsTrigger value="closed">Cerradas ({closedPositions.length})</TabsTrigger>
            <TabsTrigger value="dividends">Dividendos</TabsTrigger>
            <TabsTrigger value="history">Historial</TabsTrigger>
            <TabsTrigger value="charts">📈 Gráficas</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="positions">
          <Card>
            <CardContent className="p-0">
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-border/50">
                {openPositions.map(p => (
                  <div key={p.symbol} className="px-4 py-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{p.name}</p>
                        <div className="flex gap-1 mt-0.5">
                          <Badge variant="muted" className="text-xs">{p.symbol}</Badge>
                          <Badge variant="secondary" className="text-xs">{ASSET_LABELS[p.asset_class] || p.asset_class}</Badge>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold text-sm">
                          {p.market_value != null ? formatCurrency(p.market_value) : formatCurrency(p.total_invested)}
                        </p>
                        {p.unrealized_pnl != null && (
                          <p className={`text-xs font-medium ${p.unrealized_pnl >= 0 ? 'text-positive' : 'text-negative'}`}>
                            {p.unrealized_pnl >= 0 ? '+' : ''}{formatCurrency(p.unrealized_pnl)}
                            {p.unrealized_pnl_pct != null && (
                              <span className="ml-1 opacity-80">
                                ({p.unrealized_pnl_pct >= 0 ? '+' : ''}{p.unrealized_pnl_pct.toFixed(1)}%)
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{p.shares.toFixed(4)} acc. · P.med. {formatCurrency(p.avg_buy_price)}</span>
                      {p.current_price && (
                        <span>Actual: {formatCurrency(p.current_price)}</span>
                      )}
                    </div>
                  </div>
                ))}
                {openPositions.length === 0 && (
                  <p className="px-4 py-8 text-center text-muted-foreground text-sm">Sin posiciones abiertas</p>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-4 py-3 font-medium">Activo</th>
                      <th className="text-right px-4 py-3 font-medium">Acciones</th>
                      <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Precio medio</th>
                      <th className="text-right px-4 py-3 font-medium hidden md:table-cell">Precio actual (€)</th>
                      <th className="text-right px-4 py-3 font-medium">Valor mercado</th>
                      <th className="text-right px-4 py-3 font-medium hidden lg:table-cell">P&L no realizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openPositions.map(p => (
                      <tr key={p.symbol} className="border-b border-border/50 hover:bg-accent/30 group">
                        <td className="px-4 py-3">
                          <p className="font-medium">{p.name}</p>
                          <div className="flex gap-1 mt-0.5">
                            <Badge variant="muted" className="text-xs">{p.symbol}</Badge>
                            <Badge variant="secondary" className="text-xs">{ASSET_LABELS[p.asset_class] || p.asset_class}</Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{p.shares.toFixed(6)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">{formatCurrency(p.avg_buy_price)}</td>
                        <td className="px-4 py-3 text-right hidden md:table-cell">
                          <EditablePrice
                            symbol={p.symbol}
                            currentPrice={p.current_price}
                            onSave={() => refresh(r => r + 1)}
                          />
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {p.market_value != null ? formatCurrency(p.market_value) : formatCurrency(p.total_invested)}
                        </td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          {p.unrealized_pnl != null ? (
                            <div>
                              <span className={p.unrealized_pnl >= 0 ? 'text-positive' : 'text-negative'}>
                                {p.unrealized_pnl >= 0 ? '+' : ''}{formatCurrency(p.unrealized_pnl)}
                              </span>
                              <p className={`text-xs ${p.unrealized_pnl_pct != null && p.unrealized_pnl_pct >= 0 ? 'text-positive/70' : 'text-negative/70'}`}>
                                {p.unrealized_pnl_pct != null ? `${p.unrealized_pnl_pct >= 0 ? '+' : ''}${p.unrealized_pnl_pct.toFixed(2)}%` : ''}
                              </p>
                            </div>
                          ) : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                    {openPositions.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Sin posiciones abiertas</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closed">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-4 py-3 font-medium">Activo</th>
                      <th className="text-right px-4 py-3 font-medium">P&L Realizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedPositions.map(p => (
                      <tr key={p.symbol} className="border-b border-border/50">
                        <td className="px-4 py-3">
                          <p className="font-medium">{p.name}</p>
                          <Badge variant="muted" className="text-xs">{p.symbol}</Badge>
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${p.realized_pnl >= 0 ? 'text-positive' : 'text-negative'}`}>
                          {p.realized_pnl >= 0 ? '+' : ''}{formatCurrency(p.realized_pnl)}
                        </td>
                      </tr>
                    ))}
                    {closedPositions.length === 0 && (
                      <tr><td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">Sin posiciones cerradas</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dividends">
          <Card>
            <CardContent className="p-0">
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
          <Card>
            <CardContent className="p-0">
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
          <Card>
            <CardContent className="p-5">
              <PriceChart symbols={openPositions.map(p => p.symbol)} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
