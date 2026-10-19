import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

export function CyclesComparisonCard({
  totalIncome, totalExpenses, netSavings, prevIncome, prevExpenses, prevSavings,
  isPartialCompare, compareDays,
}: {
  totalIncome: number
  totalExpenses: number
  netSavings: number
  prevIncome: number
  prevExpenses: number
  prevSavings: number
  isPartialCompare: boolean
  compareDays: number | null
}) {
  return (
    <Card className="card-hover rounded-2xl">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground mb-3">
          vs ciclo anterior{isPartialCompare && compareDays ? ` (mismos ${compareDays} días)` : ''}
        </p>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {[
            { label: 'Ingresos', cur: totalIncome, prev: prevIncome },
            { label: 'Gastos',   cur: totalExpenses, prev: prevExpenses },
            { label: 'Ahorro',   cur: netSavings, prev: prevSavings },
          ].map(({ label, cur, prev }) => (
            <div key={label} className="text-center space-y-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">{label}</p>
              <p className="text-xs xs:text-sm font-semibold tabular-nums truncate">{formatCurrency(cur)}</p>
              <p className="text-xs text-muted-foreground/60 tabular-nums truncate">
                {formatCurrency(prev)} {isPartialCompare && compareDays ? `(días 1-${compareDays})` : 'ant.'}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
