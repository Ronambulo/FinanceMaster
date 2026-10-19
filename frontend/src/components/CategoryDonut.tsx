import { useState } from 'react'
import { cn, formatCurrency } from '@/lib/utils'
import { ResponsiveContainer, Cell, PieChart, Pie, Tooltip } from 'recharts'
import { PieTooltip } from '@/components/DashboardTooltips'

/* ── Gastos por categoría: donut + leyenda lateral interactiva ── */
export function CategoryDonut({
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
