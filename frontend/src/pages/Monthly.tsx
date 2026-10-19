import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query'
import { dashApi, budgetApi, txApi, recurringApi } from '@/lib/api'
import { usePayrollCycle } from '@/hooks/usePayrollCycle'
import type { MonthlyDetailRow } from '@/lib/api'
import { catApi } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { ChevronLeft, ChevronRight, Plus, FileText, FileSpreadsheet } from 'lucide-react'
import { getChartColors } from '@/lib/theme'
import { AddBudgetDialog } from '@/components/AddBudgetDialog'
import { MarkRecurringDialog } from '@/components/MarkRecurringDialog'
import { MonthlyHeroCard } from '@/components/MonthlyHeroCard'
import { CyclesComparisonCard } from '@/components/CyclesComparisonCard'
import { CycleTrendChart } from '@/components/CycleTrendChart'
import { MonthlyBudgetsCard } from '@/components/MonthlyBudgetsCard'
import { MonthlyTransactionsSection } from '@/components/MonthlyTransactionsSection'
import { RecurringPaymentsSection } from '@/components/RecurringPaymentsSection'
import { ConfirmDeleteRecurringDialog } from '@/components/ConfirmDeleteRecurringDialog'

/* ─── helpers ─────────────────────────────────────────────────── */
function monthLabel(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

function cycleLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')
}

/* ─── Página principal ────────────────────────────────────────── */
export function Monthly() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cycleOffset, setCycleOffset] = useState(0)  // 0 = latest cycle, -1 = previous, etc.
  const [addOpen, setAddOpen] = useState(false)
  const [recurringTx, setRecurringTx] = useState<MonthlyDetailRow | null>(null)
  const [cycleCategory, setCycleCategory] = useState<number | null>(null) // category driving cycle detection
  const [confirmDeleteRecurring, setConfirmDeleteRecurring] = useState<number | null>(null)

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

  // Investment purchases this cycle — informational only, excluded from savings calcs
  const { data: investments } = useQuery({
    queryKey: ['monthly-investments', periodStart, periodEnd],
    queryFn: () => dashApi.monthlyInvestments({ date_from: periodStart, date_to: periodEnd }),
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
      setConfirmDeleteRecurring(null)
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
          <Button variant="outline" size="icon" aria-label="Periodo anterior" onClick={goPrevCycle} disabled={selectedCycleIdx <= 0}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" aria-label="Periodo siguiente" onClick={goNextCycle} disabled={isLatestCycle}>
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

      <MonthlyHeroCard
        netSavings={netSavings}
        totalIncome={totalIncome}
        totalExpenses={totalExpenses}
        savingsRate={savingsRate}
        invested={investments?.invested}
      />

      {hasPrevCycle && (
        <CyclesComparisonCard
          totalIncome={totalIncome}
          totalExpenses={totalExpenses}
          netSavings={netSavings}
          prevIncome={prevIncome}
          prevExpenses={prevExpenses}
          prevSavings={prevSavings}
          isPartialCompare={isPartialCompare}
          compareDays={compareDays}
        />
      )}

      <CycleTrendChart
        chartData={chartData}
        incomeColor={incomeColor}
        expenseColor={expenseColor}
        savingsColor={savingsColor}
      />

      {(budgetStatus && budgetStatus.length > 0) && (
        <MonthlyBudgetsCard
          budgetStatus={budgetStatus}
          allBudgets={allBudgets}
          isPayrollCycle={isPayrollCycle}
          periodStart={periodStart}
          periodEnd={periodEnd}
          onDeleteBudget={id => deleteBudgetMutation.mutate(id)}
        />
      )}

      <MonthlyTransactionsSection
        detail={detail}
        loadingDetail={loadingDetail}
        onToggleExclude={(id, exclude) => toggleMutation.mutate({ id, exclude })}
        onMarkRecurring={row => setRecurringTx(row)}
        onDeleteRecurringGroup={groupId => setConfirmDeleteRecurring(groupId)}
      />

      <RecurringPaymentsSection
        recurringGroups={recurringGroups}
        loadingRecurring={loadingRecurring}
        onDetect={() => detectMutation.mutate()}
        isDetecting={detectMutation.isPending}
        onToggleActive={(id, is_active) => toggleRecurringMutation.mutate({ id, is_active })}
        onDeleteRequest={id => setConfirmDeleteRecurring(id)}
      />

      <AddBudgetDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        categories={categories || []}
        currentMonth={monthStr}
      />
      {recurringTx && <MarkRecurringDialog tx={recurringTx} onClose={() => setRecurringTx(null)} />}

      <ConfirmDeleteRecurringDialog
        groupId={confirmDeleteRecurring}
        onClose={() => setConfirmDeleteRecurring(null)}
        onConfirm={id => deleteRecurringMutation.mutate(id)}
        isPending={deleteRecurringMutation.isPending}
      />
    </div>
  )
}
