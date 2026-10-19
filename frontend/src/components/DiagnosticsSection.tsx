import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { trApi, portfolioApi } from '@/lib/api'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { AlertTriangle, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Toast = ReturnType<typeof useToast>['toast']

interface DiagAction {
  id: string
  name: string
  desc: string
  danger?: boolean
  run: (toast: Toast) => Promise<unknown> | undefined
}

const REPAIR_ACTIONS: DiagAction[] = [
  {
    id: 'fix-unknown', name: 'Reparar categorías',
    desc: 'Elimina movimientos sin categoría para que la próxima sincronización los recree.',
    run: toast => trApi.fixUnknown().then(r =>
      toast(r.deleted > 0 ? `${r.deleted} sin categoría eliminadas — vuelve a sincronizar` : 'Sin transacciones para reparar', 'success')
    ),
  },
  {
    id: 'fix-securities', name: 'Reparar portfolio',
    desc: 'Mueve al portfolio las operaciones de valores registradas como movimientos.',
    run: toast => trApi.fixSecurities().then(r => toast(r.fixed > 0 ? `${r.fixed} operaciones movidas al portfolio` : 'Portfolio ya en orden', 'success')),
  },
  {
    id: 'estimate-positions', name: 'Estimar posiciones',
    desc: 'Busca tickers por ISIN, corrige nombres y estima el número de acciones.',
    run: toast => portfolioApi.fixTickers()
      .then(r => toast(
        `Tickers: ${r.isins_found} encontrados, ${r.isins_not_found} sin resolver · Nombres: ${r.names_fixed} corregidos · Acciones estimadas: ${r.shares_estimated}`,
        'success'
      ))
      .catch(e => toast(e.message || 'Error al estimar posiciones', 'error')),
  },
  {
    id: 'resolve-tickers', name: 'Resolver tickers',
    desc: 'Asigna tickers de Yahoo Finance a las posiciones que aún no lo tienen.',
    run: toast => trApi.fixTickers()
      .then(r => toast(
        r.resolved > 0
          ? `${r.resolved} de ${r.total} posiciones resueltas a tickers Yahoo`
          : r.total === 0 ? 'Todas las posiciones ya tienen ticker' : `${r.skipped} posiciones sin resolver`,
        r.resolved > 0 ? 'success' : 'info'
      ))
      .catch(e => toast(e.message || 'Error al resolver tickers', 'error')),
  },
  {
    id: 'fix-cancelled', name: 'Limpiar canceladas',
    desc: 'Borra las transacciones que Trade Republic marca como canceladas.',
    run: toast => trApi.fixCancelled()
      .then(r => toast(r.deleted > 0 ? `${r.deleted} canceladas eliminadas` : 'Sin canceladas', r.deleted > 0 ? 'success' : 'info'))
      .catch(e => toast(e.message || 'Error', 'error')),
  },
  {
    id: 'dedupe', name: 'Limpiar duplicados',
    desc: 'Elimina movimientos que se importaron más de una vez.',
    run: toast => trApi.dedupe().then(r => toast(r.deleted > 0 ? `${r.deleted} duplicados eliminados` : 'Sin duplicados', 'success')),
  },
  {
    id: 'import-missing', name: 'Importar pendientes',
    desc: 'Importa los movimientos de Trade Republic que faltan en la base de datos.',
    run: toast => trApi.importMissing()
      .then(r => {
        console.table(r.details)
        toast(
          r.imported > 0
            ? `${r.imported} transacciones importadas`
            : 'Sin transacciones pendientes',
          r.imported > 0 ? 'success' : 'info'
        )
      })
      .catch(e => toast(e.message || 'Error', 'error')),
  },
  {
    id: 'fix-orphans', name: 'Limpiar huérfanas', danger: true,
    desc: 'Elimina transacciones cuyo identificador ya no existe en Trade Republic.',
    run: toast => {
      if (!confirm('Elimina transacciones cuyo external_id no existe en TR. ¿Continuar?')) return
      return trApi.fixOrphans()
        .then(r => {
          console.table(r.deleted_orphan)
          toast(
            r.total_deleted > 0 ? `${r.total_deleted} eliminadas` : 'Sin huérfanas',
            r.total_deleted > 0 ? 'success' : 'info'
          )
        })
        .catch(e => toast(e.message || 'Error', 'error'))
    },
  },
]

const DEBUG_ACTIONS: DiagAction[] = [
  {
    id: 'debug-balance', name: 'Diagnóstico de balance',
    desc: 'Compara el saldo local con el de Trade Republic. Detalle en la consola (F12).',
    run: toast => trApi.debugBalance().then(r => {
      const msg = `BD: €${r.db_sum} | TR: €${r.tr_timeline_sum} | Diff: €${r.db_vs_tr_diff} | Huérfanas: ${r.orphan_db_rows.length} | Faltan: ${r.missing_from_db.length} | Desajustes: ${r.amount_mismatches.length}`
      console.log('=== FALTAN EN BD ==='); console.table(r.missing_from_db)
      console.log('=== HUÉRFANAS BD ==='); console.table(r.orphan_db_rows)
      console.log('=== IMPORTES DISTINTOS ==='); console.table(r.amount_mismatches)
      console.log('=== SIN MAPEAR ==='); console.table(r.tr_unmapped_nonzero)
      toast(msg, r.db_vs_tr_diff === 0 ? 'success' : 'info')
    }).catch(e => toast(e.message || 'Error', 'error')),
  },
  {
    id: 'debug-skipped', name: 'Diagnóstico de omitidos',
    desc: 'Lista los eventos de Trade Republic que no se importaron. Detalle en la consola (F12).',
    run: toast => trApi.debugSkipped().then(r => {
      const msg = `TR total: ${r.total_events_from_tr} | En BD: ${r.already_in_db} | Canceladas omitidas: ${r.skipped_cancelled.length} | Otros: ${r.skipped_other.length} | Impacto: €${r.total_skipped_cash_impact}`
      console.log('=== CANCELADAS OMITIDAS ==='); console.table(r.skipped_cancelled)
      console.log('=== OTROS OMITIDOS ==='); console.table(r.skipped_other)
      toast(msg, 'info')
    }).catch(e => toast(e.message || 'Error', 'error')),
  },
]

function ActionList({ title, actions, running, onRun }: { title: string; actions: DiagAction[]; running: string | null; onRun: (a: DiagAction) => void }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <div className="divide-y divide-border">
        {actions.map(a => (
          <button
            key={a.id}
            type="button"
            disabled={running !== null}
            onClick={() => onRun(a)}
            className="flex w-full min-h-[56px] items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-secondary/60 disabled:cursor-wait disabled:opacity-70"
          >
            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-medium', a.danger && 'text-negative')}>{a.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{a.desc}</p>
            </div>
            {running === a.id
              ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          </button>
        ))}
      </div>
    </Card>
  )
}

export function DiagnosticsSection({ onGoToIntegrations }: { onGoToIntegrations: () => void }) {
  const { toast } = useToast()
  const { data: trStatus, isLoading } = useQuery({ queryKey: ['tr-status'], queryFn: trApi.status, retry: false })
  const [running, setRunning] = useState<string | null>(null)

  const run = async (a: DiagAction) => {
    setRunning(a.id)
    try { await a.run(toast) } finally { setRunning(null) }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Comprobando conexión...
      </div>
    )
  }

  if (!trStatus?.connected) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Trade Republic no está conectado</p>
          <p className="text-xs text-muted-foreground mt-0.5">Conéctalo en Integraciones para usar las herramientas de diagnóstico.</p>
        </div>
        <Button size="sm" variant="outline" onClick={onGoToIntegrations}>Ir a Integraciones</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ActionList title="Reparación de datos" actions={REPAIR_ACTIONS} running={running} onRun={run} />
      <ActionList title="Diagnóstico" actions={DEBUG_ACTIONS} running={running} onRun={run} />
    </div>
  )
}
