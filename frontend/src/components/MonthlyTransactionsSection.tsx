import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Loader2, Eye, EyeOff, Repeat2 } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { MonthlyDetailRow } from '@/lib/api'

export function MonthlyTransactionsSection({
  detail, loadingDetail, onToggleExclude, onMarkRecurring, onDeleteRecurringGroup,
}: {
  detail: MonthlyDetailRow[] | undefined
  loadingDetail: boolean
  onToggleExclude: (id: number, exclude: boolean) => void
  onMarkRecurring: (row: MonthlyDetailRow) => void
  onDeleteRecurringGroup: (groupId: number) => void
}) {
  const [txSearch, setTxSearch]     = useState('')
  const [txTypeGroup, setTxTypeGroup] = useState('')  // '' | 'income' | 'expense'

  const filteredDetail = useMemo(() => {
    let rows = detail ?? []
    if (txSearch) {
      const s = txSearch.toLowerCase()
      rows = rows.filter(r => r.name?.toLowerCase().includes(s) || r.category_name.toLowerCase().includes(s))
    }
    if (txTypeGroup === 'income')  rows = rows.filter(r => r.amount > 0)
    if (txTypeGroup === 'expense') rows = rows.filter(r => r.amount < 0)
    return rows
  }, [detail, txSearch, txTypeGroup])

  return (
    <Card className="card-hover rounded-2xl">
      <CardHeader className="pb-2 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Transacciones del período
          </CardTitle>
          <span className="text-xs text-muted-foreground/60">ojo = excluida del cálculo</span>
        </div>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              className="pl-8 h-8 text-sm"
              value={txSearch}
              onChange={e => setTxSearch(e.target.value)}
            />
          </div>
          <Select value={txTypeGroup || 'all'} onValueChange={v => setTxTypeGroup(v === 'all' ? '' : v)}>
            <SelectTrigger className="h-8 sm:w-36 text-sm">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="income">↑ Ingresos</SelectItem>
              <SelectItem value="expense">↓ Gastos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loadingDetail ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            {/* Mobile */}
            <div className="sm:hidden divide-y divide-border">
              {filteredDetail.map(row => (
                <div key={row.id} className={cn('flex items-center gap-3 px-4 py-3', row.exclude_from_stats && 'opacity-40')}>
                  <span className="text-lg shrink-0">{row.category_icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{row.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(row.date)} · {row.category_name}</p>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <p className={cn('text-sm font-semibold tabular-nums', row.amount >= 0 ? 'text-positive' : 'text-negative')}>
                      {row.amount >= 0 ? '+' : ''}{formatCurrency(row.amount)}
                    </p>
                    <button
                      onClick={() => onToggleExclude(row.id, !row.exclude_from_stats)}
                      className="text-muted-foreground/60 hover:text-primary transition-colors"
                      title={row.exclude_from_stats ? 'Incluir en cálculo' : 'Excluir del cálculo'}
                    >
                      {row.exclude_from_stats ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                    {row.recurring_group_id ? (
                      <button
                        onClick={() => onDeleteRecurringGroup(row.recurring_group_id!)}
                        className="text-primary hover:text-negative transition-colors"
                        title="Quitar grupo recurrente"
                      >
                        <Repeat2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => onMarkRecurring(row)}
                        className="text-muted-foreground/40 hover:text-primary transition-colors"
                        title="Marcar como recurrente"
                      >
                        <Repeat2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left px-4 py-2.5 font-medium">Fecha</th>
                    <th className="text-left px-4 py-2.5 font-medium">Nombre</th>
                    <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Categoría</th>
                    <th className="text-right px-4 py-2.5 font-medium">Importe</th>
                    <th className="px-4 py-2.5 text-center font-medium w-10" title="Incluir/excluir del cálculo">
                      <Eye className="h-3.5 w-3.5 mx-auto" />
                    </th>
                    <th className="px-4 py-2.5 text-center font-medium w-10" title="Recurrente">
                      <Repeat2 className="h-3.5 w-3.5 mx-auto" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDetail.map(row => (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-b border-border hover:bg-accent/40 transition-colors',
                        row.exclude_from_stats && 'opacity-40',
                      )}
                    >
                      <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(row.date)}</td>
                      <td className="px-4 py-2.5 font-medium max-w-[200px] truncate">{row.name}</td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full border"
                          style={{ color: row.category_color, borderColor: row.category_color }}
                        >
                          {row.category_icon} {row.category_name}
                        </span>
                      </td>
                      <td className={cn('px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap', row.amount >= 0 ? 'text-positive' : 'text-negative')}>
                        {row.amount >= 0 ? '+' : ''}{formatCurrency(row.amount)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button
                          onClick={() => onToggleExclude(row.id, !row.exclude_from_stats)}
                          className="text-muted-foreground/60 hover:text-primary transition-colors"
                          title={row.exclude_from_stats ? 'Incluir' : 'Excluir'}
                        >
                          {row.exclude_from_stats
                            ? <EyeOff className="h-4 w-4 text-negative/70" />
                            : <Eye className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {row.recurring_group_id ? (
                          <button
                            onClick={() => onDeleteRecurringGroup(row.recurring_group_id!)}
                            className="text-primary hover:text-negative transition-colors"
                            title="Quitar grupo recurrente"
                          >
                            <Repeat2 className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => onMarkRecurring(row)}
                            className="text-muted-foreground/40 hover:text-primary transition-colors"
                            title="Marcar como recurrente"
                          >
                            <Repeat2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredDetail.length === 0 && (
                <p className="text-center py-8 text-muted-foreground text-sm">
                  {(detail?.length ?? 0) > 0 ? 'Sin resultados para los filtros activos' : 'Sin transacciones en este período'}
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
