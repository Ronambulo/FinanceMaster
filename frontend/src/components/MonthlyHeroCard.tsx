import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PiggyBank, TrendingUp, TrendingDown } from 'lucide-react'
import { cn, formatCurrency } from '@/lib/utils'

export function MonthlyHeroCard({
  netSavings, totalIncome, totalExpenses, savingsRate, invested,
}: {
  netSavings: number
  totalIncome: number
  totalExpenses: number
  savingsRate: number
  invested: number | undefined
}) {
  return (
    <Card className="card-hover relative overflow-hidden rounded-2xl">
      <div className={cn(
        'pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full blur-3xl',
        netSavings >= 0 ? 'bg-positive/[0.08]' : 'bg-negative/[0.08]',
      )} />
      <CardContent className="relative z-10 p-6 sm:p-7">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <PiggyBank className="h-4 w-4" />
              Ahorro neto del ciclo
            </div>
            <p className={cn(
              'font-display tabular-nums text-4xl sm:text-5xl font-semibold tracking-tight mt-2',
              netSavings >= 0 ? 'text-positive' : 'text-negative',
            )}>
              {netSavings >= 0 ? '+' : ''}{formatCurrency(netSavings)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {totalIncome > 0 && (
                <Badge variant={netSavings >= 0 ? 'success' : 'destructive'} className="text-xs">
                  {savingsRate.toFixed(1)}% tasa de ahorro
                </Badge>
              )}
              {!!invested && (
                <Badge variant="secondary" className="text-xs">
                  Invertido: {formatCurrency(invested)}
                </Badge>
              )}
            </div>
          </div>

          {/* Secondary income / expense figures — deliberately smaller than the hero */}
          <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
            <div className="rounded-xl bg-secondary/60 border border-border p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Ingresos
              </div>
              <p className="font-display tabular-nums text-lg font-semibold text-positive">
                +{formatCurrency(totalIncome)}
              </p>
            </div>
            <div className="rounded-xl bg-secondary/60 border border-border p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                <TrendingDown className="h-3.5 w-3.5" /> Gastos
              </div>
              <p className="font-display tabular-nums text-lg font-semibold text-negative">
                -{formatCurrency(totalExpenses)}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
