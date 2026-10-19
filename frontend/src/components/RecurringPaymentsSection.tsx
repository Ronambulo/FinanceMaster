import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, Calendar, Trash2, Archive, ChevronDown } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import type { RecurringGroup } from '@/lib/api'

export function RecurringPaymentsSection({
  recurringGroups, loadingRecurring, onDetect, isDetecting, onToggleActive, onDeleteRequest,
}: {
  recurringGroups: RecurringGroup[] | undefined
  loadingRecurring: boolean
  onDetect: () => void
  isDetecting: boolean
  onToggleActive: (id: number, is_active: boolean) => void
  onDeleteRequest: (id: number) => void
}) {
  const [showInactiveRecurring, setShowInactiveRecurring] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Pagos recurrentes</h2>
          <p className="text-xs text-muted-foreground">{recurringGroups?.length ?? 0} compromisos detectados</p>
        </div>
        <Button variant="outline" size="sm" onClick={onDetect} disabled={isDetecting}>
          {isDetecting
            ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Re-detectar
        </Button>
      </div>

      {/* Resumen recurrentes */}
      {recurringGroups && recurringGroups.length > 0 && (() => {
        const totalMonthly = recurringGroups
          .filter(g => g.is_active && g.period_days === 30)
          .reduce((s, g) => s + (g.avg_amount || 0), 0)
        const activeCount = recurringGroups.filter(g => g.is_active).length
        const nextGroup = recurringGroups
          .filter(g => g.is_active && g.next_expected_date)
          .sort((a, b) => (a.next_expected_date ?? '').localeCompare(b.next_expected_date ?? ''))[0]

        return (
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="card-hover rounded-2xl">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Coste mensual fijo</p>
                <p className="text-lg font-semibold tabular-nums text-negative">-{formatCurrency(totalMonthly)}</p>
              </CardContent>
            </Card>
            <Card className="card-hover rounded-2xl">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Compromisos activos</p>
                <p className="text-lg font-semibold tabular-nums">{activeCount}</p>
              </CardContent>
            </Card>
            <Card className="card-hover rounded-2xl">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Próximo pago</p>
                <p className="text-sm font-semibold tabular-nums">
                  {nextGroup ? formatDate(nextGroup.next_expected_date!) : '—'}
                </p>
              </CardContent>
            </Card>
          </div>
        )
      })()}

      {/* Lista */}
      {loadingRecurring ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (() => {
        const periodLabel = (d: number | null) => {
          if (d === 7) return 'Semanal'
          if (d === 14) return 'Quincenal'
          if (d === 30) return 'Mensual'
          if (d === 365) return 'Anual'
          return `Cada ${d}d`
        }
        const renderCard = (g: NonNullable<typeof recurringGroups>[number]) => {
          const nextDate = g.next_expected_date ? new Date(g.next_expected_date + 'T00:00:00') : null
          const daysUntil = nextDate
            ? Math.ceil((nextDate.getTime() - new Date().getTime()) / 86400000)
            : null

          return (
            <Card key={g.id} className={cn('card-hover rounded-2xl', !g.is_active && 'opacity-50')}>
              <CardContent className="p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xl shrink-0">{g.category?.icon || '💳'}</span>
                  <div className="flex-1 min-w-0" style={{ minWidth: '120px' }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{g.display_name}</p>
                      <Badge variant="secondary" className="text-xs">{periodLabel(g.period_days)}</Badge>
                      {!g.is_active && <Badge variant="muted" className="text-xs">Inactivo</Badge>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {nextDate ? formatDate(nextDate.toISOString().slice(0, 10)) : 'Sin fecha'}
                      </span>
                      {daysUntil !== null && (
                        <Badge variant={daysUntil <= 3 ? 'warning' : 'muted'} className="text-xs">
                          {daysUntil === 0 ? 'Hoy' : daysUntil < 0 ? `Vencido ${Math.abs(daysUntil)}d` : `en ${daysUntil}d`}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto shrink-0">
                    <p className="font-semibold tabular-nums text-negative text-sm">-{formatCurrency(g.avg_amount || 0)}</p>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      aria-label={g.is_active ? 'Desactivar' : 'Activar'}
                      onClick={() => onToggleActive(g.id, !g.is_active)}
                      title={g.is_active ? 'Desactivar' : 'Activar'}
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', g.is_active ? 'text-primary' : 'text-muted-foreground')} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Eliminar recurrente"
                      onClick={() => onDeleteRequest(g.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        }

        const activeRecurring   = recurringGroups?.filter(g => g.is_active) ?? []
        const inactiveRecurring = recurringGroups?.filter(g => !g.is_active) ?? []

        return (
          <div className="space-y-3">
            <div className="grid gap-2">
              {activeRecurring.map(renderCard)}
              {activeRecurring.length === 0 && inactiveRecurring.length === 0 && (
                <Card className="rounded-2xl"><CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Sin pagos recurrentes. Importa transacciones y pulsa "Re-detectar".
                </CardContent></Card>
              )}
              {activeRecurring.length === 0 && inactiveRecurring.length > 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Sin recurrentes activos.</p>
              )}
            </div>

            {inactiveRecurring.length > 0 && (
              <div>
                <button
                  onClick={() => setShowInactiveRecurring(v => !v)}
                  className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Desactivados ({inactiveRecurring.length})
                  <ChevronDown className={cn('h-3.5 w-3.5 ml-auto transition-transform', showInactiveRecurring && 'rotate-180')} />
                </button>
                {showInactiveRecurring && (
                  <div className="grid gap-2 mt-2">
                    {inactiveRecurring.map(renderCard)}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
