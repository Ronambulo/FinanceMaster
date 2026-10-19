import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, trApi } from '@/lib/api'
import { cn, formatCurrency, formatDate, applyOverrides } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Plus, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { PriceChart } from '@/components/PriceChart'
import { AddManualPositionModal } from '@/components/AddManualPositionModal'
import { PortfolioAllocationDonut } from '@/components/PortfolioAllocationDonut'
import { OpenPositionsList } from '@/components/OpenPositionsList'

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
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [confirmDeleteManual, setConfirmDeleteManual] = useState<{ id: number; symbol: string } | null>(null)
  const { toast } = useToast()
  const qc = useQueryClient()

  const deleteManualMutation = useMutation({
    mutationFn: (id: number) => portfolioApi.deleteManualPosition(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] })
      qc.invalidateQueries({ queryKey: ['portfolio-live'] })
      toast('Posición eliminada', 'success')
      setConfirmDeleteManual(null)
    },
    onError: () => toast('Error al eliminar', 'error'),
  })

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

  const totalMarketValue = openPositions.reduce((s, p) => s + (p.market_value ?? p.total_invested), 0)
  const totalUnrealized = openPositions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0)
  const totalUnrealizedPct = perf?.total_invested ? (totalUnrealized / perf.total_invested) * 100 : 0

  const recentDividends = (history?.items ?? []).filter(tx => tx.type === 'DIVIDEND').slice(0, 4)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Portfolio de Inversiones</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {trConnected
              ? `Trade Republic · conectado${trStatus?.last_sync ? ` · última sync ${new Date(trStatus.last_sync).toLocaleString('es-ES')}` : ''}`
              : 'Seguimiento de tus activos financieros'}
          </p>
        </div>
        {/* Actions + live indicator */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAddModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Añadir posición</span>
          </Button>
          {livePerf && (
            <Badge variant="success" className="rounded-full px-2.5 py-1 font-medium">
              Posiciones de TR
            </Badge>
          )}
          <span className={cn(
            'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full',
            liveConnected ? 'bg-positive/10 text-positive' : 'bg-muted text-muted-foreground'
          )}>
            <span className={cn('h-1.5 w-1.5 rounded-full', liveConnected ? 'bg-positive animate-pulse' : 'bg-muted-foreground/40')} />
            {liveConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Hero — dominant total portfolio value */}
      <Card className="relative overflow-hidden rounded-2xl card-hover">
        <div className="pointer-events-none absolute -top-10 -right-10 h-56 w-56 rounded-full bg-primary/[0.06] blur-3xl" />
        <CardContent className="relative z-10 p-6 sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Valor de mercado actual</p>
              <p className="font-display text-4xl sm:text-5xl font-semibold tracking-tight tabular-nums mt-2">
                {totalMarketValue > 0 ? formatCurrency(totalMarketValue) : '—'}
              </p>
              <div className="flex flex-wrap items-center gap-2.5 mt-3">
                {totalMarketValue > 0 && (
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums',
                    totalUnrealized >= 0 ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'
                  )}>
                    {totalUnrealized >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {totalUnrealized >= 0 ? '+' : ''}{formatCurrency(totalUnrealized)}
                    {perf?.total_invested ? ` (${totalUnrealized >= 0 ? '+' : ''}${totalUnrealizedPct.toFixed(1)}%)` : ''}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">coste {formatCurrency(perf?.total_invested ?? 0)}</span>
              </div>
            </div>

            {/* Secondary stats — smaller than the hero number on purpose */}
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <div>
                <p className="text-xs text-muted-foreground">P&amp;L realizado</p>
                <p className={cn('text-base font-semibold tabular-nums mt-0.5', (perf?.total_realized_pnl ?? 0) >= 0 ? 'text-positive' : 'text-negative')}>
                  {(perf?.total_realized_pnl ?? 0) >= 0 ? '+' : ''}{formatCurrency(perf?.total_realized_pnl ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Dividendos</p>
                <p className="text-base font-semibold tabular-nums mt-0.5 text-positive">+{formatCurrency(perf?.total_dividends ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Comisiones</p>
                <p className="text-base font-semibold tabular-nums mt-0.5 text-muted-foreground">-{formatCurrency(perf?.total_fees ?? 0)}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
          <Card className="relative overflow-hidden rounded-2xl card-hover">
            <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/[0.04] blur-3xl" />
            <CardContent className="relative z-10 p-0">
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-border/50">
                {perf?.dividends_by_asset.map(d => (
                  <div key={d.symbol} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{d.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="muted" className="text-xs">{d.symbol}</Badge>
                        <span className="text-xs text-muted-foreground">{d.count} pagos</span>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-positive shrink-0 tabular-nums">+{formatCurrency(d.total)}</p>
                  </div>
                ))}
                {(perf?.dividends_by_asset.length === 0) && (
                  <p className="px-4 py-8 text-center text-muted-foreground text-sm">Sin dividendos registrados</p>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
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
                        <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">{d.count}</td>
                        <td className="px-4 py-3 text-right font-semibold text-positive tabular-nums">+{formatCurrency(d.total)}</td>
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
          <Card className="relative overflow-hidden rounded-2xl card-hover">
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
                    <p className={`text-sm font-semibold shrink-0 tabular-nums ${tx.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
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
                        <td className="px-4 py-3 text-right text-muted-foreground tabular-nums hidden md:table-cell">{tx.shares?.toFixed(4)}</td>
                        <td className="px-4 py-3 text-right text-muted-foreground tabular-nums hidden md:table-cell">{tx.price ? formatCurrency(tx.price) : '—'}</td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${tx.amount >= 0 ? 'text-positive' : 'text-negative'}`}>
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
          <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1.5fr_1fr]">
            {/* Columna izquierda: evolución + posiciones */}
            <div className="flex min-w-0 flex-col gap-4">
              <Card className="relative overflow-hidden rounded-2xl card-hover">
                <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/[0.04] blur-3xl" />
                <CardHeader className="relative z-10 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Evolución</CardTitle>
                </CardHeader>
                <CardContent className="relative z-10 p-5 pt-0">
                  <PriceChart positions={openPositions.filter(p => p.shares > 0.0001)} totalInvested={perf?.total_invested ?? 0} />
                </CardContent>
              </Card>

              <OpenPositionsList
                positions={openPositions}
                totalMarketValue={totalMarketValue}
                totalUnrealized={totalUnrealized}
                onDeleteManual={(id, symbol) => setConfirmDeleteManual({ id, symbol })}
              />
            </div>

            {/* Columna derecha: distribución + dividendos */}
            <div className="flex flex-col gap-4">
              <Card className="relative overflow-hidden rounded-2xl card-hover">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Distribución</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <PortfolioAllocationDonut positions={openPositions} total={totalMarketValue} />
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden rounded-2xl card-hover">
                <CardContent className="p-5">
                  <p className="text-xs text-muted-foreground">Dividendos recibidos</p>
                  <p className="font-display text-2xl font-semibold tabular-nums mt-1.5">
                    +{formatCurrency(perf?.total_dividends ?? 0)}
                  </p>
                  <div className="h-px bg-border my-3.5" />
                  <div className="space-y-2.5">
                    {recentDividends.length > 0 ? recentDividends.map(tx => (
                      <div key={tx.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-muted-foreground">{tx.name}</span>
                        <span className="shrink-0 font-medium tabular-nums">{formatDate(tx.date)} · +{formatCurrency(tx.amount)}</span>
                      </div>
                    )) : (
                      <p className="text-xs text-muted-foreground">Sin pagos recientes</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AddManualPositionModal open={addModalOpen} onClose={() => setAddModalOpen(false)} />

      <Dialog open={confirmDeleteManual !== null} onOpenChange={open => !open && setConfirmDeleteManual(null)}>
        <DialogContent className="max-w-[320px]">
          <DialogHeader>
            <DialogTitle className="text-negative flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              Eliminar posición
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1">
            Se eliminará la posición manual de {confirmDeleteManual?.symbol}. Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteManual(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteManualMutation.isPending}
              onClick={() => confirmDeleteManual && deleteManualMutation.mutate(confirmDeleteManual.id)}
            >
              {deleteManualMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
