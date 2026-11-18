// Detalle de una posición (gráfico de precio y datos), posiciones manuales
// con buscador de valores y actualización de precios en directo.
import { useState, type CSSProperties } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { portfolioApi, type PortfolioPosition, type StockSearchResult } from '@/lib/api'
import { ASSET_LABEL, KIND_CLASS, assetKind, brokerKey, positionKind, sharesLabel } from '@/lib/accounts'
import { accountName, parseAmount, shortDate } from '@/lib/movements'
import { heldPeriods, heldRuns, tradeMarks } from '@/lib/priceChart'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { pctText } from '@/screens/Inicio'
import { confirm } from '@/ui/Confirm'
import { Icon } from '@/ui/Icon'
import { toast } from '@/ui/Toast'
import { TickerTile } from '@/ui/TickerTile'
import { Btn, C, Divider, Field, KV, Pill, Segmented, Sheet, Skeleton, useMoney } from '@/ui/kit'

const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Algo ha fallado')

/** Pide precios en directo y sustituye la cartera en caché. */
export async function refreshLivePrices(qc: QueryClient) {
  try {
    const live = await portfolioApi.livePerformance()
    qc.setQueryData(['portfolio-performance'], live)
    toast('Precios actualizados')
  } catch (e) { toast(errText(e), { error: true }) }
}

type Period = '1mo' | '6mo' | '1y' | '5y'
const PERIODS: [Period, string][] = [['1mo', '1M'], ['6mo', '6M'], ['1y', '1A'], ['5y', '5A']]

const BUY = 'var(--c-b3aeff)'
const SELL = 'var(--c-ffc27a)'

/** Precio con las compras y ventas marcadas; donde no se tenía el activo la línea es discontinua. */
function PriceChart({ points, pos }: { points: { date: string; close: number }[]; pos: PortfolioPosition }) {
  const money = useMoney()
  const w = 320
  const h = 140
  const vals = points.map(p => p.close)
  const dates = points.map(p => p.date)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const xy = vals.map((v, i) => [(i / (vals.length - 1)) * w, 8 + (1 - (v - min) / span) * (h - 16)] as const)
  const path = (a: number, b: number) => xy.slice(a, b + 1).map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const periods = heldPeriods(pos.buy_events, pos.sell_events, pos.shares)
  const runs = heldRuns(dates, periods)
  const marks = tradeMarks(dates, pos.buy_events, pos.sell_events)
  const up = vals[vals.length - 1] >= vals[0]
  const color = up ? C.green : C.red
  const change = vals[0] ? ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100 : null
  const dot = (c: string): CSSProperties => ({ width: 11, height: 11, borderRadius: 99, background: c, boxShadow: `0 0 0 2.5px ${C.pop}`, flex: 'none' })
  const shares = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 4 })
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.muted }}>Precio <span style={{ color: C.text, fontWeight: 800 }}>{money(vals[vals.length - 1], { euro: true })}</span></span>
        {change != null && <span style={{ fontSize: 13, fontWeight: 800, color }}>{pctText(change)}</span>}
      </div>
      <div style={{ position: 'relative' }}>
        <svg role="img" aria-label="Precio" width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
          <defs>
            <linearGradient id="g-price" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
            <linearGradient id="g-price-off" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.1" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {runs.filter(r => r.to > r.from).map(r => (
            <path key={`a${r.from}`} d={`${path(r.from, r.to)} L${xy[r.to][0].toFixed(1)} ${h} L${xy[r.from][0].toFixed(1)} ${h} Z`} fill={r.held ? 'url(#g-price)' : 'url(#g-price-off)'} />
          ))}
          {runs.filter(r => r.to > r.from).map(r => (
            <path key={`l${r.from}`} d={path(r.from, r.to)} fill="none" stroke={color}
              strokeWidth={r.held ? 2.5 : 1.6} strokeOpacity={r.held ? 1 : 0.5} strokeDasharray={r.held ? undefined : '5 5'}
              strokeLinejoin="round" strokeLinecap={r.held ? 'round' : 'butt'} vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
        {/* Las marcas van en HTML: dentro del SVG estirado saldrían ovaladas */}
        {marks.map(m => {
          const [x, y] = xy[m.index]
          const both = m.buy > 0 && m.sell > 0
          const label = [m.buy > 0 && `Compra de ${shares(m.buy)}`, m.sell > 0 && `Venta de ${shares(m.sell)}`].filter(Boolean).join(' y ')
          return (
            <span key={m.index} role="img" aria-label={`${label} · ${shortDate(dates[m.index])}`} title={`${label} · ${shortDate(dates[m.index])}`}
              style={{ position: 'absolute', left: `${(x / w) * 100}%`, top: y, transform: 'translate(-50%, -50%)', display: 'flex', gap: 3 }}>
              {m.buy > 0 && <span style={dot(BUY)} />}
              {m.sell > 0 && <span style={{ ...dot(SELL), marginLeft: both ? 0 : undefined }} />}
            </span>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: C.muted, fontWeight: 700 }}>
        <span>{shortDate(points[0].date)}</span>
        <span>{`Mín ${money(min)} · Máx ${money(max)}`}</span>
        <span>{shortDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  )
}

/** Hoja con el gráfico y los datos de una posición; las manuales se pueden editar. */
export function PositionSheet({ pos, onClose }: { pos: PortfolioPosition | null; onClose: () => void }) {
  const money = useMoney()
  const qc = useQueryClient()
  const [period, setPeriod] = useState<Period>('1y')
  const [edit, setEdit] = useState(false)
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [pickType, setPickType] = useState(false)
  // Tipo elegido en esta hoja (la posición que llega es una foto y no se refresca)
  const [cls, setCls] = useState<{ value: string; manual: boolean } | null>(null)
  const [last, setLast] = useState<string | null>(null)
  const key = pos ? pos.symbol + (pos.manual_id ?? '') : null
  if (key !== last) { setLast(key); setEdit(false); setPickType(false); setCls(null) }
  const hist = useQuery({
    queryKey: ['price-history', pos?.symbol, period],
    queryFn: () => portfolioApi.priceHistory([pos!.symbol], period),
    enabled: !!pos?.symbol,
    staleTime: 30 * 60_000,
  })
  const points = hist.data?.[0]?.points ?? []
  const refresh = () => { qc.invalidateQueries({ queryKey: ['portfolio-performance'] }); qc.invalidateQueries({ queryKey: ['net-worth'] }) }

  const startEdit = () => {
    if (!pos) return
    setShares(String(pos.shares).replace('.', ','))
    setPrice(String(pos.avg_buy_price).replace('.', ','))
    setEdit(true)
  }
  const save = async () => {
    if (!pos?.manual_id) return
    const s = parseAmount(shares)
    const p = parseAmount(price)
    if (s == null || s <= 0 || p == null || p < 0) { toast('Revisa las participaciones y el precio', { error: true }); return }
    try { await portfolioApi.updateManualPosition(pos.manual_id, { shares: s, avg_price_eur: p }); refresh(); toast('Posición guardada'); onClose() }
    catch (e) { toast(errText(e), { error: true }) }
  }
  const remove = async () => {
    if (!pos?.manual_id) return
    const ok = await confirm({ title: `¿Eliminar ${pos.name || pos.symbol}?`, text: 'Se quita la posición manual de tu cartera.', action: 'Eliminar', icon: 'delete', danger: true })
    if (!ok) return
    try { await portfolioApi.deleteManualPosition(pos.manual_id); refresh(); toast('Posición eliminada'); onClose() }
    catch (e) { toast(errText(e), { error: true }) }
  }

  const kind = pos ? (cls ? assetKind(cls.value) : positionKind(pos)) : 'other'
  const manual = cls ? cls.manual : !!pos?.asset_class_manual
  const autoKind = pos?.asset_class_auto ? assetKind(pos.asset_class_auto) : null
  const chooseType = async (value: string | null) => {
    if (!pos) return
    setPickType(false)
    const next = { value: value ?? pos.asset_class_auto ?? pos.asset_class, manual: value != null }
    const prev = cls
    setCls(next)
    try {
      await portfolioApi.setAssetType(pos.symbol, value)
      qc.invalidateQueries({ queryKey: ['portfolio-performance'] })
    } catch (e) { setCls(prev); toast(errText(e), { error: true }) }
  }

  const pnl = pos?.unrealized_pnl
  const stat = (label: string, v: string) => (
    <div style={{ background: C.field, borderRadius: 16, padding: '10px 12px', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted }}>{label}</span>
      <span style={{ display: 'block', fontSize: 15, fontWeight: 800, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
    </div>
  )
  const realized = pos?.realized_pnl ?? 0
  const extra = pos ? [
    pos.dividends_received > 0 && <KV k="Dividendos" v={money(pos.dividends_received, { euro: true })} />,
    Math.abs(realized) > 0.005 && <KV k="Ganancia realizada" v={<span style={{ color: realized >= 0 ? C.green : C.red }}>{money(realized, { sign: true, euro: true })}</span>} />,
    pos.first_purchase_date && <KV k="Primera compra" v={shortDate(pos.first_purchase_date)} />,
  ].filter(Boolean) : []
  return (
    <Sheet open={!!pos} onClose={onClose} title={pos?.name || pos?.symbol}
      actions={pos?.is_manual && pos.manual_id != null && !pickType ? (
        edit
          ? <Btn height={50} style={{ width: '100%' }} onClick={save}>Guardar</Btn>
          : <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <Btn kind="secondary" icon="edit" height={46} style={{ flex: 1, paddingLeft: 14 }} onClick={startEdit}>Editar</Btn>
              <Btn kind="danger" icon="delete" height={46} style={{ flex: 1, paddingLeft: 14 }} onClick={remove}>Eliminar</Btn>
            </div>
      ) : undefined}>
      {pos && (pickType ? (
        <div role="radiogroup" aria-label="Tipo de activo">
          {[[null, autoKind ? `Automático · ${ASSET_LABEL[autoKind]}` : 'Automático'] as const, ...KIND_CLASS.map(([k, v]) => [v, ASSET_LABEL[k]] as const)].map(([v, text], i) => {
            const on = v == null ? !manual : manual && assetKind(v) === kind
            return (
              <div key={v ?? 'auto'}>
                {i > 0 && <Divider margin="0" />}
                <button type="button" role="radio" aria-checked={on} onClick={() => chooseType(v)}
                  style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 22px', gap: 10, alignItems: 'center', border: 0, background: 'transparent', color: C.text, padding: '14px 0', font: 'inherit', fontWeight: on ? 800 : 700, textAlign: 'left', cursor: 'pointer' }}>
                  <span>{text}</span>
                  <span style={{ color: C.accentText, display: 'flex' }}>{on && <Icon name="check-mark" size={18} />}</span>
                </button>
              </div>
            )
          })}
        </div>
      ) : edit ? (
        <div>
          <Field label="Participaciones" inputMode="decimal" value={shares} onChange={e => setShares(e.target.value)} />
          <Field label="Precio medio de compra (€)" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TickerTile p={pos} size={44} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pos.symbol}</span>
              <span style={{ display: 'block', fontSize: 13, color: C.muted, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{accountName(brokerKey(pos))}</span>
            </span>
            <button type="button" onClick={() => setPickType(true)} aria-label={`Tipo: ${ASSET_LABEL[kind]}. Cambiar`}
              style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, height: 32, padding: '0 8px 0 12px', borderRadius: 99, border: 0, background: C.field, color: C.text, font: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              {ASSET_LABEL[kind]}
              <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={14} /></span>
            </button>
          </div>

          <div style={{ marginTop: 18 }}>
            <span style={{ display: 'block', fontSize: 13, color: C.muted, fontWeight: 600 }}>Valor</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em' }}>{money(pos.market_value ?? pos.total_invested, { euro: true })}</span>
              {pnl != null && (
                <Pill tone={pnl >= 0 ? 'green' : 'red'}>
                  {money(pnl, { sign: true, euro: true })}{pos.unrealized_pnl_pct != null && ` · ${pctText(pos.unrealized_pnl_pct)}`}
                </Pill>
              )}
            </div>
          </div>

          <div style={{ marginTop: 16, background: C.field, borderRadius: 20, padding: '14px 14px 12px' }}>
            {hist.isLoading
              ? <Skeleton h={190} r={14} />
              : points.length > 1
                ? <PriceChart points={points} pos={pos} />
                : <p style={{ margin: '24px 0', textAlign: 'center', color: C.muted, fontWeight: 600 }}>No hay historial de precio para este valor.</p>}
            <Segmented label="Periodo" value={period} options={PERIODS} onChange={setPeriod} style={{ marginTop: 12 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
            {stat('Participaciones', sharesLabel(pos.shares, kind))}
            {stat('Invertido', money(pos.total_invested, { euro: true }))}
            {stat('Precio medio', money(pos.avg_buy_price, { euro: true }))}
            {stat('Precio actual', pos.current_price != null ? money(pos.current_price, { euro: true }) : '—')}
          </div>

          {extra.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {extra.map((row, i) => <div key={i}>{i > 0 && <Divider margin="0" />}{row}</div>)}
            </div>
          )}
        </div>
      ))}
    </Sheet>
  )
}

/** Añadir una posición manual buscando el valor por nombre o ticker. */
export function ManualPositionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<StockSearchResult | null>(null)
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [busy, setBusy] = useState(false)
  const term = useDebouncedValue(q.trim(), 350)
  const search = useQuery({
    queryKey: ['stock-search', term],
    queryFn: () => portfolioApi.searchStocks(term),
    enabled: open && !pick && term.length >= 2,
    staleTime: 5 * 60_000,
  })
  const close = () => { setQ(''); setPick(null); setShares(''); setPrice(''); onClose() }
  const s = parseAmount(shares)
  const p = parseAmount(price)
  const valid = !!pick && s != null && s > 0 && p != null && p >= 0
  const add = async () => {
    if (!pick || !valid) return
    setBusy(true)
    try {
      await portfolioApi.addManualPosition({ ticker: pick.ticker, name: pick.name, shares: s!, avg_price_eur: p!, currency: pick.currency || 'EUR' })
      qc.invalidateQueries({ queryKey: ['portfolio-performance'] }); qc.invalidateQueries({ queryKey: ['net-worth'] })
      toast('Posición añadida'); close()
    } catch (e) { toast(errText(e), { error: true }) }
    finally { setBusy(false) }
  }
  return (
    <Sheet open={open} onClose={close} title="Añadir posición"
      actions={pick ? <Btn height={50} style={{ width: '100%' }} disabled={!valid || busy} onClick={add}>Añadir</Btn> : undefined}>
      {pick ? (
        <div>
          <button type="button" onClick={() => setPick(null)} style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center', border: 0, borderRadius: 16, background: C.field, color: C.text, padding: '12px 14px', marginBottom: 14, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pick.name}</span>
              <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 700 }}>{`${pick.ticker} · ${pick.exchange}`}</span>
            </span>
            <span style={{ color: C.accentText, fontWeight: 800, fontSize: 14 }}>Cambiar</span>
          </button>
          <Field label="Participaciones" inputMode="decimal" autoFocus value={shares} onChange={e => setShares(e.target.value)} />
          <Field label="Precio medio de compra (€)" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
        </div>
      ) : (
        <div>
          <Field label="Buscar valor" icon="search" placeholder="Apple, VWCE, MSCI World…" autoFocus value={q} onChange={e => setQ(e.target.value)} />
          {search.isFetching && <Skeleton h={48} r={14} />}
          {!search.isFetching && term.length >= 2 && (search.data ?? []).length === 0 && <p style={{ margin: '4px 0', color: C.muted, fontWeight: 600 }}>Sin resultados.</p>}
          {(search.data ?? []).slice(0, 8).map((r, i) => (
            <div key={r.ticker}>
              {i > 0 && <Divider margin="0" />}
              <button type="button" onClick={() => setPick(r)} style={{ width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 10, alignItems: 'center', border: 0, background: 'transparent', color: C.text, padding: '10px 0', font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                  <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 700 }}>{`${r.ticker} · ${r.exchange}`}</span>
                </span>
                <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>{r.type_disp}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}
