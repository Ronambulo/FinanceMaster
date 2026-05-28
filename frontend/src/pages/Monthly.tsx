import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query'
import { dashApi, budgetApi, catApi, txApi, recurringApi } from '@/lib/api'
import type { Category } from '@/lib/api'
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
  ChevronLeft, ChevronRight, Plus, Trash2, Loader2,
  TrendingUp, TrendingDown, Eye, EyeOff, RefreshCw, Calendar, Search,
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
    <div className="rounded-lg border border-white/10 bg-[hsl(228_22%_7%)] p-3 text-xs shadow-xl">
      <p className="font-medium text-foreground/80 mb-2">{periodLabel}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-1.5" style={{ color: p.stroke }}>
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.stroke }} />
          {p.name}: <span className="font-semibold ml-auto pl-3">{formatCurrency(p.value)}</span>
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

/* ─── Página principal ────────────────────────────────────────── */
export function Monthly() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const today = useMemo(() => new Date(), [])
  const [cycleOffset, setCycleOffset] = useState(0)  // 0 = latest cycle, -1 = previous, etc.
  const [addOpen, setAddOpen] = useState(false)
  const [txSearch, setTxSearch]     = useState('')
  const [txTypeGroup, setTxTypeGroup] = useState('')  // '' | 'income' | 'expense'

  /* ── Categories (needed before payroll detection) ── */
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: catApi.list,
  })

  /* ── Payroll detection: look for "nómina" category, fall back to CUSTOMER_INPAYMENT ── */
  const nominaCategory = useMemo(() => {
    return categories?.find(c => {
      const n = c.name.toLowerCase()
      return n.includes('nomina') || n.includes('nómina') || n.includes('salario') || n.includes('sueldo')
    }) ?? null
  }, [categories])

  const { data: payrollData } = useQuery({
    queryKey: ['payroll-transactions', nominaCategory?.id ?? 'none'],
    queryFn: () => txApi.list({
      ...(nominaCategory
        ? { category_id: nominaCategory.id.toString() }
        : { type: 'CUSTOMER_INPAYMENT' }),
      account_category: 'CASH',
      page_size: 100,
    }),
    enabled: categories !== undefined,  // wait for categories so we use the right filter from the start
    staleTime: 5 * 60_000,
  })

  // Every nómina transaction is a cycle boundary — use all unique dates sorted
  const payrollDates = useMemo(() => {
    if (!payrollData?.items) return []
    return [...new Set(payrollData.items.map(tx => tx.date))].sort()
  }, [payrollData])

  // Build one cycle entry per payroll period: from this nómina to the day before the next.
  // The latest (open) cycle extends 45 days past today so manually-entered future expenses appear.
  const cycles = useMemo(() => {
    if (!payrollDates.length) return []
    return payrollDates.map((start, i) => {
      if (i + 1 < payrollDates.length) {
        const d = new Date(payrollDates[i + 1] + 'T12:00:00')
        d.setDate(d.getDate() - 1)
        return { start, end: d.toISOString().slice(0, 10), isOpen: false }
      }
      // Open cycle: extend well past today to capture future-dated manual entries
      const future = new Date(today)
      future.setDate(future.getDate() + 45)
      return { start, end: future.toISOString().slice(0, 10), isOpen: true }
    })
  }, [payrollDates, today])

  const selectedCycleIdx = cycles.length > 0
    ? Math.max(0, cycles.length - 1 + cycleOffset)
    : -1

  function prevCycle() { setCycleOffset(o => Math.max(-(cycles.length - 1), o - 1)) }
  function nextCycle()  { setCycleOffset(o => Math.min(0, o + 1)) }
  const isLatestCycle = cycleOffset >= 0

  const { periodStart, periodEnd, isPayrollCycle, monthStr, cycleMonthLabel } = useMemo(() => {
    if (selectedCycleIdx < 0 || !cycles.length) {
      // Fallback: current calendar month (no payroll data yet)
      const m  = today.getMonth() + 1
      const y  = today.getFullYear()
      const ms = `${y}-${String(m).padStart(2, '0')}`
      return {
        periodStart:    `${ms}-01`,
        periodEnd:      today.toISOString().slice(0, 10),
        isPayrollCycle: false,
        monthStr:       ms,
        cycleMonthLabel: monthLabel(y, m),
      }
    }
    const cycle     = cycles[selectedCycleIdx]
    const startDate = new Date(cycle.start + 'T12:00:00')
    const ms = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`
    return {
      periodStart:    cycle.start,
      periodEnd:      cycle.end,
      isPayrollCycle: true,
      monthStr:       ms,
      cycleMonthLabel: monthLabel(startDate.getFullYear(), startDate.getMonth() + 1),
    }
  }, [cycles, selectedCycleIdx, today])

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

  const { data: budgetStatus } = useQuery({
    queryKey: ['budget-status', monthStr],
    queryFn: () => budgetApi.status(monthStr),
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['recurring'] }); toast('Eliminado', 'success') },
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
      qc.invalidateQueries({ queryKey: ['budget-status', monthStr] })
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  const deleteBudgetMutation = useMutation({
    mutationFn: budgetApi.delete,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] })
      qc.invalidateQueries({ queryKey: ['budget-status'] })
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
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {formatDate(periodStart)} — {isPayrollCycle && cycles[selectedCycleIdx]?.isOpen ? 'hoy' : formatDate(periodEnd)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevCycle} disabled={selectedCycleIdx <= 0}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={nextCycle} disabled={isLatestCycle}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-2" />Presupuesto</Button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <TrendingUp className="h-3 w-3" /> Ingresos del mes
          </p>
          <p className="text-xl font-semibold text-positive">+{formatCurrency(totalIncome)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1.5">
            <TrendingDown className="h-3 w-3" /> Gastos del mes
          </p>
          <p className="text-xl font-semibold text-negative">-{formatCurrency(totalExpenses)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Ahorro neto</p>
          <p className={cn('text-xl font-semibold', totalIncome - totalExpenses >= 0 ? 'text-positive' : 'text-negative')}>
            {totalIncome - totalExpenses >= 0 ? '+' : ''}{formatCurrency(totalIncome - totalExpenses)}
          </p>
        </CardContent></Card>
      </div>

      {/* ── Gráfica tendencia 12 meses ── */}
      <Card>
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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Presupuestos</CardTitle>
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
                    <span className={cn('text-sm font-semibold', trafficColor(b.pct_used))}>
                      {formatCurrency(b.spent)}
                    </span>
                    <span className="text-xs text-muted-foreground"> / {formatCurrency(b.budgeted)}</span>
                  </div>
                  <button
                    onClick={() => {
                      const budget = allBudgets?.find(bgt => bgt.id === b.budget_id)
                      if (budget) deleteBudgetMutation.mutate(budget.id)
                    }}
                    className="text-muted-foreground/40 hover:text-negative transition-colors shrink-0"
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
      <Card>
        <CardHeader className="pb-2 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Transacciones del período
            </CardTitle>
            <span className="text-xs text-muted-foreground/50">ojo = excluida del cálculo</span>
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
              <div className="sm:hidden divide-y divide-border/50">
                {filteredDetail.map(row => (
                  <div key={row.id} className={cn('flex items-center gap-3 px-4 py-3', row.exclude_from_stats && 'opacity-40')}>
                    <span className="text-lg shrink-0">{row.category_icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{row.name}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(row.date)} · {row.category_name}</p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-2">
                      <p className={cn('text-sm font-semibold', row.amount >= 0 ? 'text-positive' : 'text-negative')}>
                        {row.amount >= 0 ? '+' : ''}{formatCurrency(row.amount)}
                      </p>
                      <button
                        onClick={() => toggleMutation.mutate({ id: row.id, exclude: !row.exclude_from_stats })}
                        className="text-muted-foreground/50 hover:text-primary transition-colors"
                        title={row.exclude_from_stats ? 'Incluir en cálculo' : 'Excluir del cálculo'}
                      >
                        {row.exclude_from_stats ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
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
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDetail.map(row => (
                      <tr
                        key={row.id}
                        className={cn(
                          'border-b border-border/50 hover:bg-accent/30 transition-colors',
                          row.exclude_from_stats && 'opacity-40',
                        )}
                      >
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{formatDate(row.date)}</td>
                        <td className="px-4 py-2.5 font-medium max-w-[200px] truncate">{row.name}</td>
                        <td className="px-4 py-2.5 hidden md:table-cell">
                          <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ color: row.category_color }}>
                            {row.category_icon} {row.category_name}
                          </span>
                        </td>
                        <td className={cn('px-4 py-2.5 text-right font-semibold whitespace-nowrap', row.amount >= 0 ? 'text-positive' : 'text-negative')}>
                          {row.amount >= 0 ? '+' : ''}{formatCurrency(row.amount)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            onClick={() => toggleMutation.mutate({ id: row.id, exclude: !row.exclude_from_stats })}
                            className="text-muted-foreground/50 hover:text-primary transition-colors"
                            title={row.exclude_from_stats ? 'Incluir' : 'Excluir'}
                          >
                            {row.exclude_from_stats
                              ? <EyeOff className="h-4 w-4 text-negative/60" />
                              : <Eye className="h-4 w-4" />}
                          </button>
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
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Coste mensual fijo</p>
                <p className="text-lg font-semibold text-negative">-{formatCurrency(totalMonthly)}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Compromisos activos</p>
                <p className="text-lg font-semibold">{activeCount}</p>
              </CardContent></Card>
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground mb-1">Próximo pago</p>
                <p className="text-lg font-semibold text-sm">
                  {nextGroup ? formatDate(nextGroup.next_expected_date!) : '—'}
                </p>
              </CardContent></Card>
            </div>
          )
        })()}

        {/* Lista */}
        {loadingRecurring ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid gap-2">
            {recurringGroups?.map(g => {
              const nextDate = g.next_expected_date ? new Date(g.next_expected_date + 'T00:00:00') : null
              const daysUntil = nextDate
                ? Math.ceil((nextDate.getTime() - new Date().getTime()) / 86400000)
                : null
              const periodLabel = (d: number | null) => {
                if (d === 7) return 'Semanal'
                if (d === 14) return 'Quincenal'
                if (d === 30) return 'Mensual'
                if (d === 365) return 'Anual'
                return `Cada ${d}d`
              }

              return (
                <Card key={g.id} className={!g.is_active ? 'opacity-50' : ''}>
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
                        <p className="font-bold text-negative text-sm">-{formatCurrency(g.avg_amount || 0)}</p>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => toggleRecurringMutation.mutate({ id: g.id, is_active: !g.is_active })}
                          title={g.is_active ? 'Desactivar' : 'Activar'}
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${g.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
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
            })}
            {recurringGroups?.length === 0 && (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
                Sin pagos recurrentes. Importa transacciones y pulsa "Re-detectar".
              </CardContent></Card>
            )}
          </div>
        )}
      </div>

      <AddBudgetDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        categories={categories || []}
        currentMonth={monthStr}
      />
    </div>
  )
}
