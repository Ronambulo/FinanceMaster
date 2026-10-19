import type { PortfolioPosition } from '@/lib/api'

// Purely derived from already-fetched positions — groups the long tail into
// "Otros" so the donut never needs more than the 4-color qualitative palette.
interface AllocSlice { label: string; value: number; pct: number; color: string }
const ALLOC_TOKENS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))']

function buildAllocation(positions: PortfolioPosition[], total: number): AllocSlice[] {
  if (total <= 0) return []
  const withValue = positions
    .map(p => ({ label: p.name || p.symbol, value: p.market_value ?? p.total_invested }))
    .filter(p => p.value > 0.0001)
    .sort((a, b) => b.value - a.value)
  if (!withValue.length) return []

  const groups = withValue.length <= 4
    ? withValue
    : [
        ...withValue.slice(0, 3),
        { label: 'Otros', value: withValue.slice(3).reduce((s, p) => s + p.value, 0) },
      ]

  return groups.map((g, i) => ({ ...g, pct: (g.value / total) * 100, color: ALLOC_TOKENS[i % ALLOC_TOKENS.length] }))
}

export function PortfolioAllocationDonut({ positions, total }: { positions: PortfolioPosition[]; total: number }) {
  const allocation = buildAllocation(positions, total)

  if (allocation.length === 0) {
    return <p className="py-8 text-center text-xs text-muted-foreground">Sin posiciones abiertas</p>
  }

  return (
    <>
      <div className="flex justify-center py-1">
        <svg viewBox="0 0 150 150" width={150} height={150}>
          <circle cx="75" cy="75" r="58" fill="none" stroke="hsl(var(--border))" strokeWidth="16" />
          {(() => {
            const C = 2 * Math.PI * 58
            let offset = 0
            return allocation.map(slice => {
              const dash = (slice.pct / 100) * C
              const el = (
                <circle
                  key={slice.label}
                  cx="75" cy="75" r="58" fill="none"
                  stroke={slice.color}
                  strokeWidth="16"
                  strokeDasharray={`${dash} ${C - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="round"
                  transform="rotate(-90 75 75)"
                />
              )
              offset += dash
              return el
            })
          })()}
          <text x="75" y="71" textAnchor="middle" className="fill-foreground font-display text-[16px] font-semibold">
            {positions.length}
          </text>
          <text x="75" y="88" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {positions.length === 1 ? 'activo' : 'activos'}
          </text>
        </svg>
      </div>
      <div className="mt-3 space-y-2">
        {allocation.map(slice => (
          <div key={slice.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
              <span className="truncate">{slice.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums">{slice.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </>
  )
}
