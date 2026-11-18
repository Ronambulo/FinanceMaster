// Detalle de una posición (gráfico de precio y datos), posiciones manuales
// con buscador de valores y actualización de precios en directo.
import { useState } from 'react'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { portfolioApi, type PortfolioPosition, type StockSearchResult } from '@/lib/api'
import { parseAmount, shortDate } from '@/lib/movements'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { pctText } from '@/screens/Inicio'
import { confirm } from '@/ui/Confirm'
import { toast } from '@/ui/Toast'
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

function PriceChart({ points }: { points: { date: string; close: number }[] }) {
  const money = useMoney()
  const w = 320
  const h = 140
  const vals = points.map(p => p.close)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const span = max - min || 1
  const xy = vals.map((v, i) => [(i / (vals.length - 1)) * w, 8 + (1 - (v - min) / span) * (h - 16)] as const)
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const up = vals[vals.length - 1] >= vals[0]
  const color = up ? C.green : C.red
  const change = vals[0] ? ((vals[vals.length - 1] - vals[0]) / vals[0]) * 100 : null
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 800 }}>{money(vals[vals.length - 1], { euro: true })}</span>
        {change != null && <Pill tone={up ? 'green' : 'red'}>{pctText(change)}</Pill>}
      </div>
      <svg role="img" aria-label="Precio" width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id="g-price" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="url(#g-price)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
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
  const [last, setLast] = useState<string | null>(null)
  const key = pos ? pos.symbol + (pos.manual_id ?? '') : null
  if (key !== last) { setLast(key); setEdit(false) }
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

  const pnl = pos?.unrealized_pnl
  return (
    <Sheet open={!!pos} onClose={onClose} title={pos?.name || pos?.symbol}
      actions={pos?.is_manual && pos.manual_id != null ? (
        edit
          ? <Btn height={50} style={{ width: '100%' }} onClick={save}>Guardar</Btn>
          : <div style={{ display: 'flex', gap: 10, width: '100%' }}>
              <Btn kind="secondary" icon="edit" height={46} style={{ flex: 1, paddingLeft: 14 }} onClick={startEdit}>Editar</Btn>
              <Btn kind="danger" icon="delete" height={46} style={{ flex: 1, paddingLeft: 14 }} onClick={remove}>Eliminar</Btn>
            </div>
      ) : undefined}>
      {pos && (edit ? (
        <div>
          <Field label="Participaciones" inputMode="decimal" value={shares} onChange={e => setShares(e.target.value)} />
          <Field label="Precio medio de compra (€)" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} />
        </div>
      ) : (
        <div>
          <Segmented label="Periodo" value={period} options={PERIODS} onChange={setPeriod} style={{ marginBottom: 14 }} />
          {hist.isLoading
            ? <Skeleton h={190} r={16} />
            : points.length > 1
              ? <PriceChart points={points} />
              : <p style={{ margin: '8px 0', color: C.muted, fontWeight: 600 }}>No hay historial de precio para este valor.</p>}
          <div style={{ marginTop: 12 }}>
            {pos.market_value != null && <><KV k="Valor" v={money(pos.market_value, { euro: true })} /><Divider margin="0" /></>}
            <KV k="Invertido" v={money(pos.total_invested, { euro: true })} />
            <Divider margin="0" />
            <KV k="Precio medio" v={money(pos.avg_buy_price, { euro: true })} />
            {pos.current_price != null && <><Divider margin="0" /><KV k="Precio actual" v={money(pos.current_price, { euro: true })} /></>}
            {pnl != null && (
              <><Divider margin="0" /><KV k="Ganancia" v={<span style={{ color: pnl >= 0 ? C.green : C.red }}>{money(pnl, { sign: true, euro: true })}</span>} /></>
            )}
            {pos.dividends_received > 0 && <><Divider margin="0" /><KV k="Dividendos" v={money(pos.dividends_received, { euro: true })} /></>}
            {pos.first_purchase_date && <><Divider margin="0" /><KV k="Primera compra" v={shortDate(pos.first_purchase_date)} /></>}
          </div>
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
