import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { catApi, txApi } from '@/lib/api'

export interface PayrollCycle {
  start: string   // YYYY-MM-DD
  end: string     // YYYY-MM-DD
  isOpen: boolean // true = current (extends into future)
}

export interface UsePayrollCycleReturn {
  /** All detected paycheck-to-paycheck cycles, oldest → newest */
  cycles: PayrollCycle[]
  /** Index of the cycle currently selected (into `cycles`) */
  selectedCycleIdx: number
  /** Whether the selected cycle is the most recent (open) one */
  isLatestCycle: boolean
  /** Start date of the active period (YYYY-MM-DD) */
  periodStart: string
  /** End date of the active period (YYYY-MM-DD) */
  periodEnd: string
  /** True when cycles were derived from real payroll data */
  isPayrollCycle: boolean
  /** Human-readable label for the current cycle's period */
  cycleRangeLabel: string
  /** Month string YYYY-MM (based on cycle start) for budget queries */
  monthStr: string
}

/** Derives the current payroll cycle given a cycleOffset (0 = latest, -1 = previous, …) */
export function usePayrollCycle(cycleOffset: number): UsePayrollCycleReturn {
  const today = useMemo(() => new Date(), [])

  /* ── 1. Categories ── */
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: catApi.list,
    staleTime: 10 * 60_000,
  })

  /* ── 2. Locate the "nómina" category ── */
  const nominaCategory = useMemo(() => {
    return (
      categories?.find(c => {
        const n = c.name.toLowerCase()
        return (
          n.includes('nomina') ||
          n.includes('nómina') ||
          n.includes('salario') ||
          n.includes('sueldo')
        )
      }) ?? null
    )
  }, [categories])

  /* ── 3. Fetch payroll transactions ── */
  const { data: payrollData } = useQuery({
    queryKey: ['payroll-transactions', nominaCategory?.id ?? 'none'],
    queryFn: () =>
      txApi.list({
        ...(nominaCategory
          ? { category_id: nominaCategory.id.toString() }
          : { type: 'CUSTOMER_INPAYMENT' }),
        account_category: 'CASH',
        page_size: 100,
      }),
    enabled: categories !== undefined,
    staleTime: 5 * 60_000,
  })

  /* ── 4. Unique sorted payroll dates ── */
  const payrollDates = useMemo(() => {
    if (!payrollData?.items) return []
    return [...new Set(payrollData.items.map(tx => tx.date))].sort()
  }, [payrollData])

  /* ── 5. Build cycles array ── */
  const cycles = useMemo((): PayrollCycle[] => {
    if (!payrollDates.length) return []
    return payrollDates.map((start, i) => {
      if (i + 1 < payrollDates.length) {
        const d = new Date(payrollDates[i + 1] + 'T12:00:00')
        d.setDate(d.getDate() - 1)
        return { start, end: d.toISOString().slice(0, 10), isOpen: false }
      }
      // Open cycle: extend 45 days past today to catch future manual entries
      const future = new Date(today)
      future.setDate(future.getDate() + 45)
      return { start, end: future.toISOString().slice(0, 10), isOpen: true }
    })
  }, [payrollDates, today])

  /* ── 6. Resolve selected cycle ── */
  const selectedCycleIdx =
    cycles.length > 0 ? Math.max(0, cycles.length - 1 + cycleOffset) : -1

  const isLatestCycle = cycleOffset >= 0

  /* ── 7. Derive period range & labels ── */
  const { periodStart, periodEnd, isPayrollCycle, monthStr, cycleRangeLabel } =
    useMemo(() => {
      // Fallback: current calendar month when no payroll data yet
      if (selectedCycleIdx < 0 || !cycles.length) {
        const m = today.getMonth() + 1
        const y = today.getFullYear()
        const ms = `${y}-${String(m).padStart(2, '0')}`
        return {
          periodStart: `${ms}-01`,
          periodEnd: today.toISOString().slice(0, 10),
          isPayrollCycle: false,
          monthStr: ms,
          cycleRangeLabel: new Date(y, m - 1, 1).toLocaleDateString('es-ES', {
            month: 'long',
            year: 'numeric',
          }),
        }
      }

      const cycle = cycles[selectedCycleIdx]
      const startDate = new Date(cycle.start + 'T12:00:00')
      const ms = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`

      const fmtShort = (d: string) =>
        new Date(d + 'T12:00:00').toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'short',
        }).replace('.', '')

      const endLabel = cycle.isOpen ? 'hoy' : fmtShort(cycle.end)
      const label = `${fmtShort(cycle.start)} — ${endLabel}`

      return {
        periodStart: cycle.start,
        periodEnd: cycle.end,
        isPayrollCycle: true,
        monthStr: ms,
        cycleRangeLabel: label,
      }
    }, [cycles, selectedCycleIdx, today])

  return {
    cycles,
    selectedCycleIdx,
    isLatestCycle,
    periodStart,
    periodEnd,
    isPayrollCycle,
    cycleRangeLabel,
    monthStr,
  }
}
