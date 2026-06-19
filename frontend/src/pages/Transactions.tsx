import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { txApi, catApi, authApi, trApi, aiApi } from '@/lib/api'
import type { Transaction, Category } from '@/lib/api'
import { usePayrollCycle } from '@/hooks/usePayrollCycle'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Upload, Search, ChevronLeft, ChevronRight, ChevronDown, Loader2, Tag, X, Plus, Trash2, AlertTriangle, Filter, Sparkles, Bot, RefreshCw, Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { TransactionIcon } from '@/components/TransactionIcon'

import { cn } from '@/lib/utils'

/* ── helpers ─────────────────────────────────────────────────────── */
function monthLastDay(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

const TYPE_GROUPS = [
  { value: 'income',  label: '↑ Ingresos' },
  { value: 'expense', label: '↓ Gastos' },
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
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
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
            <div className="rounded-lg bg-muted p-4 space-y-1 text-sm">
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
          <div className="grid grid-cols-2 gap-3">
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
                className={isIncome ? 'border-primary/40 focus:border-[#c2ff72]' : 'border-[hsl(var(--negative))]/30 focus:border-[hsl(var(--negative))]/50'}
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
              className="border-[hsl(var(--negative))]/30"
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

export function Transactions() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage]           = useState(1)
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
  const [bulkCatId, setBulkCatId] = useState<string>('')
  const [syncing, setSyncing] = useState(false)
  const [aiCategorizingIds, setAiCategorizingIds] = useState<Set<number>>(new Set())
  const [bulkAiPending, setBulkAiPending] = useState(false)

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
    } finally {
      setSyncing(false)
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
  const { data, isLoading } = useQuery({
    queryKey: ['transactions', page, search, catFilter, cycleFilter, typeGroup],
    queryFn: () => txApi.list({
      page,
      page_size: 25,
      account_category: 'CASH',
      ...(search     ? { search }                : {}),
      ...(catFilter  ? { category_id: catFilter } : {}),
      ...(dateFrom   ? { date_from: dateFrom }    : {}),
      ...(dateTo     ? { date_to: dateTo }        : {}),
      ...(typeGroup  ? { type_group: typeGroup }  : {}),
    }),
    placeholderData: prev => prev,
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Transaction> }) => txApi.update(id, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ['transactions'] })
      const prev = qc.getQueryData<{ items: Transaction[] }>(['transactions', page, search, catFilter, cycleFilter, typeGroup])
      qc.setQueryData(['transactions', page, search, catFilter, cycleFilter, typeGroup], (old: any) => {
        if (!old) return old
        return { ...old, items: old.items.map((tx: Transaction) => tx.id === id ? { ...tx, ...data } : tx) }
      })
      return { prev }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['transactions', page, search, catFilter, cycleFilter, typeGroup], ctx.prev)
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      qc.invalidateQueries({ queryKey: ['by-cat'] })
      setConfirmDelete(null)
      toast('Transacción eliminada', 'success')
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map(id => txApi.delete(id))),
    onSuccess: (_, ids) => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      qc.invalidateQueries({ queryKey: ['overview'] })
      setSelectedIds(new Set())
      toast(`${ids.length} transacciones eliminadas`, 'success')
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  const bulkCategoryMutation = useMutation({
    mutationFn: ({ ids, category_id }: { ids: number[]; category_id: number }) =>
      Promise.all(ids.map(id => txApi.update(id, { category_id }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions'] })
      setSelectedIds(new Set())
      setBulkCatOpen(false)
      setBulkCatId('')
      toast('Categoría actualizada', 'success')
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  const toggleSelect = useCallback((id: number, idx: number, shiftKey: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (shiftKey && lastClickedIdx !== null && data?.items) {
        const lo = Math.min(idx, lastClickedIdx)
        const hi = Math.max(idx, lastClickedIdx)
        data.items.slice(lo, hi + 1).forEach(tx => next.add(tx.id))
      } else {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      }
      return next
    })
    setLastClickedIdx(idx)
  }, [lastClickedIdx, data?.items])

  const toggleSelectAll = useCallback(() => {
    if (!data?.items) return
    if (selectedIds.size === data.items.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(data.items.map(tx => tx.id)))
  }, [data?.items, selectedIds.size])

  const totalPages = data ? Math.ceil(data.total / 25) : 1

  const hasActiveFilters = !!(cycleFilter || typeGroup || catFilter || search)
  const selectedCatName   = catFilter && categories ? categories.find(c => c.id.toString() === catFilter)?.name : null
  const selectedCycleLabel = selectedCycleOption?.label ?? null
  const selectedTypeLabel  = typeGroup ? TYPE_GROUPS.find(g => g.value === typeGroup)?.label : null
  const isPayrollMode = payrollCycles.length > 0

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-xl font-semibold tracking-tight">Transacciones</h1>
          <div className="flex items-center gap-2 text-sm">
            {(data?.income_sum ?? 0) > 0 && (
              <span className="text-positive font-medium">+{formatCurrency(data!.income_sum)}</span>
            )}
            {(data?.income_sum ?? 0) > 0 && (data?.expense_sum ?? 0) > 0 && (
              <span className="text-muted-foreground/40">·</span>
            )}
            {(data?.expense_sum ?? 0) > 0 && (
              <span className="text-negative font-medium">-{formatCurrency(data!.expense_sum)}</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{data?.total ?? 0} resultados</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="text-negative border-negative/20 hover:bg-negative/10" onClick={() => setDeleteAllOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> Borrar todo
          </Button>
          {trStatus?.connected ? (
            <Button variant="outline" onClick={handleBankSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sincronizar bancos
            </Button>
          ) : (
            <Button variant="outline" onClick={() => navigate('/ajustes')}>
              <Settings className="h-4 w-4 mr-2" /> Conectar banco
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Importar CSV
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Añadir
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="relative overflow-hidden flex flex-col gap-3 bg-white/[0.02] border border-white/[0.05] p-3 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.5)] animate-fade-in">
        <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="relative z-10 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o descripción..."
              className="pl-9"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          {/* Cycle / Month filter */}
          <Select value={cycleFilter || 'all'} onValueChange={v => { setCycleFilter(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="sm:w-52">
              <SelectValue placeholder={isPayrollMode ? 'Todos los tramos' : 'Todos los meses'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isPayrollMode ? 'Todos los tramos' : 'Todos los meses'}</SelectItem>
              {cycleOptions.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Type group */}
          <Select value={typeGroup || 'all'} onValueChange={v => { setTypeGroup(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="sm:w-36">
              <SelectValue placeholder="Todos los tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {TYPE_GROUPS.map(g => (
                <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Category */}
          <Select value={catFilter || 'all'} onValueChange={v => { setCatFilter(v === 'all' ? '' : v); setPage(1) }}>
            <SelectTrigger className="sm:w-44">
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
                onClick={() => { setCycleFilter(''); setPage(1) }}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                {isPayrollMode ? '💳' : '📅'} {selectedCycleLabel}
                <X className="h-3 w-3 ml-0.5" />
              </button>
            )}
            {selectedTypeLabel && (
              <button
                onClick={() => { setTypeGroup(''); setPage(1) }}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                {selectedTypeLabel}
                <X className="h-3 w-3 ml-0.5" />
              </button>
            )}
            {selectedCatName && (
              <button
                onClick={() => { setCatFilter(''); setPage(1) }}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                {categories?.find(c => c.id.toString() === catFilter)?.icon} {selectedCatName}
                <X className="h-3 w-3 ml-0.5" />
              </button>
            )}
            {search && (
              <button
                onClick={() => { setSearch(''); setPage(1) }}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
              >
                🔍 &ldquo;{search}&rdquo;
                <X className="h-3 w-3 ml-0.5" />
              </button>
            )}
            <button
              onClick={() => { setSearch(''); setCatFilter(''); setCycleFilter(''); setTypeGroup(''); setPage(1) }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
            >
              Limpiar todo
            </button>
          </div>
        )}
        </div>
      </div>

      {/* Table / Card list */}
      <div className="relative rounded-2xl border border-white/[0.07] bg-card/40 backdrop-blur-md shadow-[0_4px_24px_rgba(0,0,0,0.5)] overflow-hidden animate-fade-up">
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/[0.03] blur-3xl" />
        <div className="relative z-10">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="sm:hidden flex flex-col">
                {data?.items.map(tx => (
                  <div key={tx.id} className="flex gap-3 px-4 py-3.5 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors last:border-0">
                    <div className="flex h-10 w-10 mt-0.5 shrink-0 items-center justify-center rounded-full bg-white/[0.04] border border-white/[0.05] text-lg shadow-sm overflow-hidden">
                      <TransactionIcon name={tx.name || tx.description || tx.type} category={tx.category} />
                    </div>
                    
                    <div className="flex flex-col flex-1 min-w-0 gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-col min-w-0">
                          <p className="font-semibold text-[14px] leading-tight text-foreground truncate">{tx.name || tx.description || tx.type}</p>
                          {tx.is_pending && (
                            <span className="text-[11px] text-amber-400/80 mt-0.5 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60"></span>
                              Pendiente — no computa en saldo
                            </span>
                          )}
                          {tx.is_internal_transfer && (
                            <span className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-500/50"></span>
                              Transferencia Interna
                            </span>
                          )}
                        </div>
                        <span className={cn(
                          "text-[15px] font-bold tabular-nums tracking-tight shrink-0",
                          tx.amount > 0 ? "text-emerald-400" : "text-foreground",
                          tx.amount === 0 && "text-muted-foreground"
                        )}>
                          {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Select 
                            value={tx.category_id?.toString() || ''} 
                            onValueChange={id => updateMutation.mutate({ id: tx.id, data: { category_id: Number(id) } })}
                          >
                            <SelectTrigger className="flex items-center justify-between gap-1 text-[11px] px-2 py-0.5 h-6 w-fit min-w-[90px] max-w-[150px] rounded-full bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all font-medium shadow-sm [&>svg]:opacity-50 [&>svg]:h-3 [&>svg]:w-3">
                              {tx.category ? (
                                <span style={{ color: tx.category.color }} className="flex items-center gap-1 truncate">{tx.category.icon} <span className="truncate">{tx.category.name}</span></span>
                              ) : (
                                <span className="text-muted-foreground flex items-center gap-1 truncate"><Tag className="h-2.5 w-2.5" /> Asignar cat.</span>
                              )}
                            </SelectTrigger>
                            <SelectContent>
                              {categories?.map(c => (
                                <SelectItem key={c.id} value={c.id.toString()}>
                                  {c.icon} {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                              className="text-violet-400/80 hover:text-violet-400 transition-colors shrink-0"
                            >
                              <Bot className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-[11px] font-medium text-muted-foreground/50">{formatDate(tx.date)}</span>
                          <button
                            title="Categorizar con IA"
                            disabled={aiCategorizingIds.has(tx.id)}
                            onClick={() => handleAiCategorize([tx.id])}
                            className="text-muted-foreground/40 hover:text-violet-400 transition-colors flex items-center justify-center disabled:opacity-40"
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
                ))}
                {data?.items.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground text-sm">No se encontraron transacciones</p>
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/[0.02] border-b border-white/[0.05]">
                    <tr className="text-muted-foreground">
                      <th className="pl-4 pr-2 py-3.5 w-8">
                        <input
                          type="checkbox"
                          checked={(data?.items?.length ?? 0) > 0 && selectedIds.size === (data?.items?.length ?? 0)}
                          ref={el => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < (data?.items?.length ?? 0) }}
                          onChange={toggleSelectAll}
                          className="h-3.5 w-3.5 rounded accent-primary cursor-pointer"
                        />
                      </th>
                      <th className="text-left px-5 py-3.5 font-medium text-xs tracking-wider uppercase">Fecha</th>
                      <th className="text-left px-5 py-3.5 font-medium text-xs tracking-wider uppercase">Descripción</th>
                      <th className="text-left px-5 py-3.5 font-medium text-xs tracking-wider uppercase hidden md:table-cell min-w-[240px] w-[240px] max-w-[240px]">Categoría</th>
                      <th className="text-right px-5 py-3.5 font-medium text-xs tracking-wider uppercase">Importe</th>
                      <th className="px-5 py-3.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.map((tx, idx) => (
                      <tr key={tx.id} className={cn("border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors group", selectedIds.has(tx.id) && "bg-primary/5")}>
                        <td className="pl-4 pr-2 py-4 w-8">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(tx.id)}
                            onChange={e => toggleSelect(tx.id, idx, e.nativeEvent instanceof MouseEvent ? e.nativeEvent.shiftKey : false)}
                            onClick={e => toggleSelect(tx.id, idx, e.shiftKey)}
                            className="h-3.5 w-3.5 rounded accent-primary cursor-pointer"
                          />
                        </td>
                        <td className="px-5 py-4 text-xs font-medium text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.04] border border-white/[0.05] text-lg shadow-sm overflow-hidden">
                              <TransactionIcon name={tx.name || tx.description || tx.type} category={tx.category} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-foreground truncate max-w-[220px]">{tx.name || tx.description || tx.type}</p>
                              <div className="flex gap-1 mt-0.5">
                                {!tx.category_id && (
                                  <Badge variant="muted" className="text-xs py-0">Sin cat.</Badge>
                                )}
                                {tx.is_pending && (
                                  <Badge className="text-xs py-0 bg-amber-500/15 text-amber-400 border-amber-500/20">Pendiente</Badge>
                                )}
                                {tx.is_internal_transfer && (
                                  <button
                                    title="Transferencia interna (excluida de totales). Haz clic para marcar como ingreso/gasto real."
                                    onClick={() => updateMutation.mutate({ id: tx.id, data: { is_internal_transfer: false } })}
                                    className="cursor-pointer"
                                  >
                                    <Badge variant="muted" className="text-xs py-0 hover:bg-orange-500/20 hover:text-orange-300 transition-colors">🔄 Interna</Badge>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4 hidden md:table-cell min-w-[240px] w-[240px] max-w-[240px]">
                          <div className="flex items-center gap-2">
                            <Select 
                              value={tx.category_id?.toString() || ''} 
                              onValueChange={id => updateMutation.mutate({ id: tx.id, data: { category_id: Number(id) } })}
                            >
                              <SelectTrigger className="flex items-center justify-between w-full max-w-[160px] gap-1.5 text-xs px-2.5 py-1.5 h-7 rounded-md bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all font-medium group shadow-sm [&>svg]:opacity-50 hover:[&>svg]:opacity-100">
                                {tx.category ? (
                                  <span style={{ color: tx.category.color }} className="flex items-center gap-1.5 truncate">{tx.category.icon} <span className="truncate">{tx.category.name}</span></span>
                                ) : (
                                  <span className="text-muted-foreground flex items-center gap-1.5 truncate"><Tag className="h-3.5 w-3.5" /> Asignar categoría</span>
                                )}
                              </SelectTrigger>
                              <SelectContent>
                                {categories?.map(c => (
                                  <SelectItem key={c.id} value={c.id.toString()}>
                                    {c.icon} {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {tx.is_auto_categorized && !tx.is_internal_transfer && (
                              <button
                                title="Categoría asignada automáticamente. Haz clic para confirmar y quitar este aviso."
                                onClick={() => updateMutation.mutate({ id: tx.id, data: { is_auto_categorized: false } })}
                                className="text-primary/60 hover:text-primary transition-colors shrink-0"
                              >
                                <Sparkles className="h-4 w-4" />
                              </button>
                            )}
                            {tx.is_ai_categorized && (
                              <button
                                title="Categoría asignada por la IA. Haz clic para confirmar y quitar el indicador."
                                onClick={() => updateMutation.mutate({ id: tx.id, data: { is_ai_categorized: false } })}
                                className="text-violet-400/80 hover:text-violet-400 transition-colors shrink-0"
                              >
                                <Bot className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              title="Categorizar con IA"
                              disabled={aiCategorizingIds.has(tx.id)}
                              onClick={() => handleAiCategorize([tx.id])}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-violet-400 disabled:opacity-50 shrink-0"
                            >
                              {aiCategorizingIds.has(tx.id)
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Sparkles className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right whitespace-nowrap">
                          <span className={cn(
                            "inline-flex px-2.5 py-1 rounded-md text-[15px] font-semibold tabular-nums tracking-tight",
                            tx.amount > 0 ? "bg-emerald-500/10 text-emerald-400" : "text-foreground",
                            tx.amount === 0 && "text-muted-foreground"
                          )}>
                            {tx.amount > 0 ? '+' : ''}{formatCurrency(tx.amount)}
                          </span>
                        </td>
                        <td className="px-3 py-4 text-right">
                          <button
                            onClick={() => setConfirmDelete(tx.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-negative"
                            title="Eliminar transacción"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data?.items.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground text-sm">No se encontraron transacciones</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">Página {page} de {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk action floating bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-2xl shadow-2xl backdrop-blur-md animate-fade-up">
          <span className="text-sm font-semibold text-foreground">{selectedIds.size}</span>
          <span className="text-sm text-muted-foreground mr-1">seleccionadas</span>
          <div className="w-px h-5 bg-border" />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkCatOpen(true)}>
            <Tag className="h-3 w-3 mr-1.5" /> Categorizar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
            disabled={bulkAiPending}
            onClick={() => handleAiCategorize(Array.from(selectedIds))}
          >
            {bulkAiPending
              ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              : <Sparkles className="h-3 w-3 mr-1.5" />}
            IA
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-xs"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
          >
            <Trash2 className="h-3 w-3 mr-1.5" /> Eliminar
          </Button>
          <button onClick={() => setSelectedIds(new Set())} className="text-muted-foreground hover:text-foreground ml-1 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Bulk category dialog */}
      <Dialog open={bulkCatOpen} onOpenChange={v => { if (!v) { setBulkCatOpen(false); setBulkCatId('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Cambiar categoría ({selectedIds.size} transacciones)</DialogTitle></DialogHeader>
          <Select value={bulkCatId} onValueChange={setBulkCatId}>
            <SelectTrigger><SelectValue placeholder="Selecciona una categoría..." /></SelectTrigger>
            <SelectContent>
              {categories?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.icon} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkCatOpen(false); setBulkCatId('') }}>Cancelar</Button>
            <Button
              disabled={!bulkCatId || bulkCategoryMutation.isPending}
              onClick={() => bulkCategoryMutation.mutate({ ids: Array.from(selectedIds), category_id: Number(bulkCatId) })}
            >
              {bulkCategoryMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <AddTransactionDialog open={addOpen} onClose={() => setAddOpen(false)} categories={categories || []} />
      <DeleteAllDialog open={deleteAllOpen} onClose={() => setDeleteAllOpen(false)} />

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
