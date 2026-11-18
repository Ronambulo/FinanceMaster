import { describe, expect, it } from 'vitest'
import type { Transaction, TxGroup } from '../api'
import { EMPTY_FILTERS, activeFilterCount, filterParams, periodLabel, periodRange, serverDate, syncLabel } from '../movements'
import {
  accountName, averageTicket, categoriesFor, countLabel, dayLabel, groupByDay, groupFilter, groupSections,
  kindToType, merchantBars, monthName, monthRange, parseAmount, recentMonths, signedAmount, txKind, txTitle,
} from '../movements'

const today = new Date(2026, 10, 17) // martes 17 nov 2026

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: 1, external_id: null, date: '2026-11-17', datetime: null, type: 'CARD_TRANSACTION',
    account_category: 'CASH', asset_class: null, name: 'X', symbol: null, shares: null, price: null,
    amount: -1, fee: null, tax: null, currency: 'EUR', description: null, counterparty_name: null,
    mcc_code: null, category_id: null, category: null, is_auto_categorized: false, is_ai_categorized: false,
    is_internal_transfer: false, exclude_from_stats: false, is_pending: false, recurring_group_id: null,
    link_group_id: null, is_link_primary: false, effective_amount: null, linked_transactions: null, ...p,
  }
}

function grp(p: Partial<TxGroup>): TxGroup {
  return { key: 'k', label: 'L', income: 0, expense: 0, count: 1, icon: null, color: null, ...p }
}

describe('dayLabel', () => {
  it('hoy, ayer y día de la semana', () => {
    expect(dayLabel('2026-11-17', today)).toBe('Hoy')
    expect(dayLabel('2026-11-16', today)).toBe('Ayer')
    expect(dayLabel('2026-11-15', today)).toBe('Domingo 15')
  })
  it('ayer cruzando de mes', () => {
    expect(dayLabel('2026-10-31', new Date(2026, 10, 1))).toBe('Ayer')
  })
})

describe('groupByDay', () => {
  it('agrupa en orden y suma el neto, usando el importe efectivo', () => {
    const g = groupByDay([
      tx({ id: 1, date: '2026-11-17', amount: -3.4 }),
      tx({ id: 2, date: '2026-11-17', amount: -42.15 }),
      tx({ id: 3, date: '2026-11-16', amount: 1875 }),
      tx({ id: 4, date: '2026-11-16', amount: -100, effective_amount: -54 }),
    ], today)
    expect(g.map(d => [d.label, d.net, d.items.length])).toEqual([['Hoy', -45.55, 2], ['Ayer', 1821, 2]])
  })
})

describe('textos de fila', () => {
  it('cuenta y título', () => {
    expect(accountName('n26')).toBe('N26')
    expect(accountName(null)).toBe('Manual')
    expect(accountName('caixa_bank')).toBe('caixa bank')
    expect(txTitle({ name: null, counterparty_name: ' Ana ', description: 'x' })).toBe('Ana')
    expect(countLabel(1)).toBe('1 movimiento')
    expect(countLabel(8)).toBe('8 movimientos')
  })
})

describe('clase del movimiento', () => {
  it('deduce gasto/ingreso/traspaso', () => {
    expect(txKind({ amount: -5, is_internal_transfer: false })).toBe('expense')
    expect(txKind({ amount: 5, is_internal_transfer: false })).toBe('income')
    expect(txKind({ amount: -5, is_internal_transfer: true })).toBe('transfer')
  })
  it('conserva el tipo si encaja y si no elige uno por defecto', () => {
    expect(kindToType('expense', 'DIRECT_DEBIT')).toBe('DIRECT_DEBIT')
    expect(kindToType('expense', 'CUSTOMER_INPAYMENT')).toBe('CARD_TRANSACTION')
    expect(kindToType('income', 'CUSTOMER_INPAYMENT')).toBe('CUSTOMER_INPAYMENT')
    expect(kindToType('income', 'CARD_TRANSACTION')).toBe('TRANSFER_INBOUND')
    expect(kindToType('transfer')).toBe('TRANSFER_OUTBOUND')
  })
  it('firma el importe', () => {
    expect(signedAmount(42.15, 'expense')).toBe(-42.15)
    expect(signedAmount(-10, 'income')).toBe(10)
    expect(signedAmount(300, 'transfer')).toBe(-300)
  })
  it('lee importes escritos a mano', () => {
    expect(parseAmount('42,15')).toBe(42.15)
    expect(parseAmount('1.042,15 €')).toBe(1042.15)
    expect(parseAmount('12.5')).toBe(12.5)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })
})

describe('meses', () => {
  it('rango, nombre y últimos meses', () => {
    expect(monthRange('2026-02')).toEqual({ date_from: '2026-02-01', date_to: '2026-02-28' })
    expect(monthName('2026-11')).toBe('Noviembre')
    expect(recentMonths(new Date(2026, 0, 15), 3)).toEqual(['2026-01', '2025-12', '2025-11'])
  })
})

describe('groupSections', () => {
  const groups = [
    grp({ key: '1', label: 'Comida', expense: 312.4, count: 8 }),
    grp({ key: '2', label: 'Transporte', expense: 162, count: 4 }),
    grp({ key: 'none', label: 'Sin categoría', income: 1875, expense: 10, count: 2 }),
  ]
  it('separa gastos e ingresos, mayores primero', () => {
    const [exp, inc] = groupSections(groups, true)
    expect(exp.kind).toBe('expense')
    expect(exp.groups.map(g => g.label)).toEqual(['Comida', 'Transporte', 'Sin categoría'])
    expect(exp.total).toBe(-484.4)
    expect(inc.kind).toBe('income')
    expect(inc.total).toBe(1875)
  })
  it('sin separar, una sección con el neto', () => {
    const [all] = groupSections(groups, false)
    expect(all.kind).toBe('all')
    expect(all.groups[2].net).toBe(1865)
    expect(groupSections([], false)).toEqual([])
  })
  it('filtro de cada grupo', () => {
    expect(groupFilter('category', { key: 'none', label: '' })).toEqual({ category_id: 0 })
    expect(groupFilter('category', { key: '7', label: '' })).toEqual({ category_id: 7 })
    expect(groupFilter('merchant', { key: 'mercadona', label: 'Mercadona' })).toEqual({ search: 'Mercadona' })
    expect(groupFilter('account', { key: 'n26', label: 'N26' })).toEqual({ source: 'n26' })
  })
})

describe('comercio', () => {
  it('barras de 6 meses con huecos', () => {
    const bars = merchantBars([grp({ key: '2026-11', expense: 340.8 }), grp({ key: '2026-09', expense: 170.4 })], today)
    expect(bars.map(b => b.label)).toEqual(['Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov'])
    expect(bars.map(b => b.ratio)).toEqual([0, 0, 0, 0.5, 0, 1])
    expect(bars[5].current).toBe(true)
  })
  it('media por movimiento', () => {
    expect(averageTicket(-340.8, 12)).toBe(28.4)
    expect(averageTicket(10, 0)).toBe(0)
  })
})

describe('categoriesFor', () => {
  const cat = (id: number, type: string) => ({ id, user_id: null, name: String(id), icon: '', color: '', type, is_system: true })
  it('filtra por clase y cae a todas si no hay', () => {
    const cats = [cat(1, 'expense'), cat(2, 'income'), cat(3, 'internal')]
    expect(categoriesFor(cats, 'expense').map(c => c.id)).toEqual([1])
    expect(categoriesFor(cats, 'transfer').map(c => c.id)).toEqual([3])
    expect(categoriesFor([cat(1, 'expense')], 'income').map(c => c.id)).toEqual([1])
  })
})

describe('filtros de movimientos', () => {
  const today = new Date(2026, 10, 17)
  it('periodos', () => {
    expect(periodRange('this', today)).toEqual({ date_from: '2026-11-01', date_to: '2026-11-30' })
    expect(periodRange('last', today)).toEqual({ date_from: '2026-10-01', date_to: '2026-10-31' })
    expect(periodRange('3m', today)).toEqual({ date_from: '2026-09-01', date_to: '2026-11-30' })
    expect(periodRange('', today)).toEqual({})
    expect(periodLabel('2026-03')).toBe('Marzo')
  })
  it('periodos por ciclo de nómina', () => {
    const cycles = [
      { start: '2026-08-28', end: '2026-09-26' },
      { start: '2026-09-27', end: '2026-10-27' },
      { start: '2026-10-28', end: '2026-12-31' },
    ]
    expect(periodRange('this', today, cycles)).toEqual({ date_from: '2026-10-28', date_to: '2026-12-31' })
    expect(periodRange('last', today, cycles)).toEqual({ date_from: '2026-09-27', date_to: '2026-10-27' })
    expect(periodRange('3m', today, cycles)).toEqual({ date_from: '2026-08-28', date_to: '2026-12-31' })
    // Un mes elegido a mano sigue siendo el mes natural
    expect(periodRange('2026-03', today, cycles)).toEqual({ date_from: '2026-03-01', date_to: '2026-03-31' })
    expect(periodRange('', today, cycles)).toEqual({})
    expect(filterParams({ ...EMPTY_FILTERS }, today, cycles)).toMatchObject({ date_from: '2026-10-28' })
  })
  it('parámetros', () => {
    const p = filterParams({ ...EMPTY_FILTERS, kind: 'transfer', sources: ['n26', 'bbva'], categoryIds: [3, 0], min: '1.200,5', max: '' }, today)
    expect(p).toMatchObject({ type_group: 'transfer', source: 'n26,bbva', category_ids: '3,0', amount_min: 1200.5, amount_max: undefined })
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0)
    expect(activeFilterCount({ ...EMPTY_FILTERS, period: '', min: '5' })).toBe(2)
  })
})

import { chipDate, keypadInput, longDateTime, ruleFor, shortDate } from '../movements'

describe('editar / añadir', () => {
  it('fechas cortas y largas', () => {
    expect(shortDate('2026-11-17')).toBe('17 nov')
    expect(longDateTime('2026-11-17', '2026-11-17T13:42:00')).toBe('Martes 17 nov · 13:42')
    expect(longDateTime('2026-11-17', null)).toBe('Martes 17 nov')
    const today = new Date(2026, 10, 17)
    expect(chipDate('2026-11-17', today)).toBe('Hoy')
    expect(chipDate('2026-11-16', today)).toBe('Ayer')
    expect(chipDate('2026-11-02', today)).toBe('2 nov')
  })
  it('teclado numérico', () => {
    let t = ''
    for (const k of ['2', '4', ',', '9', '0', '5']) t = keypadInput(t, k)
    expect(t).toBe('24,90')
    expect(keypadInput('', ',')).toBe('0,')
    expect(keypadInput('0', '7')).toBe('7')
    expect(keypadInput('24,9', 'back')).toBe('24,')
    expect(keypadInput('1,5', ',')).toBe('1,5')
  })
  it('regla del comercio', () => {
    const rules = [{ keyword: 'lidl' }, { keyword: 'Mercadona' }]
    expect(ruleFor(rules, 'MERCADONA Valencia')?.keyword).toBe('Mercadona')
    expect(ruleFor(rules, 'Café')).toBeUndefined()
  })
})

describe('serverDate / syncLabel', () => {
  it('lee la hora del servidor como UTC', () => {
    expect(serverDate('2026-11-18T09:40:00').getTime()).toBe(Date.UTC(2026, 10, 18, 9, 40))
    expect(serverDate('2026-11-18T09:40:00Z').getTime()).toBe(Date.UTC(2026, 10, 18, 9, 40))
    expect(serverDate('2026-11-18T09:40:00+00:00').getTime()).toBe(Date.UTC(2026, 10, 18, 9, 40))
  })
  it('muestra la hora local', () => {
    const d = new Date(Date.UTC(2026, 10, 18, 9, 40))
    const hhmm = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    expect(syncLabel('2026-11-18T09:40:00', d)).toBe(`Hoy, ${hhmm}`)
  })
})
