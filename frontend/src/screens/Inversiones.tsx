// Inversiones: toda la cartera junta (valor, ganancia, reparto, brókers y posiciones).
import { useMemo, useState, type CSSProperties } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { portfolioApi, type PortfolioPosition } from '@/lib/api'
import { ASSET_LABEL, assetMix, brokerKey, holdingsByBroker, positionKind, positionsReturn, sharesLabel, type AssetKind } from '@/lib/accounts'
import { accountName } from '@/lib/movements'
import { pctText } from '@/screens/Inicio'
import { PCHeader, useIsPC } from '@/app/Shell'
import { BankLogo } from '@/ui/BankLogo'
import { Btn, C, Chip, Divider, Empty, Header, Label, Pill, RoundBtn, Row, Section, Skeleton, useMoney } from '@/ui/kit'
import { AddAccountSheet, Donut, Legend, PositionRow, ReturnText, openAddAccount, openAddPosition } from './Cuentas'
import { PositionSheet, refreshLivePrices } from './Posiciones'
import { TickerTile } from '@/ui/TickerTile'

const card = { background: C.card, boxShadow: 'var(--sh-card)' }

export default function Inversiones() {
  const pc = useIsPC()
  const money = useMoney()
  const qc = useQueryClient()
  const perf = useQuery({ queryKey: ['portfolio-performance'], queryFn: portfolioApi.performance })
  const all = perf.data?.positions ?? []
  const open = useMemo(
    () => all.filter(p => p.shares > 0.0001).sort((a, b) => (b.market_value ?? b.total_invested) - (a.market_value ?? a.total_invested)),
    [all],
  )
  const value = open.reduce((a, p) => a + (p.market_value ?? p.total_invested ?? 0), 0)
  const cost = open.reduce((a, p) => a + (p.total_invested ?? 0), 0)
  const gain = value - cost
  const ret = positionsReturn(open)
  const mix = assetMix(open, 0)
  const brokers = holdingsByBroker(all)
  const [kind, setKind] = useState<AssetKind | null>(null)
  const shown = kind ? open.filter(p => positionKind(p) === kind) : open
  const [detail, setDetail] = useState<PortfolioPosition | null>(null)
  const m = pc ? 0 : 16

  const actions = (
    <>
      <RoundBtn icon="refresh" label="Actualizar precios" onClick={() => refreshLivePrices(qc)} />
      <RoundBtn icon="plus" label="Añadir posición" onClick={openAddPosition} />
    </>
  )
  const tile = (label: string, v: number, tone = false) => (
    <div style={{ background: C.field, borderRadius: 16, padding: '10px 12px', minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.muted }}>{label}</span>
      <span style={{ display: 'block', fontSize: 16, fontWeight: 800, marginTop: 2, whiteSpace: 'nowrap', color: tone ? (v >= 0 ? C.green : C.red) : C.text }}>
        {money(v, { sign: tone, decimals: 0 })}
      </span>
    </div>
  )

  const hero = (
    <section style={{ ...card, margin: pc ? 0 : `16px ${m}px 0`, borderRadius: 28, padding: pc ? '22px 24px' : '18px 20px', display: 'flex', flexDirection: 'column' }}>
      <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>Valor de la cartera</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: pc ? 40 : 34, fontWeight: 800, letterSpacing: '-0.03em' }}>{money(value, { euro: true })}</span>
        {ret != null && <Pill tone={ret >= 0 ? 'green' : 'red'}>{pctText(ret)}</Pill>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: pc ? 10 : 8, marginTop: pc ? 'auto' : 14, paddingTop: pc ? 18 : 0 }}>
        {tile('Ganancia', gain, true)}
        {tile('Realizado', perf.data?.total_realized_pnl ?? 0, true)}
        {tile('Dividendos', perf.data?.total_dividends ?? 0)}
      </div>
    </section>
  )
  const mixCard = mix.length > 0 && (
    <section style={{ ...card, margin: pc ? 0 : `12px ${m}px 0`, borderRadius: pc ? 28 : 24, padding: pc ? '20px 22px' : '16px 18px', display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: pc ? 24 : 18, alignItems: 'center', width: '100%' }}>
        <Donut slices={mix} size={pc ? 128 : undefined} />
        <Legend slices={mix} />
      </div>
    </section>
  )
  const brokerList = brokers.length > 0 && (
    <>
      <Label style={pc ? { margin: '16px 4px 8px', minHeight: 36, display: 'flex', alignItems: 'center' } : undefined}>Brókers</Label>
      <Section style={pc ? { margin: 0 } : undefined}>
        {brokers.map((b, i) => (
          <div key={b.broker}>
            {i > 0 && <Divider />}
            <Row lead={<BankLogo source={b.broker} />} title={accountName(b.broker)}
              trail={<span style={{ display: 'block', textAlign: 'right' }}>{money(b.value)}<ReturnText pct={positionsReturn(all.filter(p => brokerKey(p) === b.broker))} /></span>}
              chevron to={`/cuentas/broker/${b.broker}`} />
          </div>
        ))}
      </Section>
    </>
  )
  const chips = mix.length > 1 && (
    <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: pc ? 0 : '0 16px 10px', ...(pc ? { minWidth: 0 } : {}) }}>
      <Chip active={kind == null} onClick={() => setKind(null)}>Todas</Chip>
      {mix.map(s => <Chip key={s.kind} active={kind === s.kind} onClick={() => setKind(kind === s.kind ? null : s.kind)}>{ASSET_LABEL[s.kind]}</Chip>)}
    </div>
  )
  const none = shown.length === 0 && <p style={{ color: C.muted, fontWeight: 600, margin: '14px 0' }}>Sin posiciones abiertas</p>
  // En PC, tabla con todas las cifras de cada posición
  const COLS = '40px minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 76px'
  const num: CSSProperties = { textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const table = (
    <Section style={{ margin: 0 }} pad="6px 18px">
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 12, padding: '10px 0 8px', fontSize: 12, fontWeight: 700, color: C.muted }}>
        <span /><span>Posición</span><span style={num}>Cantidad</span><span style={num}>Precio medio</span><span style={num}>Precio</span><span style={num}>Valor</span><span style={num}>Rentab.</span>
      </div>
      {none}
      {shown.map(p => {
        const pct = p.unrealized_pnl_pct
        return (
          <div key={p.symbol + (p.manual_id ?? '')}>
            <Divider margin="0" />
            <button type="button" onClick={() => setDetail(p)}
              style={{ width: '100%', display: 'grid', gridTemplateColumns: COLS, gap: 12, alignItems: 'center', padding: '10px 0', border: 0, background: 'transparent', color: C.text, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
              <TickerTile p={p} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name || p.symbol}</span>
                <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}>{ASSET_LABEL[positionKind(p)]}</span>
              </span>
              <span style={{ ...num, color: C.muted, fontWeight: 600 }}>{sharesLabel(p.shares, positionKind(p))}</span>
              <span style={{ ...num, fontWeight: 600 }}>{money(p.avg_buy_price)}</span>
              <span style={{ ...num, fontWeight: 600 }}>{p.current_price != null ? money(p.current_price) : '—'}</span>
              <span style={{ ...num, fontWeight: 800 }}>{money(p.market_value ?? p.total_invested)}</span>
              <span style={{ ...num, fontWeight: 800, color: pct == null ? C.muted : pct >= 0 ? C.green : C.red }}>{pct != null ? pctText(pct) : '—'}</span>
            </button>
          </div>
        )
      })}
    </Section>
  )

  return (
    <div style={pc ? { maxWidth: 1400, paddingBottom: 32 } : { paddingBottom: 120 }}>
      {pc ? <PCHeader title="Inversiones" search={false} add={false} actions={actions} /> : <Header title="Inversiones" actions={actions} />}
      {perf.isLoading ? (
        <div style={{ margin: `16px ${m}px 0`, display: 'grid', gap: 12 }}><Skeleton h={170} r={28} /><Skeleton h={140} r={24} /><Skeleton h={220} /></div>
      ) : open.length === 0 && brokers.length === 0 ? (
        <Empty icon="invest" title="Aún no hay inversiones" text="Conecta tu bróker o añade una posición a mano."
          action={<Btn icon="plus" onClick={openAddAccount} style={{ padding: '0 9px 0 0' }}>Añadir cuenta</Btn>} />
      ) : pc ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: mixCard ? 'minmax(0, 1.3fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 16, marginTop: 16 }}>
            {hero}
            {mixCard}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: brokerList ? 'minmax(0, 1fr) 340px' : 'minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '16px 4px 8px', minHeight: 36 }}>
                <Label style={{ margin: 0 }}>Posiciones</Label>
                {chips}
              </div>
              {table}
            </div>
            {brokerList && <div>{brokerList}</div>}
          </div>
        </>
      ) : (
        <>
          {hero}
          {mixCard}
          {brokerList}
          <Label>Posiciones</Label>
          {chips}
          <Section>
            {none}
            {shown.map((p, i) => (
              <div key={p.symbol + (p.manual_id ?? '')}>
                {i > 0 && <Divider margin="0" />}
                <PositionRow p={p} onClick={() => setDetail(p)} />
              </div>
            ))}
          </Section>
        </>
      )}
      <PositionSheet pos={detail} onClose={() => setDetail(null)} />
      <AddAccountSheet />
    </div>
  )
}
