import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recurringApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { RefreshCw, Trash2, Calendar, Loader2 } from 'lucide-react'

export function Recurring() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const { data: groups, isLoading } = useQuery({ queryKey: ['recurring'], queryFn: recurringApi.list })

  const detectMutation = useMutation({
    mutationFn: recurringApi.detect,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); toast('Detección completada', 'success') },
  })

  const deleteMutation = useMutation({
    mutationFn: recurringApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); toast('Eliminado', 'success') },
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => recurringApi.update(id, { is_active }),
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey: ['recurring'] })
      const prev = qc.getQueryData(['recurring'])
      qc.setQueryData(['recurring'], (old: any[]) => old?.map(g => g.id === id ? { ...g, is_active } : g))
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['recurring'], ctx.prev)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring'] }),
  })

  const totalMonthly = groups?.filter(g => g.is_active && g.period_days === 30)
    .reduce((sum, g) => sum + (g.avg_amount || 0), 0) || 0

  const today = new Date()

  const periodLabel = (days: number | null) => {
    if (days === 7) return 'Semanal'
    if (days === 14) return 'Quincenal'
    if (days === 30) return 'Mensual'
    if (days === 365) return 'Anual'
    return `Cada ${days}d`
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pagos Recurrentes</h1>
          <p className="text-sm text-muted-foreground">{groups?.length ?? 0} compromisos detectados</p>
        </div>
        <Button variant="outline" onClick={() => detectMutation.mutate()} disabled={detectMutation.isPending}>
          {detectMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Re-detectar
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Total mensual</p>
          <p className="text-xl font-semibold tracking-tight text-negative">-{formatCurrency(totalMonthly)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Compromisos activos</p>
          <p className="text-xl font-semibold tracking-tight">{groups?.filter(g => g.is_active).length ?? 0}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Próximo pago</p>
          <p className="text-xl font-semibold tracking-tight text-sm">
            {groups?.find(g => g.is_active && g.next_expected_date)
              ? formatDate(groups.find(g => g.is_active && g.next_expected_date)!.next_expected_date!)
              : '—'
            }
          </p>
        </CardContent></Card>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-3">
          {groups?.map(g => {
            const nextDate = g.next_expected_date ? new Date(g.next_expected_date + 'T00:00:00') : null
            const daysUntil = nextDate ? Math.ceil((nextDate.getTime() - today.getTime()) / 86400000) : null

            return (
              <Card key={g.id} className={!g.is_active ? 'opacity-50' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-2xl shrink-0">{g.category?.icon || '💳'}</span>
                    <div className="flex-1 min-w-0" style={{ minWidth: '140px' }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold truncate">{g.display_name}</p>
                        <Badge variant="secondary" className="text-xs">{periodLabel(g.period_days)}</Badge>
                        {!g.is_active && <Badge variant="muted" className="text-xs">Inactivo</Badge>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {nextDate ? formatDate(nextDate.toISOString().slice(0, 10)) : 'Sin fecha'}
                        </span>
                        {daysUntil !== null && (
                          <Badge variant={daysUntil <= 3 ? 'warning' : 'muted'} className="text-xs">
                            {daysUntil === 0 ? 'Hoy' : daysUntil < 0 ? `Vencido ${Math.abs(daysUntil)}d` : `en ${daysUntil}d`}
                          </Badge>
                        )}
                        <span>{g.transaction_count} pagos detectados</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-auto shrink-0">
                      <p className="font-bold text-negative text-base">-{formatCurrency(g.avg_amount || 0)}</p>
                      <Button
                        variant="ghost" size="icon"
                        onClick={() => toggleMutation.mutate({ id: g.id, is_active: !g.is_active })}
                        title={g.is_active ? 'Desactivar' : 'Activar'}
                      >
                        <RefreshCw className={`h-4 w-4 ${g.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(g.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
          {groups?.length === 0 && (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              No se han detectado pagos recurrentes. Importa transacciones y pulsa "Re-detectar".
            </CardContent></Card>
          )}
        </div>
      )}
    </div>
  )
}
