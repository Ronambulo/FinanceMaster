import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  exportApi,
  type ExportFormat,
  type ExportParams,
  type ExportPeriod,
  type ExportSectionKey,
  type ExportSummary,
} from '@/lib/api'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SettingsSwitch } from '@/components/SettingsSwitch'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { Braces, Check, Download, FileSpreadsheet, FileText, Landmark, Loader2, Sheet } from 'lucide-react'

export type ExportKind = ExportFormat | 'pdf'

export interface ExportRequest extends Omit<ExportParams, 'format'> {
  format: ExportKind
}

/** Descarga una exportación (el PDF se monta en el navegador). Devuelve el nombre del archivo. */
export async function runExport(req: ExportRequest): Promise<string> {
  if (req.format === 'pdf') {
    const { downloadPdf } = await import('@/lib/exportPdf')
    const { format: _f, ...rest } = req
    return downloadPdf(rest)
  }
  return exportApi.download(req as ExportParams)
}

export const FORMAT_OPTIONS: { id: ExportKind; label: string; hint: string; icon: typeof FileText }[] = [
  { id: 'xlsx', label: 'Excel', hint: 'Una hoja por sección', icon: FileSpreadsheet },
  { id: 'csv', label: 'CSV', hint: 'Un .csv por sección (zip)', icon: Sheet },
  { id: 'pdf', label: 'PDF', hint: 'Informe para leer o imprimir', icon: FileText },
  { id: 'json', label: 'JSON', hint: 'Copia de seguridad completa', icon: Braces },
  { id: 'ofx', label: 'OFX', hint: 'Para otras apps de finanzas', icon: Landmark },
]

export const SECTION_OPTIONS: { id: ExportSectionKey; label: string; countKey?: string }[] = [
  { id: 'transactions', label: 'Movimientos', countKey: 'transactions' },
  { id: 'banks', label: 'Por banco' },
  { id: 'monthly', label: 'Resumen mensual' },
  { id: 'categories_by_month', label: 'Por categoría' },
  { id: 'portfolio', label: 'Cartera' },
  { id: 'budgets', label: 'Presupuestos', countKey: 'budgets' },
  { id: 'recurring', label: 'Recurrentes', countKey: 'recurring' },
  { id: 'debts', label: 'Deudas', countKey: 'debts' },
  { id: 'goals', label: 'Objetivos', countKey: 'goals' },
  { id: 'categories', label: 'Categorías', countKey: 'categories' },
  { id: 'rules', label: 'Reglas', countKey: 'rules' },
]
const ALL_SECTIONS = SECTION_OPTIONS.map(s => s.id)

const PERIODS: { id: ExportPeriod; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'month', label: 'Un mes' },
  { id: 'year', label: 'Un año' },
  { id: 'range', label: 'Rango' },
]

export interface ExportPreset {
  format?: ExportKind
  period?: ExportPeriod
  month?: string
  year?: number
  banks?: string[]
  split?: boolean
  split_bank?: boolean
  sections?: ExportSectionKey[]
}

export function useExportSummary(enabled = true) {
  return useQuery<ExportSummary>({
    queryKey: ['export-summary'],
    queryFn: exportApi.summary,
    enabled,
    staleTime: 60_000,
  })
}

function Chip({ active, disabled, onClick, children }: {
  active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors disabled:opacity-40',
        active ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {active && <Check className="h-3 w-3" />}
      {children}
    </button>
  )
}

export function ExportDialog({ open, onOpenChange, preset }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  preset?: ExportPreset
}) {
  const { toast } = useToast()
  const { data: summary, isLoading } = useExportSummary(open)

  const [format, setFormat] = useState<ExportKind>('xlsx')
  const [period, setPeriod] = useState<ExportPeriod>('all')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState<number | undefined>()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [banks, setBanks] = useState<string[]>([])     // vacío = todos
  const [split, setSplit] = useState(false)
  const [splitBank, setSplitBank] = useState(false)
  const [sections, setSections] = useState<ExportSectionKey[]>(ALL_SECTIONS)
  const [busy, setBusy] = useState(false)

  // Al abrir, se parte del preset (o de los valores por defecto)
  useEffect(() => {
    if (!open) return
    setFormat(preset?.format ?? 'xlsx')
    setPeriod(preset?.period ?? 'all')
    setMonth(preset?.month ?? '')
    setYear(preset?.year)
    setBanks(preset?.banks ?? [])
    setSplit(preset?.split ?? false)
    setSplitBank(preset?.split_bank ?? false)
    setSections(preset?.sections ?? ALL_SECTIONS)
    setFrom('')
    setTo('')
  }, [open, preset])

  // Valores por defecto en cuanto llega el resumen
  const months = useMemo(() => [...(summary?.months ?? [])].sort((a, b) => b.month.localeCompare(a.month)), [summary])
  useEffect(() => {
    if (!summary) return
    if (!month && months[0]) setMonth(months[0].month)
    if (!year && summary.years[0]) setYear(summary.years[0])
    if (!from && summary.first_date) setFrom(summary.first_date)
    if (!to && summary.last_date) setTo(summary.last_date)
  }, [summary]) // eslint-disable-line react-hooks/exhaustive-deps

  const bankList = summary?.banks ?? []
  const isOfx = format === 'ofx'
  const allBanks = banks.length === 0

  function toggleBank(key: string) {
    setBanks(prev => {
      const base = prev.length === 0 ? bankList.map(b => b.key) : prev
      const next = base.includes(key) ? base.filter(k => k !== key) : [...base, key]
      return next.length === bankList.length ? [] : next
    })
  }

  function toggleSection(id: ExportSectionKey) {
    setSections(prev => (prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]))
  }

  // Movimientos que entran en el periodo (sin contar el filtro de banco)
  const estimate = useMemo(() => {
    if (!summary) return null
    const inPeriod = summary.months.filter(m => {
      if (period === 'month') return m.month === month
      if (period === 'year') return year !== undefined && m.month.startsWith(String(year))
      if (period === 'range') return (!from || m.month >= from.slice(0, 7)) && (!to || m.month <= to.slice(0, 7))
      return true
    })
    return { count: inPeriod.reduce((s, m) => s + m.count, 0), months: inPeriod.length }
  }, [summary, period, month, year, from, to])

  const invalid =
    (period === 'month' && !month) ||
    (period === 'year' && !year) ||
    (period === 'range' && (!from || !to || from > to)) ||
    (!isOfx && sections.length === 0)

  async function submit() {
    setBusy(true)
    try {
      const name = await runExport({
        format,
        period,
        month: period === 'month' ? month : undefined,
        year: period === 'year' ? year : undefined,
        date_from: period === 'range' ? from : undefined,
        date_to: period === 'range' ? to : undefined,
        banks: allBanks ? undefined : banks,
        split,
        split_bank: splitBank,
        sections: isOfx ? undefined : sections,
      })
      toast(`Descargado ${name}`, 'success')
      onOpenChange(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo exportar', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exportar datos</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Elige formato, periodo y bancos. Las credenciales bancarias y los tokens nunca se incluyen.
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="space-y-5">
            {/* Formato */}
            <div className="space-y-2">
              <Label>Formato</Label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {FORMAT_OPTIONS.map(f => {
                  const Icon = f.icon
                  const active = format === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFormat(f.id)}
                      aria-pressed={active}
                      className={cn(
                        'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
                        active ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/50',
                      )}
                    >
                      <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="text-sm font-medium">{f.label}</span>
                      <span className="text-[11px] leading-tight text-muted-foreground">{f.hint}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Periodo */}
            <div className="space-y-2">
              <Label>Periodo</Label>
              <div className="inline-flex rounded-lg border border-border p-0.5">
                {PERIODS.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPeriod(p.id)}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      period === p.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {period === 'month' && (
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="max-w-xs"><SelectValue placeholder="Elige un mes" /></SelectTrigger>
                  <SelectContent>
                    {months.map(m => (
                      <SelectItem key={m.month} value={m.month}>{m.label} · {m.count} movs.</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {period === 'year' && (
                <Select value={year ? String(year) : ''} onValueChange={v => setYear(Number(v))}>
                  <SelectTrigger className="max-w-xs"><SelectValue placeholder="Elige un año" /></SelectTrigger>
                  <SelectContent>
                    {(summary?.years ?? []).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {period === 'range' && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-auto" />
                  <span className="text-xs text-muted-foreground">hasta</span>
                  <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-auto" />
                  {from && to && from > to && <span className="text-xs text-negative">El inicio va después del final</span>}
                </div>
              )}
            </div>

            {/* Bancos */}
            {bankList.length > 0 && (
              <div className="space-y-2">
                <Label>Bancos</Label>
                <div className="flex flex-wrap gap-2">
                  <Chip active={allBanks} onClick={() => setBanks([])}>Todos</Chip>
                  {bankList.map(b => (
                    <Chip key={b.key} active={!allBanks && banks.includes(b.key)} onClick={() => toggleBank(b.key)}>
                      {b.label} <span className="text-muted-foreground">{b.count}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {/* Separar */}
            <div className="space-y-1">
              <Label>Separar</Label>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">Mes a mes</p>
                  <p className="text-xs text-muted-foreground">
                    {format === 'xlsx' ? 'Una hoja por mes' : format === 'pdf' ? 'Un bloque por mes' : format === 'json' ? 'Movimientos agrupados por mes' : 'Un archivo por mes (zip)'}
                  </p>
                </div>
                <SettingsSwitch checked={split} onChange={setSplit} label="Separar mes a mes" />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">Por banco</p>
                  <p className="text-xs text-muted-foreground">
                    {format === 'xlsx' ? 'Una hoja por banco' : format === 'pdf' ? 'Un bloque por banco' : format === 'json' ? 'Movimientos agrupados por banco' : 'Una carpeta o archivo por banco (zip)'}
                  </p>
                </div>
                <SettingsSwitch checked={splitBank} onChange={setSplitBank} label="Separar por banco" />
              </div>
            </div>

            {/* Secciones */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Qué incluir</Label>
                {!isOfx && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setSections(sections.length === ALL_SECTIONS.length ? ['transactions'] : ALL_SECTIONS)}
                  >
                    {sections.length === ALL_SECTIONS.length ? 'Solo movimientos' : 'Todo'}
                  </button>
                )}
              </div>
              {isOfx ? (
                <p className="text-xs text-muted-foreground">
                  OFX solo lleva los movimientos de las cuentas de efectivo, con su saldo. Las órdenes de fondos de MyInvestor no entran.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {SECTION_OPTIONS.map(s => {
                    const n = s.countKey ? summary?.counts[s.countKey] : undefined
                    return (
                      <Chip key={s.id} active={sections.includes(s.id)} onClick={() => toggleSection(s.id)}>
                        {s.label}{n !== undefined && <span className="text-muted-foreground">{n}</span>}
                      </Chip>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:gap-0">
          {estimate && (
            <p className="mr-auto text-xs text-muted-foreground">
              {estimate.count} movimientos en {estimate.months} {estimate.months === 1 ? 'mes' : 'meses'}
              {!allBanks && ` · ${banks.length} ${banks.length === 1 ? 'banco' : 'bancos'}`}
            </p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || invalid || isLoading}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Descargar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
