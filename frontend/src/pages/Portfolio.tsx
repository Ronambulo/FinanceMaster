import { useQuery } from '@tanstack/react-query'
import { portfolioApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TrendingUp, TrendingDown, DollarSign, Gift, Loader2 } from 'lucide-react'
import { useState } from 'react'

const ASSET_LABELS: Record<string, string> = {
  STOCK: '📈 Acciones',
  FUND: '🌍 Fondos',
  DERIVATIVE: '⚡ Derivados',
}

export function Portfolio() {
  const { data: perf, isLoading } = useQuery({ queryKey: ['portfolio'], queryFn: portfolioApi.performance })
  const { data: history } = useQuery({ queryKey: ['portfolio-history'], queryFn: () => portfolioApi.history({ page_size: 50 }) })
  const [tab, setTab] = useState('positions')

  if (isLoading) return (
    <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
  )

  const openPositions = perf?.positions.filter(p => p.shares > 0.0001) || []
  const closedPositions = perf?.positions.filter(p => p.shares <= 0.0001 && p.realized_pnl !== 0) || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Portfolio de Inversiones</h1>
        <p className="text-sm text-muted-foreground">Seguimiento de tus activos financieros</p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Total invertido</p>
          <p className="text-2xl font-bold">{formatCurrency(perf?.total_invested ?? 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">P&L Realizado</p>
          <p className={`text-2xl font-bold ${(perf?.total_realized_pnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {(perf?.total_realized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(perf?.total_realized_pnl ?? 0)}
          </p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Total dividendos</p>
          <p className="text-2xl font-bold text-emerald-400">+{formatCurrency(perf?.total_dividends ?? 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Comisiones pagadas</p>
          <p className="text-2xl font-bold text-red-400">-{formatCurrency(perf?.total_fees ?? 0)}</p>
        </CardContent></Card>
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
                      <th className="text-right px-4 py-3 font-medium">Precio medio</th>
                      <th className="text-right px-4 py-3 font-medium">Total invertido</th>
                      <th className="text-right px-4 py-3 font-medium hidden md:table-cell">P&L Realizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openPositions.map(p => (
                      <tr key={p.symbol} className="border-b border-border/50 hover:bg-accent/30">
                        <td className="px-4 py-3">
                          <p className="font-medium">{p.name}</p>
                          <div className="flex gap-1 mt-0.5">
                            <Badge variant="muted" className="text-xs">{p.symbol}</Badge>
                            <Badge variant="secondary" className="text-xs">{ASSET_LABELS[p.asset_class] || p.asset_class}</Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">{p.shares.toFixed(4)}</td>
                        <td className="px-4 py-3 text-right">{formatCurrency(p.avg_buy_price)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{formatCurrency(p.total_invested)}</td>
                        <td className={`px-4 py-3 text-right hidden md:table-cell ${p.realized_pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {p.realized_pnl !== 0 ? `${p.realized_pnl >= 0 ? '+' : ''}${formatCurrency(p.realized_pnl)}` : '—'}
                        </td>
                      </tr>
                    ))}
                    {openPositions.length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Sin posiciones abiertas</td></tr>
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
