import { useMemo, useState } from 'react'
import { useQuery, useQueries } from '@tanstack/react-query'
import { dashApi, txApi, goalApi, portfolioApi } from '@/lib/api'
import type { Goal } from '@/lib/api'
import { usePayrollCycle } from '@/hooks/usePayrollCycle'
import { useDashboardLayout, type WidgetId } from '@/hooks/useDashboardLayout'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import {
  TrendingUp, TrendingDown, Wallet, PiggyBank, Target,
  ArrowRight, Calendar, ArrowUpRight, ArrowDownRight,
  Activity, Scale, GripVertical, EyeOff, Eye, Settings2, X,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
  LineChart, Line, Legend,
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
    <div className="rounded-lg border border-white/10 bg-[hsl(228_22%_7%)] p-3 text-xs shadow-xl">
      <p className="font-medium text-foreground/80 mb-2">{periodLabel}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.stroke || p.fill }} className="flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.stroke || p.fill }} />
          {p.name}: <span className="font-semibold ml-auto pl-3">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-[hsl(228_22%_7%)] p-2.5 text-xs shadow-xl">
      <p className="font-medium text-foreground">{payload[0].name}</p>
      <p style={{ color: payload[0].payload.fill }} className="font-bold">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

/* ── Hero balance card ── */
function BalanceHero({
  balance, savingsMonth, incomeMonth, expensesMonth, goals, cycleLabel,
}: {
  balance: number; savingsMonth: number; incomeMonth: number; expensesMonth: number
  goals: Goal[]; cycleLabel: string
}) {
  const savingsRate = incomeMonth > 0 ? (savingsMonth / incomeMonth) * 100 : 0
  const isPositiveSavings = savingsMonth >= 0

  const activeGoals   = goals.filter(g => g.is_active && g.type === 'EURO_TARGET' && g.target_amount)
  const savedInGoals  = activeGoals.reduce((s, g) => s + g.current_amount, 0)
  const available     = balance - savedInGoals
  const hasGoals      = activeGoals.length > 0

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-card p-6 shadow-[0_4px_24px_rgba(0,0,0,0.5)] animate-fade-up">
      <div className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-primary/[0.06] blur-3xl" />
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-3">Balance Total</p>
            <p className="text-4xl font-bold tracking-tight text-foreground animate-number-pop">
              {formatCurrency(balance)}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <span className={cn(
                'inline-flex items-center gap-1 text-sm font-semibold',
                isPositiveSavings ? 'text-positive' : 'text-negative'
              )}>
                {isPositiveSavings ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                {formatCurrency(Math.abs(savingsMonth))}
              </span>
              <span className="text-xs text-muted-foreground">{cycleLabel}</span>
              {incomeMonth > 0 && (
                <span className={cn(
                  'ml-1 text-xs font-medium px-1.5 py-0.5 rounded-full',
                  isPositiveSavings ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative'
                )}>
                  {savingsRate.toFixed(1)}% tasa
                </span>
              )}
            </div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
        </div>

        {hasGoals ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] text-muted-foreground">Disponible</span>
              </div>
              <p className="text-base font-bold text-foreground">{formatCurrency(Math.max(available, 0))}</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] text-muted-foreground">En objetivos</span>
              </div>
              <p className="text-base font-bold text-primary">{formatCurrency(savedInGoals)}</p>
            </div>
            <div className="col-span-2 space-y-2 pt-1 border-t border-white/[0.05] mt-1">
              {activeGoals.slice(0, 3).map(g => {
                const pct = g.target_amount ? Math.min(100, (g.current_amount / g.target_amount) * 100) : 0
                return (
                  <div key={g.id} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[11px] text-muted-foreground truncate max-w-[60%]">{g.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatCurrency(g.current_amount)} / {formatCurrency(g.target_amount ?? 0)}
                      </span>
                    </div>
                    <Progress value={pct} className="h-1" indicatorClassName="bg-primary" />
                  </div>
                )
              })}
              {activeGoals.length > 3 && (
                <p className="text-[10px] text-muted-foreground/60">+{activeGoals.length - 3} más</p>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUpRight className="h-3.5 w-3.5 text-positive" />
                <span className="text-[11px] text-muted-foreground">Ingresos</span>
              </div>
              <p className="text-base font-bold text-positive">{formatCurrency(incomeMonth)}</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowDownRight className="h-3.5 w-3.5 text-negative" />
                <span className="text-[11px] text-muted-foreground">Gastos</span>
              </div>
              <p className="text-base font-bold text-negative">{formatCurrency(expensesMonth)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  title, value, icon: Icon, accent = 'default', sub, delay = 0
}: {
  title: string; value: string; icon: any; accent?: 'emerald' | 'rose' | 'amber' | 'violet' | 'cyan' | 'orange' | 'default'; sub?: string; delay?: number
}) {
  const colors: Record<string, { text: string; bg: string; glow: string; icon?: string }> = {
    emerald: { text: 'text-emerald-400', bg: 'bg-emerald-400/10', glow: 'bg-emerald-500/20' },
    rose: { text: 'text-rose-400', bg: 'bg-rose-400/10', glow: 'bg-rose-500/20' },
    amber: { text: 'text-amber-400', bg: 'bg-amber-400/10', glow: 'bg-amber-500/20' },
    violet: { text: 'text-violet-400', bg: 'bg-violet-400/10', glow: 'bg-violet-500/20' },
    cyan: { text: 'text-cyan-400', bg: 'bg-cyan-400/10', glow: 'bg-cyan-500/20' },
    orange: { text: 'text-orange-400', bg: 'bg-orange-400/10', glow: 'bg-orange-500/20' },
    default: { text: 'text-foreground', bg: 'bg-white/[0.05]', glow: 'bg-white/[0.05]', icon: 'text-muted-foreground' }
  }
  const c = colors[accent]
  return (
    <div
      className="card-hover relative overflow-hidden rounded-2xl border border-white/[0.07] bg-card p-4 shadow-[0_4px_24px_rgba(0,0,0,0.5)] animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={cn("pointer-events-none absolute -top-8 -right-8 h-32 w-32 rounded-full blur-2xl", c.glow)} />
      <div className="relative z-10 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">{title}</p>
          <p className={cn('text-xl font-bold tracking-tight truncate', c.text)}>{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-1 truncate">{sub}</p>}
        </div>
        <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', c.bg)}>
          <Icon className={cn('h-4 w-4', c.icon || c.text)} />
        </div>
      </div>
    </div>
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
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
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

/* ── Main dashboard ── */
export function Dashboard() {
  const {
    cycles, periodStart, periodEnd, isPayrollCycle, cycleRangeLabel,
  } = usePayrollCycle(0)

  const layout = useDashboardLayout()

  const { data: overview  } = useQuery({ queryKey: ['overview'],  queryFn: () => dashApi.overview() })
  const { data: cycleDetail } = useQuery({
    queryKey: ['monthly-detail', periodStart, periodEnd],
    queryFn: () => dashApi.monthlyDetail({ date_from: periodStart, date_to: periodEnd }),
    enabled: !!(periodStart && periodEnd),
  })

  const trendCycles = cycles.slice(-6)
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

  const PIE_PALETTE = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#fb923c']
  const today   = new Date()
  const pieData = (byCat || []).slice(0, 6).map((b, i) => ({
    name: b.category_name, value: b.total, fill: PIE_PALETTE[i % PIE_PALETTE.length],
  }))
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

  const portfolioValue = portfolio?.total_market_value || portfolio?.total_invested || 0
  const netWorth   = balance + portfolioValue
  const investedPct = netWorth > 0 ? (portfolioValue / netWorth) * 100 : 0
  const cashPct     = netWorth > 0 ? (balance / netWorth) * 100 : 0
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
        balance={balance} savingsMonth={savingsMonth}
        incomeMonth={incomeMonth} expensesMonth={expensesMonth}
        goals={goals ?? []} cycleLabel={cycleLabel}
      />
    ),
    metrics: (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard title="Ahorro este tramo" value={formatCurrency(savingsMonth)} icon={PiggyBank}
          accent={savingsMonth >= 0 ? 'emerald' : 'rose'}
          sub={incomeMonth > 0 ? `${((savingsMonth / incomeMonth) * 100).toFixed(1)}% de los ingresos` : undefined} delay={75} />
        <MetricCard title="Mayor gasto cat." value={byCat?.[0] ? formatCurrency(byCat[0].total) : '—'} icon={TrendingDown}
          accent="amber" sub={byCat?.[0]?.category_name} delay={150} />
        <MetricCard title="Patrimonio Invertido" value={`${Math.round(investedPct)}%`} icon={Scale}
          accent="violet" sub={`Frente a un ${Math.round(cashPct)}% parado en banco`} delay={225} />
        <MetricCard title="Ritmo de gasto"
          value={hasPrevPace ? `${paceDiff >= 0 ? '+' : ''}${paceDiff.toFixed(1)}%` : '—'}
          icon={Activity} accent={hasPrevPace ? (paceDiff <= 0 ? 'cyan' : 'rose') : 'default'}
          sub="vs media diaria ciclo ant." delay={300} />
      </div>
    ),
    trend: (
      <Card className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-positive/[0.05] blur-3xl" />
        <CardHeader className="relative z-10 pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {isPayrollCycle ? 'Flujo de caja por nómina' : 'Ingresos vs Gastos · 6 meses'}
          </CardTitle>
        </CardHeader>
        <CardContent className="relative z-10 px-2 pb-4" style={{ minHeight: 240 }}>
          {isPayrollCycle ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ left: -10, right: 4 }}>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }} />
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
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
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
      <Card className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-negative/[0.05] blur-3xl" />
        <CardHeader className="relative z-10 pb-2">
          <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Gastos por categoría</CardTitle>
        </CardHeader>
        <CardContent className="relative z-10 pb-4">
          {pieData.length > 0 ? (
            <div className="space-y-3">
              <div className="relative h-44">
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                  <div className="text-center">
                    <p className="text-base font-bold text-foreground leading-tight">{formatCurrency(totalPie)}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">este tramo</p>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={52} outerRadius={76} paddingAngle={2} dataKey="value" startAngle={90} endAngle={-270} strokeWidth={0}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} opacity={0.85} />)}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5">
                {pieData.map((entry, i) => {
                  const pct = totalPie > 0 ? Math.round((entry.value / totalPie) * 100) : 0
                  return (
                    <div key={i} className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: entry.fill }} />
                      <span className="text-[11px] text-muted-foreground truncate flex-1">{entry.name}</span>
                      <span className="text-[11px] font-medium tabular-nums">{formatCurrency(entry.value)}</span>
                      <span className="text-[10px] text-muted-foreground/60 w-7 text-right tabular-nums">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">Sin datos</div>
          )}
        </CardContent>
      </Card>
    ),
    insights: <InsightsWidget />,
    networth: <NetWorthChart months={24} />,
    personality: (
      <div className="grid gap-4 lg:grid-cols-2">
        <SpendingPersonality />
        <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-card p-5 shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
          <Achievements compact />
        </div>
      </div>
    ),
    upcoming: (
      <Card className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-amber-500/[0.05] blur-3xl" />
        <CardHeader className="relative z-10 flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Próximos pagos recurrentes</CardTitle>
          <Link to="/monthly" className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors">
            Ver todos <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="relative z-10 space-y-1 pb-4">
          {upcoming?.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No hay pagos próximos</p>}
          {upcoming?.slice(0, 4).map(r => (
            <div key={r.id} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-base">{r.category?.icon || '💳'}</span>
                <div>
                  <p className="text-sm font-medium text-foreground truncate max-w-[150px]">{r.display_name}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Calendar className="h-3 w-3" />
                    {r.next_expected_date ? formatDate(r.next_expected_date) : 'Sin fecha'}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-sm font-semibold text-negative">-{formatCurrency(r.avg_amount)}</p>
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
      <Card className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/[0.04] blur-3xl" />
        <CardHeader className="relative z-10 flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Últimas transacciones</CardTitle>
          <Link to="/transacciones" className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors">
            Ver todas <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        <CardContent className="relative z-10 space-y-1 pb-4">
          {txs?.items.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">Sin transacciones</p>}
          {txs?.items.map(tx => (
            <div key={tx.id} className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-base">{tx.category?.icon || '💳'}</span>
                <div>
                  <p className="text-sm font-medium text-foreground truncate max-w-[150px]">{tx.name || tx.description || tx.type}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(tx.date)}</p>
                </div>
              </div>
              <span className={cn('text-sm font-semibold shrink-0 ml-2', tx.amount >= 0 ? 'text-primary' : 'text-negative')}>
                {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    ),
  }

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
        <SortableContext items={layout.order} strategy={verticalListSortingStrategy}>
          <div className="space-y-5">
            {layout.order.map(id => (
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
