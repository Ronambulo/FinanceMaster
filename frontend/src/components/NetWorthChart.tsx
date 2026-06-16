import { useQuery } from '@tanstack/react-query'
import { dashApi } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { TrendingUp } from 'lucide-react'

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-[hsl(228_22%_7%)] p-3 text-xs shadow-xl min-w-[180px]">
      <p className="font-medium text-foreground/80 mb-2">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center justify-between gap-3 mt-0.5" style={{ color: p.color }}>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold tabular-nums">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

export function NetWorthChart({ months = 24 }: { months?: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['net-worth-history', months],
    queryFn: () => dashApi.netWorthHistory(months),
    staleTime: 10 * 60_000,
  })

  const latest = data?.[data.length - 1]
  const oldest = data?.[0]
  const change = latest && oldest ? latest.net_worth - oldest.net_worth : null

  // Format month label
  const chartData = (data ?? []).map(p => ({
    ...p,
    label: new Date(p.month + '-15').toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }),
  }))

  return (
    <Card className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-violet-500/[0.06] blur-3xl" />
      <CardHeader className="relative z-10 pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Patrimonio Neto Histórico
            </CardTitle>
            {latest && (
              <p className="text-2xl font-bold tracking-tight mt-1 text-violet-400">
                {formatCurrency(latest.net_worth)}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-400/10">
              <TrendingUp className="h-4 w-4 text-violet-400" />
            </div>
            {change !== null && (
              <span className={`text-[11px] font-medium ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {change >= 0 ? '+' : ''}{formatCurrency(change)}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative z-10 px-2 pb-4">
        {isLoading ? (
          <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">Cargando…</div>
        ) : chartData.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-xs text-muted-foreground">Sin datos suficientes</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ left: -10, right: 4 }}>
                <defs>
                  <linearGradient id="gradNW" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a78bfa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradCash" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#38bdf8" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradPortfolio" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#34d399" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
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
                  dataKey="cash"
                  name="Cuenta"
                  stroke="#38bdf8"
                  strokeWidth={1.5}
                  fill="url(#gradCash)"
                  dot={false}
                  stackId="1"
                />
                <Area
                  type="monotone"
                  dataKey="portfolio"
                  name="Portfolio"
                  stroke="#34d399"
                  strokeWidth={1.5}
                  fill="url(#gradPortfolio)"
                  dot={false}
                  stackId="1"
                />
                <Area
                  type="monotone"
                  dataKey="net_worth"
                  name="Patrimonio"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  fill="url(#gradNW)"
                  dot={false}
                  strokeDasharray={undefined}
                />
              </AreaChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex items-center justify-center gap-5 mt-2 px-4">
              {[
                { color: '#38bdf8', label: 'Cuenta' },
                { color: '#34d399', label: 'Portfolio' },
                { color: '#ef4444', label: 'Deudas' },
                { color: '#a78bfa', label: 'Patrimonio' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-3 rounded-full" style={{ background: color }} />
                  <span className="text-[10px] text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
