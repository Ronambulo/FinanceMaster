import { useQuery } from '@tanstack/react-query'
import { dashApi, txApi, goalApi } from '@/lib/api'
import type { Goal } from '@/lib/api'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  TrendingUp, TrendingDown, Wallet, PiggyBank, Target,
  ArrowRight, Calendar, Percent, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

/* ── Tooltip components ── */
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-[hsl(228_22%_7%)] p-3 text-xs shadow-xl">
      <p className="font-medium text-foreground/80 mb-2">{formatMonth(label)}</p>
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
function BalanceHero({ balance, savingsMonth, incomeMonth, expensesMonth, goals }: {
  balance: number; savingsMonth: number; incomeMonth: number; expensesMonth: number; goals: Goal[]
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
              <span className="text-xs text-muted-foreground">este mes</span>
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

        {/* ── Balance split: Disponible vs Objetivos ── */}
        {hasGoals ? (
          <div className="mt-5 grid grid-cols-2 gap-3">
            {/* Disponible */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] text-muted-foreground">Disponible</span>
              </div>
              <p className="text-base font-bold text-foreground">{formatCurrency(Math.max(available, 0))}</p>
            </div>
            {/* Guardado en objetivos */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.05] p-3 space-y-1">
              <div className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] text-muted-foreground">En objetivos</span>
              </div>
              <p className="text-base font-bold text-primary">{formatCurrency(savedInGoals)}</p>
            </div>
            {/* Mini progress bars por objetivo */}
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
          /* Sin objetivos: mostrar ingresos/gastos como antes */
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

/* ── Small metric card ── */
function MetricCard({
  title, value, icon: Icon, positive, sub, delay = 0
}: {
  title: string; value: string; icon: any; positive?: boolean | null; sub?: string; delay?: number
}) {
  const isGreen  = positive === true
  const isRed    = positive === false
  const isNeutral = positive === null || positive === undefined

  return (
    <div
      className="card-hover rounded-xl border border-white/[0.07] bg-card p-4 shadow-card animate-fade-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">{title}</p>
          <p className={cn(
            'text-xl font-bold tracking-tight truncate',
            isGreen   && 'text-positive',
            isRed     && 'text-negative',
            isNeutral && 'text-foreground',
          )}>
            {value}
          </p>
          {sub && <p className="text-[10px] text-muted-foreground mt-1 truncate">{sub}</p>}
        </div>
        <div className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          isGreen   && 'bg-positive/10',
          isRed     && 'bg-negative/10',
          isNeutral && 'bg-white/[0.05]',
        )}>
          <Icon className={cn(
            'h-4 w-4',
            isGreen   && 'text-positive',
            isRed     && 'text-negative',
            isNeutral && 'text-muted-foreground',
          )} />
        </div>
      </div>
    </div>
  )
}

/* ── Main dashboard ── */
export function Dashboard() {
  const { data: overview  } = useQuery({ queryKey: ['overview'],  queryFn: () => dashApi.overview() })
  const { data: trend     } = useQuery({ queryKey: ['trend'],     queryFn: () => dashApi.monthlyTrend(6) })
  const { data: byCat     } = useQuery({ queryKey: ['by-cat'],    queryFn: () => dashApi.byCategory() })
  const { data: upcoming  } = useQuery({ queryKey: ['upcoming'],  queryFn: () => dashApi.upcoming(30) })
  const { data: txs       } = useQuery({ queryKey: ['tx-recent'], queryFn: () => txApi.list({ page: 1, page_size: 5, account_category: 'CASH' }) })
  const { data: goals     } = useQuery({ queryKey: ['goals'],     queryFn: goalApi.list })

  // Vibrant palette designed for dark backgrounds — overrides flat/gray category colors
  const PIE_PALETTE = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#fb923c']

  const today   = new Date()
  const pieData = (byCat || []).slice(0, 6).map((b, i) => ({
    name: b.category_name,
    value: b.total,
    fill: PIE_PALETTE[i % PIE_PALETTE.length],
  }))
  const totalPie = pieData.reduce((s, e) => s + e.value, 0)

  const balance      = overview?.balance        ?? 0
  const incomeMonth  = overview?.income_month   ?? 0
  const expensesMonth= overview?.expenses_month ?? 0
  const savingsMonth = overview?.savings_month  ?? 0
  const interestMonth= overview?.interest_month ?? 0
  const interestTotal= overview?.interest_total ?? 0

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      {/* Date header */}
      <div className="animate-fade-in">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-0.5 capitalize">
          {today.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* ── Hero balance ── */}
      <BalanceHero
        balance={balance}
        savingsMonth={savingsMonth}
        incomeMonth={incomeMonth}
        expensesMonth={expensesMonth}
        goals={goals ?? []}
      />

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          title="Ahorro este mes"
          value={formatCurrency(savingsMonth)}
          icon={PiggyBank}
          positive={savingsMonth >= 0 ? true : false}
          delay={75}
        />
        <MetricCard
          title="Intereses este mes"
          value={formatCurrency(interestMonth)}
          icon={Percent}
          positive={null}
          sub={
            balance > 0 && interestMonth > 0
              ? `≈${((interestMonth * 12) / balance * 100).toFixed(2)}% TAE · Total: ${formatCurrency(interestTotal)}`
              : `Total acumulado: ${formatCurrency(interestTotal)}`
          }
          delay={150}
        />
        <MetricCard
          title="Mayor gasto cat."
          value={byCat?.[0] ? formatCurrency(byCat[0].total) : '—'}
          icon={TrendingDown}
          positive={false}
          sub={byCat?.[0]?.category_name}
          delay={225}
        />
        <MetricCard
          title="Transacciones"
          value={`${txs?.total ?? 0}`}
          icon={TrendingUp}
          positive={null}
          sub="este mes en efectivo"
          delay={300}
        />
      </div>

      {/* ── Charts ── */}
      <div className="grid gap-5 lg:grid-cols-5">
        {/* Area / Bar chart */}
        <Card className="lg:col-span-3 animate-fade-up flex flex-col" style={{ animationDelay: '100ms' }}>
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Ingresos vs Gastos · 6 meses
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 px-2 pb-4 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend || []} margin={{ left: -10, right: 4 }}>
                <defs>
                  <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(var(--positive))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--positive))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="hsl(var(--negative))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--negative))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonth}
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="income"
                  name="Ingresos"
                  stroke="hsl(var(--positive))"
                  strokeWidth={2}
                  fill="url(#gradIncome)"
                  dot={false}
                  activeDot={{ r: 4, fill: 'hsl(var(--positive))', strokeWidth: 0 }}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  name="Gastos"
                  stroke="hsl(var(--negative))"
                  strokeWidth={2}
                  fill="url(#gradExpenses)"
                  dot={false}
                  activeDot={{ r: 4, fill: 'hsl(var(--negative))', strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Donut chart */}
        <Card className="lg:col-span-2 animate-fade-up" style={{ animationDelay: '150ms' }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Gastos por categoría
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            {pieData.length > 0 ? (
              <div className="space-y-3">
                {/* Donut + center label overlay */}
                <div className="relative h-44">
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                    <div className="text-center">
                      <p className="text-base font-bold text-foreground leading-tight">{formatCurrency(totalPie)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest">este mes</p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={76}
                        paddingAngle={2}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                        strokeWidth={0}
                      >
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} opacity={0.85} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend: dot · name · amount · % */}
                <div className="space-y-1.5">
                  {pieData.map((entry, i) => {
                    const pct = totalPie > 0 ? Math.round((entry.value / totalPie) * 100) : 0
                    return (
                      <div key={i} className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: entry.fill }}
                        />
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
      </div>

      {/* ── Bottom row ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Upcoming recurring */}
        <Card className="animate-fade-up" style={{ animationDelay: '200ms' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Próximos pagos recurrentes
            </CardTitle>
            <Link
              to="/monthly"
              className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
            >
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-1 pb-4">
            {upcoming?.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No hay pagos próximos</p>
            )}
            {upcoming?.slice(0, 4).map(r => (
              <div
                key={r.id}
                className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-base">
                    {r.category?.icon || '💳'}
                  </span>
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

        {/* Recent transactions */}
        <Card className="animate-fade-up" style={{ animationDelay: '250ms' }}>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Últimas transacciones
            </CardTitle>
            <Link
              to="/transacciones"
              className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
            >
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-1 pb-4">
            {txs?.items.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin transacciones</p>
            )}
            {txs?.items.map(tx => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-base">
                    {tx.category?.icon || '💳'}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground truncate max-w-[150px]">
                      {tx.name || tx.description || tx.type}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(tx.date)}</p>
                  </div>
                </div>
                <span className={cn(
                  'text-sm font-semibold shrink-0 ml-2',
                  tx.amount >= 0 ? 'text-primary' : 'text-negative',
                )}>
                  {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
