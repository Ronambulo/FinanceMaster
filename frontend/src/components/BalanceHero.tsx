import { useId } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn, formatCurrency } from '@/lib/utils'
import { Wallet, Target, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import type { Goal, PendingRecurring } from '@/lib/api'

/* ── Tiny sparkline (decorative — mirrors the already-computed cycle trend) ── */
function Sparkline({ data, width = 220, height = 64 }: { data: number[]; width?: number; height?: number }) {
  const gid = useId()
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)
  const points = data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * (height - 8) - 4
    return [x, y] as const
  })
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${width} ${height} L0 ${height} Z`
  const [lastX, lastY] = points[points.length - 1]
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="hidden shrink-0 sm:block">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--positive))" stopOpacity="0.28" />
          <stop offset="100%" stopColor="hsl(var(--positive))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gid})`} />
      <path d={linePath} fill="none" stroke="hsl(var(--positive))" strokeWidth="2" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="3.5" fill="hsl(var(--positive))" />
    </svg>
  )
}

export function BalanceHero({
  cash, netWorth, portfolioValue, debtTotal, savingsMonth, incomeMonth, expensesMonth, goals, cycleLabel, pendingRecurring, sparkline,
}: {
  cash: number; netWorth: number; portfolioValue: number; debtTotal: number
  savingsMonth: number; incomeMonth: number; expensesMonth: number
  goals: Goal[]; cycleLabel: string; pendingRecurring: PendingRecurring[]; sparkline: number[]
}) {
  const savingsRate = incomeMonth > 0 ? (savingsMonth / incomeMonth) * 100 : 0
  const isPositiveSavings = savingsMonth >= 0

  const activeGoals        = goals.filter(g => g.is_active && g.type === 'EURO_TARGET' && g.target_amount)
  const savedInGoals       = activeGoals.reduce((s, g) => s + g.current_amount, 0)
  const pendingTotal       = pendingRecurring.reduce((s, r) => s + r.avg_amount, 0)
  const available          = cash - savedInGoals - pendingTotal
  const hasGoals           = activeGoals.length > 0
  const hasPendingRecurring = pendingRecurring.length > 0
  const hasBlocked         = hasGoals || hasPendingRecurring

  return (
    <Card className="card-hover overflow-hidden animate-fade-up">
      <CardContent className="p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Patrimonio neto</p>
            <p className="mt-2 font-display text-4xl font-semibold tracking-tight text-foreground tabular-nums animate-number-pop sm:text-5xl">
              {formatCurrency(netWorth)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-semibold',
                isPositiveSavings ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'
              )}>
                {isPositiveSavings ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {formatCurrency(Math.abs(savingsMonth))}
              </span>
              <span className="text-xs text-muted-foreground">{cycleLabel}</span>
              {incomeMonth > 0 && (
                <span className={cn(
                  'text-xs font-medium px-1.5 py-0.5 rounded-full',
                  isPositiveSavings ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'
                )}>
                  {savingsRate.toFixed(1)}% tasa
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Cuenta <span className="font-medium text-foreground tabular-nums">{formatCurrency(cash)}</span></span>
              <span>Invertido <span className="font-medium text-foreground tabular-nums">{formatCurrency(portfolioValue)}</span></span>
              {debtTotal > 0 && (
                <span>Deudas <span className="font-medium text-negative tabular-nums">-{formatCurrency(debtTotal)}</span></span>
              )}
            </div>
          </div>
          <Sparkline data={sparkline} />
        </div>

        {hasBlocked ? (
          <div className="mt-5 space-y-3">
            {/* Summary boxes */}
            <div className={cn('grid gap-2 xs:gap-3', hasGoals && hasPendingRecurring ? 'grid-cols-3' : 'grid-cols-2')}>
              <div className="min-w-0 space-y-1 rounded-xl bg-secondary/60 p-2.5 xs:p-3">
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate text-[11px] text-muted-foreground">Disponible</span>
                </div>
                <p className="truncate text-sm xs:text-base font-bold text-foreground tabular-nums">{formatCurrency(Math.max(available, 0))}</p>
              </div>
              {hasGoals && (
                <div className="min-w-0 space-y-1 rounded-xl bg-secondary/60 p-2.5 xs:p-3">
                  <div className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate text-[11px] text-muted-foreground">En objetivos</span>
                  </div>
                  <p className="truncate text-sm xs:text-base font-bold text-primary tabular-nums">{formatCurrency(savedInGoals)}</p>
                </div>
              )}
              {hasPendingRecurring && (
                <div className="min-w-0 space-y-1 rounded-xl bg-secondary/60 p-2.5 xs:p-3">
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 shrink-0 text-warning" />
                    <span className="truncate text-[11px] text-muted-foreground">Recurrentes</span>
                  </div>
                  <p className="truncate text-sm xs:text-base font-bold text-warning tabular-nums">{formatCurrency(pendingTotal)}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-secondary/60 p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <ArrowUpRight className="h-3.5 w-3.5 text-positive" />
                <span className="text-[11px] text-muted-foreground">Ingresos</span>
              </div>
              <p className="text-base font-bold text-positive tabular-nums">{formatCurrency(incomeMonth)}</p>
            </div>
            <div className="rounded-xl bg-secondary/60 p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <ArrowDownRight className="h-3.5 w-3.5 text-negative" />
                <span className="text-[11px] text-muted-foreground">Gastos</span>
              </div>
              <p className="text-base font-bold text-negative tabular-nums">{formatCurrency(expensesMonth)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
