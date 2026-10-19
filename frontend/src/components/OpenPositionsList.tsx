import { Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatCurrency, symbolColor } from '@/lib/utils'
import type { PortfolioPosition } from '@/lib/api'

export function OpenPositionsList({
  positions,
  totalMarketValue,
  totalUnrealized,
  onDeleteManual,
}: {
  positions: PortfolioPosition[]
  totalMarketValue: number
  totalUnrealized: number
  onDeleteManual: (id: number, symbol: string) => void
}) {
  return (
    <Card className="relative overflow-hidden rounded-2xl card-hover">
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/[0.04] blur-3xl" />
      <CardHeader className="relative z-10 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Posiciones abiertas
        </CardTitle>
      </CardHeader>
      <CardContent className="relative z-10 p-0">
        <div className="divide-y divide-border/50">
          {positions.map(p => {
            const sharesKnown = p.shares > 0.0001
            const value = sharesKnown && p.market_value != null ? p.market_value : p.total_invested
            const weightPct = totalMarketValue > 0 ? Math.min(100, Math.max(0, (value / totalMarketValue) * 100)) : 0
            const gain = sharesKnown ? (p.unrealized_pnl ?? 0) >= 0 : true
            const badgeColor = symbolColor(p.symbol)
            return (
              <div key={p.symbol} className="px-4 py-3 flex items-center gap-3">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-[11px] font-bold tracking-tight"
                  style={{ backgroundColor: `${badgeColor}22`, color: badgeColor }}
                >
                  {p.symbol.slice(0, 4)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {p.is_manual && (
                      <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-primary/70 border border-primary/20 rounded px-1 py-0.5">manual</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {sharesKnown ? `${p.shares.toFixed(6)} acc.` : '? acc.'}
                    </span>
                    {!sharesKnown && !p.is_manual && (
                      <span className="text-xs text-warning/80" title="Reconecta TR para ver acciones">sync pendiente</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold tabular-nums">{formatCurrency(value)}</p>
                  {sharesKnown && p.unrealized_pnl != null && (
                    <p className={`text-xs font-medium tabular-nums ${p.unrealized_pnl >= 0 ? 'text-positive' : 'text-negative'}`}>
                      {p.unrealized_pnl >= 0 ? '+' : ''}{formatCurrency(p.unrealized_pnl)}
                      {p.unrealized_pnl_pct != null && (
                        <span className="opacity-70 ml-1">({p.unrealized_pnl_pct >= 0 ? '+' : ''}{p.unrealized_pnl_pct.toFixed(1)}%)</span>
                      )}
                    </p>
                  )}
                </div>
                <div className="hidden w-14 shrink-0 sm:block" title={`${weightPct.toFixed(0)}% del total`}>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn('h-full rounded-full', gain ? 'bg-positive' : 'bg-negative')}
                      style={{ width: `${Math.max(4, weightPct)}%` }}
                    />
                  </div>
                </div>
                {p.is_manual && p.manual_id != null && (
                  <button
                    onClick={() => onDeleteManual(p.manual_id!, p.symbol)}
                    className="shrink-0 p-1.5 rounded-lg text-muted-foreground/50 hover:text-negative hover:bg-negative/10 transition-colors"
                    aria-label="Eliminar posición manual"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
          {positions.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Sin posiciones abiertas</p>
          )}
        </div>

        {/* Totales */}
        {positions.length > 0 && (
          <div className="border-t border-border px-4 py-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Total</span>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">{formatCurrency(totalMarketValue)}</p>
                <p className={`text-xs font-medium tabular-nums ${totalUnrealized >= 0 ? 'text-positive' : 'text-negative'}`}>
                  {totalUnrealized >= 0 ? '+' : ''}{formatCurrency(totalUnrealized)}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
