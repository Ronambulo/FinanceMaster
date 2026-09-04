import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query'
import { dashApi, budgetApi, txApi, recurringApi } from '@/lib/api'
import { usePayrollCycle } from '@/hooks/usePayrollCycle'
import type { Category } from '@/lib/api'
import { catApi } from '@/lib/api'
import type { MonthlyDetailRow } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import {
  ChevronLeft, ChevronRight, ChevronDown, Plus, Trash2, Loader2,
  TrendingUp, TrendingDown, Eye, EyeOff, RefreshCw, Calendar, Search,
  FileText, FileSpreadsheet, Repeat2, PiggyBank, Archive,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { cn } from '@/lib/utils'
import { getChartColors } from '@/lib/theme'

/* ─── helpers ─────────────────────────────────────────────────── */
function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

function cycleLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
}

/* ─── Semáforo de presupuesto ─────────────────────────────────── */
function trafficColor(pct: number) {
  if (pct >= 100) return 'text-negative'
  if (pct >= 80)  return 'text-warning'
  return 'text-positive'
}
function trafficBg(pct: number) {
  if (pct >= 100) return 'bg-negative'
  if (pct >= 80)  return 'bg-warning'
  return 'bg-positive'
}

/* ─── Tooltip del gráfico ─────────────────────────────────────── */
const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const periodLabel = payload[0]?.payload?.periodLabel || label
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-card-hover">
      <p className="font-medium text-foreground/80 mb-2">{periodLabel}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-1.5" style={{ color: p.stroke }}>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.stroke }} />
          {p.name}: <span className="font-semibold ml-auto pl-3 tabular-nums">{formatCurrency(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

/* ─── Diálogo nuevo presupuesto ───────────────────────────────── */
function AddBudgetDialog({
  open, onClose, categories, currentMonth,
}: {
  open: boolean; onClose: () => void; categories: Category[]; currentMonth: string
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState({ category_id: '', amount: '', is_recurring: true })

  const mutation = useMutation({
    mutationFn: () => budgetApi.create({
      category_id: form.category_id ? Number(form.category_id) : undefined,
      amount: Number(form.amount),
      is_recurring: form.is_recurring,
      month: form.is_recurring ? undefined : currentMonth,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] })
      qc.invalidateQueries({ queryKey: ['budget-status'] })
      toast('Presupuesto creado', 'success')
      onClose()
      setForm({ category_id: '', amount: '', is_recurring: true })
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nuevo presupuesto</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
              <SelectContent>
                {categories.filter(c => c.type === 'expense').map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Importe mensual (€)</Label>
            <Input type="number" step="0.01" placeholder="200.00"
              value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="recurring" checked={form.is_recurring}
              onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))}
              className="rounded border-border" />
            <Label htmlFor="recurring" className="cursor-pointer">Recurrente (todos los meses)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!form.amount || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─── Diálogo marcar como recurrente ─────────────────────────── */
function MarkRecurringDialog({ tx, onClose }: { tx: MonthlyDetailRow; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState(tx.name ?? '')
  const [period, setPeriod] = useState('30')

  const mutation = useMutation({
    mutationFn: () => recurringApi.createFromTx({
      transaction_id: tx.id,
      display_name: name,
      period_days: Number(period),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] })
      qc.invalidateQueries({ queryKey: ['monthly-detail'] })
      toast('Marcado como recurrente', 'success')
      onClose()
    },
    onError: (e: any) => toast(e.message ?? 'Error', 'error'),
  })

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Marcar como recurrente</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del gasto recurrente" />
          </div>
          <div className="space-y-1.5">
            <Label>Periodicidad</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Semanal</SelectItem>
                <SelectItem value="14">Quincenal</SelectItem>
                <SelectItem value="30">Mensual</SelectItem>
                <SelectItem value="90">Trimestral</SelectItem>
                <SelectItem value="365">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Importe: {formatCurrency(Math.abs(tx.amount))}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─── Página principal ────────────────────────────────────────── */
export function Monthly() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cycleOffset, setCycleOffset] = useState(0)  // 0 = latest cycle, -1 = previous, etc.
  const [addOpen, setAddOpen] = useState(false)
  const [recurringTx, setRecurringTx] = useState<MonthlyDetailRow | null>(null)
  const [txSearch, setTxSearch]     = useState('')
  const [txTypeGroup, setTxTypeGroup] = useState('')  // '' | 'income' | 'expense'
  const [cycleCategory, setCycleCategory] = useState<number | null>(null) // category driving cycle detection
  const [showInactiveRecurring, setShowInactiveRecurring] = useState(false)

  /* ── Categories (still needed for the budget dialog) ── */
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: catApi.list,
  })

  /* ── Payroll cycle (shared logic) ── */
  const {
    cycles, selectedCycleIdx, isLatestCycle,
    periodStart, periodEnd, isPayrollCycle, monthStr, cycleRangeLabel,
  } = usePayrollCycle(cycleOffset, cycleCategory)

  function goPrevCycle() { setCycleOffset(o => Math.max(-(cycles.length - 1), o - 1)) }
  function goNextCycle()  { setCycleOffset(o => Math.min(0, o + 1)) }

  // Derive month label from cycleRangeLabel (first part) or fall back to full label
  const cycleMonthLabel = isPayrollCycle
    ? cycleRangeLabel
    : ((() => { const d = new Date(); return monthLabel(d.getFullYear(), d.getMonth() + 1) })())

  // Cycle-based trend chart: fetch detail for each of the last 10 cycles
  const visibleCycles = cycles.slice(-10)
  const cycleQueries = useQueries({
    queries: visibleCycles.map(c => ({
      queryKey: ['monthly-detail', c.start, c.end],
      queryFn:  () => dashApi.monthlyDetail({ date_from: c.start, date_to: c.end }),
      staleTime: 5 * 60_000,
    })),
  })

  // Chart colors (read once on mount; re-reads on page navigation)
  const [incomeColor, expenseColor, savingsColor] = useMemo(() => {
    const c = getChartColors()
    return [
      c?.income  || 'hsl(var(--positive))',
      c?.expense || 'hsl(var(--negative))',
      c?.savings || 'hsl(var(--primary))',
    ]
  }, [])

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['monthly-detail', periodStart, periodEnd],
    queryFn: () => dashApi.monthlyDetail({ date_from: periodStart, date_to: periodEnd }),
    enabled: !!(periodStart && periodEnd),
  })

  /* ── Previous cycle for comparison ──
     Day-aligned: if the selected cycle is still open (in progress), we
     only compare against the same number of elapsed days into the
     previous cycle — otherwise a partial current cycle would look
     artificially small/large next to a full previous one. */
  const selectedCycle = selectedCycleIdx >= 0 ? cycles[selectedCycleIdx] : null
  const elapsedDays = useMemo(() => {
    if (!selectedCycle) return null
    const start = new Date(selectedCycle.start + 'T12:00:00')
    const ref = selectedCycle.isOpen ? new Date() : new Date(selectedCycle.end + 'T12:00:00')
    return Math.max(1, Math.floor((ref.getTime() - start.getTime()) / 86_400_000) + 1)
  }, [selectedCycle])

  const prevCycle = selectedCycleIdx > 0 ? cycles[selectedCycleIdx - 1] : null
  const isPartialCompare = !!selectedCycle?.isOpen
  const prevCompareEnd = useMemo(() => {
    if (!prevCycle) return null
    if (!isPartialCompare || elapsedDays == null) return prevCycle.end
    const d = new Date(prevCycle.start + 'T12:00:00')
    d.setDate(d.getDate() + elapsedDays - 1)
    const capped = d.toISOString().slice(0, 10)
    return capped < prevCycle.end ? capped : prevCycle.end
  }, [prevCycle, isPartialCompare, elapsedDays])
  // Actual number of days compared (may be < elapsedDays if the previous
  // cycle was shorter than the current one has run so far).
  const compareDays = useMemo(() => {
    if (!isPartialCompare || !prevCycle || !prevCompareEnd) return elapsedDays
    const start = new Date(prevCycle.start + 'T12:00:00')
    const end = new Date(prevCompareEnd + 'T12:00:00')
    return Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1)
  }, [isPartialCompare, prevCycle, prevCompareEnd, elapsedDays])

  const { data: prevDetail } = useQuery({
    queryKey: ['monthly-detail', prevCycle?.start, prevCompareEnd],
    queryFn: () => dashApi.monthlyDetail({ date_from: prevCycle!.start, date_to: prevCompareEnd! }),
    enabled: !!prevCycle && !!prevCompareEnd,
  })

  const { data: budgetStatus } = useQuery({
    queryKey: ['budget-status', periodStart, periodEnd],
    queryFn: () => budgetApi.status(monthStr, periodStart, periodEnd),
    enabled: !!(periodStart && periodEnd),
  })

  // ── Recurring queries ───────────────────────────────────────────
  const { data: recurringGroups, isLoading: loadingRecurring } = useQuery({
    queryKey: ['recurring'],
    queryFn: recurringApi.list,
  })

  const detectMutation = useMutation({
    mutationFn: recurringApi.detect,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); toast('Detección completada', 'success') },
  })
  const deleteRecurringMutation = useMutation({
    mutationFn: recurringApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] })
      qc.invalidateQueries({ queryKey: ['monthly-detail'] })
      toast('Grupo recurrente eliminado', 'success')
    },
  })
  const toggleRecurringMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => recurringApi.update(id, { is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring'] }),
  })

  const { data: allBudgets } = useQuery({
    queryKey: ['budgets'],
    queryFn: budgetApi.list,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, exclude }: { id: number; exclude: boolean }) =>
      txApi.update(id, { exclude_from_stats: exclude }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['monthly-detail', periodStart, periodEnd] })
      qc.invalidateQueries({ queryKey: ['budget-status', periodStart, periodEnd] })
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  const deleteBudgetMutation = useMutation({
    mutationFn: budgetApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] })
      qc.invalidateQueries({ queryKey: ['budget-status', periodStart, periodEnd] })
      toast('Presupuesto eliminado', 'success')
    },
  })

  const chartData = visibleCycles.map((cycle, i) => {
    const rows     = cycleQueries[i]?.data ?? []
    const included = rows.filter(r => !r.exclude_from_stats)
    const income   = included.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0)
    const expenses = included.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0)
    const startLbl = cycleLabel(cycle.start)
    const endLbl   = cycle.isOpen ? 'hoy' : cycleLabel(cycle.end)
    return {
      month: startLbl,
      periodLabel: `${startLbl} — ${endLbl}`,
      Ingresos: income, Gastos: expenses, Ahorro: income - expenses,
    }
  })

  // Totals from raw detail (respecting exclude_from_stats)
  const included = detail?.filter(r => !r.exclude_from_stats) ?? []
  const totalIncome   = included.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const totalExpenses = included.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0)
  const netSavings = totalIncome - totalExpenses
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0

  // Previous cycle totals for comparison
  const prevIncluded    = prevDetail?.filter(r => !r.exclude_from_stats) ?? []
  const prevIncome      = prevIncluded.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const prevExpenses    = prevIncluded.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0)
  const prevSavings     = prevIncome - prevExpenses
  const hasPrevCycle    = !!prevCycle && prevDetail !== undefined

  // Export functions
  async function exportPDF() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF()
    doc.setFontSize(14)
    doc.text(`Resumen ${cycleMonthLabel}`, 14, 16)
    doc.setFontSize(10)
    doc.text(`Ingresos: ${formatCurrency(totalIncome)}   Gastos: ${formatCurrency(totalExpenses)}   Ahorro: ${formatCurrency(totalIncome - totalExpenses)}`, 14, 24)
    autoTable(doc, {
      startY: 30,
      head: [['Fecha', 'Nombre', 'Categoría', 'Importe']],
      body: (detail ?? []).map(r => [
        r.date,
        r.name ?? '',
        r.category_name,
        (r.amount >= 0 ? '+' : '') + formatCurrency(r.amount),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [40, 40, 60] },
    })
    doc.save(`financemaster-${monthStr}.pdf`)
  }

  async function exportExcel() {
    const XLSX = await import('xlsx')
    const rows = (detail ?? []).map(r => ({
      Fecha: r.date,
      Nombre: r.name ?? '',
      Categoría: r.category_name,
      Importe: r.amount,
      Excluido: r.exclude_from_stats ? 'Sí' : 'No',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, cycleMonthLabel.slice(0, 31))
    XLSX.writeFile(wb, `financemaster-${monthStr}.xlsx`)
  }

  // Handle ?export=pdf/xlsx from command palette
  useEffect(() => {
    const exp = searchParams.get('export')
    if (!exp || !detail) return
    setSearchParams({}, { replace: true })
    if (exp === 'pdf') exportPDF()
    if (exp === 'xlsx') exportExcel()
  }, [searchParams, detail])

  // Filtered view for the transaction list
  const filteredDetail = useMemo(() => {
    let rows = detail ?? []
    if (txSearch) {
      const s = txSearch.toLowerCase()
      rows = rows.filter(r => r.name?.toLowerCase().includes(s) || r.category_name.toLowerCase().includes(s))
    }
    if (txTypeGroup === 'income')  rows = rows.filter(r => r.amount > 0)
    if (txTypeGroup === 'expense') rows = rows.filter(r => r.amount < 0)
    return rows
  }, [detail, txSearch, txTypeGroup])

  return (
    <div className="space-y-6 animate-fade-up">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Resumen mensual</h1>
          <p className="text-sm text-muted-foreground capitalize">{cycleMonthLabel}</p>
          {periodStart && periodEnd && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">
              {formatDate(periodStart)} — {isPayrollCycle && isLatestCycle ? 'hoy' : formatDate(periodEnd)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={goPrevCycle} disabled={selectedCycleIdx <= 0}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={goNextCycle} disabled={isLatestCycle}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Select
            value={cycleCategory !== null ? String(cycleCategory) : 'auto'}
            onValueChange={v => { setCycleCategory(v === 'auto' ? null : Number(v)); setCycleOffset(0) }}
          >
            <SelectTrigger className="h-8 w-44 text-sm">
              <SelectValue placeholder="Tramos por..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (nómina)</SelectItem>
              {categories?.map(c => (
                <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportPDF} title="Exportar PDF">
            <FileText className="h-3.5 w-3.5 mr-1.5" />PDF
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} title="Exportar Excel">
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />Excel
          </Button>
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" />Presupuesto</Button>
        </div>
      </div>

      {/* ── Hero: ahorro neto del ciclo ── */}
      <Card className="card-hover relative overflow-hidden rounded-2xl">
        <div className={cn(
          'pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full blur-3xl',
          netSavings >= 0 ? 'bg-positive/[0.08]' : 'bg-negative/[0.08]',
        )} />
        <CardContent className="relative z-10 p-6 sm:p-7">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <PiggyBank className="h-4 w-4" />
                Ahorro neto del ciclo
              </div>
              <p className={cn(
                'font-display tabular-nums text-4xl sm:text-5xl font-semibold tracking-tight mt-2',
                netSavings >= 0 ? 'text-positive' : 'text-negative',
              )}>
                {netSavings >= 0 ? '+' : ''}{formatCurrency(netSavings)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {totalIncome > 0 && (
                  <Badge variant={netSavings >= 0 ? 'success' : 'destructive'} className="text-xs">
                    {savingsRate.toFixed(1)}% tasa de ahorro
                  </Badge>
                )}
              </div>
            </div>

            {/* Secondary income / expense figures — deliberately smaller than the hero */}
            <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
              <div className="rounded-xl bg-secondary/60 border border-border p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <TrendingUp className="h-3.5 w-3.5" /> Ingresos
                </div>
                <p className="font-display tabular-nums text-lg font-semibold text-positive">
                  +{formatCurrency(totalIncome)}
                </p>
              </div>
              <div className="rounded-xl bg-secondary/60 border border-border p-4">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <TrendingDown className="h-3.5 w-3.5" /> Gastos
                </div>
                <p className="font-display tabular-nums text-lg font-semibold text-negative">
                  -{formatCurrency(totalExpenses)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Comparación con ciclo anterior ── */}
      {hasPrevCycle && (
        <Card className="card-hover rounded-2xl">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground mb-3">
              vs ciclo anterior{isPartialCompare && compareDays ? ` (mismos ${compareDays} días)` : ''}
            </p>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { label: 'Ingresos', cur: totalIncome, prev: prevIncome },
                { label: 'Gastos',   cur: totalExpenses, prev: prevExpenses },
                { label: 'Ahorro',   cur: netSavings, prev: prevSavings },
              ].map(({ label, cur, prev }) => (
                <div key={label} className="text-center space-y-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{label}</p>
                  <p className="text-xs xs:text-sm font-semibold tabular-nums truncate">{formatCurrency(cur)}</p>
                  <p className="text-xs text-muted-foreground/60 tabular-nums truncate">
                    {formatCurrency(prev)} {isPartialCompare && compareDays ? `(días 1-${compareDays})` : 'ant.'}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Gráfica tendencia por tramos ── */}
      <Card className="card-hover rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Tendencia por tramos</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false}
                tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }} />
              <Line type="monotone" dataKey="Ingresos" stroke={incomeColor}  strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Gastos"   stroke={expenseColor} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Ahorro"   stroke={savingsColor} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Presupuestos por categoría ── */}
      {(budgetStatus && budgetStatus.length > 0) && (
        <Card className="card-hover rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-sm font-medium text-muted-foreground">Presupuestos</CardTitle>
              {isPayrollCycle && (
                <p className="text-xs text-muted-foreground/60 mt-0.5">Prorateado al tramo ({Math.round((new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86400000) + 1}d / 30d)</p>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {budgetStatus.map(b => (
              <div key={b.budget_id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span>{b.category_icon}</span>
                    <span className="text-sm font-medium truncate">{b.category_name}</span>
                    <Badge
                      variant="muted"
                      className={cn('text-xs shrink-0', trafficColor(b.pct_used))}
                    >
                      {b.pct_used.toFixed(0)}%
                    </Badge>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={cn('text-sm font-semibold tabular-nums', trafficColor(b.pct_used))}>
                      {formatCurrency(b.spent)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums"> / {formatCurrency(b.budgeted)}</span>
                  </div>
                  <button
                    onClick={() => {
                      const budget = allBudgets?.find(bgt => bgt.id === b.budget_id)
                      if (budget) deleteBudgetMutation.mutate(budget.id)
                    }}
                    className="text-muted-foreground/50 hover:text-negative transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <Progress
                  value={Math.min(b.pct_used, 100)}
                  className="h-1.5"
                  indicatorClassName={trafficBg(b.pct_used)}
                />
                {b.pct_used >= 100 && (
                  <p className="text-xs text-negative">
                    Excedido por {formatCurrency(Math.abs(b.remaining))}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── Transacciones del período con toggle ── */}
      <Card className="card-hover rounded-2xl">
        <CardHeader className="pb-2 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Transacciones del período
            </CardTitle>
            <span className="text-xs text-muted-foreground/60">ojo = excluida del cálculo</span>
          </div>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                className="pl-8 h-8 text-sm"
                value={txSearch}
                onChange={e => setTxSearch(e.target.value)}
              />
            </div>
            <Select value={txTypeGroup || 'all'} onValueChange={v => setTxTypeGroup(v === 'all' ? '' : v)}>
              <SelectTrigger className="h-8 sm:w-36 text-sm">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="income">↑ Ingresos</SelectItem>
                <SelectItem value="expense">↓ Gastos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingDetail ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Mobile */}
              <div className="sm:hidden divide-y divide-border">
                {filteredDetail.map(row => (
                  <div key={row.id} className={cn('flex items-center gap-3 px-4 py-3', row.exclude_from_stats && 'opacity-40')}>
                    <span className="text-lg shrink-0">{row.category_icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(row.date)} · {row.category_name}</p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <p className={cn('text-sm font-semibold tabular-nums', row.amount >= 0 ? 'text-positive' : 'text-negative')}>
                        {row.amount >= 0 ? '+' : ''}{formatCurrency(row.amount)}
                      </p>
                      <button
                        onClick={() => toggleMutation.mutate({ id: row.id, exclude: !row.exclude_from_stats })}
                        className="text-muted-foreground/60 hover:text-primary transition-colors"
                        title={row.exclude_from_stats ? 'Incluir en cálculo' : 'Excluir del cálculo'}
                      >
                        {row.exclude_from_stats ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                      {row.recurring_group_id ? (
                        <button
                          onClick={() => deleteRecurringMutation.mutate(row.recurring_group_id!)}
                          className="text-primary hover:text-negative transition-colors"
                          title="Quitar grupo recurrente"
                        >
                          <Repeat2 className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() => setRecurringTx(row)}
                          className="text-muted-foreground/40 hover:text-primary transition-colors"
                          title="Marcar como recurrente"
                        >
                          <Repeat2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">Fecha</th>
                      <th className="text-left px-4 py-2.5 font-medium">Nombre</th>
                      <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Categoría</th>
                      <th className="text-right px-4 py-2.5 font-medium">Importe</th>
                      <th className="px-4 py-2.5 text-center font-medium w-10" title="Incluir/excluir del cálculo">
                        <Eye className="h-3.5 w-3.5 mx-auto" />
                      </th>
                      <th className="px-4 py-2.5 text-center font-medium w-10" title="Recurrente">
                        <Repeat2 className="h-3.5 w-3.5 mx-auto" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDetail.map(row => (
                      <tr
                        key={row.id}
                        className={cn(
                          'border-b border-border hover:bg-accent/40 transition-colors',
                          row.exclude_from_stats && 'opacity-40',
                        )}
                      >
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(row.date)}</td>
                        <td className="px-4 py-2.5 font-medium max-w-[200px] truncate">{row.name}</td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full border"
                            style={{ color: row.category_color, borderColor: row.category_color }}
                          >
                            {row.category_icon} {row.category_name}
                          </span>
                        </td>
                        <td className={cn('px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap', row.amount >= 0 ? 'text-positive' : 'text-negative')}>
                          {row.amount >= 0 ? '+' : ''}{formatCurrency(row.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => toggleMutation.mutate({ id: row.id, exclude: !row.exclude_from_stats })}
                            className="text-muted-foreground/60 hover:text-primary transition-colors"
                            title={row.exclude_from_stats ? 'Incluir' : 'Excluir'}
                          >
                            {row.exclude_from_stats
                              ? <EyeOff className="h-4 w-4 text-negative/70" />
                              : <Eye className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {row.recurring_group_id ? (
                            <button
                              onClick={() => deleteRecurringMutation.mutate(row.recurring_group_id!)}
                              className="text-primary hover:text-negative transition-colors"
                              title="Quitar grupo recurrente"
                            >
                              <Repeat2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => setRecurringTx(row)}
                              className="text-muted-foreground/40 hover:text-primary transition-colors"
                              title="Marcar como recurrente"
                            >
                              <Repeat2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredDetail.length === 0 && (
                  <p className="text-center py-8 text-muted-foreground text-sm">
                    {(detail?.length ?? 0) > 0 ? 'Sin resultados para los filtros activos' : 'Sin transacciones en este período'}
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Pagos recurrentes ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold tracking-tight">Pagos recurrentes</h2>
            <p className="text-xs text-muted-foreground">{recurringGroups?.length ?? 0} compromisos detectados</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => detectMutation.mutate()} disabled={detectMutation.isPending}>
            {detectMutation.isPending
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
                        onClick={() => toggleRecurringMutation.mutate({ id: g.id, is_active: !g.is_active })}
                        title={g.is_active ? 'Desactivar' : 'Activar'}
                      >
                        <RefreshCw className={cn('h-3.5 w-3.5', g.is_active ? 'text-primary' : 'text-muted-foreground')} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => deleteRecurringMutation.mutate(g.id)}>
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

      <AddBudgetDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        categories={categories || []}
        currentMonth={monthStr}
      />
      {recurringTx && <MarkRecurringDialog tx={recurringTx} onClose={() => setRecurringTx(null)} />}
    </div>
  )
}
