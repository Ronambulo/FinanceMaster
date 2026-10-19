import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, LineChart, Line, Legend, ReferenceLine,
} from 'recharts'
import { ChartTooltip } from '@/components/DashboardTooltips'

export function CashFlowTrendCard({
  isPayrollCycle, trendData, numTramos, onChangeTramos,
}: {
  isPayrollCycle: boolean
  trendData: { month: string; periodLabel: string; income: number; expenses: number; savings: number }[]
  numTramos: number | null
  onChangeTramos: (n: number | null) => void
}) {
  return (
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
                onClick={() => onChangeTramos(n)}
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
  )
}
