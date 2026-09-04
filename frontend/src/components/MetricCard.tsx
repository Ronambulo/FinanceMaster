import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export function MetricCard({
  title, value, icon: Icon, accent = 'muted', sub, delay = 0,
}: {
  title: string; value: string; icon: any
  accent?: 'positive' | 'negative' | 'warning' | 'chart-2' | 'chart-4' | 'muted'
  sub?: string; delay?: number
}) {
  const styles: Record<string, { text: string; iconBg: string; iconText: string }> = {
    positive: { text: 'text-positive', iconBg: 'bg-positive/10', iconText: 'text-positive' },
    negative: { text: 'text-negative', iconBg: 'bg-negative/10', iconText: 'text-negative' },
    warning:  { text: 'text-warning',  iconBg: 'bg-warning/10',  iconText: 'text-warning' },
    'chart-2':{ text: 'text-chart-2',  iconBg: 'bg-chart-2/10',  iconText: 'text-chart-2' },
    'chart-4':{ text: 'text-chart-4',  iconBg: 'bg-chart-4/10',  iconText: 'text-chart-4' },
    muted:    { text: 'text-foreground', iconBg: 'bg-secondary', iconText: 'text-muted-foreground' },
  }
  const s = styles[accent]
  return (
    <Card className="card-hover animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-4">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', s.iconBg)}>
          <Icon className={cn('h-4 w-4', s.iconText)} />
        </div>
        <p className="mt-3 text-[11px] uppercase tracking-widest text-muted-foreground">{title}</p>
        <p className={cn('mt-1 truncate text-xl font-semibold tracking-tight tabular-nums', s.text)}>{value}</p>
        {sub && <p className="mt-1 truncate text-[10px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}
