// Inicio (tableros Main y PCInicio).
import { Fragment, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dashApi, goalApi, txApi } from '@/lib/api'
import { categoryBars, dateHeading, periodTotals, weekdayDay, worthChangePct } from '@/lib/home'
import { goalsReserved, nextRecurring, topGoal } from '@/lib/plan'
import { visibleAccounts } from '@/lib/accounts'
import { usePayrollCycle } from '@/hooks/usePayrollCycle'
import { usePeriodWords } from '@/hooks/usePeriodWords'
import { useAuthStore } from '@/store/auth'
import { usePreferencesStore } from '@/store/preferences'
import { openAdd } from '@/store/add'
import { useFeaturesStore } from '@/store/features'
import { usePrivacyStore } from '@/store/privacy'
import { Icon } from '@/ui/Icon'
import { C, Pill, RoundBtn, Ring, SkelChart, SkelHero, SkelRows, Skeleton, useMoney } from '@/ui/kit'
import { CardHead, CatBar, MerchantTile, Spark, TxRow, shortDayLabel } from '@/ui/tx'
import { PCHeader, useIsPC } from '@/app/Shell'
import { cycleEstimatedEnd } from '@/lib/cycles'
import { accountName, txNet, txTitle } from '@/lib/movements'
import type { HomeCard } from '@/lib/preferences'
import { Available } from './Cuentas'
import { cardBox, CustomizeHome, CustomizeLink, InsightsCard, PendingCard } from './InicioCards'

const card = { background: C.card, boxShadow: 'var(--sh-card)' } as const

export function pctText(p: number): string {
  const s = Math.abs(p).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${p >= 0 ? '+' : '−'}${s} %`
}

function useHomeData() {
  const features = useFeaturesStore(s => s.features)
  const cycle = usePayrollCycle(0)
  const range = { date_from: cycle.periodStart, date_to: cycle.periodEnd }
  const ready = !!cycle.periodStart && !!cycle.periodEnd
  const detail = useQuery({ queryKey: ['home-detail', range], queryFn: () => dashApi.monthlyDetail(range), enabled: ready })
  const cats = useQuery({ queryKey: ['home-cats', range], queryFn: () => dashApi.byCategory(range), enabled: ready })
  const worth = useQuery({ queryKey: ['net-worth', 12], queryFn: () => dashApi.netWorthHistory(12), enabled: features.accounts, staleTime: 5 * 60_000 })
  const upcoming = useQuery({ queryKey: ['upcoming', 30], queryFn: () => dashApi.upcoming(30), enabled: features.recurring })
  const goals = useQuery({ queryKey: ['goals'], queryFn: goalApi.list, enabled: features.goals })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: dashApi.accounts, enabled: features.accounts && features.goals })
  // Efectivo menos lo apartado para objetivos.
  const cash = visibleAccounts(accounts.data ?? []).reduce((a, c) => a + c.balance, 0)
  const reserved = goalsReserved(goals.data ?? [])
  const totals = useMemo(() => periodTotals(detail.data ?? []), [detail.data])
  const bars = useMemo(() => categoryBars(cats.data ?? [], 5), [cats.data])
  const history = worth.data ?? []
  return {
    features, totals, bars, loading: !ready || detail.isLoading || cats.isLoading || worth.isLoading,
    worthValue: history.length ? history[history.length - 1].net_worth : null,
    worthPct: worthChangePct(history),
    worthSeries: history.map(h => h.net_worth),
    next: nextRecurring(upcoming.data ?? []),
    goal: topGoal(goals.data ?? []),
    cash: accounts.data && goals.data ? { available: cash - reserved, reserved } : null,
    range,
    // Fin real previsto del ciclo (el rango de datos se alarga 45 días para coger apuntes futuros).
    cycleEnd: cycle.cycles.length ? cycleEstimatedEnd(cycle.cycles) : monthEnd(),
  }
}

function Hero({ pc, totals, end }: { pc?: boolean; totals: { income: number; expenses: number; left: number }; end?: string }) {
  const money = useMoney()
  const w = usePeriodWords()
  if (pc) return <PCHero totals={totals} end={end} />
  return (
    <section style={{ ...card, margin: '16px 16px 0', borderRadius: 28, padding: 20 }}>
      <p style={{ margin: 0, fontSize: 14, color: C.muted, fontWeight: 600 }}>Te quedan {w.this}</p>
      <p style={{ margin: '4px 0 0', fontSize: 44, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{money(totals.left, { euro: true })}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
        <Link to="/transacciones?tipo=ingresos" style={{ background: C.field, borderRadius: 16, padding: '10px 12px', color: C.text }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.green }}><Icon name="transfer-in" size={15} />Entró</span>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 800, marginTop: 2 }}>{money(totals.income)}</span>
        </Link>
        <Link to="/transacciones?tipo=gastos" style={{ background: C.field, borderRadius: 16, padding: '10px 12px', color: C.text }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.red }}><Icon name="transfer-out" size={15} />Salió</span>
          <span style={{ display: 'block', fontSize: 17, fontWeight: 800, marginTop: 2 }}>{money(totals.expenses)}</span>
        </Link>
      </div>
    </section>
  )
}

/** Días que quedan del periodo, contando hoy. */
function monthEnd(): string {
  const t = new Date()
  const e = new Date(t.getFullYear(), t.getMonth() + 1, 0)
  return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`
}

function daysLeft(end?: string): number | null {
  if (!end) return null
  const today = new Date()
  const t = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const [y, m, d] = end.slice(0, 10).split('-').map(Number)
  const n = Math.round((Date.UTC(y, m - 1, d) - t) / 86_400_000) + 1
  return n > 0 ? n : null
}

/** En PC la tarjeta ocupa el alto de su fila: arriba lo que queda, en medio el ritmo de gasto, abajo entradas y salidas. */
function PCHero({ totals, end }: { totals: { income: number; expenses: number; left: number }; end?: string }) {
  const money = useMoney()
  const w = usePeriodWords()
  const days = daysLeft(end)
  const used = totals.income > 0 ? Math.min(1, totals.expenses / totals.income) : totals.expenses > 0 ? 1 : 0
  const usedPct = Math.round(used * 100)
  const tone = used >= 1 ? C.red : used >= 0.85 ? 'var(--c-ffc27a)' : C.green
  return (
    <section style={{ ...card, borderRadius: 22, padding: '22px 24px', display: 'flex', flexDirection: 'column', minHeight: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 14, color: C.muted, fontWeight: 600 }}>Te quedan {w.this}</p>
          <p style={{ margin: '4px 0 0', fontSize: 46, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{money(totals.left, { euro: true })}</p>
        </div>
        {days != null && totals.left > 0 && (
          <div style={{ textAlign: 'right', flex: 'none' }}>
            <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 700 }}>{days === 1 ? 'Último día' : `${days} días por delante`}</span>
            <span style={{ display: 'block', fontSize: 20, fontWeight: 800, marginTop: 2 }}>{money(totals.left / days, { euro: true })}<span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}> / día</span></span>
          </div>
        )}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6 }}>
          <span>Gastado de lo que entró</span>
          <span style={{ color: C.text }}>{usedPct} %</span>
        </div>
        <div role="progressbar" aria-label="Gastado de lo que entró" aria-valuenow={usedPct} aria-valuemin={0} aria-valuemax={100}
          style={{ height: 8, borderRadius: 99, background: C.field, overflow: 'hidden' }}>
          <div style={{ width: `${usedPct}%`, height: '100%', borderRadius: 99, background: tone, transition: 'width .4s' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
        <Link to="/transacciones?tipo=ingresos" style={{ background: C.field, borderRadius: 16, padding: '12px 14px', color: C.text }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.green }}><Icon name="transfer-in" size={15} />Entró</span>
          <span style={{ display: 'block', fontSize: 19, fontWeight: 800, marginTop: 2 }}>{money(totals.income)}</span>
        </Link>
        <Link to="/transacciones?tipo=gastos" style={{ background: C.field, borderRadius: 16, padding: '12px 14px', color: C.text }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.red }}><Icon name="transfer-out" size={15} />Salió</span>
          <span style={{ display: 'block', fontSize: 19, fontWeight: 800, marginTop: 2 }}>{money(totals.expenses)}</span>
        </Link>
      </div>
    </section>
  )
}

function Worth({ pc, value, pct, series, cash }: { pc?: boolean; value: number; pct: number | null; series: number[]; cash: { available: number; reserved: number } | null }) {
  const money = useMoney()
  const pill = pct != null && <Pill tone={pct >= 0 ? 'green' : 'red'}>{pctText(pct)}</Pill>
  if (pc) {
    return (
      <Link to="/cuentas" style={{ ...card, display: 'block', borderRadius: 22, padding: '20px 24px', color: C.text }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span>
            <span style={{ display: 'block', fontSize: 13, color: C.muted, fontWeight: 600 }}>Patrimonio</span>
            <span style={{ display: 'block', fontSize: 26, fontWeight: 800 }}>{money(value, { euro: true })}</span>
          </span>
          {pill}
        </div>
        <div style={{ marginTop: 10 }}><Spark values={series} width={420} height={92} id="g-worth-pc" /></div>
        {cash && <Available {...cash} />}
      </Link>
    )
  }
  return (
    <Link to="/cuentas" style={{ ...card, display: 'block', margin: '12px 16px 0', borderRadius: 24, padding: '16px 18px 12px', color: C.text }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span>
          <span style={{ display: 'block', fontSize: 13, color: C.muted, fontWeight: 600 }}>Patrimonio</span>
          <span style={{ display: 'block', fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>{money(value, { euro: true })}</span>
        </span>
        {pill}
      </span>
      {series.length > 1 && <span style={{ display: 'block', marginTop: 8 }}><Spark values={series} width={318} height={58} id="g-worth" /></span>}
      {cash && <span style={{ display: 'block', paddingBottom: 4 }}><Available {...cash} /></span>}
    </Link>
  )
}

function ThisMonth({ pc, bars }: { pc?: boolean; bars: ReturnType<typeof categoryBars> }) {
  const nav = useNavigate()
  const w = usePeriodWords()
  const list = pc ? bars.slice(0, 5) : bars.slice(0, 4)
  return (
    <section style={pc ? { ...card, borderRadius: 22, padding: '20px 24px' } : { ...card, margin: '12px 16px 0', borderRadius: 24, padding: '16px 18px' }}>
      <CardHead title={w.This} link="ver todo" onLink={() => nav('/transacciones?agrupar=categoria')} />
      <div style={{ marginTop: 6 }}>
        {list.length === 0 && <p style={{ margin: '10px 0 4px', fontSize: 14, color: C.muted, fontWeight: 600 }}>Aún no hay gastos {w.this}</p>}
        {list.map(b => <CatBar key={b.name} name={b.name} total={b.total} ratio={b.ratio} tile={pc ? 34 : 32} pad={pc ? '8px 0' : '7px 0'} gap={pc ? 6 : 5} />)}
      </div>
    </section>
  )
}

function NextCharge({ pc, next }: { pc?: boolean; next: NonNullable<ReturnType<typeof nextRecurring>> }) {
  const money = useMoney()
  return (
    <section style={{ ...cardBox(pc), padding: pc ? '18px 24px' : '14px 18px' }}>
      <Link to="/recurrentes" style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: 0, color: C.text }}>
        <MerchantTile name={next.display_name} merchant={next.merchant} category={next.category?.name} type={next.category?.type} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{next.display_name}</span>
          <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}>{weekdayDay(next.next_expected_date!)} · próximo cargo</span>
        </span>
        <span style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{money(-Math.abs(next.avg_amount), { sign: true })}</span>
      </Link>
    </section>
  )
}

function GoalCard({ pc, goal }: { pc?: boolean; goal: NonNullable<ReturnType<typeof topGoal>> }) {
  const money = useMoney()
  const pct = Math.round(goal.progress_pct)
  return (
    <section style={{ ...cardBox(pc), padding: pc ? '18px 24px' : '14px 18px' }}>
      <Link to="/objetivos" style={{ display: 'flex', gap: 14, alignItems: 'center', color: C.text }}>
        <Ring ratio={pct / 100}>{pct}</Ring>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 800 }}>{goal.name}</span>
          <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>
            {goal.type === 'EURO_TARGET' && goal.target_amount
              ? `${money(goal.current_amount, { decimals: 0 })} de ${money(goal.target_amount, { decimals: 0, euro: true })}`
              : `${pct} % de ${goal.target_percent ?? 0} %`}
          </span>
        </div>
        <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={18} /></span>
      </Link>
    </section>
  )
}

function Recent({ pc }: { pc?: boolean }) {
  const nav = useNavigate()
  const today = useMemo(() => new Date(), [])
  const q = useQuery({ queryKey: ['tx-recent'], queryFn: () => txApi.list({ page: 1, page_size: 5 }) })
  return (
    <section style={pc ? { ...card, borderRadius: 22, padding: '20px 24px' } : { ...card, margin: '12px 16px 0', borderRadius: 24, padding: '16px 18px' }}>
      <CardHead title="Últimos movimientos" link="ver todos" onLink={() => nav('/transacciones')} />
      <div style={{ marginTop: 4 }}>
        {q.isLoading && <Skeleton h={200} r={16} />}
        {q.data?.items.length === 0 && <p style={{ margin: '10px 0 4px', fontSize: 14, color: C.muted, fontWeight: 600 }}>Aún no hay movimientos</p>}
        {q.data?.items.map(tx => <TxRow key={tx.id} tx={tx} sub={`${shortDayLabel(tx.date, today)} · ${accountName(tx.source)}`} />)}
      </div>
    </section>
  )
}

// ── Ultra simple (tableros UltraInicio y PCUltra) ───────────────────────────
const bigBtn = (primary: boolean, h: number, color?: string): CSSProperties => ({
  width: '100%', height: h, margin: 0, border: 0, borderRadius: 16, background: primary ? C.accent : C.card, color: primary ? C.white : (color ?? C.text),
  fontFamily: 'inherit', fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '0 9px 0 0', cursor: 'pointer', boxSizing: 'border-box', flex: 'none', ...(primary ? {} : { boxShadow: 'var(--sh-card)' }),
})

function useRecent() {
  return useQuery({ queryKey: ['tx-recent'], queryFn: () => txApi.list({ page: 1, page_size: 5 }) })
}

type HomeData = ReturnType<typeof useHomeData>
type Heading = ReturnType<typeof dateHeading>

function UltraInicio({ d, h }: { d: HomeData; h: Heading }) {
  const money = useMoney()
  const w = usePeriodWords()
  const hidden = usePrivacyStore(s => s.hidden)
  const toggle = usePrivacyStore(s => s.toggle)
  const recent = useRecent()
  const today = useMemo(() => new Date(), [])
  const last = recent.data?.items[0]
  const { income, expenses, left } = d.totals
  const ratio = income > 0 ? Math.max(0, Math.min(1, expenses / income)) : expenses > 0 ? 1 : 0
  return (
    <>
      <header style={{ padding: '22px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 500 }}>{h.day}</p>
          <h1 style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{h.month}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <RoundBtn icon={hidden ? 'eye-invisible' : 'eye-open'} label={hidden ? 'Mostrar importes' : 'Ocultar importes'} onClick={toggle} />
        </div>
      </header>
      {d.loading ? <SkelHero style={{ margin: '20px 16px 0' }} /> : (
        <section style={{ ...card, margin: '20px 16px 0', borderRadius: 28, padding: '22px 20px 20px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 14, color: C.muted, fontWeight: 600 }}>Te quedan {w.this}</p>
          <p style={{ margin: '6px 0 0', fontSize: 52, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>{money(left, { euro: true })}</p>
          <div style={{ margin: '18px 0 0' }}>
            <div style={{ height: 8, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.round(ratio * 100)}%`, height: '100%', borderRadius: 99, background: 'var(--c-8b85ff)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 13, fontWeight: 600 }}>
            <span style={{ color: C.muted }}>Gastado <span style={{ color: C.text, fontWeight: 800 }}>{money(expenses)}</span></span>
            <span style={{ color: C.muted }}>Entró <span style={{ color: C.green, fontWeight: 800 }}>{money(income)}</span></span>
          </div>
        </section>
      )}
      <div style={{ margin: '14px 16px 0', display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 10 }}>
        <button type="button" onClick={() => openAdd('expense')} style={bigBtn(true, 60)}><Icon name="plus" size={20} />Añadir gasto</button>
        <button type="button" onClick={() => openAdd('income')} style={bigBtn(false, 60, C.green)}><Icon name="transfer-in" size={20} />Ingreso</button>
      </div>
      {d.loading ? <SkelRows n={4} style={{ margin: '22px 16px 0' }} /> : (
        <section style={{ ...card, margin: '22px 16px 0', borderRadius: 24, padding: '16px 18px' }}>
          <CardHead title="Gasto por categoría" />
          <div style={{ marginTop: 6 }}>
            {d.bars.length === 0 && <p style={{ margin: '10px 0 4px', fontSize: 14, color: C.muted, fontWeight: 600 }}>Aún no hay gastos {w.this}</p>}
            {d.bars.slice(0, 4).map(b => <CatBar key={b.name} name={b.name} total={b.total} ratio={b.ratio} tile={32} />)}
          </div>
        </section>
      )}
      {last && (
        <section style={{ ...card, margin: '12px 16px 0', borderRadius: 24, padding: '14px 16px' }}>
          <Link to={`/transacciones/${last.id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto 18px', gap: 12, alignItems: 'center', padding: 0, color: C.text }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txTitle(last)}</span>
              <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}>Último movimiento · {shortDayLabel(last.date, today).toLowerCase()}</span>
            </span>
            <span style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap', ...(txNet(last) > 0 ? { color: C.green } : {}) }}>{money(txNet(last), { sign: true })}</span>
            <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={18} /></span>
          </Link>
        </section>
      )}
    </>
  )
}

function PCUltraInicio({ d, h }: { d: HomeData; h: Heading }) {
  const money = useMoney()
  const w = usePeriodWords()
  const nav = useNavigate()
  const recent = useRecent()
  const today = useMemo(() => new Date(), [])
  const box = { background: C.field, borderRadius: 16, padding: '10px 12px', color: C.text } as const
  return (
    <>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, margin: '0 0 22px' }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>Modo ultra simple</p>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>{h.month}</h1>
        </div>
      </header>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 980, alignItems: 'start' }}>
        {d.loading ? <Skeleton h={300} r={22} /> : (
          <section style={{ ...card, borderRadius: 22, padding: '28px 30px' }}>
            <p style={{ margin: 0, fontSize: 16, color: C.muted, fontWeight: 600 }}>Te quedan {w.this}</p>
            <p style={{ margin: '6px 0 0', fontSize: 64, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1 }}>{money(d.totals.left, { euro: true })}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              <Link to="/transacciones?tipo=ingresos" style={box}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.green }}><Icon name="transfer-in" size={15} />Entró</span>
                <span style={{ display: 'block', fontSize: 17, fontWeight: 800, marginTop: 2 }}>{money(d.totals.income)}</span>
              </Link>
              <Link to="/transacciones?tipo=gastos" style={box}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: C.red }}><Icon name="transfer-out" size={15} />Salió</span>
                <span style={{ display: 'block', fontSize: 17, fontWeight: 800, marginTop: 2 }}>{money(d.totals.expenses)}</span>
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 22 }}>
              <button type="button" onClick={() => openAdd('expense')} style={{ ...bigBtn(true, 56), flex: 1, width: 'auto' }}><Icon name="minus" size={20} />Gasto</button>
              <button type="button" onClick={() => openAdd('income')} style={{ ...bigBtn(false, 56), flex: 1, width: 'auto' }}><Icon name="plus" size={20} />Ingreso</button>
            </div>
          </section>
        )}
        <section style={{ ...card, borderRadius: 22, padding: '22px 24px' }}>
          <CardHead title="Últimos" link={recent.data?.items.length ? 'ver todos' : undefined} onLink={() => nav('/transacciones')} />
          <div style={{ marginTop: 4 }}>
            {recent.isLoading && <Skeleton h={200} r={16} />}
            {recent.data?.items.length === 0 && <p style={{ margin: '10px 0 4px', fontSize: 14, color: C.muted, fontWeight: 600 }}>Aún no hay movimientos</p>}
            {recent.data?.items.slice(0, 4).map(tx => <TxRow key={tx.id} tx={tx} sub={shortDayLabel(tx.date, today)} />)}
          </div>
        </section>
      </div>
    </>
  )
}

/** Tarjetas que se pueden mostrar con los módulos activos. */
function availableCards(d: HomeData): HomeCard[] {
  const f = d.features
  const out: HomeCard[] = ['hero', 'month', 'insights', 'recent']
  if (f.accounts) out.push('worth')
  if (f.recurring) out.push('pending', 'next')
  if (f.goals) out.push('goal')
  return out
}

function HomeCards({ pc, d }: { pc?: boolean; d: HomeData }) {
  const order = usePreferencesStore(s => s.prefs.home_cards)
  const avail = availableCards(d)
  const render = (c: HomeCard): ReactNode => {
    switch (c) {
      case 'hero': return <Hero pc={pc} totals={d.totals} end={d.cycleEnd} />
      case 'recent': return <Recent pc={pc} />
      case 'worth': return d.worthValue != null ? <Worth pc={pc} value={d.worthValue} pct={d.worthPct} series={d.worthSeries} cash={d.cash} /> : null
      case 'month': return <ThisMonth pc={pc} bars={d.bars} />
      case 'pending': return <PendingCard pc={pc} start={d.range.date_from} end={d.range.date_to} />
      case 'next': return d.next ? <NextCharge pc={pc} next={d.next} /> : null
      case 'goal': return d.goal ? <GoalCard pc={pc} goal={d.goal} /> : null
      case 'insights': return <InsightsCard pc={pc} />
    }
  }
  return <>{order.filter(c => avail.includes(c)).map(c => <Fragment key={c}>{render(c)}</Fragment>)}</>
}

export default function Inicio() {
  const pc = useIsPC()
  const user = useAuthStore(s => s.user)
  const hidden = usePrivacyStore(s => s.hidden)
  const toggle = usePrivacyStore(s => s.toggle)
  const h = dateHeading(new Date())
  const d = useHomeData()
  const name = user?.display_name || user?.username || ''
  const ultra = usePreferencesStore(s => s.prefs.ui_mode === 'ultra')
  const [custom, setCustom] = useState(false)
  const customize = <CustomizeHome open={custom} onClose={() => setCustom(false)} available={availableCards(d)} />

  if (ultra) return pc ? <PCUltraInicio d={d} h={h} /> : <UltraInicio d={d} h={h} />

  if (pc) {
    return (
      <>
        <PCHeader sub={h.day} title={h.month} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {d.loading ? (
            <>
              <Skeleton h={190} r={22} />
              {d.features.accounts && <Skeleton h={190} r={22} />}
              <Skeleton h={260} r={22} />
            </>
          ) : <HomeCards pc d={d} />}
        </div>
        <CustomizeLink onClick={() => setCustom(true)}>Personalizar Inicio</CustomizeLink>
        {customize}
      </>
    )
  }

  return (
    <>
      <header style={{ padding: '22px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 500 }}>{h.day}</p>
          <h1 style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{h.month}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <RoundBtn icon={hidden ? 'eye-invisible' : 'eye-open'} label={hidden ? 'Mostrar importes' : 'Ocultar importes'} onClick={toggle} />
          <Link to="/ajustes/perfil" aria-label="Perfil" style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--avatar)', color: C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flex: 'none' }}>{(name || '?').charAt(0).toUpperCase()}</Link>
        </div>
      </header>
      {d.loading ? (
        <>
          <SkelHero style={{ margin: '18px 16px 0' }} />
          {d.features.accounts && <SkelChart style={{ margin: '12px 16px 0' }} />}
          <SkelRows n={4} style={{ margin: '12px 16px 0' }} />
        </>
      ) : (
        <>
          <HomeCards d={d} />
          <CustomizeLink onClick={() => setCustom(true)}>Personalizar Inicio</CustomizeLink>
        </>
      )}
      {customize}
    </>
  )
}
