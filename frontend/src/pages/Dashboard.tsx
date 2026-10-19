import { useMemo, useState } from 'react'
import { useFeaturesStore } from '@/store/features'
import { useQuery, useQueries } from '@tanstack/react-query'
import { dashApi, txApi, goalApi, portfolioApi, budgetApi } from '@/lib/api'
import { usePayrollCycle } from '@/hooks/usePayrollCycle'
import { useDashboardLayout, type WidgetId } from '@/hooks/useDashboardLayout'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MetricCard } from '@/components/MetricCard'
import {
  TrendingDown, PiggyBank,
  Activity, Settings2, X, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SpendingPersonality } from '@/components/SpendingPersonality'
import { Achievements } from '@/components/Achievements'
import { NetWorthChart } from '@/components/NetWorthChart'
import { InsightsWidget } from '@/components/InsightsWidget'
import { BalanceHero } from '@/components/BalanceHero'
import { GoalsWidget } from '@/components/GoalsWidget'
import { CategoryDonut } from '@/components/CategoryDonut'
import { SortableWidget } from '@/components/SortableWidget'
import { CashFlowTrendCard } from '@/components/CashFlowTrendCard'
import { BudgetOverviewCard } from '@/components/BudgetOverviewCard'
import { UpcomingRecurringCard } from '@/components/UpcomingRecurringCard'
import { RecentTransactionsCard } from '@/components/RecentTransactionsCard'
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

function shortCycleLabel(dateStr: string) {
  return new Date(dateStr + 'T12:00:00')
    .toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
    .replace('.', '')
}

/* ── Main dashboard ── */
export function Dashboard() {
  const {
    cycles, periodStart, periodEnd, isPayrollCycle, cycleRangeLabel,
  } = usePayrollCycle(0)

  const layout = useDashboardLayout()
  const features = useFeaturesStore(s => s.features)

  const { data: overview, isLoading: overviewLoading } = useQuery({ queryKey: ['overview'],  queryFn: () => dashApi.overview() })
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

  if (overviewLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
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
      <CashFlowTrendCard
        isPayrollCycle={isPayrollCycle}
        trendData={trendData}
        numTramos={numTramos}
        onChangeTramos={setNumTramos}
      />
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
        <BudgetOverviewCard budgets={budgets} />
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
    upcoming: <UpcomingRecurringCard upcoming={upcoming} />,
    recent: <RecentTransactionsCard txs={txs?.items} />,
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
