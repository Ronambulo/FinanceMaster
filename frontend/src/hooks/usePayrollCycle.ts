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

/**
 * Derives payroll cycles from a cycleOffset (0 = latest, -1 = previous, …).
 * Pass overrideCategoryId to use a specific category instead of auto-detecting nómina.
 */
export function usePayrollCycle(cycleOffset: number, overrideCategoryId?: number | null): UsePayrollCycleReturn {
  const today = useMemo(() => new Date(), [])

  /* ── 1. Categories (for auto-detection fallback) ── */
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: catApi.list,
    staleTime: 10 * 60_000,
    enabled: !overrideCategoryId,
  })

  /* ── 2. Auto-detect "nómina" category (skipped when override is set) ── */
  const nominaCategory = useMemo(() => {
    if (overrideCategoryId) return null
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
  }, [categories, overrideCategoryId])

  /* ── 3. Resolved category id: explicit override wins, then auto-detected ── */
  const activeCategoryId = overrideCategoryId ?? nominaCategory?.id ?? null

  /* ── 4. Fetch payroll transactions — always try CUSTOMER_INPAYMENT ── */
  const { data: payrollByType } = useQuery({
    queryKey: ['payroll-transactions-type'],
    queryFn: () =>
      txApi.list({
        type: 'CUSTOMER_INPAYMENT',
        account_category: 'CASH',
        page_size: 100,
      }),
    staleTime: 5 * 60_000,
  })

  /* Also query by the active category (override or auto-detected nómina) */
  const { data: payrollByCategory } = useQuery({
    queryKey: ['payroll-transactions-cat', activeCategoryId ?? 'none'],
    queryFn: () =>
      txApi.list({
        category_id: activeCategoryId!.toString(),
        page_size: 100,
      }),
    enabled: !!activeCategoryId,
    staleTime: 5 * 60_000,
  })

  /* ── 4. Unique sorted payroll dates (union of both sources) ── */
  const payrollDates = useMemo(() => {
    const typeItems = payrollByType?.items ?? []
    const catItems  = payrollByCategory?.items ?? []
    const allItems  = [...typeItems, ...catItems]
    if (!allItems.length) return []

    // Sort by date asc and group amounts per date
    const dateAmounts = new Map<string, number>()
    for (const tx of allItems) {
      dateAmounts.set(tx.date, Math.max(dateAmounts.get(tx.date) ?? 0, Math.abs(tx.amount)))
    }
    const allDates = [...dateAmounts.keys()].sort()

    // Keep only dates that are ≥ 20 days apart from the previous kept one.
    // This filters out mid-month transfers/refunds that break cycle detection.
    // When two dates are too close we prefer the one with the higher amount
    // (more likely to be the salary). Within the window, we already took the max.
    const MIN_GAP_DAYS = 20
    const filtered: string[] = []
    for (const d of allDates) {
      if (filtered.length === 0) {
        filtered.push(d)
        continue
      }
      const prev = filtered[filtered.length - 1]
      const gapMs = new Date(d + 'T12:00:00').getTime() - new Date(prev + 'T12:00:00').getTime()
      const gapDays = gapMs / 86_400_000
      if (gapDays >= MIN_GAP_DAYS) {
        filtered.push(d)
      } else if ((dateAmounts.get(d) ?? 0) > (dateAmounts.get(prev) ?? 0)) {
        // Same window but new date has larger amount → replace
        filtered[filtered.length - 1] = d
      }
    }
    return filtered
  }, [payrollByType, payrollByCategory])

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
