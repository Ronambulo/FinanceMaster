import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { recurringApi } from '@/lib/api'
import type { RecurringGroup } from '@/lib/api'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { MetricCard } from '@/components/MetricCard'
import { RefreshCw, Trash2, Calendar, Loader2, AlertTriangle, Pencil, Wallet, Activity, ChevronDown, Archive } from 'lucide-react'

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

  const pickAmountMutation = useMutation({
    mutationFn: ({ id, avg_amount }: { id: number; avg_amount: number }) => recurringApi.update(id, { avg_amount }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); toast('Importe actualizado', 'success'); setAmountPickerFor(null) },
  })

  const [amountPickerFor, setAmountPickerFor] = useState<RecurringGroup | null>(null)
  const [selectedAmount, setSelectedAmount] = useState<string>('')
  const [showInactive, setShowInactive] = useState(false)

  const totalMonthly = groups?.filter(g => g.is_active && g.period_days === 30)
    .reduce((sum, g) => sum + (g.avg_amount || 0), 0) || 0

  const today = new Date()
  const activeGroups   = groups?.filter(g => g.is_active) ?? []
  const inactiveGroups = groups?.filter(g => !g.is_active) ?? []

  const periodLabel = (days: number | null) => {
    if (days === 7) return 'Semanal'
    if (days === 14) return 'Quincenal'
    if (days === 30) return 'Mensual'
    if (days === 365) return 'Anual'
    return `Cada ${days}d`
  }

  function renderCard(g: RecurringGroup, i: number) {
    const nextDate = g.next_expected_date ? new Date(g.next_expected_date + 'T00:00:00') : null
    const daysUntil = nextDate ? Math.ceil((nextDate.getTime() - today.getTime()) / 86400000) : null
    const urgent = daysUntil !== null && daysUntil <= 3

    return (
      <div
        key={g.id}
        className={cn(
          'card-hover animate-fade-up relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)] bg-card transition-opacity',
          !g.is_active && 'opacity-50',
        )}
        style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
      >
        <div
          className={cn(
            'pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full blur-3xl',
            urgent ? 'bg-warning/[0.06]' : 'bg-primary/[0.04]',
          )}
        />
        <div className="relative p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-xl ring-1 ring-white/[0.06]">
              {g.category?.icon || '💳'}
            </div>
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
                {(g.amount_options?.length ?? 0) > 0 && (
                  <button
                    onClick={() => { setAmountPickerFor(g); setSelectedAmount(String(g.avg_amount ?? g.amount_options[0]?.amount ?? '')) }}
                    className={`flex items-center gap-1 transition-colors ${g.amount_options.length > 1 ? 'text-amber-400 hover:text-amber-300' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {g.amount_options.length > 1 ? (
                      <><AlertTriangle className="h-3 w-3" /> {g.amount_options.length} importes distintos</>
                    ) : (
                      <><Pencil className="h-3 w-3" /> Cambiar importe</>
                    )}
                  </button>
                )}
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
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-up">
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
        <MetricCard
          title="Total mensual" icon={Wallet} accent="negative" delay={0}
          value={`-${formatCurrency(totalMonthly)}`}
        />
        <MetricCard
          title="Compromisos activos" icon={Activity} accent="chart-2" delay={60}
          value={String(groups?.filter(g => g.is_active).length ?? 0)}
        />
        <MetricCard
          title="Próximo pago" icon={Calendar} accent="chart-4" delay={120}
          value={
            groups?.find(g => g.is_active && g.next_expected_date)
              ? formatDate(groups.find(g => g.is_active && g.next_expected_date)!.next_expected_date!)
              : '—'
          }
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3">
            {activeGroups.map((g, i) => renderCard(g, i))}
            {activeGroups.length === 0 && inactiveGroups.length === 0 && (
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] shadow-[0_4px_24px_rgba(0,0,0,0.5)] bg-card py-14 text-center animate-fade-up">
                <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/[0.04] blur-3xl" />
                <div className="relative flex flex-col items-center gap-2 px-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-xl ring-1 ring-white/[0.06]">🔍</div>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    No se han detectado pagos recurrentes. Importa transacciones y pulsa "Re-detectar".
                  </p>
                </div>
              </div>
            )}
            {activeGroups.length === 0 && inactiveGroups.length > 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Sin recurrentes activos.</p>
            )}
          </div>

          {/* Desactivados — colapsado por defecto para no molestar en la lista principal */}
          {inactiveGroups.length > 0 && (
            <div>
              <button
                onClick={() => setShowInactive(v => !v)}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Archive className="h-3.5 w-3.5" />
                Desactivados ({inactiveGroups.length})
                <ChevronDown className={cn('h-3.5 w-3.5 ml-auto transition-transform', showInactive && 'rotate-180')} />
              </button>
              {showInactive && (
                <div className="grid gap-3 mt-2">
                  {inactiveGroups.map((g, i) => renderCard(g, i))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={amountPickerFor !== null} onOpenChange={(open) => !open && setAmountPickerFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Elegir importe</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-1">
            Importes detectados para "{amountPickerFor?.display_name}". Elige cuál quieres usar.
          </p>
          <Select value={selectedAmount} onValueChange={setSelectedAmount}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Selecciona un importe" />
            </SelectTrigger>
            <SelectContent>
              {amountPickerFor?.amount_options?.map(opt => (
                <SelectItem key={opt.amount} value={String(opt.amount)}>
                  {formatCurrency(opt.amount)} · {opt.count} {opt.count === 1 ? 'vez' : 'veces'} · última: {formatDate(opt.last_date)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter className="mt-2">
            <Button
              onClick={() => amountPickerFor && selectedAmount && pickAmountMutation.mutate({ id: amountPickerFor.id, avg_amount: Number(selectedAmount) })}
              disabled={!selectedAmount || pickAmountMutation.isPending}
            >
              {pickAmountMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
