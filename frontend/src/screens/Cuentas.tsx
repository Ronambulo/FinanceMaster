// Cuentas (tablero Cuentas / PCCuentas), cuenta bancaria (Banco), bróker (Broker) y hoja Añadir cuenta.
import { cur } from '@/lib/format'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { dashApi, goalApi, miApi, portfolioApi, trApi, txApi, type AccountBalance, type PortfolioPosition } from '@/lib/api'
import {
  ASSET_COLOR, ASSET_LABEL, BROKERS, accountSub, assetKind, assetMix, balanceSeries, brokerKey, brokerSub,
  holdingsByBroker, positionsReturn, sharesLabel, trWarning, visibleAccounts, worthSplit, type AssetSlice,
} from '@/lib/accounts'
import { accountName, dayLabel, kindToType, parseAmount } from '@/lib/movements'
import { pctText } from '@/screens/Inicio'
import { useIsPC } from '@/app/Shell'
import { BankLogo, type BankId } from '@/ui/BankLogo'
import { Icon } from '@/ui/Icon'
import { confirm } from '@/ui/Confirm'
import { toast } from '@/ui/Toast'
import { Spark, TxRow } from '@/ui/tx'
import { Btn, C, Divider, Empty, Field, Header, Label, Pill, RoundBtn, Row, Section, Sheet, SheetOption, Skeleton, SubHeader, useMoney } from '@/ui/kit'
import { create } from 'zustand'
import { useFeaturesStore } from '@/store/features'
import { goalsReserved } from '@/lib/plan'

const card = { background: C.card, boxShadow: 'var(--sh-card)' }
const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Algo ha fallado')

// ── Datos compartidos ───────────────────────────────────────────────────────
function useAccountsData() {
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: dashApi.accounts })
  const perf = useQuery({ queryKey: ['portfolio-performance'], queryFn: portfolioApi.performance })
  const worth = useQuery({ queryKey: ['net-worth', 12], queryFn: () => dashApi.netWorthHistory(12), staleTime: 5 * 60_000 })
  const cash = visibleAccounts(accounts.data ?? [])
  const positions = perf.data?.positions ?? []
  const brokers = holdingsByBroker(positions)
  const cashTotal = cash.reduce((a, c) => a + c.balance, 0)
  const invested = brokers.reduce((a, b) => a + b.value, 0)
  const goalsOn = useFeaturesStore(s => s.features.goals)
  const goals = useQuery({ queryKey: ['goals'], queryFn: goalApi.list, enabled: goalsOn })
  // Lo apartado para objetivos sale del efectivo: lo que queda es lo disponible.
  const reserved = goalsOn ? goalsReserved(goals.data ?? []) : 0
  return { reserved, available: cashTotal - reserved, loading: accounts.isLoading || perf.isLoading || worth.isLoading, history: (worth.data ?? []).map(p => p.net_worth), cash, positions, brokers, cashTotal, invested, split: worthSplit(cashTotal, invested) }
}

// ── Hoja Añadir cuenta ──────────────────────────────────────────────────────
const useAddAccount = create<{ open: boolean }>(() => ({ open: false }))
export const openAddAccount = () => useAddAccount.setState({ open: true })

const NEW_ACCOUNTS: { id: BankId; title: string; to: string }[] = [
  { id: 'n26', title: 'N26', to: '/importar?origen=n26' },
  { id: 'revolut', title: 'Revolut', to: '/importar?origen=revolut' },
  { id: 'bbva', title: 'BBVA', to: '/importar?origen=bbva' },
  { id: 'caixabank', title: 'CaixaBank', to: '/importar' },
  { id: 'trade_republic', title: 'Trade Republic', to: '/cuentas/trade-republic' },
  { id: 'myinvestor', title: 'MyInvestor', to: '/importar?origen=myinvestor' },
]

export function AddAccountSheet() {
  const open = useAddAccount(s => s.open)
  const nav = useNavigate()
  const close = () => useAddAccount.setState({ open: false })
  const go = (to: string) => { close(); nav(to) }
  const tile = (key: string, lead: ReactNode, title: string, onClick: () => void) => (
    <button key={key} type="button" onClick={onClick} style={{ border: 0, borderRadius: 20, background: C.field, color: C.text, padding: '14px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, font: "700 12px 'Manrope', sans-serif", lineHeight: 1.2, textAlign: 'center', cursor: 'pointer' }}>
      {lead}{title}
    </button>
  )
  const plain = (icon: 'wallet' | 'edit') => (
    <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 13, background: C.field, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} /></span>
  )
  return (
    <Sheet open={open} onClose={close} title="Añadir cuenta">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {NEW_ACCOUNTS.map(a => tile(a.id, <BankLogo id={a.id} />, a.title, () => go(a.to)))}
        {tile('cash', plain('wallet'), 'Efectivo', () => go('/cuentas/manual'))}
        {tile('manual', plain('edit'), 'Manual', () => go('/cuentas/manual'))}
      </div>
      <button type="button" onClick={() => go('/importar')} style={{ width: '100%', marginTop: 12, border: 0, borderRadius: 16, background: 'transparent', color: C.accentText, height: 48, font: "800 15px 'Manrope', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 9px 0 0', cursor: 'pointer' }}>
        <Icon name="plus" size={18} />Otro banco por CSV
      </button>
    </Sheet>
  )
}

// ── Piezas ──────────────────────────────────────────────────────────────────
function Dot({ color }: { color: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flex: 'none' }} />
}

/** Efectivo disponible una vez apartado lo de los objetivos. */
export function Available({ available, reserved }: { available: number; reserved: number }) {
  const money = useMoney()
  const box = { background: C.field, borderRadius: 16, padding: '10px 12px', color: C.text, minWidth: 0 }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10, marginTop: 14 }}>
      <span style={box}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted }}>Disponible</span>
        <span style={{ display: 'block', fontSize: 17, fontWeight: 800, marginTop: 2 }}>{money(available, { euro: true })}</span>
      </span>
      <Link to="/objetivos" style={box}>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted }}>En objetivos</span>
        <span style={{ display: 'block', fontSize: 17, fontWeight: 800, marginTop: 2 }}>{money(reserved, { euro: true })}</span>
      </Link>
    </div>
  )
}

function SectionHead({ title, total }: { title: string; total: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '20px 22px 8px' }}>
      <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>{title}</span>
      <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>{total}</span>
    </div>
  )
}

function ReturnText({ pct }: { pct: number | null }) {
  if (pct == null) return null
  return <span style={{ display: 'block', fontSize: 12, fontWeight: 700, textAlign: 'right', color: pct >= 0 ? C.green : C.red }}>{pctText(pct)}</span>
}

function Donut({ slices, size = 112 }: { slices: AssetSlice[]; size?: number }) {
  const r = size / 2 - 8
  const len = 2 * Math.PI * r
  const gap = slices.length > 1 ? 3 : 0
  let offset = 0
  return (
    <span style={{ position: 'relative', width: size, height: size, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg role="img" aria-label="Reparto" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0 }}>
        {slices.map(s => {
          const dash = Math.max((s.pct / 100) * len - gap, 0.5)
          const el = <circle key={s.kind} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ASSET_COLOR[s.kind]} strokeWidth="16" strokeDasharray={`${dash} ${len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          offset += (s.pct / 100) * len
          return el
        })}
      </svg>
      <span style={{ position: 'relative', fontSize: 12, color: C.muted, fontWeight: 700 }}>{slices.length === 1 ? '1 tipo' : `${slices.length} tipos`}</span>
    </span>
  )
}

function Legend({ slices }: { slices: AssetSlice[] }) {
  return (
    <div style={{ flex: 1, width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {slices.map(s => (
        <span key={s.kind} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700 }}>
          <Dot color={ASSET_COLOR[s.kind]} />{ASSET_LABEL[s.kind]}
          <span style={{ marginLeft: 'auto', color: C.muted }}>{s.pct} %</span>
        </span>
      ))}
    </div>
  )
}

const TICKER_BG = ['var(--c-a8323e)', 'var(--c-1b1b1b)', 'var(--c-5b6070)', 'var(--c-c77700)', 'var(--c-13294b)', 'var(--c-36a18b)', 'var(--c-0b7fab)']
function tickerBg(s: string) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TICKER_BG[h % TICKER_BG.length]
}
const ticker = (p: PortfolioPosition) => (p.symbol || p.name || '?').replace(/\..*$/, '').slice(0, 5).toUpperCase()

function SyncBar({ broker, compact }: { broker: string; compact?: boolean }) {
  const qc = useQueryClient()
  const nav = useNavigate()
  const tr = broker === 'trade_republic'
  const status = useQuery({ queryKey: [tr ? 'tr-status' : 'mi-status'], queryFn: () => (tr ? trApi.status() : miApi.status()) })
  const sync = useMutation({
    mutationFn: () => trApi.sync(),
    onSuccess: r => { qc.invalidateQueries(); toast(r.synced ? `${r.synced} movimientos nuevos` : 'Todo al día') },
    onError: e => nav('/cuentas/sync-error', { state: { source: 'trade_republic', message: errText(e) } }),
  })
  if (!tr || !status.data) return null
  const s = status.data
  const when = s.last_sync ? `${dayLabel(s.last_sync, new Date())}, ${new Date(s.last_sync).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : null
  const ok = s.connected
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.field, borderRadius: compact ? 14 : 16, padding: compact ? '8px 8px 8px 14px' : '10px 10px 10px 14px', marginTop: compact ? 0 : 16 }}>
      <span style={{ color: ok ? C.green : 'var(--c-ffc27a)', display: 'flex' }}><Icon name={ok ? 'feedback-success' : 'feedback-warning'} size={18} /></span>
      <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{ok ? (when ? `Sincronizado ${when.charAt(0).toLowerCase()}${when.slice(1)}` : 'Conectado') : 'Sin conexión'}</span>
      <button type="button" disabled={sync.isPending} onClick={() => (ok ? sync.mutate() : nav('/cuentas/trade-republic'))}
        style={{ height: 36, border: 0, borderRadius: 12, background: C.accent, color: C.white, font: "800 13px 'Manrope', sans-serif", display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 0 10px', cursor: 'pointer', opacity: sync.isPending ? 0.7 : 1 }}>
        <Icon name={ok ? 'refresh' : 'link'} size={16} />{ok ? (sync.isPending ? 'Sincronizando' : 'Sincronizar') : 'Conectar'}
      </button>
    </div>
  )
}

// ── Cuentas ─────────────────────────────────────────────────────────────────
export default function Cuentas() {
  const pc = useIsPC()
  const money = useMoney()
  const d = useAccountsData()
  const empty = !d.loading && d.cash.length === 0 && d.brokers.length === 0
  const brokerReturn = (b: string) => positionsReturn(d.positions.filter(p => brokerKey(p) === b))
  const hasTR = d.brokers.some(b => b.broker === 'trade_republic') || d.cash.some(c => c.source === 'trade_republic')
  const trStatus = useQuery({ queryKey: ['tr-status'], queryFn: trApi.status, enabled: hasTR })
  const warn = trWarning(trStatus.data, hasTR)

  const worthCard = (
    <section style={{ ...card, margin: '16px 16px 0', borderRadius: 28, padding: '18px 20px' }}>
      <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>Patrimonio</p>
      <p style={{ margin: '2px 0 0', fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em' }}>{money(d.split.total, { euro: true })}</p>
      {(d.split.cashPct > 0 || d.split.investedPct > 0) && (
        <>
          <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', gap: 3, margin: '14px 0 10px' }}>
            {d.split.cashPct > 0 && <span style={{ width: `${d.split.cashPct}%`, background: C.green }} />}
            {d.split.investedPct > 0 && <span style={{ flex: 1, background: 'var(--c-8b85ff)' }} />}
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, fontWeight: 700 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot color={C.green} />Efectivo {d.split.cashPct} %</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot color="var(--c-8b85ff)" />Invertido {d.split.investedPct} %</span>
          </div>
        </>
      )}
      {d.reserved > 0 && <Available available={d.available} reserved={d.reserved} />}
    </section>
  )

  const cashRows = d.cash.map((a, i) => (
    <div key={a.source}>
      {i > 0 && <Divider />}
      <Row lead={<BankLogo source={a.source} />} title={a.label || accountName(a.source)} sub={accountSub(a.source)} trail={money(a.balance)} chevron to={`/cuentas/${a.source}`} />
    </div>
  ))
  const brokerRows = d.brokers.map((b, i) => (
    <div key={b.broker}>
      {i > 0 && <Divider />}
      <Row lead={<BankLogo source={b.broker} />} title={accountName(b.broker)} sub={brokerSub(b.broker)}
        trail={<span style={{ display: 'block', textAlign: 'right' }}>{money(b.value)}<ReturnText pct={brokerReturn(b.broker)} /></span>} chevron to={`/cuentas/broker/${b.broker}`} />
    </div>
  ))

  if (pc) return <CuentasPC d={d} />

  return (
    <div style={{ paddingBottom: 120 }}>
      <Header title="Cuentas" actions={<RoundBtn icon="plus" label="Añadir cuenta" onClick={openAddAccount} />} />
      {d.loading ? <div style={{ margin: '16px 16px 0', display: 'grid', gap: 12 }}><Skeleton h={150} r={28} /><Skeleton h={180} /></div>
        : empty ? <Empty icon="bank-card" title="Aún no hay cuentas" text="Importa un extracto o conecta tu bróker." action={<Btn icon="plus" onClick={openAddAccount} style={{ padding: '0 9px 0 0' }}>Añadir cuenta</Btn>} />
          : (
            <>
              {worthCard}
              {warn && (
                <Link to={trStatus.data?.connected ? '/cuentas/broker/trade_republic' : '/cuentas/trade-republic'} style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 16px 0', background: 'var(--c-3a2e14)', color: 'var(--c-ffc979)', borderRadius: 18, padding: '12px 14px' }}>
                  <span style={{ display: 'flex' }}><Icon name="feedback-warning" size={20} /></span>
                  <span style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{warn}</span>
                  <span style={{ display: 'flex' }}><Icon name="chev-r" size={18} /></span>
                </Link>
              )}
              {d.cash.length > 0 && <><SectionHead title="Efectivo" total={money(d.cashTotal)} /><Section>{cashRows}</Section></>}
              {d.brokers.length > 0 && <><SectionHead title="Invertido" total={money(d.invested)} /><Section>{brokerRows}</Section></>}
            </>
          )}
      <AddAccountSheet />
    </div>
  )
}

type PCSel = { kind: 'cash' | 'broker'; source: string } | null

function CuentasPC({ d }: { d: ReturnType<typeof useAccountsData> }) {
  const money = useMoney()
  const [sel, setSel] = useState<PCSel>(null)
  const isSel = (kind: 'cash' | 'broker', source: string) => sel?.kind === kind && sel.source === source
  const pick = (kind: 'cash' | 'broker', source: string) => setSel(isSel(kind, source) ? null : { kind, source })
  const brokerReturn = (b: string) => positionsReturn(d.positions.filter(p => brokerKey(p) === b))
  const count = d.cash.length + d.brokers.length

  const item = (key: string, active: boolean, onClick: () => void, lead: ReactNode, title: string, sub: ReactNode, value: ReactNode) => (
    <button key={key} type="button" onClick={onClick} aria-pressed={active}
      style={{ width: '100%', display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 14, alignItems: 'center', padding: 10, border: 0, borderRadius: 14, background: active ? C.field : 'transparent', color: C.text, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
      {lead}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{sub}</span>
      </span>
      <span style={{ fontWeight: 800, textAlign: 'right' }}>{value}</span>
    </button>
  )
  const head = (title: string, total: number) => (
    <>
      <div style={{ borderTop: `1px solid ${C.line}`, margin: '6px 10px 0' }} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '10px 10px 2px' }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{title}</h2>
        <span style={{ fontSize: 13, color: C.muted, fontWeight: 800 }}>{money(total, { euro: true })}</span>
      </div>
    </>
  )

  let right: ReactNode
  if (sel === null) right = <SummaryPC d={d} onPick={(kind, source) => setSel({ kind, source })} />
  else if (sel.kind === 'cash') right = <section style={{ ...card, borderRadius: 22, padding: '22px 24px' }}><BankPanel key={sel.source} source={sel.source} embedded /></section>
  else right = <BrokerCardPC broker={sel.source} positions={d.positions} cash={d.cash} />

  return (
    <div>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, margin: '0 0 22px' }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>Patrimonio {money(d.split.total, { euro: true })}</p>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>Cuentas</h1>
        </div>
      </header>
      {d.loading ? <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16 }}><Skeleton h={320} r={22} /><Skeleton h={420} r={22} /></div>
        : count === 0 ? (
          <section style={{ ...card, borderRadius: 22, padding: '22px 24px' }}>
            <Empty icon="bank-card" title="Aún no hay cuentas" text="Importa un extracto o conecta tu bróker." action={<Btn icon="plus" onClick={openAddAccount} style={{ padding: '0 9px 0 0' }}>Añadir cuenta</Btn>} />
          </section>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
            <section style={{ ...card, borderRadius: 22, padding: '10px 10px 12px', display: 'grid', gap: 2 }}>
              {item('all', sel === null, () => setSel(null),
                <span style={{ width: 40, height: 40, borderRadius: 14, background: C.soft, color: C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="pie" size={20} /></span>,
                'Todas las cuentas', `${count} ${count === 1 ? 'cuenta' : 'cuentas'}`, money(d.split.total, { euro: true }))}
              <Btn kind="secondary" icon="plus" height={42} onClick={openAddAccount} style={{ background: C.field, boxShadow: 'none', margin: '4px 0 2px', padding: '0 18px 0 13px' }}>Añadir cuenta</Btn>
              {d.cash.length > 0 && head('Bancos y efectivo', d.cashTotal)}
              {d.cash.map(a => item(`c-${a.source}`, isSel('cash', a.source), () => pick('cash', a.source), <BankLogo source={a.source} />, a.label || accountName(a.source), accountSub(a.source), money(a.balance, { euro: true })))}
              {d.brokers.length > 0 && head('Invertido', d.invested)}
              {d.brokers.map(b => item(`b-${b.broker}`, isSel('broker', b.broker), () => pick('broker', b.broker), <BankLogo source={b.broker} />, accountName(b.broker), brokerSub(b.broker),
                <span style={{ display: 'block' }}>{money(b.value, { euro: true })}<ReturnText pct={brokerReturn(b.broker)} /></span>))}
            </section>
            {right}
          </div>
        )}
      <AddAccountSheet />
    </div>
  )
}

/** Panel derecho por defecto: la suma de todas las cuentas. */
function SummaryPC({ d, onPick }: { d: ReturnType<typeof useAccountsData>; onPick: (kind: 'cash' | 'broker', source: string) => void }) {
  const money = useMoney()
  const history = d.history
  const first = history.length > 1 ? history[0] : null
  const change = first ? ((d.split.total - first) / Math.abs(first)) * 100 : null
  const rows = [
    ...d.cash.map(a => ({ kind: 'cash' as const, source: a.source, title: a.label || accountName(a.source), value: a.balance })),
    ...d.brokers.map(b => ({ kind: 'broker' as const, source: b.broker, title: accountName(b.broker), value: b.value })),
  ].sort((a, b) => b.value - a.value)
  const max = Math.max(1, ...rows.map(r => Math.abs(r.value)))
  return (
    <section style={{ ...card, borderRadius: 22, padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>Patrimonio total</p>
          <p style={{ margin: 0, fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em' }}>{money(d.split.total, { euro: true })}</p>
        </div>
        {change != null && Number.isFinite(change) && <span style={{ marginLeft: 4 }}><Pill tone={change >= 0 ? 'green' : 'red'}>{pctText(change)} en 12 meses</Pill></span>}
      </div>
      {history.length > 1 && <div style={{ marginTop: 14 }}><Spark values={history} width={640} height={90} id="g-worth-pc" /></div>}
      {(d.split.cashPct > 0 || d.split.investedPct > 0) && (
        <>
          <div style={{ display: 'flex', height: 10, borderRadius: 99, overflow: 'hidden', gap: 3, margin: '18px 0 10px' }}>
            {d.split.cashPct > 0 && <span style={{ width: `${d.split.cashPct}%`, background: C.green }} />}
            {d.split.investedPct > 0 && <span style={{ flex: 1, background: 'var(--c-8b85ff)' }} />}
          </div>
          <div style={{ display: 'flex', gap: 20, fontSize: 13, fontWeight: 700, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot color={C.green} />Efectivo {money(d.cashTotal, { euro: true })} · {d.split.cashPct} %</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot color="var(--c-8b85ff)" />Invertido {money(d.invested, { euro: true })} · {d.split.investedPct} %</span>
          </div>
        </>
      )}
      {d.reserved > 0 && <Available available={d.available} reserved={d.reserved} />}
      <h2 style={{ margin: '24px 0 4px', fontSize: 17, fontWeight: 800 }}>Por cuenta</h2>
      {rows.map(r => {
        const share = d.split.total > 0 ? Math.round((r.value / d.split.total) * 100) : 0
        return (
          <button key={`${r.kind}-${r.source}`} type="button" onClick={() => onPick(r.kind, r.source)}
            style={{ width: '100%', display: 'grid', gridTemplateColumns: '34px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '10px 0', border: 0, borderTop: `1px solid ${C.line}`, background: 'transparent', color: C.text, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
            <BankLogo source={r.source} size={34} />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 14 }}>
                <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                <span style={{ color: C.muted, fontWeight: 700 }}>{share} %</span>
              </span>
              <span style={{ display: 'block', height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
                <span style={{ display: 'block', width: `${Math.max(0, (r.value / max) * 100)}%`, height: '100%', borderRadius: 99, background: r.kind === 'cash' ? C.green : 'var(--c-8b85ff)' }} />
              </span>
            </span>
            <span style={{ fontWeight: 800, minWidth: 96, textAlign: 'right' }}>{money(r.value, { euro: true })}</span>
          </button>
        )
      })}
    </section>
  )
}

function BrokerCardPC({ broker, positions, cash }: { broker: string; positions: PortfolioPosition[]; cash: AccountBalance[] }) {
  const money = useMoney()
  const own = positions.filter(p => brokerKey(p) === broker && p.shares > 0.0001).sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0))
  const cashHere = Math.max(cash.find(c => c.source === broker)?.balance ?? 0, 0)
  const value = own.reduce((a, p) => a + (p.market_value ?? p.total_invested ?? 0), 0) + cashHere
  const mix = assetMix(own, cashHere)
  const ret = positionsReturn(own)
  return (
    <section style={{ ...card, borderRadius: 22, padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <BankLogo source={broker} size={48} />
        <div>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>{accountName(broker)}</p>
          <p style={{ margin: 0, fontSize: 28, fontWeight: 800 }}>{money(value, { euro: true })}</p>
        </div>
        {ret != null && <span style={{ marginLeft: 8 }}><Pill tone={ret >= 0 ? 'green' : 'red'}>{pctText(ret)}</Pill></span>}
        <span style={{ marginLeft: 'auto' }}><SyncBar broker={broker} compact /></span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 28, marginTop: 18, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          {mix.length > 0 && <Donut slices={mix} size={140} />}
          <Legend slices={mix} />
        </div>
        <div>
          {own.map(p => {
            const pct = p.unrealized_pnl_pct
            return (
              <div key={p.symbol + (p.manual_id ?? '')} style={{ display: 'grid', gridTemplateColumns: '70px 1fr auto auto', gap: 14, alignItems: 'center', padding: '10px 0', borderTop: `1px solid ${C.line}` }}>
                <span style={{ fontWeight: 800 }}>{ticker(p)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || p.symbol}</span>
                  <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{sharesLabel(p.shares, assetKind(p.asset_class))}</span>
                </span>
                <span style={{ fontWeight: 800 }}>{money(p.market_value ?? p.total_invested, { euro: true })}</span>
                {pct != null ? <Pill tone={pct >= 0 ? 'green' : 'red'}>{pctText(pct)}</Pill> : <span />}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ── Cuenta bancaria ─────────────────────────────────────────────────────────
export function Banco() {
  const { source = 'manual' } = useParams()
  const pc = useIsPC()
  return (
    <div style={pc ? { maxWidth: 640 } : { paddingBottom: 40 }}>
      <BankPanel key={source} source={source} />
    </div>
  )
}

/** Una cuenta bancaria: pantalla propia, o panel derecho de Cuentas en PC (embedded). */
function BankPanel({ source, embedded }: { source: string; embedded?: boolean }) {
  const isPC = useIsPC()
  const pc = isPC || !!embedded
  const nav = useNavigate()
  const money = useMoney()
  const qc = useQueryClient()
  const [menu, setMenu] = useState(false)
  const [adjust, setAdjust] = useState(false)
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: dashApi.accounts })
  const txs = useQuery({ queryKey: ['transactions', 'account', source], queryFn: () => txApi.list({ source, page: 1, page_size: 200 }) })
  const acc = accounts.data?.find(a => a.source === source)
  const balance = acc?.balance ?? 0
  const items = txs.data?.items ?? []
  const series = useMemo(() => balanceSeries(balance, items.map(t => ({ date: t.date, amount: t.effective_amount ?? t.amount }))), [balance, items])
  const today = new Date()
  const title = acc?.label || accountName(source)
  const isBroker = BROKERS.includes(source)
  const shown = embedded ? 12 : 30
  const allTx = `/transacciones?cuenta=${source}&periodo=`

  async function disconnect() {
    setMenu(false)
    if (!(await confirm({ title: `Desconectar ${title}`, text: 'Los movimientos ya importados se quedan.', action: 'Desconectar', icon: 'power-switch' }))) return
    try { await (source === 'trade_republic' ? trApi.disconnect() : miApi.disconnect()); qc.invalidateQueries(); toast(`${title} desconectado`) } catch (e) { toast(errText(e), { error: true }) }
  }

  const btn = (icon: 'upload' | 'edit', label: string, onClick: () => void) => (
    <Btn kind="secondary" icon={icon} onClick={onClick} style={{ padding: '0 20px 0 15px' }}>{label}</Btn>
  )
  const gap = (top: number) => (embedded || pc ? `${top}px 0 0` : `${top}px 16px 0`)

  return (
    <>
      {!embedded && <SubHeader title={title} back="/cuentas" actions={<RoundBtn icon="dots" label="Más opciones" onClick={() => setMenu(true)} />} />}
      <div style={{ padding: embedded ? 0 : pc ? '18px 4px 0' : '18px 20px 0', display: 'flex', alignItems: 'center', gap: 14 }}>
        <BankLogo source={source} size={embedded ? 48 : 56} radius={embedded ? 16 : 18} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>{embedded ? title : 'Saldo'}</p>
          <p style={{ margin: 0, fontSize: embedded ? 28 : 32, fontWeight: 800, letterSpacing: '-0.03em' }}>{accounts.isLoading ? '…' : money(balance, { euro: true })}</p>
        </div>
        {embedded && <RoundBtn icon="dots" label="Más opciones" onClick={() => setMenu(true)} />}
      </div>
      {series.length > 1 && (
        <section style={embedded ? { marginTop: 16 } : { ...card, margin: gap(18), borderRadius: 24, padding: '14px 18px' }}>
          <Spark values={series} width={pc ? 600 : 318} height={70} id={`g-acc-${source}${embedded ? '-pc' : ''}`} />
        </section>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: gap(embedded ? 16 : 12) }}>
        {btn('upload', 'Importar CSV', () => nav(`/importar?origen=${source}`))}
        {btn('edit', 'Ajustar saldo', () => setAdjust(true))}
      </div>
      {embedded
        ? <h2 style={{ margin: '24px 0 4px', fontSize: 17, fontWeight: 800 }}>Movimientos</h2>
        : <Label style={pc ? { margin: '22px 4px 8px' } : undefined}>Movimientos</Label>}
      <Section style={embedded ? { margin: 0, padding: 0, background: 'transparent', boxShadow: 'none' } : pc ? { margin: 0 } : undefined}>
        {txs.isLoading && <div style={{ padding: '8px 0' }}><Skeleton h={48} r={14} /></div>}
        {!txs.isLoading && items.length === 0 && <p style={{ color: C.muted, fontWeight: 600, margin: '14px 0' }}>Sin movimientos</p>}
        {items.slice(0, shown).map((t, i) => (
          <div key={t.id}>{i > 0 && <Divider />}<TxRow tx={t} sub={dayLabel(t.date, today)} /></div>
        ))}
      </Section>
      {items.length > shown && (
        <div style={{ margin: gap(12) }}>
          <Btn kind="ghost" onClick={() => nav(allTx)}>Ver todos</Btn>
        </div>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={title}>
        <SheetOption icon="text-unordered" title="Ver en Movimientos" onClick={() => nav(allTx)} />
        <SheetOption icon="upload" title="Importar CSV" onClick={() => nav(`/importar?origen=${source}`)} />
        {isBroker && <SheetOption icon="cat-inversion" title="Ver inversiones" onClick={() => nav(`/cuentas/broker/${source}`)} />}
        {isBroker && <SheetOption icon="power-switch" title="Desconectar" onClick={disconnect} />}
      </Sheet>
      <AdjustSheet open={adjust} onClose={() => setAdjust(false)} source={source} balance={balance} />
    </>
  )
}

function AdjustSheet({ open, onClose, source, balance }: { open: boolean; onClose: () => void; source: string; balance: number }) {
  const qc = useQueryClient()
  const money = useMoney()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const value = parseAmount(text)
  const diff = value == null ? 0 : Math.round((value - balance) * 100) / 100
  async function save() {
    if (value == null || diff === 0 || busy) return
    setBusy(true)
    try {
      const made = await txApi.create({
        date: new Date().toISOString().slice(0, 10), type: kindToType(diff > 0 ? 'income' : 'expense'), amount: diff,
        name: 'Ajuste de saldo', source, category_id: null,
      })
      qc.invalidateQueries()
      onClose(); setText('')
      toast('Saldo ajustado', { undo: async () => { await txApi.delete(made.id); qc.invalidateQueries() } })
    } catch (e) { toast(errText(e), { error: true }) } finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Ajustar saldo"
      actions={<Btn icon="check-mark" disabled={value == null || diff === 0 || busy} onClick={save} style={{ padding: '0 9px 0 0' }}>Guardar</Btn>}>
      <Field label="Saldo real" inputMode="decimal" placeholder={money(balance)} value={text} autoFocus onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && save()} trail={cur()} />
      {value != null && diff !== 0 && (
        <p style={{ margin: '12px 4px 0', color: C.muted, fontWeight: 600 }}>Se añade un movimiento de {money(diff, { sign: true, euro: true })}</p>
      )}
    </Sheet>
  )
}

// ── Bróker ──────────────────────────────────────────────────────────────────
export function Broker() {
  const { broker = 'trade_republic' } = useParams()
  const pc = useIsPC()
  const money = useMoney()
  const d = useAccountsData()
  const own = d.positions.filter(p => brokerKey(p) === broker && p.shares > 0.0001).sort((a, b) => (b.market_value ?? 0) - (a.market_value ?? 0))
  const cashHere = Math.max(d.cash.find(c => c.source === broker)?.balance ?? 0, 0)
  const value = own.reduce((a, p) => a + (p.market_value ?? p.total_invested ?? 0), 0) + cashHere
  const mix = assetMix(own, cashHere)
  const ret = positionsReturn(own)
  const m = pc ? 0 : 16
  const [menu, setMenu] = useState(false)
  const nav = useNavigate()

  return (
    <div style={pc ? { maxWidth: 640 } : { paddingBottom: 40 }}>
      <SubHeader title={accountName(broker)} back="/cuentas" actions={<RoundBtn icon="dots" label="Más opciones" onClick={() => setMenu(true)} />} />
      <section style={{ ...card, margin: `16px ${m}px 0`, borderRadius: 24, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <BankLogo source={broker} size={48} />
          <div>
            <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>Valor total</p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>{d.loading ? '…' : money(value, { euro: true })}</p>
          </div>
          {ret != null && <span style={{ marginLeft: 'auto' }}><Pill tone={ret >= 0 ? 'green' : 'red'}>{pctText(ret)}</Pill></span>}
        </div>
        <SyncBar broker={broker} />
      </section>
      {mix.length > 0 && (
        <section style={{ ...card, margin: `12px ${m}px 0`, borderRadius: 24, padding: '16px 18px' }}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
            <Donut slices={mix} />
            <Legend slices={mix} />
          </div>
        </section>
      )}
      <Label style={pc ? { margin: '22px 4px 8px' } : undefined}>Posiciones</Label>
      <Section style={pc ? { margin: 0 } : undefined}>
        {d.loading && <div style={{ padding: '8px 0' }}><Skeleton h={48} r={14} /></div>}
        {!d.loading && own.length === 0 && <p style={{ color: C.muted, fontWeight: 600, margin: '14px 0' }}>Sin posiciones abiertas</p>}
        {own.map((p, i) => {
          const pct = p.unrealized_pnl_pct
          return (
            <div key={p.symbol + (p.manual_id ?? '')}>
              {i > 0 && <Divider margin="0" />}
              <div style={{ display: 'grid', gridTemplateColumns: '40px minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '9px 0' }}>
                <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: tickerBg(p.symbol || p.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{ticker(p)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || p.symbol}</span>
                  <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{sharesLabel(p.shares, assetKind(p.asset_class))}</span>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <span style={{ display: 'block', fontWeight: 700 }}>{money(p.market_value ?? p.total_invested)}</span>
                  {pct != null && <span style={{ color: pct >= 0 ? C.green : C.red, fontWeight: 700 }}>{pctText(pct)}</span>}
                </span>
              </div>
            </div>
          )
        })}
      </Section>
      <Sheet open={menu} onClose={() => setMenu(false)} title={accountName(broker)}>
        {d.cash.some(c => c.source === broker) && <SheetOption icon="wallet" title="Ver efectivo" onClick={() => nav(`/cuentas/${broker}`)} />}
        <SheetOption icon="text-unordered" title="Ver en Movimientos" onClick={() => nav(`/transacciones?cuenta=${broker}`)} />
        <SheetOption icon="upload" title="Importar CSV" onClick={() => nav(`/importar?origen=${broker}`)} />
      </Sheet>
    </div>
  )
}
