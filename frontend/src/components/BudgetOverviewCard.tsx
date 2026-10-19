import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatCurrency } from '@/lib/utils'
import type { BudgetStatus } from '@/lib/api'

export function BudgetOverviewCard({ budgets }: { budgets: BudgetStatus[] | undefined }) {
  return (
    <Card className="card-hover overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Presupuestos por categoría</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pb-4">
        {!budgets || budgets.length === 0 ? (
          <div className="flex h-36 items-center justify-center text-sm text-muted-foreground">Sin presupuestos</div>
        ) : (
          budgets.map(b => {
            const pct = Math.min(b.pct_used, 100)
            const over = b.pct_used > 100
            return (
              <div key={b.budget_id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm" style={{ backgroundColor: b.category_color + '22' }}>
                      {b.category_icon}
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">{b.category_name}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={cn('text-sm font-semibold tabular-nums', over ? 'text-negative' : 'text-foreground')}>
                      {formatCurrency(b.spent)}
                    </span>
                    <span className="ml-1 text-[11px] text-muted-foreground">/ {formatCurrency(b.budgeted)}</span>
                  </div>
                </div>
                <div className="h-1.5 w-full rounded-full bg-secondary">
                  <div
                    className="h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, backgroundColor: over ? 'hsl(var(--negative))' : b.category_color, opacity: 0.85 }}
                  />
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
