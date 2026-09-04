import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { txApi, catApi, authApi, trApi, aiApi, dashApi } from '@/lib/api'
import type { Transaction, Category, TransactionListResponse } from '@/lib/api'
import { usePayrollCycle } from '@/hooks/usePayrollCycle'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Upload, Search, ChevronDown, Loader2, Tag, X, Plus, Trash2, AlertTriangle, Filter, Sparkles, Bot, RefreshCw, Settings, Link2, Unlink, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { TransactionIcon } from '@/components/TransactionIcon'
import { TwoFAModal } from '@/App'

import { cn } from '@/lib/utils'

/* ── helpers ─────────────────────────────────────────────────────── */
function monthLastDay(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

// Friendly label for a transaction's raw `type` — used as secondary/meta text in the list.
function txTypeLabel(type: string): string {
  switch (type) {
    case 'CARD_TRANSACTION':   return 'Tarjeta'
    case 'TRANSFER_OUTBOUND':  return 'Transferencia enviada'
    case 'TRANSFER_INBOUND':   return 'Transferencia recibida'
    case 'CUSTOMER_INPAYMENT': return 'Ingreso'
    case 'INTEREST_PAYMENT':   return 'Interés'
    default: return type.replace(/_/g, ' ').toLowerCase()
  }
}

// "Hoy" / "Ayer" / full date — used as the sticky-ish group header above each day's transactions.
function dateGroupLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Hoy'
  if (diffDays === 1) return 'Ayer'
  return format(d, "d 'de' MMMM yyyy", { locale: es })
}

// Display amount for a row — the netted value when merged, the raw amount otherwise.
function netAmount(tx: Transaction): number {
  return tx.effective_amount ?? tx.amount
}

const TYPE_GROUPS = [
  { value: 'income',  label: 'Ingresos' },
  { value: 'expense', label: 'Gastos' },
]

function CategoryPicker({ categories, value, onChange }: { categories: Category[]; value: number | null; onChange: (id: number) => void }) {
  return (
    <Select value={value?.toString() || ''} onValueChange={v => onChange(Number(v))}>
      <SelectTrigger className="h-7 text-xs w-40">
        <SelectValue placeholder="Categoría..." />
      </SelectTrigger>
      <SelectContent>
        {categories.map(c => (
          <SelectItem key={c.id} value={c.id.toString()}>
            {c.icon} {c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const BANK_FORMATS = [
  { value: 'auto', label: '🔍 Auto-detectar' },
  { value: 'trade_republic', label: 'Trade Republic' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'n26', label: 'N26' },
  { value: 'wise', label: 'Wise' },
]

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<{ imported: number; skipped_duplicates: number; errors: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [bankFormat, setBankFormat] = useState('auto')
  const [detectedBank, setDetectedBank] = useState<string | null>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setResult(null)
    setDetectedBank(null)
    try {
      const res = await txApi.importCsv(file, bankFormat) as any
      setResult(res)
      if (res.detected_bank) setDetectedBank(res.detected_bank)
      qc.invalidateQueries()
      toast(`Importadas ${res.imported} transacciones`, 'success')
    } catch (err: any) {
      toast(err.message || 'Error al importar', 'error')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Importar CSV</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Formato del banco</label>
            <select
              value={bankFormat}
              onChange={e => setBankFormat(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {BANK_FORMATS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <div
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Haz clic para seleccionar el CSV</p>
            <p className="text-xs text-muted-foreground mt-1">.csv — cualquier banco soportado</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>
          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Procesando...
            </div>
          )}
          {result && (
            <div className="rounded-xl bg-muted p-4 space-y-1 text-sm">
              {detectedBank && <p className="text-xs text-muted-foreground mb-1">Banco detectado: <span className="font-medium text-foreground">{detectedBank}</span></p>}
              <p className="text-primary">✓ {result.imported} transacciones importadas</p>
              {result.skipped_duplicates > 0 && <p className="text-muted-foreground">↷ {result.skipped_duplicates} duplicadas omitidas</p>}
              {result.errors > 0 && <p className="text-negative">✗ {result.errors} errores</p>}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

const TX_TYPES = [
  { value: 'CARD_TRANSACTION', label: 'Gasto (tarjeta)' },
  { value: 'TRANSFER_OUTBOUND', label: 'Transferencia saliente' },
  { value: 'CUSTOMER_INPAYMENT', label: 'Ingreso' },
  { value: 'TRANSFER_INBOUND', label: 'Transferencia entrante' },
  { value: 'INTEREST_PAYMENT', label: 'Interés' },
]

function AddTransactionDialog({ open, onClose, categories }: { open: boolean; onClose: () => void; categories: Category[] }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    name: '',
    amount: '',
    type: 'CARD_TRANSACTION',
    category_id: '',
    description: '',
  })

  const createMutation = useMutation({
    mutationFn: () => txApi.create({
      date: form.date,
      name: form.name || undefined,
      amount: form.type.includes('INBOUND') || form.type === 'CUSTOMER_INPAYMENT' || form.type === 'INTEREST_PAYMENT'
        ? Math.abs(Number(form.amount))
        : -Math.abs(Number(form.amount)),
      type: form.type,
      category_id: form.category_id ? Number(form.category_id) : undefined,
      description: form.description || undefined,
      currency: 'EUR',
    }),
    onSuccess: () => {
      qc.invalidateQueries()
      toast('Transacción añadida', 'success')
      onClose()
      setForm({ date: new Date().toISOString().slice(0, 10), name: '', amount: '', type: 'CARD_TRANSACTION', category_id: '', description: '' })
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  const isIncome = form.type.includes('INBOUND') || form.type === 'CUSTOMER_INPAYMENT' || form.type === 'INTEREST_PAYMENT'

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nueva transacción manual</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Importe (€)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className={isIncome ? 'border-primary/40 focus:border-primary' : 'border-negative/30 focus:border-negative/50'}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TX_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nombre / Comercio</Label>
            <Input placeholder="Ej: Mercadona, Nómina..." value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.icon} {c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Descripción (opcional)</Label>
            <Input placeholder="Notas adicionales..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => form.amount && createMutation.mutate()}
            disabled={!form.amount || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Añadir transacción
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteAllDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [confirm, setConfirm] = useState('')

  const deleteMutation = useMutation({
    mutationFn: authApi.deleteAllData,
    onSuccess: () => {
      qc.invalidateQueries()
      toast('Todos los datos han sido eliminados', 'success')
      onClose()
      setConfirm('')
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  return (
    <Dialog open={open} onOpenChange={v => { onClose(); setConfirm('') }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-negative">
            <AlertTriangle className="h-5 w-5" /> Borrar todos los datos
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta acción eliminará <strong className="text-foreground">permanentemente</strong> todas tus transacciones, grupos recurrentes, deudas, metas y categorías personalizadas. <strong className="text-negative">No se puede deshacer.</strong>
          </p>
          <div className="space-y-1.5">
            <Label>Escribe <strong>BORRAR</strong> para confirmar</Label>
            <Input
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="BORRAR"
              className="border-negative/30"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { onClose(); setConfirm('') }}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={confirm !== 'BORRAR' || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Borrar todo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Category select rendered as a pill/badge — opens the glanceable grid picker below ── */
function RowCategorySelect({ tx, size, onOpen }: {
  tx: Transaction
  size: 'sm' | 'xs'
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-auto min-w-[92px] max-w-[150px] items-center gap-1 rounded-full border font-medium shadow-none transition-colors active:scale-95',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-6 px-2 text-[11px]',
      )}
      style={tx.category ? {
        borderColor: `${tx.category.color}4d`,
        color: tx.category.color,
        backgroundColor: `${tx.category.color}14`,
      } : undefined}
    >
      {tx.category ? (
        <span className="flex items-center gap-1 truncate">{tx.category.icon} <span className="truncate">{tx.category.name}</span></span>
      ) : (
        <span className="flex items-center gap-1 truncate text-muted-foreground"><Tag className="h-3 w-3" /> Categorizar</span>
      )}
    </button>
  )
}

/* ── Glanceable category picker: searchable grid of color-coded chips instead of a text list ── */
function CategoryPickerDialog({ open, onClose, categories, value, onSelect, title = 'Elegir categoría' }: {
  open: boolean
  onClose: () => void
  categories: Category[]
  value?: number | null
  onSelect: (categoryId: number) => void
  title?: string
}) {
  const [query, setQuery] = useState('')
  useEffect(() => { if (open) setQuery('') }, [open])
  const filtered = categories.filter(c => c.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar categoría..."
              className="rounded-xl pl-9"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 max-h-[50vh] overflow-y-auto pr-0.5 xs:grid-cols-4">
            {filtered.map(c => {
              const selected = value === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onSelect(c.id); onClose() }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition-all active:scale-95',
                    selected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/40',
                  )}
                  style={{ backgroundColor: `${c.color}14` }}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg" style={{ backgroundColor: `${c.color}25` }}>
                    {c.icon}
                  </span>
                  <span className="line-clamp-2 text-[11px] font-medium leading-tight" style={{ color: c.color }}>
                    {c.name}
                  </span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="col-span-3 py-6 text-center text-sm text-muted-foreground xs:col-span-4">Sin resultados</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ── Skeleton rows shown instantly while the first batch of transactions loads ── */
function TxRowSkeleton() {
  return (
    <>
      {/* Mobile skeleton row */}
      <div className="flex gap-3 px-4 py-3.5 sm:hidden">
        <div className="h-10 w-10 shrink-0 rounded-full bg-muted animate-pulse" />
        <div className="flex flex-1 flex-col gap-2 py-0.5">
          <div className="flex items-center justify-between gap-2">
            <div className="h-3.5 w-32 rounded bg-muted animate-pulse" />
            <div className="h-3.5 w-14 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-2.5 w-20 rounded bg-muted/70 animate-pulse" />
          <div className="h-5 w-24 rounded-full bg-muted/70 animate-pulse" />
        </div>
      </div>
      {/* Desktop skeleton row */}
      <div className="hidden items-center gap-3 border-b border-border/70 py-3 pl-[17px] pr-5 last:border-b-0 sm:flex">
        <div className="h-10 w-10 shrink-0 rounded-full bg-muted animate-pulse" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 w-40 rounded bg-muted animate-pulse" />
          <div className="h-2.5 w-24 rounded bg-muted/70 animate-pulse" />
        </div>
        <div className="hidden w-[180px] shrink-0 md:block">
          <div className="h-6 w-28 rounded-full bg-muted animate-pulse" />
        </div>
        <div className="w-28 shrink-0 flex justify-end">
          <div className="h-3.5 w-16 rounded bg-muted animate-pulse" />
        </div>
        <div className="w-4 shrink-0" />
      </div>
    </>
  )
}

export function Transactions() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState<string>('')
  // cycleFilter: '' = all, 'idx:N' = payroll cycle index N, 'month:YYYY-MM' = calendar fallback
  const [cycleFilter, setCycleFilter] = useState<string>('')
  const [typeGroup, setTypeGroup] = useState<string>('')       // "" | "income" | "expense"
  const [importOpen, setImportOpen]   = useState(false)

  // Open dialogs when navigated from command palette
  useEffect(() => {
    if (searchParams.get('import') === '1') {
      setImportOpen(true)
      setSearchParams({}, { replace: true })
    } else if (searchParams.get('add') === '1') {
      setAddOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [])
  const [addOpen, setAddOpen]         = useState(false)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [lastClickedIdx, setLastClickedIdx] = useState<number | null>(null)
  const [bulkCatOpen, setBulkCatOpen] = useState(false)
  const [catPickerTxId, setCatPickerTxId] = useState<number | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [show2FA, setShow2FA] = useState(false)
  const [aiCategorizingIds, setAiCategorizingIds] = useState<Set<number>>(new Set())
  const [bulkAiPending, setBulkAiPending] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set())

  const toggleExpandGroup = useCallback((linkGroupId: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(linkGroupId)) next.delete(linkGroupId)
      else next.add(linkGroupId)
      return next
    })
  }, [])

  // Auto-refresh when AI chat categorizes a transaction
  useEffect(() => {
    const handler = () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['by-cat'] })
    }
    window.addEventListener('tx-categorized', handler)
    return () => window.removeEventListener('tx-categorized', handler)
  }, [qc])

  const { data: trStatus } = useQuery({
    queryKey: ['tr-status'],
    queryFn: trApi.status,
    staleTime: 60_000,
  })

  const handleBankSync = async () => {
    setSyncing(true)
    try {
      const r = await trApi.sync()
      const parts = [`${r.synced} nuevas`]
      if (r.updated > 0) parts.push(`${r.updated} corregidas`)
      if (r.skipped > 0) parts.push(`${r.skipped} ya existían`)
      toast(`Sincronizado: ${parts.join(', ')}`, 'success')
      qc.invalidateQueries({ queryKey: ['transactions'] })
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al sincronizar', 'error')
      qc.invalidateQueries({ queryKey: ['tr-status'] })
    } finally {
      setSyncing(false)
    }
  }

  const handleReconnect = async () => {
    setReconnecting(true)
    try {
      const r = await trApi.autoConnect()
      if (r.status === 'connected') {
        toast('Trade Republic reconectado', 'success')
        qc.invalidateQueries({ queryKey: ['tr-status'] })
      } else if (r.status === 'needs_2fa') {
        setShow2FA(true)
      } else if (r.status === 'no_credentials') {
        navigate('/ajustes?tab=integrations')
      } else {
        toast(r.message ? `Trade Republic: ${r.message}` : 'Error al reconectar', 'error')
      }
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Error al reconectar', 'error')
    } finally {
      setReconnecting(false)
    }
  }

  const handleAiCategorize = async (ids: number[]) => {
    const isBulk = ids.length > 1
    if (isBulk) {
      setBulkAiPending(true)
    } else {
      setAiCategorizingIds(prev => new Set([...prev, ...ids]))
    }
    try {
      const res = await aiApi.categorizeBatch(ids)
      const ok = res.results.filter(r => r.category_id)
      const fail = res.results.filter(r => r.error)
      if (ok.length > 0) {
        qc.invalidateQueries({ queryKey: ['transactions'] })
        qc.invalidateQueries({ queryKey: ['by-cat'] })
        toast(
          isBulk
            ? `IA categorizó ${ok.length} de ${ids.length} transacciones`
            : `IA asignó: ${ok[0].category_icon} ${ok[0].category_name}`,
          'success',
        )
      }
      if (fail.length > 0 && ok.length === 0) {
        toast(isBulk ? 'La IA no pudo categorizar ninguna' : `IA: ${fail[0].error}`, 'error')
      }
      if (isBulk) setSelectedIds(new Set())
    } catch (e: any) {
      toast(e.message || 'Error al categorizar con IA', 'error')
    } finally {
      if (isBulk) {
        setBulkAiPending(false)
      } else {
        setAiCategorizingIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n })
      }
    }
  }

  /* ── Payroll cycles for the period filter ── */
  const { cycles: payrollCycles } = usePayrollCycle(0)

  // Build cycle options (newest first) — fall back to calendar months when no payroll data
  const cycleOptions = useMemo(() => {
    if (payrollCycles.length > 0) {
      // Payroll mode: list each tramo newest → oldest
      return [...payrollCycles].reverse().map((c, reverseIdx) => {
        const idx = payrollCycles.length - 1 - reverseIdx
        const startD = new Date(c.start + 'T12:00:00')
        const endD   = new Date(c.end   + 'T12:00:00')
        const fmt = (d: Date) =>
          d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
        const endLabel = c.isOpen ? 'hoy' : fmt(endD)
        return {
          value: `idx:${idx}`,
          label: `${fmt(startD)} — ${endLabel}`,
          dateFrom: c.start,
          dateTo:   c.end,
        }
      })
    }
    // Calendar fallback: last 36 months
    const opts: { value: string; label: string; dateFrom: string; dateTo: string }[] = []
    const now = new Date()
    for (let i = 0; i < 36; i++) {
      const d  = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const y  = d.getFullYear()
      const m  = d.getMonth() + 1
      const ms = `${y}-${String(m).padStart(2, '0')}`
      opts.push({
        value:    `month:${ms}`,
        label:    d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
        dateFrom: `${ms}-01`,
        dateTo:   `${ms}-${String(monthLastDay(y, m)).padStart(2, '0')}`,
      })
    }
    return opts
  }, [payrollCycles])

  // Resolve date range from selected cycleFilter
  const selectedCycleOption = cycleFilter ? cycleOptions.find(o => o.value === cycleFilter) : null
  const dateFrom = selectedCycleOption?.dateFrom
  const dateTo   = selectedCycleOption?.dateTo

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: catApi.list })

  const PAGE_SIZE = 20
  const txListKey = ['transactions', search, catFilter, cycleFilter, typeGroup]

  const {
    data: txPages,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: txListKey,
    queryFn: ({ pageParam }) => txApi.list({
      page: pageParam,
      page_size: PAGE_SIZE,
      account_category: 'CASH',
      ...(search     ? { search }                : {}),
      ...(catFilter  ? { category_id: catFilter } : {}),
      ...(dateFrom   ? { date_from: dateFrom }    : {}),
      ...(dateTo     ? { date_to: dateTo }        : {}),
      ...(typeGroup  ? { type_group: typeGroup }  : {}),
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((s, p) => s + p.items.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
    placeholderData: prev => prev,
  })

  // As soon as the first (small, fast) batch resolves, immediately kick off the next one so
  // more transactions keep streaming in without waiting for the user to scroll.
  useEffect(() => {
    if (txPages && txPages.pages.length === 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage()
    }
  }, [txPages, hasNextPage, isFetchingNextPage, fetchNextPage])

  const items = useMemo(() => txPages?.pages.flatMap(p => p.items) ?? [], [txPages])
  const total = txPages?.pages[0]?.total ?? 0

  // Scroll-triggered loading of further batches once the sentinel below the list scrolls into view.
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el || !hasNextPage) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !isFetchingNextPage) fetchNextPage()
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length])

  // Category breakdown for the "Top categorías" summary widget — scoped to the same period/type filters.
  const { data: catBreakdown } = useQuery({
    queryKey: ['by-cat', dateFrom, dateTo, typeGroup],
    queryFn: () => dashApi.byCategory({
      ...(dateFrom  ? { date_from: dateFrom } : {}),
      ...(dateTo    ? { date_to: dateTo }     : {}),
      ...(typeGroup ? { tx_type: typeGroup }  : {}),
    }),
  })

  // Applies `updater` to the flattened items of every loaded page in the infinite-query cache.
  const updateTxCache = (updater: (items: Transaction[]) => Transaction[]) => {
    const prev = qc.getQueryData<InfiniteData<TransactionListResponse>>(txListKey)
    qc.setQueryData<InfiniteData<TransactionListResponse>>(txListKey, old => {
      if (!old) return old
      return { ...old, pages: old.pages.map(p => ({ ...p, items: updater(p.items) })) }
    })
    return prev
  }

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Transaction> }) => txApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ['transactions'] })
      const prev = updateTxCache(items => items.map(tx => tx.id === id ? { ...tx, ...data } : tx))
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(txListKey, ctx.prev)
      toast('Error al actualizar', 'error')
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      qc.invalidateQueries({ queryKey: ['by-cat'] })
      qc.invalidateQueries({ queryKey: ['monthly-trend'] })
      toast('is_internal_transfer' in (vars.data as any) ? 'Marcada como ingreso/gasto real' : 'Categoría actualizada', 'success')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => txApi.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['transactions'] })
      const prev = updateTxCache(items => items.filter(tx => tx.id !== id))
      setConfirmDelete(null)
      return { prev }
    },
    onError: (e: any, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(txListKey, ctx.prev)
      toast(e.message || 'Error al eliminar', 'error')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      qc.invalidateQueries({ queryKey: ['by-cat'] })
      toast('Transacción eliminada', 'success')
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map(id => txApi.delete(id))),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ['transactions'] })
      const idSet = new Set(ids)
      const prev = updateTxCache(items => items.filter(tx => !idSet.has(tx.id)))
      setSelectedIds(new Set())
      return { prev }
    },
    onError: (e: any, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(txListKey, ctx.prev)
      toast(e.message || 'Error al eliminar', 'error')
    },
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      toast(`${ids.length} transacciones eliminadas`, 'success')
    },
  })

  const linkMutation = useMutation({
    mutationFn: (ids: number[]) => txApi.link(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      qc.invalidateQueries({ queryKey: ['by-cat'] })
      qc.invalidateQueries({ queryKey: ['monthly-trend'] })
      setSelectedIds(new Set())
      toast('Transacciones unidas', 'success')
    },
    onError: (e: any) => toast(e.message || 'Error al unir transacciones', 'error'),
  })

  const unlinkMutation = useMutation({
    mutationFn: (linkGroupId: number) => txApi.unlink(linkGroupId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      qc.invalidateQueries({ queryKey: ['by-cat'] })
      qc.invalidateQueries({ queryKey: ['monthly-trend'] })
      toast('Transacciones separadas', 'success')
    },
    onError: (e: any) => toast(e.message || 'Error al separar', 'error'),
  })

  const bulkCategoryMutation = useMutation({
    mutationFn: ({ ids, category_id }: { ids: number[]; category_id: number }) =>
      Promise.all(ids.map(id => txApi.update(id, { category_id }))),
    onMutate: async ({ ids, category_id }) => {
      await qc.cancelQueries({ queryKey: ['transactions'] })
      const idSet = new Set(ids)
      const category = categories?.find(c => c.id === category_id)
      const prev = updateTxCache(items => items.map(tx =>
        idSet.has(tx.id)
          ? { ...tx, category_id, category: category ?? tx.category, is_auto_categorized: false, is_ai_categorized: false }
          : tx,
      ))
      setSelectedIds(new Set())
      setBulkCatOpen(false)
      return { prev }
    },
    onError: (e: any, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(txListKey, ctx.prev)
      toast(e.message || 'Error al actualizar', 'error')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      toast('Categoría actualizada', 'success')
    },
  })

  const toggleSelect = useCallback((id: number, idx: number, shiftKey: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (shiftKey && lastClickedIdx !== null) {
        const lo = Math.min(idx, lastClickedIdx)
        const hi = Math.max(idx, lastClickedIdx)
        items.slice(lo, hi + 1).forEach(tx => next.add(tx.id))
      } else {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      return next
    })
    setLastClickedIdx(idx)
  }, [lastClickedIdx, items])

  const toggleSelectAll = useCallback(() => {
    if (items.length === 0) return
    if (selectedIds.size === items.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(items.map(tx => tx.id)))
  }, [items, selectedIds.size])

  const hasActiveFilters = !!(cycleFilter || typeGroup || catFilter || search)
  const selectedCatName   = catFilter && categories ? categories.find(c => c.id.toString() === catFilter)?.name : null
  const selectedCycleLabel = selectedCycleOption?.label ?? null
  const selectedTypeLabel  = typeGroup ? TYPE_GROUPS.find(g => g.value === typeGroup)?.label : null
  const isPayrollMode = payrollCycles.length > 0

  // Group the loaded transactions by day, keeping their original (flat) index for shift-click
  // range selection, which is why grouping happens client-side over the flattened `items`.
  const groupedItems = useMemo(() => {
    const groups: { label: string; items: { tx: Transaction; idx: number }[] }[] = []
    items.forEach((tx, idx) => {
      const label = dateGroupLabel(tx.date)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push({ tx, idx })
      else groups.push({ label, items: [{ tx, idx }] })
    })
    return groups
  }, [items])

  const incomeSum  = txPages?.pages[0]?.income_sum ?? 0
  const expenseSum = txPages?.pages[0]?.expense_sum ?? 0
  const netSum     = incomeSum - expenseSum

  const topCategories = useMemo(() => {
    const sorted = [...(catBreakdown ?? [])].sort((a, b) => b.total - a.total).slice(0, 5)
    const max = sorted[0]?.total || 1
    return sorted.map(c => ({ ...c, pct: Math.min(100, Math.round((c.total / max) * 100)) }))
  }, [catBreakdown])

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Transacciones</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{total} movimiento{total === 1 ? '' : 's'}{selectedCycleLabel ? ` · ${selectedCycleLabel}` : ''}</span>
            {incomeSum > 0 && <span className="text-positive font-medium tabular-nums">+{formatCurrency(incomeSum)}</span>}
            {incomeSum > 0 && expenseSum > 0 && <span className="text-muted-foreground/40">·</span>}
            {expenseSum > 0 && <span className="text-negative font-medium tabular-nums">-{formatCurrency(expenseSum)}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="text-negative border-negative/25 hover:bg-negative/10" onClick={() => setDeleteAllOpen(true)}>
            <Trash2 className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Borrar todo</span>
          </Button>
          {trStatus?.connected ? (
            <Button variant="outline" size="sm" onClick={handleBankSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 sm:mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 sm:mr-1.5" />}
              <span className="hidden sm:inline">Sincronizar</span>
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleReconnect} disabled={reconnecting}>
              {reconnecting ? <Loader2 className="h-4 w-4 sm:mr-1.5 animate-spin" /> : <Settings className="h-4 w-4 sm:mr-1.5" />}
              <span className="hidden sm:inline">Reconectar</span>
            </Button>
          )}
          <Button
            size="lg"
            onClick={() => setImportOpen(true)}
            className="h-11 rounded-xl bg-primary/10 px-4 font-semibold text-primary ring-1 ring-primary/25 hover:bg-primary/20"
          >
            <Upload className="h-5 w-5 sm:mr-2" /> <span className="hidden sm:inline">Importar CSV</span>
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 sm:mr-1.5" /> <span className="hidden sm:inline">Añadir</span>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="card-hover flex flex-col gap-3 p-3.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o descripción..."
              className="rounded-xl pl-9"
              value={search}
              onChange={e => { setSearch(e.target.value) }}
            />
          </div>
          {/* Income / expense chips */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setTypeGroup('') }}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                typeGroup === '' ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              Todas
            </button>
            {TYPE_GROUPS.map(g => (
              <button
                key={g.value}
                onClick={() => { setTypeGroup(g.value) }}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  typeGroup === g.value ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          {/* Cycle / Month filter */}
          <Select value={cycleFilter || 'all'} onValueChange={v => { setCycleFilter(v === 'all' ? '' : v) }}>
            <SelectTrigger className="rounded-xl sm:w-48">
              <SelectValue placeholder={isPayrollMode ? 'Todos los tramos' : 'Todos los meses'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isPayrollMode ? 'Todos los tramos' : 'Todos los meses'}</SelectItem>
              {cycleOptions.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Category */}
          <Select value={catFilter || 'all'} onValueChange={v => { setCatFilter(v === 'all' ? '' : v) }}>
            <SelectTrigger className="rounded-xl sm:w-44">
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las categorías</SelectItem>
              {categories?.map(c => (
                <SelectItem key={c.id} value={c.id.toString()}>{c.icon} {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Active filter pills */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {selectedCycleLabel && (
              <button
                onClick={() => { setCycleFilter('') }}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                {isPayrollMode ? '💳' : '📅'} {selectedCycleLabel}
                <X className="h-3 w-3 ml-0.5" />
              </button>
            )}
            {selectedTypeLabel && (
              <button
                onClick={() => { setTypeGroup('') }}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                {selectedTypeLabel}
                <X className="h-3 w-3 ml-0.5" />
              </button>
            )}
            {selectedCatName && (
              <button
                onClick={() => { setCatFilter('') }}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                {categories?.find(c => c.id.toString() === catFilter)?.icon} {selectedCatName}
                <X className="h-3 w-3 ml-0.5" />
              </button>
            )}
            {search && (
              <button
                onClick={() => { setSearch('') }}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                🔍 &ldquo;{search}&rdquo;
                <X className="h-3 w-3 ml-0.5" />
              </button>
            )}
            <button
              onClick={() => { setSearch(''); setCatFilter(''); setCycleFilter(''); setTypeGroup('') }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              Limpiar todo
            </button>
          </div>
        )}
      </Card>

      {/* List + summary panel */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Transaction list */}
        <Card className="card-hover min-w-0 flex-1 overflow-hidden p-0">
          {isLoading ? (
            <div className="flex flex-col">
              {Array.from({ length: 8 }).map((_, i) => <TxRowSkeleton key={i} />)}
            </div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="flex flex-col sm:hidden">
                {groupedItems.map(group => (
                  <div key={group.label}>
                    <div className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      {group.label}
                    </div>
                    {group.items.map(({ tx, idx }) => (
                      <div key={tx.id} className={cn('border-b border-border/70 last:border-0', selectedIds.has(tx.id) && 'bg-primary/5')}>
                      <div className="flex gap-3 px-4 py-3.5">
                        <button
                          type="button"
                          title={selectedIds.has(tx.id) ? 'Deseleccionar' : 'Seleccionar'}
                          onClick={() => toggleSelect(tx.id, idx, false)}
                          className="relative mt-0.5 h-10 w-10 shrink-0"
                        >
                          <div className={cn(
                            'flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border text-lg shadow-sm transition-colors',
                            selectedIds.has(tx.id) ? 'border-primary bg-primary' : 'border-border bg-secondary',
                          )}>
                            {selectedIds.has(tx.id)
                              ? <Check className="h-[18px] w-[18px] text-primary-foreground" strokeWidth={2.5} />
                              : <TransactionIcon name={tx.name || tx.description || tx.type} category={tx.category} />}
                          </div>
                        </button>

                        <div className="flex flex-col flex-1 min-w-0 gap-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-col min-w-0">
                              <p className="font-medium text-[14px] leading-tight text-foreground truncate">{tx.name || tx.description || tx.type}</p>
                              <span className="text-[11.5px] text-muted-foreground mt-0.5">{txTypeLabel(tx.type)}</span>
                              {tx.is_pending && (
                                <span className="text-[11px] text-warning mt-0.5 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-warning/70"></span>
                                  Pendiente — no computa en saldo
                                </span>
                              )}
                              {tx.is_internal_transfer && (
                                <span className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-chart-4/60"></span>
                                  Transferencia Interna
                                </span>
                              )}
                              {tx.link_group_id && tx.linked_transactions && tx.linked_transactions.length > 0 && (
                                <button
                                  onClick={() => toggleExpandGroup(tx.link_group_id!)}
                                  className="inline-flex items-center gap-1 self-start mt-1 rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                                >
                                  <Link2 className="h-2.5 w-2.5" />
                                  {tx.linked_transactions.length + 1} unidas
                                  <ChevronDown className={cn('h-2.5 w-2.5 transition-transform', expandedGroups.has(tx.link_group_id) && 'rotate-180')} />
                                </button>
                              )}
                            </div>
                            <span className={cn(
                              'text-[15px] font-semibold tabular-nums tracking-tight shrink-0',
                              netAmount(tx) > 0 ? 'text-positive' : 'text-foreground',
                              netAmount(tx) === 0 && 'text-muted-foreground',
                            )}>
                              {netAmount(tx) > 0 ? '+' : ''}{formatCurrency(netAmount(tx))}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <RowCategorySelect
                                tx={tx}
                                size="xs"
                                onOpen={() => setCatPickerTxId(tx.id)}
                              />
                              {tx.is_auto_categorized && !tx.is_internal_transfer && (
                                <button
                                  title="Categoría asignada automáticamente. Haz clic para confirmar y quitar este aviso."
                                  onClick={() => updateMutation.mutate({ id: tx.id, data: { is_auto_categorized: false } })}
                                  className="text-primary/60 hover:text-primary transition-colors shrink-0"
                                >
                                  <Sparkles className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {tx.is_ai_categorized && (
                                <button
                                  title="Categoría asignada por la IA. Haz clic para confirmar y quitar el indicador."
                                  onClick={() => updateMutation.mutate({ id: tx.id, data: { is_ai_categorized: false } })}
                                  className="text-chart-4/80 hover:text-chart-4 transition-colors shrink-0"
                                >
                                  <Bot className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0">
                              <span className="text-[11px] font-medium text-muted-foreground/60">{formatDate(tx.date)}</span>
                              <button
                                title="Categorizar con IA"
                                disabled={aiCategorizingIds.has(tx.id)}
                                onClick={() => handleAiCategorize([tx.id])}
                                className="text-muted-foreground/40 hover:text-chart-4 transition-colors flex items-center justify-center disabled:opacity-40"
                              >
                                {aiCategorizingIds.has(tx.id)
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Sparkles className="h-3.5 w-3.5" />}
                              </button>
                              <button onClick={() => setConfirmDelete(tx.id)}
                                  className="text-muted-foreground/30 hover:text-negative transition-colors flex items-center justify-center">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {tx.link_group_id && tx.linked_transactions && tx.linked_transactions.length > 0 && expandedGroups.has(tx.link_group_id) && (
                        <div className="bg-secondary/30 px-4 pb-3 pt-0.5 space-y-1.5">
                          {[tx, ...tx.linked_transactions].map(leg => (
                            <div key={leg.id} className="flex items-center justify-between gap-2 text-xs pl-[52px]">
                              <span className="truncate text-muted-foreground">{leg.name || leg.description || leg.type}</span>
                              <span className={cn('shrink-0 tabular-nums font-medium', leg.amount > 0 ? 'text-positive' : 'text-foreground')}>
                                {leg.amount > 0 ? '+' : ''}{formatCurrency(leg.amount)}
                              </span>
                            </div>
                          ))}
                          <div className="flex justify-end">
                            <button
                              onClick={() => unlinkMutation.mutate(tx.link_group_id!)}
                              disabled={unlinkMutation.isPending}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-negative transition-colors disabled:opacity-50"
                            >
                              {unlinkMutation.isPending
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Unlink className="h-3 w-3" />}
                              Desvincular
                            </button>
                          </div>
                        </div>
                      )}
                      </div>
                    ))}
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground text-sm">No se encontraron transacciones</p>
                )}
              </div>

              {/* Desktop list */}
              <div className="hidden sm:block">
                <div className="flex items-center gap-3 border-b border-border bg-secondary/40 px-5 py-2.5 text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.size === items.length}
                    ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < items.length }}
                    onChange={toggleSelectAll}
                    className="h-3.5 w-3.5 shrink-0 rounded accent-primary cursor-pointer"
                  />
                  <span className="flex-1 text-xs font-medium uppercase tracking-wider">Descripción</span>
                  <span className="hidden w-[180px] shrink-0 text-xs font-medium uppercase tracking-wider md:block">Categoría</span>
                  <span className="w-28 shrink-0 text-right text-xs font-medium uppercase tracking-wider">Importe</span>
                  <span className="w-4 shrink-0" />
                </div>

                {groupedItems.map(group => (
                  <div key={group.label}>
                    <div className="px-5 pt-3.5 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                      {group.label}
                    </div>
                    {group.items.map(({ tx, idx }) => (
                      <div key={tx.id}>
                      <div
                        className={cn(
                          'group flex items-center gap-3 border-b border-l-[3px] border-border/70 py-3 pl-[17px] pr-5 transition-colors last:border-b-0',
                          selectedIds.has(tx.id) ? 'border-l-primary bg-primary/5' : 'border-l-transparent hover:bg-accent/50',
                        )}
                      >
                        <button
                          type="button"
                          title={selectedIds.has(tx.id) ? 'Deseleccionar' : 'Seleccionar'}
                          onClick={e => toggleSelect(tx.id, idx, e.shiftKey)}
                          className="relative h-10 w-10 shrink-0"
                        >
                          <div className={cn(
                            'flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border text-lg shadow-sm transition-colors',
                            selectedIds.has(tx.id) ? 'border-primary bg-primary' : 'border-border bg-secondary',
                          )}>
                            {selectedIds.has(tx.id)
                              ? <Check className="h-[18px] w-[18px] text-primary-foreground" strokeWidth={2.5} />
                              : <TransactionIcon name={tx.name || tx.description || tx.type} category={tx.category} />}
                          </div>
                          {tx.link_group_id && tx.linked_transactions && tx.linked_transactions.length > 0 && !selectedIds.has(tx.id) && (
                            <div className="absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-card bg-muted">
                              <Link2 className="h-2.5 w-2.5 text-muted-foreground" />
                            </div>
                          )}
                        </button>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{tx.name || tx.description || tx.type}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{txTypeLabel(tx.type)}</span>
                            {!tx.category_id && <Badge variant="muted" className="py-0 text-[10px]">Sin cat.</Badge>}
                            {tx.is_pending && <Badge className="py-0 text-[10px] bg-warning/15 text-warning border-transparent">Pendiente</Badge>}
                            {tx.is_internal_transfer && (
                              <button
                                title="Transferencia interna (excluida de totales). Haz clic para marcar como ingreso/gasto real."
                                onClick={() => updateMutation.mutate({ id: tx.id, data: { is_internal_transfer: false } })}
                              >
                                <Badge variant="muted" className="py-0 text-[10px] hover:bg-chart-4/20 hover:text-chart-4 transition-colors">🔄 Interna</Badge>
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="hidden w-[180px] shrink-0 items-center gap-1.5 md:flex">
                          <RowCategorySelect
                            tx={tx}
                            size="sm"
                            onOpen={() => setCatPickerTxId(tx.id)}
                          />
                          {tx.is_auto_categorized && !tx.is_internal_transfer && (
                            <button
                              title="Categoría asignada automáticamente. Haz clic para confirmar y quitar este aviso."
                              onClick={() => updateMutation.mutate({ id: tx.id, data: { is_auto_categorized: false } })}
                              className="text-primary/60 hover:text-primary transition-colors shrink-0"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {tx.is_ai_categorized && (
                            <button
                              title="Categoría asignada por la IA. Haz clic para confirmar y quitar el indicador."
                              onClick={() => updateMutation.mutate({ id: tx.id, data: { is_ai_categorized: false } })}
                              className="text-chart-4/80 hover:text-chart-4 transition-colors shrink-0"
                            >
                              <Bot className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            title="Categorizar con IA"
                            disabled={aiCategorizingIds.has(tx.id)}
                            onClick={() => handleAiCategorize([tx.id])}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-chart-4 disabled:opacity-50 shrink-0"
                          >
                            {aiCategorizingIds.has(tx.id)
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Sparkles className="h-3.5 w-3.5" />}
                          </button>
                        </div>

                        <div className="flex w-28 shrink-0 flex-col items-end gap-0.5">
                          <span className={cn(
                            'text-right text-[15px] font-semibold tabular-nums tracking-tight',
                            netAmount(tx) > 0 ? 'text-positive' : 'text-foreground',
                            netAmount(tx) === 0 && 'text-muted-foreground',
                          )}>
                            {netAmount(tx) > 0 ? '+' : ''}{formatCurrency(netAmount(tx))}
                          </span>
                          {tx.link_group_id && tx.linked_transactions && tx.linked_transactions.length > 0 && (
                            <button
                              onClick={() => toggleExpandGroup(tx.link_group_id!)}
                              className={cn(
                                'flex items-center gap-1 text-[11px] font-medium transition-colors',
                                expandedGroups.has(tx.link_group_id) ? 'text-primary' : 'text-muted-foreground hover:text-primary',
                              )}
                            >
                              {tx.linked_transactions.length + 1} movimientos
                              <ChevronDown className={cn('h-2.5 w-2.5 transition-transform', expandedGroups.has(tx.link_group_id) && 'rotate-180')} />
                            </button>
                          )}
                        </div>

                        <button
                          onClick={() => setConfirmDelete(tx.id)}
                          className="w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-negative"
                          title="Eliminar transacción"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      {tx.link_group_id && tx.linked_transactions && tx.linked_transactions.length > 0 && expandedGroups.has(tx.link_group_id) && (
                        <div className="relative border-b border-border/70 bg-secondary/30 py-2.5 pl-[84px] pr-5 last:border-b-0">
                          <div className="absolute bottom-[26px] left-[39px] top-0 w-px bg-border" />
                          <div className="flex flex-col gap-2 pt-1">
                            {[tx, ...tx.linked_transactions].map(leg => (
                              <div key={leg.id} className="relative flex items-center justify-between gap-2 text-xs">
                                <span className="absolute -left-[45px] h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                                <span className="truncate text-muted-foreground">{leg.name || leg.description || leg.type}</span>
                                <span className={cn('shrink-0 tabular-nums font-medium', leg.amount > 0 ? 'text-positive' : 'text-foreground')}>
                                  {leg.amount > 0 ? '+' : ''}{formatCurrency(leg.amount)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-end pt-2.5">
                            <button
                              onClick={() => unlinkMutation.mutate(tx.link_group_id!)}
                              disabled={unlinkMutation.isPending}
                              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-negative transition-colors disabled:opacity-50"
                            >
                              {unlinkMutation.isPending
                                ? <Loader2 className="h-3 w-3 animate-spin" />
                                : <Unlink className="h-3 w-3" />}
                              Desvincular
                            </button>
                          </div>
                        </div>
                      )}
                      </div>
                    ))}
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground text-sm">No se encontraron transacciones</p>
                )}
              </div>

              {/* Infinite-scroll sentinel + "loading more" indicator, replaces numbered pagination */}
              <div ref={loadMoreRef} className="flex items-center justify-center py-4">
                {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            </>
          )}
        </Card>

        {/* Summary panel */}
        <div className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
          <Card className="card-hover p-5">
            <p className="text-xs font-medium text-muted-foreground">Este periodo</p>
            <div className="mt-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Ingresos</span>
                <span className="text-sm font-semibold tabular-nums text-positive">+{formatCurrency(incomeSum)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Gastos</span>
                <span className="text-sm font-semibold tabular-nums text-negative">-{formatCurrency(expenseSum)}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Neto</span>
                <span className={cn('font-display text-base font-semibold tabular-nums', netSum >= 0 ? 'text-foreground' : 'text-negative')}>
                  {netSum >= 0 ? '+' : ''}{formatCurrency(netSum)}
                </span>
              </div>
            </div>
          </Card>

          <Card className="card-hover p-5">
            <p className="text-xs font-medium text-muted-foreground">Top categorías</p>
            <div className="mt-3.5 flex flex-col gap-3.5">
              {topCategories.length === 0 && (
                <p className="text-xs text-muted-foreground">Sin datos en este periodo</p>
              )}
              {topCategories.map((c, i) => (
                <div key={c.category_id ?? c.category_name}>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted-foreground">{c.category_icon} {c.category_name}</span>
                    <span className="shrink-0 font-medium tabular-nums">{formatCurrency(c.total)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${c.pct}%`, backgroundColor: `hsl(var(--chart-${(i % 4) + 1}))` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Floating bulk-action bar — stays reachable above the mobile bottom nav / desktop sidebar
          instead of sitting inline at the end of a potentially long list. */}
      {selectedIds.size > 0 && (
        <div className="fixed inset-x-0 bottom-[78px] z-40 flex justify-center px-3 pb-[env(safe-area-inset-bottom)] md:bottom-0 md:pb-4 md:pl-60">
          <div className="flex w-full max-w-xl items-center justify-between gap-3 rounded-2xl border border-border bg-popover/95 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <span className="text-sm text-foreground">
                <strong className="font-semibold">{selectedIds.size}</strong>{' '}
                <span className="hidden text-muted-foreground xs:inline">seleccionadas</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-9 rounded-full px-3 text-xs" onClick={() => setBulkCatOpen(true)}>
                <Tag className="h-3.5 w-3.5 xs:mr-1.5" /> <span className="hidden xs:inline">Categorizar</span>
              </Button>
              {selectedIds.size >= 2 && (
                <Button
                  size="sm"
                  className="h-9 rounded-full px-3 text-xs font-semibold"
                  disabled={linkMutation.isPending}
                  onClick={() => linkMutation.mutate(Array.from(selectedIds))}
                >
                  {linkMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin xs:mr-1.5" />
                    : <Link2 className="h-3.5 w-3.5 xs:mr-1.5" />}
                  <span className="hidden xs:inline">Unir</span>
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="h-9 rounded-full px-3 text-xs border-chart-4/30 text-chart-4 hover:bg-chart-4/10"
                disabled={bulkAiPending}
                onClick={() => handleAiCategorize(Array.from(selectedIds))}
              >
                {bulkAiPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin xs:mr-1.5" />
                  : <Sparkles className="h-3.5 w-3.5 xs:mr-1.5" />}
                <span className="hidden xs:inline">IA</span>
              </Button>
              <button
                disabled={bulkDeleteMutation.isPending}
                onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-negative/10 hover:text-negative disabled:opacity-50"
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk category dialog — glanceable color-coded grid instead of a text dropdown */}
      <CategoryPickerDialog
        open={bulkCatOpen}
        onClose={() => setBulkCatOpen(false)}
        categories={categories || []}
        title={`Cambiar categoría (${selectedIds.size} transacciones)`}
        onSelect={categoryId => bulkCategoryMutation.mutate({ ids: Array.from(selectedIds), category_id: categoryId })}
      />

      {/* Row-level category picker, shared by the mobile card list and desktop rows */}
      <CategoryPickerDialog
        open={catPickerTxId !== null}
        onClose={() => setCatPickerTxId(null)}
        categories={categories || []}
        value={items.find(tx => tx.id === catPickerTxId)?.category_id}
        onSelect={categoryId => { if (catPickerTxId !== null) updateMutation.mutate({ id: catPickerTxId, data: { category_id: categoryId } }) }}
      />

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <AddTransactionDialog open={addOpen} onClose={() => setAddOpen(false)} categories={categories || []} />
      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)} />
      <TwoFAModal open={show2FA} onClose={() => { setShow2FA(false); qc.invalidateQueries({ queryKey: ['tr-status'] }) }} />

      <Dialog open={confirmDelete !== null} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-[320px]">
          <DialogHeader>
            <DialogTitle className="text-negative flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" /> Borrar transacción
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1">
            ¿Estás seguro de que quieres borrar esta transacción? Esta acción no se puede deshacer.
          </p>
          <DialogFooter className="mt-4 sm:justify-end gap-2 sm:gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete) }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? <Loader2 className="h-3 w-3 mr-2 animate-spin" /> : null}
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
