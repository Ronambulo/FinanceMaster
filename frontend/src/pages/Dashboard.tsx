import { useQuery } from '@tanstack/react-query'
import { dashApi, txApi } from '@/lib/api'
import { formatCurrency, formatDate, formatMonth } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Wallet, PiggyBank, ArrowRight, Calendar } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts'
import { Link } from 'react-router-dom'

const RADIAN = Math.PI / 180

function StatCard({ title, value, icon: Icon, color, sub }: { title: string; value: string; icon: any; color: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-current/10 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-sm shadow-lg">
      <p className="font-medium mb-2">{formatMonth(label)}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.fill }} className="text-xs">
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

export function Dashboard() {
  const { data: overview } = useQuery({ queryKey: ['overview'], queryFn: () => dashApi.overview() })
  const { data: trend } = useQuery({ queryKey: ['trend'], queryFn: () => dashApi.monthlyTrend(6) })
  const { data: byCat } = useQuery({ queryKey: ['by-cat'], queryFn: () => dashApi.byCategory() })
  const { data: upcoming } = useQuery({ queryKey: ['upcoming'], queryFn: () => dashApi.upcoming(30) })
  const { data: txs } = useQuery({ queryKey: ['tx-recent'], queryFn: () => txApi.list({ page: 1, page_size: 5, account_category: 'CASH' }) })

  const today = new Date()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{today.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Balance total" value={formatCurrency(overview?.balance ?? 0)} icon={Wallet} color="text-foreground" />
        <StatCard title="Ingresos este mes" value={formatCurrency(overview?.income_month ?? 0)} icon={TrendingUp} color="text-emerald-400" />
        <StatCard title="Gastos este mes" value={formatCurrency(overview?.expenses_month ?? 0)} icon={TrendingDown} color="text-red-400" />
        <StatCard title="Ahorro este mes" value={formatCurrency(overview?.savings_month ?? 0)} icon={PiggyBank} color={(overview?.savings_month ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'} />
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Ingresos vs Gastos (6 meses)</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend || []} barGap={4}>
                <XAxis dataKey="month" tickFormatter={formatMonth} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="income" name="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar dataKey="expenses" name="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Gastos por categoría</CardTitle>
          </CardHeader>
          <CardContent className="h-56">
            {byCat && byCat.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCat.slice(0, 6)} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="total" nameKey="category_name">
                    {byCat.slice(0, 6).map((entry, i) => (
                      <Cell key={i} fill={entry.category_color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sin datos</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming recurring */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium">Próximos pagos recurrentes</CardTitle>
            <Link to="/recurrentes" className="text-xs text-primary flex items-center gap-1 hover:underline">
              Ver todos <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming?.length === 0 && <p className="text-sm text-muted-foreground">No hay pagos próximos</p>}
            {upcoming?.slice(0, 4).map(r => (
              <div key={r.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">{r.category?.icon || '💳'}</span>
                  <div>
                    <p className="text-sm font-medium truncate max-w-[160px]">{r.display_name}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {r.next_expected_date ? formatDate(r.next_expected_date) : 'Sin fecha'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-red-400">-{formatCurrency(r.avg_amount)}</p>
                  {r.days_until !== null && (
                    <Badge variant={r.days_until <= 7 ? 'warning' : 'muted'} className="text-xs">
                      {r.days_until === 0 ? 'Hoy' : r.days_until < 0 ? 'Vencido' : `${r.days_until}d`}
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Recent transactions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-medium">Últimas transacciones</CardTitle>
            <Link to="/transacciones" className="text-xs text-primary flex items-center gap-1 hover:underline">
              Ver todas <ArrowRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {txs?.items.length === 0 && <p className="text-sm text-muted-foreground">Sin transacciones</p>}
            {txs?.items.map(tx => (
              <div key={tx.id} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-base">{tx.category?.icon || '💳'}</span>
                  <div>
                    <p className="text-sm font-medium truncate max-w-[160px]">{tx.name || tx.description || tx.type}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                  </div>
                </div>
                <span className={`text-sm font-semibold ${tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
