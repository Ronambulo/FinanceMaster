import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { Transaction } from '@/lib/api'

export function RecentTransactionsCard({ txs }: { txs: Transaction[] | undefined }) {
  return (
    <Card className="card-hover overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Últimas transacciones</CardTitle>
        <Link to="/transacciones" className="flex items-center gap-1 text-xs text-primary/70 transition-colors hover:text-primary">
          Ver todas <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-1 pb-4">
        {txs?.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Sin transacciones</p>}
        {txs?.map(tx => (
          <div key={tx.id} className="flex items-center justify-between border-b border-border/60 py-2.5 last:border-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-base">{tx.category?.icon || '💳'}</span>
              <div>
                <p className="max-w-[150px] truncate text-sm font-medium text-foreground">{tx.name || tx.description || tx.type}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(tx.date)}</p>
              </div>
            </div>
            <span className={cn('ml-2 shrink-0 text-sm font-semibold tabular-nums', tx.amount >= 0 ? 'text-primary' : 'text-negative')}>
              {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
