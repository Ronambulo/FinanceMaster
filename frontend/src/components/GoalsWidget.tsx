import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { Goal } from '@/lib/api'

/* ── Objetivos: circular-progress goal rings, promoted right under the hero ── */
function GoalRing({ pct, color }: { pct: number; color: string }) {
  const size = 72, cx = size / 2, cy = size / 2, r = 28, sw = 7
  const circumference = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, pct))
  const dash = (clamped / 100) * circumference
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={sw} />
      <circle
        cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw}
        strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <text x={cx} y={cy + 5} textAnchor="middle" fontFamily='"Space Grotesk"' fontSize="15" fontWeight="600" fill="hsl(var(--foreground))">
        {Math.round(clamped)}%
      </text>
    </svg>
  )
}

function goalStatus(g: Goal): { label: string; variant: 'success' | 'warning' | 'muted' } {
  if (g.progress_pct >= 100) return { label: 'Completado', variant: 'success' }
  if (g.deadline) {
    const overdue = new Date(g.deadline + 'T23:59:59') < new Date()
    return overdue
      ? { label: 'Retrasado', variant: 'warning' }
      : { label: formatDate(g.deadline), variant: 'muted' }
  }
  return { label: 'En camino', variant: 'success' }
}

export function GoalsWidget({ goals }: { goals: Goal[] }) {
  const active = goals
    .filter(g => g.is_active)
    .sort((a, b) => {
      const aDone = a.progress_pct >= 100
      const bDone = b.progress_pct >= 100
      if (aDone !== bDone) return aDone ? 1 : -1
      return b.progress_pct - a.progress_pct
    })
  const shown = active.slice(0, 2)

  return (
    <Card className="card-hover overflow-hidden animate-fade-up">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Objetivos</CardTitle>
        <Link to="/objetivos" className="flex items-center gap-1 text-xs text-primary/70 transition-colors hover:text-primary">
          Ver todos <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pb-5">
        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No tienes objetivos activos todavía</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {shown.map((g, i) => {
              const color = `hsl(var(--chart-${(i % 4) + 1}))`
              const status = goalStatus(g)
              const subLabel = g.type === 'EURO_TARGET' && g.target_amount
                ? `${formatCurrency(g.current_amount)} de ${formatCurrency(g.target_amount)}`
                : `${g.target_percent ?? 0}% del ingreso mensual`
              return (
                <div key={g.id} className="flex items-center gap-3.5 rounded-xl bg-secondary/60 p-3.5">
                  <GoalRing pct={g.progress_pct} color={color} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{g.name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground tabular-nums">{subLabel}</p>
                    <Badge variant={status.variant} className="mt-2 text-[10px]">{status.label}</Badge>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
