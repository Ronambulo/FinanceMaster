import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { txApi } from '@/lib/api'
import type { ImportPreview, ImportPreviewRow } from '@/lib/api'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileText, Loader2, Upload } from 'lucide-react'

const BANK_FORMATS = [
  { value: 'auto', label: 'Auto-detectar' },
  { value: 'trade_republic', label: 'Trade Republic' },
  { value: 'myinvestor', label: 'MyInvestor (órdenes de fondos)' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'n26', label: 'N26' },
  { value: 'wise', label: 'Wise' },
]

type Bucket = 'new' | 'duplicates' | 'errors' | 'skipped'

const TYPE_LABELS: Record<string, string> = {
  BUY: 'Compra', SELL: 'Venta', DIVIDEND: 'Dividendo',
  CARD_TRANSACTION: 'Tarjeta', TRANSFER_OUTBOUND: 'Transferencia', TRANSFER_INBOUND: 'Transferencia',
  CUSTOMER_INPAYMENT: 'Ingreso', INTEREST_PAYMENT: 'Interés',
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

/* initialFile: si se abre con un archivo ya elegido (p.ej. soltado sobre otra
   página), salta directamente a «Revisar antes de importar». */
export function ImportCsvDialog({ open, onClose, initialFile }: { open: boolean; onClose: () => void; initialFile?: File | null }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [bankFormat, setBankFormat] = useState('auto')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [bucket, setBucket] = useState<Bucket>('new')
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dragging, setDragging] = useState(false)

  function reset() {
    setFile(null)
    setPreview(null)
    setBucket('new')
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    if (importing) return
    reset()
    onClose()
  }

  async function analyze(f: File) {
    setFile(f)
    setPreview(null)
    setAnalyzing(true)
    try {
      const p = await txApi.previewImport(f, bankFormat)
      setPreview(p)
      // Abre la pestaña que más importa: lo que se va a importar, o los errores si no hay nada
      setBucket(p.new.length ? 'new' : p.errors.length ? 'errors' : p.duplicates.length ? 'duplicates' : 'skipped')
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'No se pudo leer el archivo', 'error')
      reset()
    } finally {
      setAnalyzing(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleImport() {
    if (!file || !preview) return
    setImporting(true)
    try {
      const res = await txApi.importCsv(file, preview.detected_bank)
      qc.invalidateQueries()
      const extra = [
        res.skipped_duplicates ? plural(res.skipped_duplicates, 'duplicada omitida', 'duplicadas omitidas') : null,
        res.updated ? plural(res.updated, 'actualizada', 'actualizadas') : null,
        res.errors ? plural(res.errors, 'error', 'errores') : null,
      ].filter(Boolean).join(' · ')
      toast(`Importados ${plural(res.imported, 'registro', 'registros')}${extra ? ` (${extra})` : ''}`, res.errors ? 'error' : 'success')
      reset()
      onClose()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Error al importar', 'error')
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    if (open && initialFile) analyze(initialFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFile])

  const toImport = preview ? preview.new.length + preview.duplicates.filter(d => d.will_update).length : 0

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) handleClose() }}>
      <DialogContent className={cn('transition-[max-width]', preview ? 'max-w-3xl' : 'max-w-md')}>
        <DialogHeader><DialogTitle>Importar CSV</DialogTitle></DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) analyze(f) }}
        />

        {!file && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Formato del banco</label>
              <select
                value={bankFormat}
                onChange={e => setBankFormat(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {BANK_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div
              role="button"
              tabIndex={0}
              className={cn(
                'rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors',
                dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary',
              )}
              onClick={() => fileRef.current?.click()}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setDragging(false)
                const f = e.dataTransfer.files?.[0]
                if (f) analyze(f)
              }}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Haz clic o arrastra aquí el CSV</p>
              <p className="text-xs text-muted-foreground mt-1">
                Trade Republic, MyInvestor, Revolut, N26 o Wise. Antes de importar podrás revisarlo.
              </p>
            </div>
          </div>
        )}

        {file && (
          <div className="space-y-5 min-w-0">
            {/* Archivo seleccionado */}
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {analyzing || !preview
                    ? 'Analizando…'
                    : `${plural(preview.total, 'registro encontrado', 'registros encontrados')}${preview.bank_label ? ` · ${preview.bank_label}` : ''}`}
                </p>
              </div>
              <Button size="sm" variant="ghost" className="text-primary" onClick={reset} disabled={importing}>
                Cambiar
              </Button>
            </div>

            {analyzing && (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Revisando el archivo…
              </div>
            )}

            {preview && (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Revisar antes de importar</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pulsa un estado para comprobar qué se importará, se omitirá o necesita atención.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">{plural(preview.total, 'registro', 'registros')} en total</span>
                    <Button onClick={handleImport} disabled={toImport === 0 || importing}>
                      {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                      {toImport === 0 ? 'Nada que importar' : `Importar ${plural(toImport, 'registro', 'registros')}`}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <StatusTile active={bucket === 'new'} onClick={() => setBucket('new')}
                    label="Nuevas" count={preview.new.length} hint="se importan" tone="text-positive" />
                  <StatusTile active={bucket === 'duplicates'} onClick={() => setBucket('duplicates')}
                    label="Duplicadas" count={preview.duplicates.length} hint="se omiten" tone="text-warning" />
                  <StatusTile active={bucket === 'errors'} onClick={() => setBucket('errors')}
                    label="Errores" count={preview.errors.length} hint="revisar" tone="text-negative" />
                  {preview.skipped.length > 0 && (
                    <StatusTile active={bucket === 'skipped'} onClick={() => setBucket('skipped')}
                      label="Ignoradas" count={preview.skipped.length} hint="no aplican" tone="text-muted-foreground" />
                  )}
                </div>

                <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
                  {bucket === 'new' && <RowList rows={preview.new} empty="No hay registros nuevos en este archivo." />}
                  {bucket === 'duplicates' && <RowList rows={preview.duplicates} empty="Ningún registro está ya importado." />}
                  {bucket === 'errors' && <MessageList items={preview.errors} empty="Sin errores." tone="text-negative" />}
                  {bucket === 'skipped' && <MessageList items={preview.skipped} empty="Nada ignorado." />}
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function StatusTile({ active, onClick, label, count, hint, tone }: {
  active: boolean; onClick: () => void; label: string; count: number; hint: string; tone: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-w-[7.5rem] rounded-lg border px-3 py-2 text-left transition-colors',
        active ? 'border-border bg-secondary' : 'border-transparent hover:bg-secondary/50',
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className={cn('text-lg font-semibold tabular-nums', count === 0 ? 'text-muted-foreground' : tone)}>{count}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </p>
    </button>
  )
}

function RowList({ rows, empty }: { rows: ImportPreviewRow[]; empty: string }) {
  if (!rows.length) return <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y divide-border">
      {rows.map((r, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{r.date ? formatDate(r.date) : '—'}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate">{r.name || r.symbol || '—'}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[TYPE_LABELS[r.type] ?? r.type, r.shares != null ? `${r.shares.toLocaleString('es-ES', { maximumFractionDigits: 6 })} part.` : null, r.symbol]
                .filter(Boolean).join(' · ')}
              {r.will_update && <span className="text-primary"> · completa datos que faltaban</span>}
            </p>
          </div>
          <span className={cn('shrink-0 tabular-nums font-medium', r.amount >= 0 ? 'text-positive' : '')}>
            {formatCurrency(r.amount, r.currency || 'EUR')}
          </span>
        </li>
      ))}
    </ul>
  )
}

function MessageList({ items, empty, tone }: { items: string[]; empty: string; tone?: string }) {
  if (!items.length) return <p className="p-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="divide-y divide-border">
      {items.map((m, i) => <li key={i} className={cn('px-3 py-2 text-sm break-words', tone)}>{m}</li>)}
    </ul>
  )
}
