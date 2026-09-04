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
    if (!typeItems.length && !catItems.length) return []

    const dayMs = (a: string, b: string) =>
      (new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 86_400_000

    // Max amount per date, and whether the date came from the trusted
    // category match (real, confirmed "nómina") vs. the broader
    // CUSTOMER_INPAYMENT type search (could be any incoming payment).
    const dateAmounts = new Map<string, number>()
    const dateIsCategory = new Map<string, boolean>()
    for (const tx of typeItems) {
      dateAmounts.set(tx.date, Math.max(dateAmounts.get(tx.date) ?? 0, Math.abs(tx.amount)))
    }
    for (const tx of catItems) {
      dateAmounts.set(tx.date, Math.max(dateAmounts.get(tx.date) ?? 0, Math.abs(tx.amount)))
      dateIsCategory.set(tx.date, true)
    }

    // Collapse same-payday duplicates (e.g. a payment split across a couple
    // of days) — dates within CLUSTER_WINDOW_DAYS of each other are the same event.
    const CLUSTER_WINDOW_DAYS = 4
    const allDates = [...dateAmounts.keys()].sort()
    const clustered: string[] = []
    for (const d of allDates) {
      const prev = clustered[clustered.length - 1]
      if (prev && dayMs(d, prev) <= CLUSTER_WINDOW_DAYS) {
        const prevIsCat = dateIsCategory.get(prev) ?? false
        const dIsCat = dateIsCategory.get(d) ?? false
        // Prefer the category-tagged date; otherwise keep the larger amount.
        const dWins = dIsCat !== prevIsCat ? dIsCat : (dateAmounts.get(d) ?? 0) > (dateAmounts.get(prev) ?? 0)
        if (dWins) clustered[clustered.length - 1] = d
      } else {
        clustered.push(d)
      }
    }

    // Category-tagged dates are trusted anchors — confirmed salary payments.
    const anchors    = clustered.filter(d => dateIsCategory.get(d))
    const candidates = clustered.filter(d => !dateIsCategory.get(d))
    const FALLBACK_MIN_GAP_DAYS = 20

    if (!anchors.length) {
      // No categorized salary at all: fall back to the previous amount/gap
      // heuristic across all (type-only) dates.
      const filtered: string[] = []
      for (const d of clustered) {
        if (!filtered.length) { filtered.push(d); continue }
        const prev = filtered[filtered.length - 1]
        if (dayMs(d, prev) >= FALLBACK_MIN_GAP_DAYS) {
          filtered.push(d)
        } else if ((dateAmounts.get(d) ?? 0) > (dateAmounts.get(prev) ?? 0)) {
          filtered[filtered.length - 1] = d
        }
      }
      return filtered
    }

    // Adaptive threshold: how far an un-tagged candidate must be from the
    // nearest anchor before it's trusted as a genuine (un-tagged) payday
    // rather than dismissed as noise (a refund, transfer, extra income...).
    // Derived from the anchors' own typical spacing so it self-tunes to
    // whatever cadence this user actually gets paid on.
    let threshold = FALLBACK_MIN_GAP_DAYS
    if (anchors.length >= 2) {
      const gaps: number[] = []
      for (let i = 1; i < anchors.length; i++) gaps.push(dayMs(anchors[i], anchors[i - 1]))
      gaps.sort((a, b) => a - b)
      const median = gaps[Math.floor(gaps.length / 2)]
      threshold = Math.max(14, median - 8)
    }

    const accepted = [...anchors]
    for (const d of candidates) {
      const minGapToAnchor = Math.min(...accepted.map(a => Math.abs(dayMs(d, a))))
      if (minGapToAnchor >= threshold) accepted.push(d)
    }
    return accepted.sort()
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
