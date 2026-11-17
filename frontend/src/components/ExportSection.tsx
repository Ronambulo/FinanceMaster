import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { ExportDialog, runExport, useExportSummary, type ExportKind, type ExportPreset, type ExportRequest } from '@/components/ExportDialog'
import { cn, formatCurrency } from '@/lib/utils'
import {
  Braces, CalendarDays, CalendarRange, Download, FileSpreadsheet, Landmark, Loader2, ShieldCheck, SlidersHorizontal,
} from 'lucide-react'

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

const ROW_FORMATS: { id: ExportKind; label: string }[] = [
  { id: 'xlsx', label: 'Excel' },
  { id: 'csv', label: 'CSV' },
  { id: 'pdf', label: 'PDF' },
]

export function ExportSection() {
  const { toast } = useToast()
  const { data: summary, isLoading } = useExportSummary()
  const [busy, setBusy] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{ open: boolean; preset?: ExportPreset }>({ open: false })
  const [showAllMonths, setShowAllMonths] = useState(false)

  async function go(key: string, req: ExportRequest) {
    setBusy(key)
    try {
      const name = await runExport(req)
      toast(`Descargado ${name}`, 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo exportar', 'error')
    } finally {
      setBusy(null)
    }
  }

  const months = [...(summary?.months ?? [])].sort((a, b) => b.month.localeCompare(a.month))
  const latest = months[0]
  const banks = summary?.banks ?? []
  const visibleMonths = showAllMonths ? months : months.slice(0, 12)
  const hasData = !!summary && months.length > 0

  const quick: { key: string; icon: typeof Download; title: string; desc: string; req?: ExportRequest; preset?: ExportPreset }[] = [
    {
      key: 'backup', icon: Braces, title: 'Copia de seguridad completa',
      desc: 'Todo en un JSON: movimientos, cartera, presupuestos, reglas…',
      req: { format: 'json' },
    },
    {
      key: 'all-xlsx', icon: FileSpreadsheet, title: 'Todo a Excel',
      desc: 'Una hoja por sección, con resumen por banco y por mes',
      req: { format: 'xlsx' },
    },
    {
      key: 'latest', icon: CalendarDays, title: latest ? `Último mes · ${latest.label}` : 'Último mes',
      desc: latest ? `${latest.count} movimientos en Excel` : 'Sin movimientos todavía',
      req: latest ? { format: 'xlsx', period: 'month', month: latest.month } : undefined,
    },
    {
      key: 'by-month', icon: CalendarRange, title: 'Mes a mes',
      desc: 'Excel con una hoja de movimientos por cada mes',
      req: { format: 'xlsx', split: true },
    },
    {
      key: 'by-bank', icon: Landmark, title: 'Separado por banco',
      desc: banks.length ? banks.map(b => b.label).join(', ') : 'Una hoja por banco',
      req: { format: 'xlsx', split_bank: true },
    },
    {
      key: 'custom', icon: SlidersHorizontal, title: 'Personalizada',
      desc: 'Formato, periodo, bancos y secciones a tu medida',
    },
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2"><Download className="h-4 w-4" /> Exportar</CardTitle>
          {summary && (
            <p className="text-xs text-muted-foreground">
              {summary.counts.transactions ?? 0} movimientos · {months.length} meses
              {summary.first_date && ` · del ${fmtDate(summary.first_date)} al ${fmtDate(summary.last_date)}`}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cargando…</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {quick.map(q => {
                const Icon = q.icon
                const disabled = (q.key !== 'custom' && !q.req) || (q.key !== 'custom' && q.key !== 'backup' && !hasData) || busy !== null
                return (
                  <button
                    key={q.key}
                    type="button"
                    disabled={disabled}
                    onClick={() => (q.req ? go(q.key, q.req) : setDialog({ open: true }))}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border border-border p-3 text-left transition-colors',
                      'hover:bg-accent/50 disabled:opacity-50 disabled:hover:bg-transparent',
                    )}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      {busy === q.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 text-muted-foreground" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{q.title}</span>
                      <span className="block text-xs text-muted-foreground line-clamp-2">{q.desc}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" /> Las credenciales bancarias, tokens de API y secretos nunca se exportan.
          </p>
        </CardContent>
      </Card>

      {banks.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><Landmark className="h-4 w-4" /> Por banco</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {banks.map(b => (
              <div key={b.key} className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{b.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.count} movimientos · {fmtDate(b.first_date)} – {fmtDate(b.last_date)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ROW_FORMATS.map(f => {
                    const key = `bank-${b.key}-${f.id}`
                    return (
                      <Button key={f.id} size="sm" variant="outline" disabled={busy !== null}
                        onClick={() => go(key, { format: f.id, banks: [b.key] })}>
                        {busy === key && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}{f.label}
                      </Button>
                    )
                  })}
                  <Button size="sm" variant="ghost" disabled={busy !== null}
                    onClick={() => setDialog({ open: true, preset: { banks: [b.key] } })}>
                    Más…
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {months.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2"><CalendarRange className="h-4 w-4" /> Mes a mes</CardTitle>
            <p className="text-xs text-muted-foreground">Meses naturales (del 1 al último día).</p>
          </CardHeader>
          <CardContent className="divide-y divide-border p-0">
            {visibleMonths.map(m => (
              <div key={m.month} className="flex flex-col gap-2 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {m.count} movs. · <span className="text-positive">+{formatCurrency(m.income)}</span> · <span className="text-negative">−{formatCurrency(m.expenses)}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ROW_FORMATS.map(f => {
                    const key = `month-${m.month}-${f.id}`
                    return (
                      <Button key={f.id} size="sm" variant="outline" disabled={busy !== null}
                        onClick={() => go(key, { format: f.id, period: 'month', month: m.month })}>
                        {busy === key && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}{f.label}
                      </Button>
                    )
                  })}
                  <Button size="sm" variant="ghost" disabled={busy !== null}
                    onClick={() => setDialog({ open: true, preset: { period: 'month', month: m.month } })}>
                    Más…
                  </Button>
                </div>
              </div>
            ))}
            {months.length > 12 && (
              <div className="px-6 py-2">
                <Button size="sm" variant="ghost" onClick={() => setShowAllMonths(v => !v)}>
                  {showAllMonths ? 'Ver menos' : `Ver los ${months.length} meses`}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ExportDialog open={dialog.open} preset={dialog.preset} onOpenChange={open => setDialog(d => ({ ...d, open }))} />
    </div>
  )
}
