import { useId, useMemo, useState } from 'react'
import { useFeaturesStore } from '@/store/features'
import { useQuery, useQueries } from '@tanstack/react-query'
import { dashApi, txApi, goalApi, portfolioApi, budgetApi } from '@/lib/api'
import type { Goal, PendingRecurring } from '@/lib/api'
import { usePayrollCycle } from '@/hooks/usePayrollCycle'
import { useDashboardLayout, type WidgetId } from '@/hooks/useDashboardLayout'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MetricCard } from '@/components/MetricCard'
import {
  TrendingDown, Wallet, PiggyBank, Target,
  ArrowRight, Calendar, ArrowUpRight, ArrowDownRight,
  Activity, GripVertical, EyeOff, Eye, Settings2, X,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
  LineChart, Line, Legend, ReferenceLine,
} from 'recharts'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { SpendingPersonality } from '@/components/SpendingPersonality'
import { Achievements } from '@/components/Achievements'
import { NetWorthChart } from '@/components/NetWorthChart'
import { InsightsWidget } from '@/components/InsightsWidget'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

/* ── Tooltip components ── */
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const periodLabel = payload[0]?.payload?.periodLabel || label
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-card-hover">
      <p className="mb-2 font-medium text-popover-foreground/80">{periodLabel}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.stroke || p.fill }} className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.stroke || p.fill }} />
          {p.name}: <span className="ml-auto pl-3 font-semibold tabular-nums">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 text-xs shadow-card-hover">
      <p className="font-medium text-popover-foreground">{payload[0].name}</p>
      <p style={{ color: payload[0].payload.fill }} className="font-bold tabular-nums">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

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

/* ── Hero balance card ── */
function BalanceHero({
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

/* ── Objetivos: circular-progress goal rings, promoted right under the hero ── */
function GoalRing({ pct, color }: { pct: number; color: string }) {
  const size = 72, cx = size / 2, cy = size / 2, r = 28, sw = 7
  const circumference = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  const dash = (clamped / 100) * circumference
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={sw} />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy + 5} textAnchor="middle" fontFamily='"Space Grotesk"' fontSize="15" fontWeight="600" fill="hsl(var(--foreground))">
        {Math.round(clamped)}%
      </text>
    </svg>
  )
}

function goalStatus(g: Goal): { label: string; variant: 'success' | 'warning' | 'muted' } {
  if (g.progress_pct >= 100) return { label: 'Completado', variant: 'success' }
  if (g.deadline) {
    const overdue = new Date(g.deadline + 'T23:59:59') < new Date()
    return overdue
      ? { label: 'Retrasado', variant: 'warning' }
      : { label: formatDate(g.deadline), variant: 'muted' }
  }
  return { label: 'En camino', variant: 'success' }
}

function GoalsWidget({ goals }: { goals: Goal[] }) {
  const active = goals
    .filter(g => g.is_active)
    .sort((a, b) => {
      const aDone = a.progress_pct >= 100
      const bDone = b.progress_pct >= 100
      if (aDone !== bDone) return aDone ? 1 : -1
      return b.progress_pct - a.progress_pct
    })
  const shown = active.slice(0, 2)

  return (
    <Card className="card-hover overflow-hidden animate-fade-up">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Objetivos</CardTitle>
        <Link to="/objetivos" className="flex items-center gap-1 text-xs text-primary/70 transition-colors hover:text-primary">
          Ver todos <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pb-5">
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No tienes objetivos activos todavía</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {shown.map((g, i) => {
              const color = `hsl(var(--chart-${(i % 4) + 1}))`
              const status = goalStatus(g)
              const subLabel = g.type === 'EURO_TARGET' && g.target_amount
                ? `${formatCurrency(g.current_amount)} de ${formatCurrency(g.target_amount)}`
                : `${g.target_percent ?? 0}% del ingreso mensual`
              return (
                <div key={g.id} className="flex items-center gap-3.5 rounded-xl bg-secondary/60 p-3.5">
                  <GoalRing pct={g.progress_pct} color={color} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{g.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground tabular-nums">{subLabel}</p>
                    <Badge variant={status.variant} className="mt-2 text-[10px]">{status.label}</Badge>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function shortCycleLabel(dateStr: string) {
  return new Date(dateStr + 'T12:00:00')
    .toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    .replace('.', '')
}

/* ── Sortable wrapper for drag & drop ── */
function SortableWidget({
  id, editing, visible, onToggle, children,
}: {
  id: WidgetId; editing: boolean; visible: boolean; onToggle: () => void; children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className={cn(!visible && editing && 'opacity-40')}>
      {editing && (
        <div className="flex items-center justify-between px-1 mb-1">
          <button
            {...attributes}
            {...listeners}
            className="flex items-center gap-1.5 p-2 -m-2 text-xs text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            onClick={onToggle}
            className="flex items-center gap-1 p-2 -m-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {visible ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      )}
      {(visible || editing) && children}
    </div>
  )
}

/* ── Gastos por categoría: donut + leyenda lateral interactiva ── */
function CategoryDonut({
  data, total,
}: { data: { name: string; value: number; fill: string; icon?: string }[]; total: number }) {
  const [active, setActive] = useState<number | null>(null)

  if (data.length === 0) {
    return <div className="flex h-44 items-center justify-center text-sm text-muted-foreground">Sin datos</div>
  }

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-48 w-48 shrink-0">
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-4 text-center">
          <p className="text-lg font-bold leading-tight text-foreground tabular-nums">
            {formatCurrency(active !== null ? data[active].value : total)}
          </p>
          <p className="mt-0.5 truncate text-[9px] uppercase tracking-widest text-muted-foreground max-w-[7rem]">
            {active !== null ? data[active].name : 'este tramo'}
          </p>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data} cx="50%" cy="50%" innerRadius={62} outerRadius={88}
              paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}
              onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)}
            >
              {data.map((entry, i) => (
                <Cell
                  key={entry.name}
                  fill={entry.fill}
                  opacity={active === null || active === i ? 0.95 : 0.3}
                  style={{ transition: 'opacity 150ms' }}
                />
              ))}
            </Pie>
            <Tooltip content={<PieTooltip />} wrapperStyle={{ zIndex: 100 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="w-full min-w-0 flex-1 space-y-1">
        {data.map((d, i) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0
          return (
            <button
              key={d.name}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                active === i ? 'bg-secondary' : 'hover:bg-secondary/50',
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: d.fill }} />
              {d.icon && <span className="shrink-0 text-sm">{d.icon}</span>}
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{d.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
              <span className="w-20 shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                {formatCurrency(d.value)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main dashboard ── */
export function Dashboard() {
  const {
    cycles, periodStart, periodEnd, isPayrollCycle, cycleRangeLabel,
  } = usePayrollCycle(0)

  const layout = useDashboardLayout()
  const features = useFeaturesStore(s => s.features)

  const { data: overview  } = useQuery({ queryKey: ['overview'],  queryFn: () => dashApi.overview() })
  const { data: cycleDetail } = useQuery({
    queryKey: ['monthly-detail', periodStart, periodEnd],
    queryFn: () => dashApi.monthlyDetail({ date_from: periodStart, date_to: periodEnd }),
    enabled: !!(periodStart && periodEnd),
  })

  const [numTramos, setNumTramos] = useState<number | null>(6)
  const trendCycles = numTramos === null ? cycles : cycles.slice(-numTramos)
  const cycleQueries = useQueries({
    queries: trendCycles.map(c => ({
      queryKey: ['monthly-detail', c.start, c.end],
      queryFn:  () => dashApi.monthlyDetail({ date_from: c.start, date_to: c.end }),
      staleTime: 5 * 60_000,
    })),
  })

  const { data: byCat    } = useQuery({
    queryKey: ['by-cat', periodStart, periodEnd],
    queryFn: () => dashApi.byCategory({ date_from: periodStart, date_to: periodEnd }),
    enabled: !!(periodStart && periodEnd),
  })
  const { data: upcoming } = useQuery({ queryKey: ['upcoming'], queryFn: () => dashApi.upcoming(30) })
  const { data: txs      } = useQuery({ queryKey: ['tx-recent'], queryFn: () => txApi.list({ page: 1, page_size: 5, account_category: 'CASH' }) })
  const { data: goals    } = useQuery({ queryKey: ['goals'],     queryFn: goalApi.list })
  const { data: portfolio} = useQuery({ queryKey: ['portfolio-performance'], queryFn: portfolioApi.performance })
  const { data: netWorthHist } = useQuery({
    queryKey: ['net-worth-history', 24],
    queryFn: () => dashApi.netWorthHistory(24),
    staleTime: 10 * 60_000,
  })
  const { data: budgets  } = useQuery({
    queryKey: ['budget-status', periodStart, periodEnd],
    queryFn: () => budgetApi.status(undefined, periodStart, periodEnd),
    enabled: !!(periodStart && periodEnd),
  })
  const { data: pendingRecurring = [] } = useQuery({
    queryKey: ['pending-recurring', periodStart, periodEnd],
    queryFn: () => dashApi.pendingRecurring(periodStart!, periodEnd!),
    enabled: !!(periodStart && periodEnd),
  })

  const PIE_PALETTE = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))']
  const today   = new Date()
  const topCats  = (byCat || []).slice(0, 6)
  const restCats = (byCat || []).slice(6)
  const otrosTotal = restCats.reduce((s, b) => s + b.total, 0)
  const pieData = [
    ...topCats.map((b, i) => ({
      name: b.category_name, value: b.total, icon: b.category_icon,
      fill: b.category_color || PIE_PALETTE[i % PIE_PALETTE.length],
    })),
    ...(otrosTotal > 0 ? [{ name: 'Otros', value: otrosTotal, icon: '···', fill: 'hsl(var(--muted-foreground))' }] : []),
  ]
  const totalPie = pieData.reduce((s, e) => s + e.value, 0)

  const included      = (cycleDetail ?? []).filter(r => !r.exclude_from_stats)
  const incomeMonth   = included.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const expensesMonth = included.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0)
  const savingsMonth  = incomeMonth - expensesMonth
  const balance       = overview?.balance        ?? 0
  const interestMonth = overview?.interest_month ?? 0
  const interestTotal = overview?.interest_total ?? 0

  const trendData = useMemo(() => trendCycles.map((cycle, i) => {
    const rows = cycleQueries[i]?.data ?? []
    const inc  = rows.filter(r => !r.exclude_from_stats && r.amount > 0).reduce((s, r) => s + r.amount, 0)
    const exp  = rows.filter(r => !r.exclude_from_stats && r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0)
    const startLbl = shortCycleLabel(cycle.start)
    const endLbl   = cycle.isOpen ? 'hoy' : shortCycleLabel(cycle.end)
    return { month: startLbl, periodLabel: `${startLbl} — ${endLbl}`, income: inc, expenses: exp, savings: inc - exp }
  }), [trendCycles, cycleQueries])

  // Purely presentational: cumulative savings across the same trend series, for the
  // hero's decorative sparkline. No new data source — derived from trendData above.
  const sparklineData = useMemo(() => {
    let running = 0
    return trendData.map(t => (running += t.savings))
  }, [trendData])

  const startD    = periodStart ? new Date(periodStart + 'T00:00:00') : new Date()
  const endD      = periodEnd   ? new Date(periodEnd   + 'T23:59:59') : new Date()
  const currentD  = today > endD ? endD : today
  const daysPassed = Math.max(1, Math.ceil((currentD.getTime() - startD.getTime()) / 86400000))
  const totalDays  = Math.max(1, Math.ceil((endD.getTime()    - startD.getTime()) / 86400000))
  const dailySpend = expensesMonth / daysPassed
  let paceDiff = 0; let hasPrevPace = false
  const prevCycleObj = cycles.length > 1 ? cycles[1] : null
  const prevTrend    = trendData.length > 1 ? trendData[trendData.length - 2] : null
  if (prevCycleObj && prevTrend) {
    const pStart = new Date(prevCycleObj.start + 'T00:00:00')
    const pEnd   = new Date(prevCycleObj.end   + 'T23:59:59')
    const pDays  = Math.max(1, Math.ceil((pEnd.getTime() - pStart.getTime()) / 86400000))
    const pDaily = prevTrend.expenses / pDays
    if (pDaily > 0) { paceDiff = ((dailySpend - pDaily) / pDaily) * 100; hasPrevPace = true }
  }

  const latestNW    = netWorthHist?.[netWorthHist.length - 1]
  const portfolioValue = latestNW?.portfolio ?? (portfolio?.total_market_value || portfolio?.total_invested || 0)
  const debtTotal   = latestNW?.debt ?? 0
  const netWorth    = latestNW?.net_worth ?? (balance + portfolioValue - debtTotal)
  const cycleLabel  = isPayrollCycle ? cycleRangeLabel : 'este mes'

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIdx = layout.order.indexOf(active.id as WidgetId)
      const newIdx = layout.order.indexOf(over.id as WidgetId)
      layout.setOrder(arrayMove(layout.order, oldIdx, newIdx))
    }
  }

  /* ── Widget render map ── */
  const widgets: Record<WidgetId, React.ReactNode> = {
    hero: (
      <BalanceHero
        cash={balance} netWorth={netWorth} portfolioValue={portfolioValue} debtTotal={debtTotal}
        savingsMonth={savingsMonth} incomeMonth={incomeMonth} expensesMonth={expensesMonth}
        goals={goals ?? []} cycleLabel={cycleLabel}
        pendingRecurring={pendingRecurring} sparkline={sparklineData}
      />
    ),
    goals: <GoalsWidget goals={goals ?? []} />,
    metrics: (
      <div className="grid grid-cols-1 xs:grid-cols-3 gap-3">
        <MetricCard title="Ahorro este tramo" value={formatCurrency(savingsMonth)} icon={PiggyBank}
          accent={savingsMonth >= 0 ? 'positive' : 'negative'}
          sub={incomeMonth > 0 ? `${((savingsMonth / incomeMonth) * 100).toFixed(1)}% de los ingresos` : undefined} delay={75} />
        <MetricCard title="Mayor gasto cat." value={byCat?.[0] ? formatCurrency(byCat[0].total) : '—'} icon={TrendingDown}
          accent="warning" sub={byCat?.[0]?.category_name} delay={150} />
        <MetricCard title="Ritmo de gasto"
          value={hasPrevPace ? `${paceDiff >= 0 ? '+' : ''}${paceDiff.toFixed(1)}%` : '—'}
          icon={Activity} accent={hasPrevPace ? (paceDiff <= 0 ? 'chart-2' : 'negative') : 'muted'}
          sub="vs media diaria ciclo ant." delay={225} />
      </div>
    ),
    trend: (
      <Card className="card-hover overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {isPayrollCycle ? 'Flujo de caja por nómina' : 'Ingresos vs Gastos · 6 meses'}
          </CardTitle>
          {isPayrollCycle && (
            <div className="flex gap-1">
              {([3, 6, 9, 12, null] as (number | null)[]).map(n => (
                <button
                  key={n ?? 'max'}
                  onClick={() => setNumTramos(n)}
                  className={cn(
                    'rounded px-2.5 py-1.5 text-[10px] font-medium transition-colors active:scale-95',
                    numTramos === n
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  )}
                >
                  {n ?? 'Max'}
                </button>
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="px-2 pb-4" style={{ minHeight: 240 }}>
          {isPayrollCycle ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ left: -10, right: 4 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }} />
                <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="4 3" />
                <Line type="monotone" dataKey="income"   name="Ingresos" stroke="hsl(var(--positive))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="expenses" name="Gastos"   stroke="hsl(var(--negative))" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="savings"  name="Ahorro"   stroke="hsl(var(--primary))"  strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ left: -10, right: 4 }}>
                <defs>
                  <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--positive))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--positive))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--negative))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--negative))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="income"   name="Ingresos" stroke="hsl(var(--positive))" strokeWidth={2} fill="url(#gradIncome)"   dot={false} activeDot={{ r: 4, fill: 'hsl(var(--positive))', strokeWidth: 0 }} />
                <Area type="monotone" dataKey="expenses" name="Gastos"   stroke="hsl(var(--negative))" strokeWidth={2} fill="url(#gradExpenses)" dot={false} activeDot={{ r: 4, fill: 'hsl(var(--negative))', strokeWidth: 0 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    ),
    pie: (
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Gastos por categoría — donut + leyenda */}
        <Card className="card-hover overflow-visible">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Gastos por categoría</CardTitle>
          </CardHeader>
          <CardContent className="pb-5">
            <CategoryDonut data={pieData} total={totalPie} />
          </CardContent>
        </Card>

        {/* Presupuestos por categoría */}
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
      </div>
    ),
    insights: <InsightsWidget />,
    networth: <NetWorthChart months={24} />,
    personality: (
      <div className={cn('grid gap-4', features.achievements && 'lg:grid-cols-[1fr_2fr]')}>
        <SpendingPersonality />
        {features.achievements && (
          <Card className="p-5">
            <Achievements compact />
          </Card>
        )}
      </div>
    ),
    upcoming: (
      <Card className="card-hover overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Próximos pagos recurrentes</CardTitle>
          <Link to="/monthly" className="flex items-center gap-1 text-xs text-primary/70 transition-colors hover:text-primary">
            Ver todos <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-1 pb-4">
          {upcoming?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No hay pagos próximos</p>}
          {upcoming?.slice(0, 4).map(r => (
            <div key={r.id} className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-base">{r.category?.icon || '💳'}</span>
                <div>
                  <p className="max-w-[150px] truncate text-sm font-medium text-foreground">{r.display_name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {r.next_expected_date ? formatDate(r.next_expected_date) : 'Sin fecha'}
                  </p>
                </div>
              </div>
              <div className="ml-2 shrink-0 text-right">
                <p className="text-sm font-semibold text-negative tabular-nums">-{formatCurrency(r.avg_amount)}</p>
                {r.days_until !== null && (
                  <Badge variant={r.days_until <= 7 ? 'warning' : 'muted'} className="text-[10px] mt-0.5">
                    {r.days_until === 0 ? 'Hoy' : r.days_until < 0 ? 'Vencido' : `${r.days_until}d`}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    ),
    recent: (
      <Card className="card-hover overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Últimas transacciones</CardTitle>
          <Link to="/transacciones" className="flex items-center gap-1 text-xs text-primary/70 transition-colors hover:text-primary">
            Ver todas <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-1 pb-4">
          {txs?.items.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Sin transacciones</p>}
          {txs?.items.map(tx => (
            <div key={tx.id} className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-base">{tx.category?.icon || '💳'}</span>
                <div>
                  <p className="max-w-[150px] truncate text-sm font-medium text-foreground">{tx.name || tx.description || tx.type}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(tx.date)}</p>
                </div>
              </div>
              <span className={cn('ml-2 shrink-0 text-sm font-semibold tabular-nums', tx.amount >= 0 ? 'text-primary' : 'text-negative')}>
                {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    ),
  }

  // 'goals' is feature-gated (Ajustes → Objetivos) — drop it from the visible/sortable
  // order entirely when disabled, rather than rendering an empty card.
  const renderOrder = layout.order.filter(id => id !== 'goals' || features.goals)

  /* ── Render ── */
  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Date header + edit button */}
      <div className="flex items-start justify-between animate-fade-in">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5 capitalize">
            {today.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          {isPayrollCycle && periodStart && periodEnd && (
            <p className="text-[11px] text-muted-foreground/50 mt-0.5">
              Tramo nómina: {formatDate(periodStart)} — {cycles[cycles.length - 1]?.isOpen ? 'hoy' : formatDate(periodEnd)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {layout.editing ? (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={layout.resetLayout}>
                Restablecer
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={layout.saveAndExit}>
                <X className="h-3.5 w-3.5 mr-1" /> Guardar
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={layout.startEditing}>
              <Settings2 className="h-3.5 w-3.5" /> Personalizar
            </Button>
          )}
        </div>
      </div>

      {/* Draggable layout */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={renderOrder} strategy={verticalListSortingStrategy}>
          <div className="space-y-5">
            {renderOrder.map(id => (
              <SortableWidget
                key={id}
                id={id}
                editing={layout.editing}
                visible={layout.isVisible(id)}
                onToggle={() => layout.toggleHidden(id)}
              >
                {widgets[id]}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
