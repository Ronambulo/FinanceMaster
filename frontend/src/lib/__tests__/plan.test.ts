import { describe, expect, it } from 'vitest'
import {
  badges, bestMonth, budgetTone, budgetTotals, daysLeftInMonth, debtTotals, goalSub, lastGreenMonth, linePoints,
  longestStreak, recurringMonthly, recurringWhen, savingsAverage, streakDays,
  budgetsSummary, debtsSummary, goalsSummary, monthlySummary, recurringSummary, relativeDay, spendBars, spendChange,
} from '../plan'
import type { BudgetStatus, Debt, Goal, MonthlyTrend, UpcomingRecurring } from '../api'

const t = (month: string, expenses: number, savings = 0): MonthlyTrend => ({ month, income: 0, expenses, savings })
const today = new Date(2026, 10, 17) // martes 17 nov 2026

describe('gasto por mes', () => {
  it('barras normalizadas al máximo y la última es la actual', () => {
    const b = spendBars([t('2026-10', 200), t('2026-11', 100)])
    expect(b.map(x => x.ratio)).toEqual([1, 0.5])
    expect(b.map(x => x.label)).toEqual(['Oct', 'Nov'])
    expect(b[1].current).toBe(true)
  })
  it('variación frente al mes anterior', () => {
    expect(spendChange([t('2026-10', 1000), t('2026-11', 820)])).toEqual({ text: '−18 % vs oct', better: true })
    expect(spendChange([t('2026-10', 100), t('2026-11', 150)])).toEqual({ text: '+50 % vs oct', better: false })
    expect(spendChange([t('2026-10', 0), t('2026-11', 150)])).toBeNull()
    expect(spendChange([t('2026-11', 150)])).toBeNull()
  })
  it('mes a mes compara el ahorro', () => {
    expect(monthlySummary([t('2026-10', 0, 100), t('2026-11', 0, 200)])).toBe('Mejor que octubre')
    expect(monthlySummary([t('2026-10', 0, 300), t('2026-11', 0, 200)])).toBe('Peor que octubre')
  })
})

describe('resúmenes', () => {
  it('presupuestos', () => {
    const b = (pct: number) => ({ pct_used: pct }) as BudgetStatus
    expect(budgetsSummary([b(50), b(100), b(120), b(10)])).toBe('3 de 4 en verde')
    expect(budgetsSummary([])).toBe('Sin presupuestos')
  })
  it('días relativos', () => {
    expect(relativeDay('2026-11-17', today)).toBe('hoy')
    expect(relativeDay('2026-11-18', today)).toBe('mañana')
    expect(relativeDay('2026-11-19', today)).toBe('el jueves')
    expect(relativeDay('2026-12-03', today)).toBe('el 3 dic')
  })
  it('recurrentes: el más cercano', () => {
    const u = (name: string, d: string | null) => ({ display_name: name, next_expected_date: d }) as UpcomingRecurring
    expect(recurringSummary([u('Spotify', '2026-11-25'), u('Netflix', '2026-11-19'), u('X', null)], today)).toBe('Netflix el jueves')
    expect(recurringSummary([], today)).toBe('Nada próximo')
  })
  it('objetivos: el más avanzado activo', () => {
    const g = (name: string, p: number, active = true) => ({ name, progress_pct: p, is_active: active }) as Goal
    expect(goalsSummary([g('Coche', 20), g('Vacaciones', 62.4), g('Viejo', 99, false)])).toBe('62 % Vacaciones')
    expect(goalsSummary([])).toBe('Sin objetivos')
  })
  it('deudas: saldo neto', () => {
    const d = (dir: Debt['direction'], rem: number, settled = false) => ({ direction: dir, remaining_amount: rem, is_settled: settled }) as Debt
    expect(debtsSummary([d('OWED_TO_ME', 40)])).toBe('Te deben 40 €')
    expect(debtsSummary([d('I_OWE', 12.5), d('OWED_TO_ME', 500, true)])).toBe('Debes 12,50 €')
    expect(debtsSummary([])).toBe('Todo al día')
  })
})

describe('pantallas de plan', () => {
  it('tono del presupuesto', () => {
    expect([50, 80, 100, 101].map(budgetTone)).toEqual(['green', 'amber', 'amber', 'red'])
  })
  it('totales y días que quedan', () => {
    const b = (budgeted: number, spent: number) => ({ budgeted, spent }) as BudgetStatus
    expect(budgetTotals([b(100, 50), b(100, 100)])).toEqual({ budgeted: 200, spent: 150, ratio: 0.75 })
    expect(daysLeftInMonth(today)).toBe(14)
  })
  it('coste mensual de recurrentes', () => {
    expect(recurringMonthly([
      { avg_amount: -10, period_days: 30, is_active: true },
      { avg_amount: -120, period_days: 365, is_active: true },
      { avg_amount: -5, period_days: 7, is_active: true },
      { avg_amount: -99, period_days: 30, is_active: false },
    ])).toBe(41.29)
  })
  it('cuándo toca un recurrente', () => {
    expect(recurringWhen('2026-11-19', 30, today)).toBe('Jueves 19')
    expect(recurringWhen('2026-12-15', 30, today)).toBe('Día 15 · cada mes')
    expect(recurringWhen('2026-11-18', 7, today)).toBe('Mañana')
  })
  it('subtítulo de un objetivo', () => {
    const g = { type: 'EURO_TARGET' as const, target_amount: 2000, current_amount: 1240, deadline: '2027-07-01', target_percent: null }
    expect(goalSub(g, today)).toBe('Julio 2027 · 95 €/mes')
    expect(goalSub({ ...g, deadline: '2026-12-24', target_amount: 300, current_amount: 180 }, today)).toBe('Diciembre · 120 €/mes')
    expect(goalSub({ ...g, deadline: null }, today)).toBe('Sin fecha')
  })
  it('deudas por sentido', () => {
    const d = (direction: 'I_OWE' | 'OWED_TO_ME', remaining_amount: number, is_settled = false) => ({ direction, remaining_amount, is_settled }) as Debt
    expect(debtTotals([d('OWED_TO_ME', 25), d('OWED_TO_ME', 15), d('I_OWE', 4820), d('I_OWE', 10, true)])).toEqual({ owedToMe: 40, iOwe: 4820 })
  })
  it('mes a mes', () => {
    const tr = [t('2026-09', 0, 1138), t('2026-10', 0, 694), t('2026-11', 0, 907)]
    expect(savingsAverage(tr)).toBe(913)
    expect(bestMonth(tr)).toBe('2026-09')
    expect(lastGreenMonth(tr)).toBe('2026-10')
    expect(linePoints([0, 10], 100, 50)).toEqual([[4, 46], [96, 4]])
  })
  it('rachas', () => {
    expect(streakDays(['2026-11-17', '2026-11-16', '2026-11-15', '2026-11-13'], today)).toBe(3)
    expect(streakDays(['2026-11-16', '2026-11-15'], today)).toBe(2)
    expect(streakDays(['2026-11-10'], today)).toBe(0)
    expect(longestStreak(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-10'])).toBe(3)
  })
  it('logros', () => {
    const b = badges({ streak: 6, greenMonth: '2026-10', goals: 1, hasBroker: true, txCount: 120, debts: [] })
    expect(b.map(x => x.unlocked)).toEqual([true, true, true, true, true, false])
    expect(b[1].sub).toBe('octubre')
  })
})
