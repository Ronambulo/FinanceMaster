import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Calendar } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCurrency, formatDate } from '@/lib/utils'
import type { UpcomingRecurring } from '@/lib/api'

export function UpcomingRecurringCard({ upcoming }: { upcoming: UpcomingRecurring[] | undefined }) {
  return (
    <Card className="card-hover overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Próximos pagos recurrentes</CardTitle>
        <Link to="/monthly" className="flex items-center gap-1 text-xs text-primary/70 transition-colors hover:text-primary">
          Ver todos <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-1 pb-4">
        {upcoming?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No hay pagos próximos</p>}
        {upcoming?.slice(0, 4).map(r => (
          <div key={r.id} className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-base">{r.category?.icon || '💳'}</span>
              <div>
                <p className="max-w-[150px] truncate text-sm font-medium text-foreground">{r.display_name}</p>
                <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {r.next_expected_date ? formatDate(r.next_expected_date) : 'Sin fecha'}
                </p>
              </div>
            </div>
            <div className="ml-2 shrink-0 text-right">
              <p className="text-sm font-semibold text-negative tabular-nums">-{formatCurrency(r.avg_amount)}</p>
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
  )
}
