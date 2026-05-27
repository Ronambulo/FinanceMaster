import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portfolioApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Pencil, Check, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { PortfolioPosition } from '@/lib/api'

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
          className="text-emerald-400 hover:text-emerald-300"
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
        <h1 className="text-2xl font-bold">Portfolio de Inversiones</h1>
        <p className="text-sm text-muted-foreground">Seguimiento de tus activos financieros</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Valor de mercado actual</p>
          <p className="text-2xl font-bold">{totalMarketValue > 0 ? formatCurrency(totalMarketValue) : '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">Coste: {formatCurrency(perf?.total_invested ?? 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">P&L No realizado</p>
          <p className={`text-2xl font-bold ${totalUnrealized >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {totalMarketValue > 0
              ? `${totalUnrealized >= 0 ? '+' : ''}${formatCurrency(totalUnrealized)}`
              : '—'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">P&L Realizado: {(perf?.total_realized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(perf?.total_realized_pnl ?? 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Dividendos recibidos</p>
          <p className="text-2xl font-bold text-emerald-400">+{formatCurrency(perf?.total_dividends ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">Comisiones: -{formatCurrency(perf?.total_fees ?? 0)}</p>
        </CardContent></Card>
      </div>

      <div className="text-xs text-muted-foreground bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
        💡 Los precios en tiempo real se obtienen de Yahoo Finance y se convierten automáticamente a EUR. Puedes editar el precio haciendo hover sobre la columna "Precio actual (€)" y clicando el lápiz — se muestra en amarillo.
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="positions">Posiciones abiertas ({openPositions.length})</TabsTrigger>
          <TabsTrigger value="closed">Posiciones cerradas ({closedPositions.length})</TabsTrigger>
          <TabsTrigger value="dividends">Dividendos</TabsTrigger>
          <TabsTrigger value="history">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="positions">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
                              <span className={p.unrealized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {p.unrealized_pnl >= 0 ? '+' : ''}{formatCurrency(p.unrealized_pnl)}
                              </span>
                              <p className={`text-xs ${p.unrealized_pnl_pct != null && p.unrealized_pnl_pct >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
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
                        <td className={`px-4 py-3 text-right font-semibold ${p.realized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
                        <td className="px-4 py-3 text-right font-semibold text-emerald-400">+{formatCurrency(d.total)}</td>
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
              <div className="overflow-x-auto">
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
                        <td className={`px-4 py-3 text-right font-semibold ${tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
      </Tabs>
    </div>
  )
}
