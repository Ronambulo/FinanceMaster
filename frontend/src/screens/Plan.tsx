// Plan y sus pantallas (tableros Plan, PCPlan, Presupuestos, Recurrentes, Objetivos, Deudas, MesAMes y Logros).
import { scrollToTop } from '@/app/scroller'
import { cur as curSym } from '@/lib/format'
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  budgetApi, catApi, dashApi, debtApi, exportApi, goalApi, recurringApi, txApi,
  type MonthlyDetailRow,
  type BudgetStatus, type Category, type SavingsAllocation, type Debt, type Goal, type MonthlyTrend, type RecurringGroup,
} from '@/lib/api'
import { isModuleOn, type ModuleId } from '@/lib/preferences'
import { usePreferencesStore } from '@/store/preferences'
import { BROKERS, visibleAccounts } from '@/lib/accounts'
import { categoriesFor, monthKey, parseAmount, shortDate } from '@/lib/movements'
import {
  TONE_COLORS, badges, bestMonth, budgetTone, budgetTotals, budgetsSummary, daysLeftInMonth, debtTotals, debtsSummary,
  goalSub, goalTarget, goalsReserved, goalsSummary, lastGreenMonth, linePoints, longMonth, longestStreak, monthlySummary,
  recurringMonthly, recurringSummary, recurringWhen, savingsAverage, spendBars, spendChange, streakDays,
} from '@/lib/plan'
import { PCHeader, useIsPC } from '@/app/Shell'
import { usePayrollCycle } from '@/hooks/usePayrollCycle'
import { bestCycle, calendarCycles, cycleAverage, cycleRows, previousSpendAligned } from '@/lib/cycles'
import { CatPickSheet } from '@/ui/CatPick'
import { confirm } from '@/ui/Confirm'
import { Icon, catTone, toneColors, toneIcon, CatGlyph, CatTile, type AnyIcon } from '@/ui/Icon'
import { MerchantTile } from '@/ui/tx'
import { toast } from '@/ui/Toast'
import {
  Btn, C, Divider, Empty, Field, Header, Label, PickField, Pill, Ring, RoundBtn, Section, Segmented, Sheet, SheetOption,
  Skeleton, SubHeader, useMoney,
} from '@/ui/kit'

const card: CSSProperties = { background: C.card, borderRadius: 24, boxShadow: 'var(--sh-card)' }
const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'No se pudo guardar')
const todayIso = () => new Date().toISOString().slice(0, 10)

/** En PC las subpantallas van en una columna de 680 px. */
function Page({ children }: { children: ReactNode }) {
  const pc = useIsPC()
  return <div style={pc ? { maxWidth: 680 } : { paddingBottom: 40 }}>{children}</div>
}

function useModule(id: ModuleId) {
  const prefs = usePreferencesStore(s => s.prefs)
  return isModuleOn(prefs, id)
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries()
}

// ── Hub ─────────────────────────────────────────────────────────────────────

interface Tile { id: ModuleId; to: string; icon: AnyIcon; title: string; sub: string }

function usePlanData(months: number) {
  const prefs = usePreferencesStore(s => s.prefs)
  const on = (id: ModuleId) => isModuleOn(prefs, id)
  const trend = useQuery({ queryKey: ['monthly-trend', months], queryFn: () => dashApi.monthlyTrend(months) })
  const budgets = useQuery({ queryKey: ['budgets', 'status', monthKey(new Date())], queryFn: () => budgetApi.status(monthKey(new Date())), enabled: on('budgets') })
  const upcoming = useQuery({ queryKey: ['upcoming', 30], queryFn: () => dashApi.upcoming(30), enabled: on('recurring') })
  const goals = useQuery({ queryKey: ['goals'], queryFn: goalApi.list, enabled: on('goals') })
  const debts = useQuery({ queryKey: ['debts'], queryFn: debtApi.list, enabled: on('debts') })
  const streak = useStreak(on('achievements'))
  const today = new Date()
  const tiles: Tile[] = [
    { id: 'budgets' as const, to: '/presupuestos', icon: 'pie' as const, title: 'Presupuestos', sub: budgets.data ? budgetsSummary(budgets.data) : '' },
    { id: 'recurring' as const, to: '/recurrentes', icon: 'repeat' as const, title: 'Recurrentes', sub: upcoming.data ? recurringSummary(upcoming.data, today) : '' },
    { id: 'goals' as const, to: '/objetivos', icon: 'safe-open' as const, title: 'Objetivos', sub: goals.data ? goalsSummary(goals.data) : '' },
    { id: 'debts' as const, to: '/deudas', icon: 'receipt' as const, title: 'Deudas', sub: debts.data ? debtsSummary(debts.data) : '' },
    { id: 'monthly' as const, to: '/monthly', icon: 'calendar' as const, title: 'Mes a mes', sub: trend.data ? monthlySummary(trend.data) : '' },
    { id: 'achievements' as const, to: '/logros', icon: 'trophy' as const, title: 'Logros', sub: streak.current > 0 ? `Racha de ${streak.current} ${streak.current === 1 ? 'día' : 'días'}` : 'Empieza tu racha' },
  ].filter(t => on(t.id))
  return { trend, budgets, tiles, on }
}

function Bars({ trend, height, radius, gap }: { trend: MonthlyTrend[]; height: number; radius: number; gap: number }) {
  const money = useMoney()
  const bars = spendBars(trend)
  return (
    <div style={{ display: 'flex', gap, marginTop: height > 100 ? 16 : 14 }}>
      {bars.map(b => (
        <span key={b.month} title={`${b.label}: ${money(b.value, { euro: true })}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <span style={{ width: '100%', height, display: 'flex', alignItems: 'flex-end' }}>
            <span style={{ display: 'block', width: '100%', height: `${Math.max(4, Math.round(b.ratio * 100))}%`, borderRadius: radius, background: b.current ? 'var(--c-8b85ff)' : 'var(--track)' }} />
          </span>
          <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{b.label}</span>
        </span>
      ))}
    </div>
  )
}

function SpendCard({ trend, pc, title = 'Gasto por mes' }: { trend: MonthlyTrend[]; pc?: boolean; title?: string }) {
  const change = spendChange(trend)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: 0 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{title}</h2>
        {change && <Pill tone={change.better ? 'green' : 'red'}>{change.text}</Pill>}
      </div>
      <Bars trend={trend} height={pc ? 150 : 90} radius={pc ? 10 : 8} gap={pc ? 12 : 10} />
    </>
  )
}

function TileCard({ t, pc }: { t: Tile; pc?: boolean }) {
  const icon = <span style={{ width: 40, height: 40, borderRadius: 14, background: C.soft, color: C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={t.icon} size={20} /></span>
  if (pc) {
    return (
      <Link to={t.to} style={{ ...card, borderRadius: 22, padding: '16px 18px', color: C.text, display: 'block' }}>
        {icon}
        <span style={{ display: 'block', fontWeight: 800, marginTop: 12 }}>{t.title}</span>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{t.sub || ' '}</span>
      </Link>
    )
  }
  return (
    <Link to={t.to} style={{ ...card, borderRadius: 22, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, color: C.text }}>
      {icon}
      <span>
        <span style={{ display: 'block', fontWeight: 800 }}>{t.title}</span>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{t.sub || ' '}</span>
      </span>
    </Link>
  )
}

export default function Plan() {
  const pc = useIsPC()
  const [range, setRange] = useState<'mes' | 'ano'>('mes')
  const d = usePlanData(pc ? (range === 'mes' ? 12 : 60) : 6)
  const month = longMonth(monthKey(new Date()))
  const trend = d.trend.data ?? []

  if (pc) {
    const shown = range === 'mes' ? trend : yearly(trend)
    const budgetsOn = d.on('budgets')
    return (
      <>
        <PCHeader title="Plan" sub={month} search={false} add={false}
          actions={<Segmented label="Periodo" value={range} onChange={setRange} options={[['mes', 'Mes'], ['ano', 'Año']]} style={{ margin: 0 }} />} />
        <div style={{ display: 'grid', gridTemplateColumns: budgetsOn ? '1.4fr 1fr' : '1fr', gap: 16 }}>
          <section style={{ ...card, borderRadius: 22, padding: '20px 24px' }}>
            {d.trend.isLoading ? <Skeleton h={180} r={16} /> : <SpendCard trend={shown} pc title={range === 'mes' ? 'Gasto por mes' : 'Gasto por año'} />}
          </section>
          {budgetsOn && (
            <Link to="/presupuestos" style={{ ...card, borderRadius: 22, padding: '20px 24px', color: C.text, display: 'block' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: 0 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Presupuestos</h2>
                <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>{d.budgets.data ? budgetsSummary(d.budgets.data) : ''}</span>
              </div>
              <div style={{ marginTop: 6 }}>
                {(d.budgets.data ?? []).slice(0, 5).map(b => <PCBudgetRow key={b.budget_id} b={b} />)}
                {d.budgets.data?.length === 0 && <p style={{ margin: '12px 0 0', color: C.muted, fontWeight: 600, fontSize: 14 }}>Crea tu primer presupuesto</p>}
              </div>
            </Link>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 16 }}>
          {d.tiles.filter(t => t.id !== 'budgets').map(t => <TileCard key={t.id} t={t} pc />)}
        </div>
      </>
    )
  }

  return (
    <div style={{ paddingBottom: 40 }}>
      <Header title="Plan" sub={month} />
      <section style={{ ...card, margin: '16px 16px 0', padding: '16px 18px' }}>
        {d.trend.isLoading ? <Skeleton h={120} r={16} /> : <SpendCard trend={trend} />}
      </section>
      {d.tiles.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '12px 16px 0' }}>
          {d.tiles.map(t => <TileCard key={t.id} t={t} />)}
        </div>
      )}
    </div>
  )
}

/** Agrupa la tendencia mensual por años (las etiquetas son el año). */
function yearly(trend: MonthlyTrend[]): MonthlyTrend[] {
  const map = new Map<string, MonthlyTrend>()
  for (const t of trend) {
    const y = t.month.slice(0, 4)
    const cur = map.get(y) ?? { month: `${y}-01`, income: 0, expenses: 0, savings: 0 }
    cur.income += t.income
    cur.expenses += t.expenses
    cur.savings += t.savings
    map.set(y, cur)
  }
  return [...map.values()].map(v => ({ ...v, month: v.month.slice(0, 4) + '-00' }))
}

function PCBudgetRow({ b }: { b: BudgetStatus }) {
  const t = catTone(b.category_name, 'expense')
  const col = toneColors(t)
  const over = b.pct_used > 100
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr', gap: 12, alignItems: 'center', padding: '8px 0' }}>
      <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: 17, background: over ? 'var(--c-3a1a1e)' : col.bg, color: over ? C.red : col.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><CatGlyph name={b.category_name} tone={t} size={16} /></span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, gap: 8 }}>
          <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.category_name}</span>
          <span style={{ fontWeight: 700, color: over ? C.red : C.muted, whiteSpace: 'nowrap' }}>{fmt0(b.spent)} de {fmt0(b.budgeted)} {curSym()}</span>
        </span>
        <div style={{ height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, b.pct_used)}%`, height: '100%', borderRadius: 99, background: over ? C.red : col.fg }} />
        </div>
      </span>
    </div>
  )
}

const fmt0 = (n: number) => Math.round(n).toLocaleString('es-ES')
const fmt2 = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** "650" o "620,40": sin decimales si es entero. */
const fmtAuto = (n: number) => (Number.isInteger(Math.round(n * 100) / 100) ? fmt0(n) : fmt2(n))

// ── Presupuestos ────────────────────────────────────────────────────────────

export function Presupuestos() {
  const money = useMoney()
  const month = monthKey(new Date())
  const status = useQuery({ queryKey: ['budgets', 'status', month], queryFn: () => budgetApi.status(month) })
  const [edit, setEdit] = useState<BudgetStatus | 'new' | null>(null)
  const list = status.data ?? []
  const tot = budgetTotals(list)
  const pct = Math.round(tot.ratio * 100)
  const left = daysLeftInMonth(new Date())

  return (
    <Page>
      <SubHeader title="Presupuestos" back="/plan" actions={<RoundBtn icon="plus" label="Nuevo presupuesto" onClick={() => setEdit('new')} />} />
      {status.isLoading ? (
        <div style={{ margin: '16px 16px 0' }}><Skeleton h={100} /></div>
      ) : list.length === 0 ? (
        <Empty icon="pie" title="Sin presupuestos" text="Pon un límite a lo que gastas en una categoría." action={<Btn icon="plus" onClick={() => setEdit('new')}>Nuevo presupuesto</Btn>} />
      ) : (
        <>
          <section style={{ ...card, margin: '16px 16px 0', padding: '18px 20px' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Ring ratio={tot.ratio} size={64} stroke={8} color="var(--c-8b85ff)">{pct} %</Ring>
              <div>
                <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>Gastado de {fmt0(tot.budgeted)} {curSym()}</p>
                <p style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{money(tot.spent, { euro: true })}</p>
                <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>Quedan {left} {left === 1 ? 'día' : 'días'}</span>
              </div>
            </div>
          </section>
          <Section style={{ margin: '12px 16px 0' }}>
            {list.map((b, i) => (
              <div key={b.budget_id}>
                {i > 0 && <Divider margin="0" />}
                <BudgetRow b={b} onClick={() => setEdit(b)} />
              </div>
            ))}
          </Section>
        </>
      )}
      {edit && <BudgetSheet budget={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </Page>
  )
}

function BudgetRow({ b, onClick }: { b: BudgetStatus; onClick: () => void }) {
  const tone = TONE_COLORS[budgetTone(b.pct_used)]
  return (
    <a role="button" tabIndex={0} onClick={onClick} onKeyDown={e => e.key === 'Enter' && onClick()} style={{ display: 'block', padding: '11px 0', color: C.text, cursor: 'pointer' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', gap: 12, alignItems: 'center' }}>
        <CatTile name={b.category_name} type="expense" size={36} radius={18} icon={17} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.category_name}</span>
          <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{fmt2(b.spent)} de {fmtAuto(b.budgeted)} {curSym()}</span>
        </span>
        <span style={{ background: tone.bg, color: tone.fg, borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{Math.round(b.pct_used)} %</span>
      </div>
      <div style={{ margin: '10px 0 0 48px' }}>
        <div style={{ height: 7, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, Math.max(0, b.pct_used))}%`, height: '100%', borderRadius: 99, background: tone.fg }} />
        </div>
      </div>
    </a>
  )
}

function BudgetSheet({ budget, onClose }: { budget: BudgetStatus | null; onClose: () => void }) {
  const invalidate = useInvalidate()
  const categories = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const [cat, setCat] = useState<Category | null>(null)
  const [pick, setPick] = useState(false)
  const [amount, setAmount] = useState(budget ? fmtAuto(budget.budgeted) : '')
  const catName = cat?.name ?? budget?.category_name
  const value = parseAmount(amount)
  const valid = !!value && value > 0 && (!!budget || !!cat)
  const save = useMutation({
    mutationFn: () => (budget
      ? budgetApi.update(budget.budget_id, { amount: value!, ...(cat ? { category_id: cat.id } : {}) })
      : budgetApi.create({ category_id: cat!.id, amount: value!, is_recurring: true, month: null })),
    onSuccess: () => { invalidate(); toast(budget ? 'Presupuesto guardado' : 'Presupuesto creado'); onClose() },
    onError: e => toast(errText(e), { error: true }),
  })
  async function remove() {
    if (!budget) return
    const ok = await confirm({ title: 'Eliminar presupuesto', text: `Se quitará el límite de ${budget.category_name}.`, action: 'Eliminar', danger: true })
    if (!ok) return
    try { await budgetApi.delete(budget.budget_id); invalidate(); toast('Presupuesto eliminado'); onClose() } catch (e) { toast(errText(e), { error: true }) }
  }
  return (
    <>
      <Sheet open onClose={onClose} title={budget ? budget.category_name : 'Nuevo presupuesto'}>
        <PickField label="Categoría" onClick={() => setPick(true)} lead={catName ? <CatTile name={catName} type="expense" size={32} radius={16} icon={16} /> : undefined}>
          {catName ?? 'Elegir categoría'}
        </PickField>
        <Field label="Límite al mes" inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} trail={<span style={{ color: C.muted, fontWeight: 700 }}>{curSym()}</span>}
          onKeyDown={e => { if (e.key === 'Enter' && valid) save.mutate() }} autoFocus={!!budget} />
        <Btn disabled={!valid || save.isPending} onClick={() => save.mutate()} style={{ marginTop: 6 }}>Guardar</Btn>
        {budget && <Btn kind="ghost" onClick={remove} style={{ marginTop: 8, color: C.red }}>Eliminar presupuesto</Btn>}
      </Sheet>
      <CatPickSheet open={pick} categories={categoriesFor(categories.data ?? [], 'expense')} current={cat?.id ?? budget?.category_id} onPick={setCat} onClose={() => setPick(false)} />
    </>
  )
}

// ── Recurrentes ─────────────────────────────────────────────────────────────

export function Recurrentes() {
  const money = useMoney()
  const nav = useNavigate()
  const invalidate = useInvalidate()
  const groups = useQuery({ queryKey: ['recurring'], queryFn: recurringApi.list })
  const [add, setAdd] = useState(false)
  const [open, setOpen] = useState<RecurringGroup | null>(null)
  const today = new Date()
  const all = groups.data ?? []
  const active = useMemo(() => all.filter(g => g.is_active).sort((a, b) => (a.next_expected_date ?? '9999').localeCompare(b.next_expected_date ?? '9999')), [all])
  // Sugerencias: detectados que aún no se han añadido ni descartado.
  const suggested = all.filter(g => !g.is_active && !g.is_dismissed)
  const dismissed = all.filter(g => !g.is_active && g.is_dismissed)
  const [showDismissed, setShowDismissed] = useState(false)
  const restore = async (g: RecurringGroup) => {
    try { await recurringApi.update(g.id, { is_dismissed: false }); invalidate(); toast(`${g.display_name} vuelve a sugerencias`) } catch (e) { toast(errText(e), { error: true }) }
  }
  const remove = async (g: RecurringGroup) => {
    const ok = await confirm({ title: 'Eliminar recurrente', text: `Se eliminará ${g.display_name}. Sus movimientos no cambian.`, action: 'Eliminar', danger: true })
    if (!ok) return
    try { await recurringApi.delete(g.id); setOpen(null); invalidate(); toast('Recurrente eliminado') } catch (e) { toast(errText(e), { error: true }) }
  }
  const detect = useMutation({
    mutationFn: recurringApi.detect,
    onSuccess: () => { invalidate(); toast('Recurrentes actualizados') },
    onError: e => toast(errText(e), { error: true }),
  })
  const toggle = async (g: RecurringGroup, on: boolean) => {
    try { await recurringApi.update(g.id, { is_active: on }); invalidate(); toast(on ? `${g.display_name} añadido` : `${g.display_name} pausado`, on ? {} : { undo: () => { recurringApi.update(g.id, { is_active: true }).then(invalidate) } }) } catch (e) { toast(errText(e), { error: true }) }
  }
  // Descartar: deja de contar y la búsqueda automática no lo vuelve a proponer.
  const dismiss = async (g: RecurringGroup) => {
    const was = { is_active: g.is_active, is_dismissed: !!g.is_dismissed }
    try {
      await recurringApi.update(g.id, { is_active: false, is_dismissed: true }); invalidate()
      toast(g.is_active ? `${g.display_name} ya no es recurrente` : 'Sugerencia descartada', { undo: () => { recurringApi.update(g.id, was).then(invalidate) } })
    } catch (e) { toast(errText(e), { error: true }) }
  }

  return (
    <Page>
      <SubHeader title="Recurrentes" back="/plan" actions={<RoundBtn icon="plus" label="Nuevo recurrente" onClick={() => setAdd(true)} />} />
      {groups.isLoading ? (
        <div style={{ margin: '16px 16px 0' }}><Skeleton h={90} /></div>
      ) : all.length === 0 ? (
        <Empty icon="repeat" title="Sin recurrentes" text="Busca suscripciones y pagos fijos en tus movimientos." action={<Btn icon="search" disabled={detect.isPending} onClick={() => detect.mutate()}>{detect.isPending ? 'Buscando' : 'Buscar recurrentes'}</Btn>} />
      ) : (
        <>
          <section style={{ ...card, margin: '16px 16px 0', padding: '16px 20px' }}>
            <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>Al mes en fijos</p>
            <p style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>{money(recurringMonthly(all), { euro: true })}</p>
          </section>
          {active.length > 0 && (
            <>
              <Label>Próximos</Label>
              <Section>
                {active.map((g, i) => (
                  <div key={g.id}>
                    {i > 0 && <Divider margin="0" />}
                    <a role="button" tabIndex={0} onClick={() => setOpen(g)} onKeyDown={e => e.key === 'Enter' && setOpen(g)} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '10px 0', color: C.text, cursor: 'pointer' }}>
                      <MerchantTile name={g.display_name} category={g.category?.name} type={g.category?.type ?? 'expense'} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.display_name}</span>
                        <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}>{recurringWhen(g.next_expected_date, g.period_days, today)}</span>
                      </span>
                      <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{g.avg_amount != null ? money(-Math.abs(g.avg_amount)) : ''}</span>
                    </a>
                  </div>
                ))}
              </Section>
            </>
          )}
          {suggested.length > 0 && (
            <>
              <Label>Detectado</Label>
              {suggested.slice(0, 3).map(g => (
                <section key={g.id} style={{ ...card, margin: '0 16px 10px', padding: '14px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 40, height: 40, borderRadius: 14, background: C.soft, color: C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="sparkle" size={20} /></span>
                    <span role="button" tabIndex={0} onClick={() => setOpen(g)} onKeyDown={e => e.key === 'Enter' && setOpen(g)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <span style={{ display: 'block', fontWeight: 700 }}>¿{g.display_name} es recurrente?</span>
                      <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{g.avg_amount != null ? `${fmt2(Math.abs(g.avg_amount))} ${curSym()} ` : ''}{recurringWhen(null, g.period_days, today).toLowerCase()}</span>
                    </span>
                    <button type="button" aria-label={`Descartar ${g.display_name}`} title="Descartar" onClick={() => dismiss(g)} style={{ width: 34, height: 34, flex: 'none', border: 0, borderRadius: 10, background: C.field, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="close" size={16} /></button>
                    <button type="button" onClick={() => toggle(g, true)} style={{ height: 34, padding: '0 14px', border: 0, borderRadius: 10, background: C.accent, color: C.white, font: "800 13px 'Manrope', sans-serif", cursor: 'pointer' }}>Añadir</button>
                  </div>
                </section>
              ))}
            </>
          )}
          {dismissed.length > 0 && (
            <>
              <button type="button" aria-expanded={showDismissed} onClick={() => setShowDismissed(s => !s)} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '18px 20px 8px', padding: 0, border: 0, background: 'transparent', color: C.muted, font: "800 13px 'Manrope', sans-serif", cursor: 'pointer' }}>
                Descartados ({dismissed.length})
                <span style={{ display: 'flex', transform: showDismissed ? 'rotate(180deg)' : undefined }}><Icon name="chev-d" size={14} /></span>
              </button>
              {showDismissed && (
                <Section>
                  {dismissed.map((g, i) => (
                    <div key={g.id}>
                      {i > 0 && <Divider margin="0" />}
                      <div style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '10px 0' }}>
                        <MerchantTile name={g.display_name} category={g.category?.name} type={g.category?.type ?? 'expense'} />
                        <span style={{ minWidth: 0, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.muted }}>{g.display_name}</span>
                        <button type="button" onClick={() => restore(g)} style={{ height: 34, padding: '0 14px', border: 0, borderRadius: 10, background: C.field, color: C.text, font: "800 13px 'Manrope', sans-serif", cursor: 'pointer' }}>Restaurar</button>
                      </div>
                    </div>
                  ))}
                </Section>
              )}
            </>
          )}
        </>
      )}
      <Sheet open={add} onClose={() => setAdd(false)} title="Nuevo recurrente">
        <SheetOption icon="search" title={detect.isPending ? 'Buscando…' : 'Buscar automáticamente'} sub="Revisa tus movimientos" onClick={() => { detect.mutate(); setAdd(false) }} />
        <SheetOption icon="text-unordered" title="Desde un movimiento" sub="Abre uno y márcalo como recurrente" onClick={() => { setAdd(false); nav('/transacciones') }} />
      </Sheet>
      {open && <RecurringSheet group={all.find(g => g.id === open.id) ?? open} onClose={() => setOpen(null)}
        onAdd={g => { setOpen(null); toggle(g, true) }} onDismiss={g => { setOpen(null); dismiss(g) }} onDelete={remove} />}
    </Page>
  )
}

function RecurringSheet({ group: g, onClose, onAdd, onDismiss, onDelete }: {
  group: RecurringGroup; onClose: () => void; onAdd: (g: RecurringGroup) => void; onDismiss: (g: RecurringGroup) => void; onDelete: (g: RecurringGroup) => void
}) {
  const nav = useNavigate()
  const invalidate = useInvalidate()
  const options = g.amount_options ?? []
  const current = g.avg_amount != null ? Math.round(Math.abs(g.avg_amount) * 100) / 100 : null
  const manual = !!g.amount_is_manual
  const auto = async () => {
    if (!manual) return
    try { await recurringApi.update(g.id, { amount_is_manual: false }); invalidate(); toast('Importe automático') } catch (e) { toast(errText(e), { error: true }) }
  }
  const pick = async (amount: number) => {
    if (manual && amount === current) return
    try { await recurringApi.update(g.id, { avg_amount: amount }); invalidate(); toast(`Importe: ${fmt2(amount)} ${curSym()}`) } catch (e) { toast(errText(e), { error: true }) }
  }
  return (
    <Sheet open onClose={onClose} title={g.display_name}>
      {options.length > 1 && (
        <>
          <p style={{ margin: '0 0 2px', fontSize: 13, color: C.muted, fontWeight: 700 }}>Importe</p>
          {options.slice(0, 6).map(o => (
            <SheetOption key={o.amount} selected={manual && o.amount === current} title={`${fmt2(o.amount)} ${curSym()}`}
              sub={o.count === 1 ? `1 vez · ${shortDate(o.last_date)}` : `${o.count} veces · último ${shortDate(o.last_date)}`} onClick={() => pick(o.amount)} />
          ))}
          <SheetOption selected={!manual} title="Automático" sub={!manual && current != null ? `Media: ${fmt2(current)} ${curSym()}` : 'Media de sus movimientos'} onClick={auto} />
          <Divider margin="8px 0" />
        </>
      )}
      {!g.is_active && <SheetOption icon="plus" title="Añadir como recurrente" onClick={() => onAdd(g)} />}
      <SheetOption icon="receipt" title="Ver movimientos" onClick={() => { onClose(); nav(`/comercio/${encodeURIComponent(g.display_name)}`) }} />
      <SheetOption icon="close" title={g.is_active ? 'No es recurrente' : 'Descartar sugerencia'} onClick={() => onDismiss(g)} />
      <SheetOption icon="delete" title="Eliminar" onClick={() => onDelete(g)} />
    </Sheet>
  )
}

// ── Objetivos ───────────────────────────────────────────────────────────────

function goalLook(g: Goal): { icon: AnyIcon; color: string } {
  const t = catTone(g.category ?? g.name)
  if (t === 'otros') return { icon: 'umbrella', color: 'var(--c-8b85ff)' }
  return { icon: toneIcon(t), color: toneColors(t).fg }
}

export function Objetivos() {
  const money = useMoney()
  const goals = useQuery({ queryKey: ['goals'], queryFn: goalApi.list })
  const [edit, setEdit] = useState<Goal | 'new' | null>(null)
  const [contribute, setContribute] = useState(false)
  const list = (goals.data ?? []).filter(g => g.is_active)
  const today = new Date()
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: dashApi.accounts })
  const cashTotal = visibleAccounts(accounts.data ?? []).reduce((a, c) => a + c.balance, 0)
  const reserved = goalsReserved(list)

  return (
    <Page>
      <SubHeader title="Objetivos" back="/plan" actions={<RoundBtn icon="plus" label="Nuevo objetivo" onClick={() => setEdit('new')} />} />
      {goals.isLoading ? (
        <div style={{ margin: '12px 16px 0' }}><Skeleton h={120} /></div>
      ) : list.length === 0 ? (
        <Empty icon="safe-open" title="Sin objetivos" text="Ahorra para algo concreto y mira cómo avanza." action={<Btn icon="plus" onClick={() => setEdit('new')}>Nuevo objetivo</Btn>} />
      ) : (
        <>
          {accounts.data && (
            <section style={{ ...card, margin: '16px 16px 0', padding: '16px 20px' }}>
              <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>Disponible</p>
              <p style={{ margin: 0, fontSize: 30, fontWeight: 800 }}>{money(cashTotal - reserved, { euro: true })}</p>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted, fontWeight: 600 }}>{money(reserved, { euro: true })} apartados de {money(cashTotal, { euro: true })}</p>
            </section>
          )}
          {list.map(g => {
            const look = goalLook(g)
            const target = goalTarget(g)
            const pct = Math.round(g.progress_pct)
            return (
              <a key={g.id} role="button" tabIndex={0} onClick={() => setEdit(g)} onKeyDown={e => e.key === 'Enter' && setEdit(g)} style={{ ...card, display: 'block', margin: '12px 16px 0', padding: '16px 18px', color: C.text, cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <span style={{ width: 44, height: 44, borderRadius: 15, background: C.field, color: look.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name={look.icon} size={22} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 800 }}>{g.name}</span>
                    <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{goalSub(g, today)}</span>
                  </div>
                  <span style={{ fontWeight: 800 }}>{pct} %</span>
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={{ height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}><div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', borderRadius: 99, background: look.color }} /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                  <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>{fmtAuto(g.current_amount)} {curSym()}</span>
                  {target != null && <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>de {fmtAuto(target)} {curSym()}</span>}
                </div>
              </a>
            )
          })}
          <AllocationCard />
          <div style={{ margin: '16px 16px 0' }}>
            <Btn kind="secondary" icon="plus" onClick={() => setContribute(true)} style={{ background: C.card, boxShadow: 'var(--sh-card)' }}>Aportar a un objetivo</Btn>
          </div>
        </>
      )}
      {edit && <GoalSheet goal={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
      {contribute && <ContributeSheet goals={list} onClose={() => setContribute(false)} />}
    </Page>
  )
}

const ALLOC_PARTS = [
  { key: 'expenses_pct', label: 'Gastos', color: 'var(--c-ff9b9b)' },
  { key: 'savings_pct', label: 'Ahorro', color: 'var(--c-6fe0a5)' },
  { key: 'investment_pct', label: 'Inversión', color: C.accent },
] as const

/** Reparto del sueldo del mes entre gastos, ahorro e inversión (guardado por mes en el backend). */
function AllocationCard() {
  const money = useMoney()
  const month = monthKey(new Date())
  const alloc = useQuery({ queryKey: ['goal-allocation', month], queryFn: () => goalApi.getAllocation(month) })
  const trend = useQuery({ queryKey: ['monthly-trend', 3], queryFn: () => dashApi.monthlyTrend(3) })
  const [open, setOpen] = useState(false)
  const a = alloc.data
  if (!a) return null
  const months = (trend.data ?? []).filter(t => t.income > 0)
  const income = months.length ? months.reduce((s, t) => s + t.income, 0) / months.length : 0
  return (
    <>
      <a role="button" tabIndex={0} onClick={() => setOpen(true)} onKeyDown={e => e.key === 'Enter' && setOpen(true)}
        style={{ ...card, display: 'block', margin: '12px 16px 0', padding: '16px 18px', color: C.text, cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 800 }}>Reparto del sueldo</span>
          <span style={{ color: C.accentText, fontWeight: 800, fontSize: 14 }}>Editar</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 99, overflow: 'hidden', marginTop: 12, background: 'var(--track)' }}>
          {ALLOC_PARTS.map(p => <div key={p.key} style={{ width: `${a[p.key]}%`, background: p.color }} />)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
          {ALLOC_PARTS.map(p => (
            <div key={p.key} style={{ minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.muted, fontWeight: 700 }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: p.color }} />{p.label}
              </span>
              <span style={{ display: 'block', fontWeight: 800 }}>{Math.round(a[p.key])} %</span>
              {income > 0 && <span style={{ display: 'block', fontSize: 13, color: C.muted, fontWeight: 600 }}>{money(income * a[p.key] / 100, { euro: true, decimals: 0 })}</span>}
            </div>
          ))}
        </div>
      </a>
      {open && <AllocationSheet alloc={a} onClose={() => setOpen(false)} />}
    </>
  )
}

function AllocationSheet({ alloc, onClose }: { alloc: SavingsAllocation; onClose: () => void }) {
  const qc = useQueryClient()
  const [v, setV] = useState(() => Object.fromEntries(ALLOC_PARTS.map(p => [p.key, String(Math.round(alloc[p.key]))])) as Record<(typeof ALLOC_PARTS)[number]['key'], string>)
  const nums = ALLOC_PARTS.map(p => parseAmount(v[p.key]) ?? 0)
  const total = Math.round(nums.reduce((s, n) => s + n, 0) * 100) / 100
  const ok = total === 100 && nums.every(n => n >= 0)
  const save = useMutation({
    mutationFn: () => goalApi.upsertAllocation({ month: alloc.month, expenses_pct: nums[0], savings_pct: nums[1], investment_pct: nums[2] }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goal-allocation'] }); toast('Reparto guardado'); onClose() },
    onError: e => toast(errText(e), { error: true }),
  })
  return (
    <Sheet open onClose={onClose} title="Reparto del sueldo" actions={<Btn icon="check-mark" disabled={!ok || save.isPending} onClick={() => save.mutate()}>Guardar</Btn>}>
      <div style={{ display: 'grid', gap: 12 }}>
        {ALLOC_PARTS.map(p => (
          <Field key={p.key} label={`${p.label} (%)`} inputMode="decimal" value={v[p.key]} onChange={e => setV({ ...v, [p.key]: e.target.value })} />
        ))}
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: ok ? C.muted : C.red }}>{`Total ${total} %${ok ? '' : ' · debe sumar 100 %'}`}</p>
      </div>
    </Sheet>
  )
}

function GoalSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const invalidate = useInvalidate()
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal?.target_amount ? fmtAuto(goal.target_amount) : '')
  const [deadline, setDeadline] = useState(goal?.deadline?.slice(0, 10) ?? '')
  const value = parseAmount(target)
  const valid = name.trim().length > 0 && !!value && value > 0
  const save = useMutation({
    mutationFn: () => {
      const data = { name: name.trim(), type: 'EURO_TARGET' as const, target_amount: value!, deadline: deadline || null }
      return goal ? goalApi.update(goal.id, data) : goalApi.create({ ...data, current_amount: 0 })
    },
    onSuccess: () => { invalidate(); toast(goal ? 'Objetivo guardado' : 'Objetivo creado'); onClose() },
    onError: e => toast(errText(e), { error: true }),
  })
  async function remove() {
    if (!goal) return
    const ok = await confirm({ title: 'Eliminar objetivo', text: `Se eliminará ${goal.name}. Tus movimientos no cambian.`, action: 'Eliminar', danger: true })
    if (!ok) return
    try { await goalApi.delete(goal.id); invalidate(); toast('Objetivo eliminado'); onClose() } catch (e) { toast(errText(e), { error: true }) }
  }
  return (
    <Sheet open onClose={onClose} title={goal ? goal.name : 'Nuevo objetivo'}>
      <Field label="Nombre" placeholder="Vacaciones" value={name} onChange={e => setName(e.target.value)} autoFocus={!goal} />
      <Field label="Cantidad" inputMode="decimal" placeholder="0,00" value={target} onChange={e => setTarget(e.target.value)} trail={<span style={{ color: C.muted, fontWeight: 700 }}>{curSym()}</span>} />
      <Field label="Fecha límite" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} />
      <Btn disabled={!valid || save.isPending} onClick={() => save.mutate()} style={{ marginTop: 6 }}>Guardar</Btn>
      {goal && <Btn kind="ghost" onClick={remove} style={{ marginTop: 8, color: C.red }}>Eliminar objetivo</Btn>}
    </Sheet>
  )
}

function ContributeSheet({ goals, onClose }: { goals: Goal[]; onClose: () => void }) {
  const invalidate = useInvalidate()
  const [goal, setGoal] = useState<Goal | null>(goals.length === 1 ? goals[0] : null)
  const [amount, setAmount] = useState('')
  const value = parseAmount(amount)
  const save = useMutation({
    mutationFn: () => goalApi.update(goal!.id, { current_amount: Math.round((goal!.current_amount + value!) * 100) / 100 }),
    onSuccess: () => {
      const g = goal!
      invalidate()
      toast(`${fmtAuto(value!)} ${curSym()} a ${g.name}`, { undo: () => { goalApi.update(g.id, { current_amount: g.current_amount }).then(invalidate) } })
      onClose()
    },
    onError: e => toast(errText(e), { error: true }),
  })
  if (!goal) {
    return (
      <Sheet open onClose={onClose} title="Aportar a">
        {goals.map(g => <SheetOption key={g.id} icon={goalLook(g).icon} title={g.name} sub={`${Math.round(g.progress_pct)} %`} onClick={() => setGoal(g)} />)}
      </Sheet>
    )
  }
  return (
    <Sheet open onClose={onClose} title={`Aportar a ${goal.name}`}>
      <Field label="Cantidad" inputMode="decimal" placeholder="0,00" value={amount} autoFocus onChange={e => setAmount(e.target.value)} trail={<span style={{ color: C.muted, fontWeight: 700 }}>{curSym()}</span>}
        onKeyDown={e => { if (e.key === 'Enter' && value) save.mutate() }} />
      <Btn disabled={!value || value <= 0 || save.isPending} onClick={() => save.mutate()} style={{ marginTop: 6 }}>Aportar</Btn>
    </Sheet>
  )
}

// ── Deudas ──────────────────────────────────────────────────────────────────

function debtSub(d: Debt): string {
  if (d.description) return d.description
  if (d.payments.length > 0) {
    const last = d.payments.reduce((a, p) => (p.payment_date > a ? p.payment_date : a), '')
    return `${d.payments.length} ${d.payments.length === 1 ? 'pago' : 'pagos'} · último el ${shortDate(last)}`
  }
  if (d.due_date) return `Vence el ${new Date(`${d.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
  return `De ${fmt2(d.total_amount)} ${curSym()}`
}

export function Deudas() {
  const money = useMoney()
  const debts = useQuery({ queryKey: ['debts'], queryFn: debtApi.list })
  const [edit, setEdit] = useState<'new' | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)
  const setOpen = (d: Debt | null) => setOpenId(d?.id ?? null)
  const open = (debts.data ?? []).find(d => d.id === openId) ?? null
  const list = (debts.data ?? []).filter(d => !d.is_settled)
  const settled = (debts.data ?? []).filter(d => d.is_settled)
  const tot = debtTotals(list)
  const owed = list.filter(d => d.direction === 'OWED_TO_ME')
  const owe = list.filter(d => d.direction === 'I_OWE')

  const group = (items: Debt[], positive: boolean) => (
    <Section>
      {items.map((d, i) => (
        <div key={d.id}>
          {i > 0 && <Divider />}
          <a role="button" tabIndex={0} onClick={() => setOpen(d)} onKeyDown={e => e.key === 'Enter' && setOpen(d)} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto 18px', gap: 12, alignItems: 'center', padding: '9px 0', color: C.text, cursor: 'pointer' }}>
            <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', background: C.field, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>{d.name.trim().charAt(0).toUpperCase()}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{debtSub(d)}</span>
            </span>
            {d.is_settled
              ? <span style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', color: C.muted }}>{money(d.total_amount)}</span>
              : <span style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', color: positive ? C.green : C.red }}>{money(positive ? d.remaining_amount : -d.remaining_amount, { sign: true })}</span>}
            <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={18} /></span>
          </a>
        </div>
      ))}
    </Section>
  )

  return (
    <Page>
      <SubHeader title="Deudas" back="/plan" actions={<RoundBtn icon="plus" label="Nueva deuda" onClick={() => setEdit('new')} />} />
      {debts.isLoading ? (
        <div style={{ margin: '16px 16px 0' }}><Skeleton h={80} /></div>
      ) : list.length === 0 && settled.length === 0 ? (
        <Empty icon="receipt" title="Todo al día" text="Apunta lo que te deben o lo que debes." action={<Btn icon="plus" onClick={() => setEdit('new')}>Nueva deuda</Btn>} />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: '16px 16px 0' }}>
            <section style={{ ...card, margin: 0, padding: '14px 16px' }}>
              <span style={{ display: 'block', fontSize: 13, color: C.muted, fontWeight: 600 }}>Te deben</span>
              <span style={{ display: 'block', fontSize: 22, fontWeight: 800, color: C.green }}>{money(tot.owedToMe)}</span>
            </section>
            <section style={{ ...card, margin: 0, padding: '14px 16px' }}>
              <span style={{ display: 'block', fontSize: 13, color: C.muted, fontWeight: 600 }}>Debes</span>
              <span style={{ display: 'block', fontSize: 22, fontWeight: 800, color: C.red }}>{money(tot.iOwe)}</span>
            </section>
          </div>
          {owed.length > 0 && <><Label>Te deben</Label>{group(owed, true)}</>}
          {owe.length > 0 && <><Label>Debes</Label>{group(owe, false)}</>}
          {settled.length > 0 && <><Label>Saldadas</Label>{group(settled, true)}</>}
        </>
      )}
      {edit && <DebtSheet onClose={() => setEdit(null)} />}
      {open && <DebtDetailSheet debt={open} onClose={() => setOpen(null)} />}
    </Page>
  )
}

function DebtSheet({ onClose }: { onClose: () => void }) {
  const invalidate = useInvalidate()
  const [direction, setDirection] = useState<'OWED_TO_ME' | 'I_OWE'>('OWED_TO_ME')
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const value = parseAmount(amount)
  const valid = name.trim().length > 0 && !!value && value > 0
  const save = useMutation({
    mutationFn: () => debtApi.create({ name: name.trim(), total_amount: value!, direction, description: desc.trim() || null }),
    onSuccess: () => { invalidate(); toast('Deuda apuntada'); onClose() },
    onError: e => toast(errText(e), { error: true }),
  })
  return (
    <Sheet open onClose={onClose} title="Nueva deuda">
      <Segmented label="Tipo" value={direction} onChange={setDirection} options={[['OWED_TO_ME', 'Me deben'], ['I_OWE', 'Debo']]} style={{ margin: '0 0 14px' }} />
      <Field label={direction === 'OWED_TO_ME' ? 'Quién' : 'A quién o qué'} placeholder={direction === 'OWED_TO_ME' ? 'Laura' : 'Préstamo coche'} value={name} onChange={e => setName(e.target.value)} autoFocus />
      <Field label="Cantidad" inputMode="decimal" placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)} trail={<span style={{ color: C.muted, fontWeight: 700 }}>{curSym()}</span>} />
      <Field label="Concepto" placeholder="Cena del sábado" value={desc} onChange={e => setDesc(e.target.value)} />
      <Btn disabled={!valid || save.isPending} onClick={() => save.mutate()} style={{ marginTop: 6 }}>Guardar</Btn>
    </Sheet>
  )
}

function DebtDetailSheet({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const money = useMoney()
  const invalidate = useInvalidate()
  const [amount, setAmount] = useState(fmtAuto(debt.remaining_amount))
  const [date, setDate] = useState(todayIso())
  const value = parseAmount(amount)
  const pay = useMutation({
    mutationFn: () => debtApi.addPayment(debt.id, { amount: value!, payment_date: date || todayIso() }),
    onSuccess: () => { invalidate(); toast(value! >= debt.remaining_amount ? 'Deuda saldada' : 'Pago apuntado'); onClose() },
    onError: e => toast(errText(e), { error: true }),
  })
  async function remove() {
    const ok = await confirm({ title: 'Eliminar deuda', text: `Se eliminará ${debt.name} y sus pagos.`, action: 'Eliminar', danger: true })
    if (!ok) return
    try { await debtApi.delete(debt.id); invalidate(); toast('Deuda eliminada'); onClose() } catch (e) { toast(errText(e), { error: true }) }
  }
  async function removePayment(id: number) {
    const ok = await confirm({ title: 'Quitar pago', text: 'La deuda volverá a sumar ese importe.', action: 'Quitar', danger: true })
    if (!ok) return
    try { await debtApi.deletePayment(debt.id, id); invalidate(); toast('Pago quitado') } catch (e) { toast(errText(e), { error: true }) }
  }
  const owedToMe = debt.direction === 'OWED_TO_ME'
  const year = String(new Date().getFullYear())
  const payments = [...debt.payments].sort((a, b) => b.payment_date.localeCompare(a.payment_date))
  return (
    <Sheet open onClose={onClose} title={debt.name}>
      <div style={{ display: 'flex', justifyContent: 'space-between', margin: '0 4px 14px', fontWeight: 700 }}>
        <span style={{ color: C.muted }}>Quedan</span>
        <span style={{ color: owedToMe ? C.green : C.red }}>{money(debt.remaining_amount, { euro: true })}</span>
      </div>
      {!debt.is_settled && <>
        <Field label={owedToMe ? 'Te ha devuelto' : 'Has pagado'} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} trail={<span style={{ color: C.muted, fontWeight: 700 }}>{curSym()}</span>} />
        <Field label="Fecha" type="date" value={date} max={todayIso()} onChange={e => setDate(e.target.value)} />
        <Btn disabled={!value || value <= 0 || pay.isPending} onClick={() => pay.mutate()} style={{ marginTop: 6 }}>Apuntar pago</Btn>
      </>}
      {payments.length > 0 && <>
        <Label style={{ margin: '18px 4px 8px' }}>Pagos</Label>
        <div style={{ background: C.field, borderRadius: 18, padding: '2px 14px' }}>
          {payments.map((p, i) => (
            <div key={p.id}>
              {i > 0 && <Divider margin="0" />}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto 32px', gap: 10, alignItems: 'center', padding: '10px 0' }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700 }}>{shortDate(p.payment_date)}{p.payment_date.slice(0, 4) !== year ? ` ${p.payment_date.slice(0, 4)}` : ''}</span>
                  {p.note && <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.note}</span>}
                </span>
                <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{money(p.amount, { euro: true })}</span>
                <button type="button" aria-label={`Quitar pago del ${shortDate(p.payment_date)}`} onClick={() => removePayment(p.id)}
                  style={{ width: 32, height: 32, border: 0, borderRadius: 99, background: 'transparent', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </>}
      <Btn kind="ghost" onClick={remove} style={{ marginTop: 8, color: C.red }}>Eliminar deuda</Btn>
    </Sheet>
  )
}

// ── Mes a mes ───────────────────────────────────────────────────────────────

function SavingsLine({ values, id, sel }: { values: number[]; id: string; sel?: number }) {
  const w = 318
  const h = 80
  const pts = linePoints(values, w, h, 6)
  if (pts.length < 2) return null
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]
  const dot = pts[sel ?? pts.length - 1] ?? last
  return (
    <svg role="img" aria-label="Evolución" width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--c-6fe0a5)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--c-6fe0a5)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${last[0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="var(--c-6fe0a5)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={dot[0]} cy={dot[1]} r="4.5" fill="var(--c-6fe0a5)" stroke="var(--c-1a1b23)" strokeWidth="2" />
    </svg>
  )
}

/** PDF con el resumen y los movimientos de un mes o ciclo. */
async function exportCyclePdf(title: string, income: number, expenses: number, rows: MonthlyDetailRow[], file: string) {
  const [{ default: JsPDF }, { default: autoTable }, { formatEuro }] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('@/lib/format')])
  const doc = new JsPDF()
  doc.setFontSize(15)
  doc.text(`Resumen ${title}`, 14, 16)
  doc.setFontSize(10)
  doc.text(`Ingresos: ${formatEuro(income)}   Gastos: ${formatEuro(expenses)}   Ahorro: ${formatEuro(income - expenses, { sign: true })}`, 14, 24)
  autoTable(doc, {
    startY: 30,
    head: [['Fecha', 'Nombre', 'Categoría', 'Importe']],
    body: [...rows].sort((a, b) => a.date.localeCompare(b.date)).map(r => [r.date, r.name ?? '', r.category_name, formatEuro(r.amount, { sign: true })]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [40, 40, 60] },
    columnStyles: { 3: { halign: 'right' } },
  })
  doc.save(`${file}.pdf`)
}

export function MesAMes() {
  const money = useMoney()
  const nav = useNavigate()
  const today = useMemo(() => new Date(), [])
  const payroll = usePayrollCycle(0)
  const cycles = useMemo(
    () => (payroll.cycles.length ? payroll.cycles.slice(-10) : calendarCycles(today, 6)),
    [payroll.cycles, today],
  )
  const range = cycles.length ? { date_from: cycles[0].start, date_to: cycles[cycles.length - 1].end } : null
  const detail = useQuery({
    queryKey: ['cycles-detail', range],
    queryFn: () => dashApi.monthlyDetail(range!),
    enabled: !payroll.loading && !!range,
  })
  const rows = useMemo(() => cycleRows(cycles, detail.data ?? []), [cycles, detail.data])
  // Por defecto, el ciclo actual (el último).
  const [selKey, setSelKey] = useState<string | null>(null)
  const idx = Math.max(0, selKey ? rows.findIndex(r => r.key === selKey) : rows.length - 1)
  const cur = rows[idx]
  const prev = idx > 0 ? rows[idx - 1] : null
  const best = bestCycle(rows)
  const loading = payroll.loading || detail.isLoading
  const isCycle = payroll.isPayrollCycle
  const unit = isCycle ? 'ciclo' : 'mes'
  const name = (r: { label: string; start: string }) => (isCycle ? r.label : longMonth(r.start.slice(0, 7)))
  const investOn = usePreferencesStore(s => isModuleOn(s.prefs, 'investments'))
  const invested = useQuery({
    queryKey: ['monthly-investments', cur?.start, cur?.end],
    queryFn: () => dashApi.monthlyInvestments({ date_from: cur!.start, date_to: cur!.end }),
    enabled: investOn && !!cur,
  })
  const [exp, setExp] = useState(false)
  const [busy, setBusy] = useState(false)
  async function doExport(kind: 'pdf' | 'xlsx') {
    if (!cur) return
    setBusy(true)
    try {
      if (kind === 'xlsx') {
        await exportApi.download({ format: 'xlsx', period: 'range', date_from: cur.start, date_to: cur.end, sections: ['transactions', 'categories_by_month'] })
      } else {
        const rows = (detail.data ?? []).filter(r => r.date >= cur.start && r.date <= cur.end)
        await exportCyclePdf(name(cur), cur.income, cur.expenses, rows, `financemaster-${cur.start}_${cur.end}`)
      }
      setExp(false)
    } catch (e) { toast(e instanceof Error ? e.message : 'No se pudo exportar', { error: true }) }
    finally { setBusy(false) }
  }

  const select = (i: number) => {
    if (!rows[i]) return
    setSelKey(i === rows.length - 1 ? null : rows[i].key)
    scrollToTop(true)
  }

  let compare: ReactNode = null
  if (cur && prev && !loading) {
    const before = previousSpendAligned(cur, prev, detail.data ?? [], today)
    const diff = Math.round(cur.expenses - before)
    if (before > 0 && diff !== 0) {
      compare = (
        <Pill tone={diff < 0 ? 'green' : 'red'}>
          {money(Math.abs(diff), { decimals: 0, euro: true })} {diff < 0 ? 'menos' : 'más'} de gasto que el {unit} anterior
        </Pill>
      )
    }
  }

  const arrow = (dir: 'l' | 'r') => {
    const off = dir === 'l' ? idx === 0 : idx === rows.length - 1
    return (
      <RoundBtn icon={dir === 'l' ? 'chev-l' : 'chev-r'} label={`${unit} ${dir === 'l' ? 'anterior' : 'siguiente'}`} size={38} iconSize={18} bg={C.field}
        disabled={off} onClick={() => select(dir === 'l' ? idx - 1 : idx + 1)} style={{ opacity: off ? 0.35 : 1 }} />
    )
  }
  const tile = (icon: 'transfer-in' | 'transfer-out', label: string, color: string, value: number) => (
    <div style={{ background: C.field, borderRadius: 16, padding: '10px 12px' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color }}><Icon name={icon} size={15} />{label}</span>
      <span style={{ display: 'block', fontSize: 17, fontWeight: 800, marginTop: 2 }}>{money(value)}</span>
    </div>
  )

  return (
    <Page>
      <SubHeader title="Mes a mes" back="/plan" actions={cur && !loading ? <RoundBtn icon="export" label="Exportar" onClick={() => setExp(true)} /> : null} />
      {loading ? (
        <div style={{ margin: '16px 16px 0', display: 'grid', gap: 12 }}><Skeleton h={230} r={24} /><Skeleton h={130} r={24} /></div>
      ) : !cur ? (
        <Empty icon="calendar" title="Aún no hay meses" text="Cuando tengas movimientos verás aquí cada mes." />
      ) : (
        <>
          <section style={{ ...card, margin: '16px 16px 0', borderRadius: 24, padding: '14px 16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {arrow('l')}
              <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, color: C.muted, fontWeight: 700 }}>{cur.isOpen ? (isCycle ? 'Ciclo actual' : 'Este mes') : (isCycle ? 'Ciclo' : 'Mes')}</p>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{name(cur)}</p>
              </div>
              {arrow('r')}
            </div>
            <p style={{ margin: '16px 0 0', fontSize: 14, color: C.muted, fontWeight: 600 }}>{cur.isOpen ? 'Llevas ahorrado' : 'Ahorraste'}</p>
            <p style={{ margin: '2px 0 0', fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{money(cur.savings, { euro: true, sign: true })}</p>
            {compare && <div style={{ marginTop: 10 }}>{compare}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
              {tile('transfer-in', 'Entró', C.green, cur.income)}
              {tile('transfer-out', 'Salió', C.red, cur.expenses)}
            </div>
            {investOn && (invested.data?.invested ?? 0) > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: C.field, borderRadius: 16, padding: '10px 12px', marginTop: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: C.accentText }}><Icon name="invest" size={15} />Invertido</span>
                <span style={{ fontSize: 17, fontWeight: 800 }}>{money(invested.data!.invested)}</span>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Btn kind="ghost" height={44} onClick={() => nav(`/transacciones?periodo=${cur.key}`)}>Ver movimientos</Btn>
            </div>
          </section>

          {rows.length > 1 && (
            <section style={{ ...card, margin: '12px 16px 0', padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: 0 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Ahorro</h2>
                <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>media {money(cycleAverage(rows), { decimals: 0 })} {curSym()}/{unit}</span>
              </div>
              <div style={{ marginTop: 12 }}><SavingsLine values={rows.map(r => r.savings)} sel={idx} id="g-mesames" /></div>
            </section>
          )}

          <Section style={{ margin: '12px 16px 0' }}>
            {[...rows].reverse().map((r, i) => {
              const ri = rows.length - 1 - i
              const active = ri === idx
              return (
                <div key={r.key}>
                  {i > 0 && <Divider margin="0" />}
                  <button type="button" onClick={() => select(ri)} aria-pressed={active}
                    style={{ width: 'calc(100% + 16px)', margin: '0 -8px', display: 'grid', gridTemplateColumns: '1fr auto auto 18px', gap: 14, alignItems: 'center', padding: '12px 8px', border: 0, borderRadius: 14, background: active ? C.field : 'transparent', color: C.text, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                    <span style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                      {name(r)}
                      {r.key === best && <Pill>Mejor</Pill>}
                    </span>
                    <span style={{ textAlign: 'right' }}>
                      <span style={{ color: C.green, fontWeight: 700 }}>{money(r.income, { decimals: 0 })}</span>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted }}>{money(-Math.abs(r.expenses), { decimals: 0, sign: true })}</span>
                    </span>
                    <span style={{ fontWeight: 800, minWidth: 64, textAlign: 'right' }}>{money(r.savings, { decimals: 0, sign: true })}</span>
                    <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={18} /></span>
                  </button>
                </div>
              )
            })}
          </Section>
        </>
      )}
      <Sheet open={exp} onClose={() => !busy && setExp(false)} title={cur ? `Exportar ${name(cur)}` : 'Exportar'}>
        <SheetOption icon="file" title="PDF" onClick={() => doExport('pdf')} />
        <SheetOption icon="download" title="Excel" onClick={() => doExport('xlsx')} />
      </Sheet>
    </Page>
  )
}

// ── Logros ──────────────────────────────────────────────────────────────────

/** Racha actual y récord a partir de los movimientos de los últimos 90 días. */
function useStreak(enabled = true) {
  const from = new Date()
  from.setDate(from.getDate() - 90)
  const q = useQuery({
    queryKey: ['transactions', 'streak'],
    queryFn: () => txApi.list({ date_from: from.toISOString().slice(0, 10), page: 1, page_size: 200 }),
    enabled,
    staleTime: 60_000,
  })
  const dates = (q.data?.items ?? []).map(t => t.date)
  return { current: streakDays(dates, new Date()), best: longestStreak(dates), total: q.data?.total ?? 0, loading: q.isLoading }
}

export function Logros() {
  const streak = useStreak()
  const trend = useQuery({ queryKey: ['monthly-trend', 6], queryFn: () => dashApi.monthlyTrend(6) })
  const goals = useQuery({ queryKey: ['goals'], queryFn: goalApi.list })
  const debts = useQuery({ queryKey: ['debts'], queryFn: debtApi.list })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: dashApi.accounts })
  const all = useQuery({ queryKey: ['transactions', 'count'], queryFn: () => txApi.list({ page: 1, page_size: 1 }) })
  const list = badges({
    streak: streak.current,
    greenMonth: lastGreenMonth(trend.data ?? []),
    goals: goals.data?.length ?? 0,
    hasBroker: (accounts.data ?? []).some(a => BROKERS.includes(a.source)),
    txCount: all.data?.total ?? 0,
    debts: debts.data ?? [],
  })
  const best = Math.max(streak.best, streak.current)
  return (
    <Page>
      <SubHeader title="Logros" back="/plan" />
      <section style={{ ...card, margin: '16px 16px 0', padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ width: 52, height: 52, borderRadius: 18, background: 'var(--c-3a2e14)', color: 'var(--c-ffc979)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="flame" size={26} /></span>
          <div>
            <p style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>{streak.current} {streak.current === 1 ? 'día' : 'días'}</p>
            <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>de racha. Tu récord: {best}</span>
          </div>
        </div>
      </section>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, margin: '12px 16px 0' }}>
        {list.map(b => (
          <div key={b.id} style={{ ...card, borderRadius: 22, padding: '16px 10px', textAlign: 'center', opacity: b.unlocked ? 1 : 0.5 }}>
            <span style={{ width: 56, height: 56, borderRadius: '50%', background: b.unlocked ? 'var(--avatar)' : C.field, color: b.unlocked ? C.accentText : C.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={b.icon} size={26} /></span>
            <span style={{ display: 'block', fontWeight: 800, fontSize: 14, marginTop: 8 }}>{b.title}</span>
            <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{b.sub}</span>
          </div>
        ))}
      </div>
    </Page>
  )
}

/** Guarda de módulo: si está apagado, la ruta vuelve a Plan. */
export function useModuleGuard(id: ModuleId) {
  return useModule(id)
}
