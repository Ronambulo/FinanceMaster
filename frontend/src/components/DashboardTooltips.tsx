import { formatCurrency } from '@/lib/utils'

export const ChartTooltip = ({ active, payload, label }: any) => {
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

export const PieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 text-xs shadow-card-hover">
      <p className="font-medium text-popover-foreground">{payload[0].name}</p>
      <p style={{ color: payload[0].payload.fill }} className="font-bold tabular-nums">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}
