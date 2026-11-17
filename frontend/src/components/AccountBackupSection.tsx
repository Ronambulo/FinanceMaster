import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountApi, type BackupCounts, type BackupPreview } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { BANK_NAMES, cn } from '@/lib/utils'
import { AlertTriangle, DatabaseBackup, Download, FileJson, Loader2, ShieldCheck, Upload, X } from 'lucide-react'

const fmtDate = (d: string | null | undefined, withTime = false) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return d
  return date.toLocaleDateString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

const total = (c: BackupCounts | undefined) => Object.values(c ?? {}).reduce((a, b) => a + b, 0)

function CountsTable({ labels, incoming, current }: {
  labels: Record<string, string>
  incoming?: BackupCounts
  current?: BackupCounts
}) {
  const keys = Object.keys(labels).filter(k => (incoming?.[k] ?? 0) > 0 || (current?.[k] ?? 0) > 0)
  if (!keys.length) return <p className="text-xs text-muted-foreground">No hay datos.</p>
  const compare = !!incoming && !!current
  return (
    <table className="w-full text-sm">
      {compare && (
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="py-1 text-left font-normal" />
            <th className="py-1 text-right font-normal">Ahora</th>
            <th className="py-1 text-right font-normal">En la copia</th>
          </tr>
        </thead>
      )}
      <tbody className="tabular-nums">
        {keys.map(k => (
          <tr key={k} className="border-t border-border/60 first:border-t-0">
            <td className="py-1.5 text-muted-foreground">{labels[k] ?? k}</td>
            {compare && <td className="py-1.5 text-right text-muted-foreground">{current?.[k] ?? 0}</td>}
            <td className="py-1.5 text-right font-medium">{(incoming ?? current)?.[k] ?? 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function AccountBackupSection() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<BackupPreview | null>(null)
  const [dragging, setDragging] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: summary, isLoading } = useQuery({
    queryKey: ['account-backup-summary'],
    queryFn: accountApi.backupSummary,
  })

  const download = useMutation({
    mutationFn: accountApi.downloadBackup,
    onSuccess: name => toast(`Descargado ${name}`, 'success'),
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const check = useMutation({
    mutationFn: accountApi.previewRestore,
    onSuccess: p => setPreview(p),
    onError: (e: Error) => { toast(e.message, 'error'); reset() },
  })

  const restore = useMutation({
    mutationFn: accountApi.restore,
    onSuccess: r => {
      setConfirmOpen(false)
      toast(`Cuenta restaurada: ${r.restored.transactions ?? 0} movimientos`, 'success')
      reset()
      qc.invalidateQueries()
    },
    onError: (e: Error) => { setConfirmOpen(false); toast(e.message, 'error') },
  })

  function reset() {
    setFile(null)
    setPreview(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  function pick(f: File | undefined | null) {
    if (!f) return
    if (!/\.json$/i.test(f.name) && f.type !== 'application/json') {
      toast('La copia es un archivo .json', 'error')
      return
    }
    setFile(f)
    setPreview(null)
    check.mutate(f)
  }

  const labels = preview?.labels ?? summary?.labels ?? {}
  const currentTotal = total(preview?.current ?? summary?.counts)
  const sources = Object.entries(preview?.sources ?? {}).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2"><Download className="h-4 w-4" /> Descargar copia</CardTitle>
          <p className="text-xs text-muted-foreground">
            Un único archivo con todo lo de esta cuenta, listo para restaurarlo en otra instalación de FinanceMaster
            (por ejemplo, del servidor a tu ordenador).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cargando…</div>
          ) : (
            <div className="max-w-md"><CountsTable labels={labels} current={summary?.counts} /></div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => download.mutate()} disabled={download.isPending}>
              {download.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <DatabaseBackup className="h-4 w-4 mr-2" />}
              Descargar copia de la cuenta
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 mt-px shrink-0" />
            No incluye tu contraseña, las credenciales de los bancos, los tokens de API ni los webhooks. Guárdala en un sitio seguro: contiene todos tus movimientos.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2"><Upload className="h-4 w-4" /> Restaurar copia</CardTitle>
          <p className="text-xs text-muted-foreground">
            Sustituye todos los datos de esta cuenta por los de la copia. Las conexiones con bancos y la configuración de la cuenta se mantienen.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!file ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]) }}
              className={cn(
                'flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border px-4 py-8 text-center transition-colors',
                'hover:bg-accent/40',
                dragging && 'border-primary bg-primary/5',
              )}
            >
              <FileJson className="h-6 w-6 text-muted-foreground" />
              <span className="text-sm font-medium">Elige o suelta aquí el archivo de copia</span>
              <span className="text-xs text-muted-foreground">financemaster-cuenta-….json</span>
            </button>
          ) : (
            <div className="rounded-xl border border-border p-4 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  {preview ? (
                    <p className="text-xs text-muted-foreground">
                      Copia de <span className="text-foreground">{preview.user.username ?? '—'}</span> del {fmtDate(preview.exported_at, true)}
                      {preview.first_date && <> · movimientos del {fmtDate(preview.first_date)} al {fmtDate(preview.last_date)}</>}
                    </p>
                  ) : (
                    <p className="flex items-center text-xs text-muted-foreground"><Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> Comprobando la copia…</p>
                  )}
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={reset} disabled={restore.isPending} aria-label="Quitar archivo">
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {preview && (
                <>
                  {sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {sources.map(([s, n]) => (
                        <span key={s} className="rounded-full bg-secondary px-2.5 py-0.5 text-xs">
                          {BANK_NAMES[s] ?? s} <span className="text-muted-foreground tabular-nums">{n}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="max-w-md"><CountsTable labels={labels} incoming={preview.counts} current={preview.current} /></div>
                  {currentTotal > 0 && (
                    <p className="flex items-start gap-1.5 text-xs text-warning">
                      <AlertTriangle className="h-3.5 w-3.5 mt-px shrink-0" />
                      Lo que tienes ahora se borrará. Si quieres conservarlo, descarga antes una copia de esta cuenta.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={restore.isPending}>
                      Restaurar esta copia
                    </Button>
                    {currentTotal > 0 && (
                      <Button variant="outline" onClick={() => download.mutate()} disabled={download.isPending}>
                        {download.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Descargar antes la actual
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={e => pick(e.target.files?.[0])}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="Restaurar la copia"
        confirmLabel="Sustituir mis datos"
        pending={restore.isPending}
        onConfirm={() => file && restore.mutate(file)}
        onCancel={() => setConfirmOpen(false)}
      >
        <p>
          Se borrarán los datos actuales de esta cuenta ({currentTotal} registros) y se cargarán los{' '}
          {total(preview?.counts)} de la copia{preview?.user.username ? ` de ${preview.user.username}` : ''}.
        </p>
        <p>No se puede deshacer. Si algo falla a mitad, no se cambia nada.</p>
      </ConfirmDialog>
    </div>
  )
}
