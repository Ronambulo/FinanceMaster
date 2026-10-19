import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { formatCurrency } from '@/lib/utils'

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const periodLabel = payload[0]?.payload?.periodLabel || label
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-card-hover">
      <p className="font-medium text-foreground/80 mb-2">{periodLabel}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-1.5" style={{ color: p.stroke }}>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.stroke }} />
          {p.name}: <span className="font-semibold ml-auto pl-3 tabular-nums">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

export function CycleTrendChart({
  chartData, incomeColor, expenseColor, savingsColor,
}: {
  chartData: { month: string; periodLabel: string; Ingresos: number; Gastos: number; Ahorro: number }[]
  incomeColor: string
  expenseColor: string
  savingsColor: string
}) {
  return (
    <Card className="card-hover rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Tendencia por tramos</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false}
              tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<ChartTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }} />
            <Line type="monotone" dataKey="Ingresos" stroke={incomeColor}  strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Gastos"   stroke={expenseColor} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Ahorro"   stroke={savingsColor} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
