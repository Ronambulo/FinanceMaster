import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { txApi, catApi, authApi } from '@/lib/api'
import type { Transaction, Category } from '@/lib/api'
import { usePayrollCycle } from '@/hooks/usePayrollCycle'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Upload, Search, ChevronLeft, ChevronRight, ChevronDown, Loader2, Tag, X, Plus, Trash2, AlertTriangle, Filter, Sparkles } from 'lucide-react'
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

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<{ imported: number; skipped_duplicates: number; errors: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const res = await txApi.importCsv(file)
      setResult(res)
      qc.invalidateQueries()
      toast(`Importadas ${res.imported} transacciones`, 'success')
    } catch (err: any) {
      toast(err.message || 'Error al importar', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Importar CSV de Trade Republic</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div
            className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Haz clic para seleccionar el CSV</p>
            <p className="text-xs text-muted-foreground mt-1">Exportación de transacción.csv</p>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>
          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Procesando...
            </div>
          )}
          {result && (
            <div className="rounded-lg bg-muted p-4 space-y-1 text-sm">
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
  const [page, setPage]           = useState(1)
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState<string>('')
  // cycleFilter: '' = all, 'idx:N' = payroll cycle index N, 'month:YYYY-MM' = calendar fallback
  const [cycleFilter, setCycleFilter] = useState<string>('')
  const [typeGroup, setTypeGroup] = useState<string>('')       // "" | "income" | "expense"
  const [importOpen, setImportOpen]   = useState(false)
  const [addOpen, setAddOpen]         = useState(false)
  const [deleteAllOpen, setDeleteAllOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

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
                            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 opacity-70" title="Categorizado automáticamente" />
                          )}
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-[11px] font-medium text-muted-foreground/50">{formatDate(tx.date)}</span>
                          
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
                      <th className="text-left px-5 py-3.5 font-medium text-xs tracking-wider uppercase">Fecha</th>
                      <th className="text-left px-5 py-3.5 font-medium text-xs tracking-wider uppercase">Descripción</th>
                      <th className="text-left px-5 py-3.5 font-medium text-xs tracking-wider uppercase hidden md:table-cell min-w-[240px] w-[240px] max-w-[240px]">Categoría</th>
                      <th className="text-right px-5 py-3.5 font-medium text-xs tracking-wider uppercase">Importe</th>
                      <th className="px-5 py-3.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.items.map(tx => (
                      <tr key={tx.id} className="border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors group">
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
                              <Sparkles className="h-4 w-4 text-primary shrink-0 opacity-80" title="Categorizado automáticamente" />
                            )}
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
