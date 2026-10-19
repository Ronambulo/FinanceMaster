import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Trash2 } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'
import type { Budget, BudgetStatus } from '@/lib/api'

function trafficColor(pct: number) {
  if (pct >= 100) return 'text-negative'
  if (pct >= 80)  return 'text-warning'
  return 'text-positive'
}
function trafficBg(pct: number) {
  if (pct >= 100) return 'bg-negative'
  if (pct >= 80)  return 'bg-warning'
  return 'bg-positive'
}

export function MonthlyBudgetsCard({
  budgetStatus, allBudgets, isPayrollCycle, periodStart, periodEnd, onDeleteBudget,
}: {
  budgetStatus: BudgetStatus[]
  allBudgets: Budget[] | undefined
  isPayrollCycle: boolean
  periodStart: string
  periodEnd: string
  onDeleteBudget: (id: number) => void
}) {
  return (
    <Card className="card-hover rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-sm font-medium text-muted-foreground">Presupuestos</CardTitle>
          {isPayrollCycle && (
            <p className="text-xs text-muted-foreground/60 mt-0.5">Prorateado al tramo ({Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000) + 1}d / 30d)</p>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {budgetStatus.map(b => (
          <div key={b.budget_id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span>{b.category_icon}</span>
                <span className="text-sm font-medium truncate">{b.category_name}</span>
                <Badge
                  variant="muted"
                  className={cn('text-xs shrink-0', trafficColor(b.pct_used))}
                >
                  {b.pct_used.toFixed(0)}%
                </Badge>
              </div>
              <div className="text-right shrink-0">
                <span className={cn('text-sm font-semibold tabular-nums', trafficColor(b.pct_used))}>
                  {formatCurrency(b.spent)}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums"> / {formatCurrency(b.budgeted)}</span>
              </div>
              <button
                onClick={() => {
                  const budget = allBudgets?.find(bgt => bgt.id === b.budget_id)
                  if (budget) onDeleteBudget(budget.id)
                }}
                aria-label="Eliminar presupuesto"
                className="text-muted-foreground/50 hover:text-negative transition-colors shrink-0"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <Progress
              value={Math.min(b.pct_used, 100)}
              className="h-1.5"
              indicatorClassName={trafficBg(b.pct_used)}
            />
            {b.pct_used >= 100 && (
              <p className="text-xs text-negative">
                Excedido por {formatCurrency(Math.abs(b.remaining))}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
