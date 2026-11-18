// Cierre del periodo: solo se llega tocando el aviso de "Nómina recibida".
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { dashApi, type CycleRise } from '@/lib/api'
import { changePct, changeText, cycleLabel, parseCloseRange } from '@/lib/cycles'
import { C, ErrorState, Label, Pill, Row, Rows, Section, SkelHero, SkelRows, SubHeader, Btn, useMoney } from '@/ui/kit'
import { CatTile } from '@/ui/Icon'

export default function Cierre() {
  const [sp] = useSearchParams()
  const range = parseCloseRange(sp.get('start'), sp.get('end'))
  const q = useQuery({
    queryKey: ['cycle-close', range?.start, range?.end],
    queryFn: () => dashApi.cycleClose(range!.start, range!.end),
    enabled: !!range,
  })
  const money = useMoney()
  const nav = useNavigate()
  if (!range) return <Navigate to="/" replace />

  const d = q.data
  const label = cycleLabel(range.start, range.end, false)
  return (
    <div style={{ paddingBottom: 40 }}>
      <SubHeader title="Cierre del mes" sub={label} back="/" />
      {q.isError ? <ErrorState text="No se pudo cargar el resumen" retry={() => q.refetch()} /> : !d ? (
        <><SkelHero style={{ marginTop: 18 }} /><SkelRows n={3} style={{ marginTop: 16 }} /></>
      ) : (
        <>
          <Section pad="20px" style={{ marginTop: 18 }}>
            <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 700 }}>{d.saved >= 0 ? 'Ahorraste' : 'Gastaste de más'}</p>
            <p style={{ margin: '4px 0 0', fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: d.saved >= 0 ? C.green : C.red }}>
              {money(Math.abs(d.saved), { euro: true })}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              <Figure k="Ingresos" v={money(d.income, { euro: true })} />
              <Figure k="Gastado" v={money(d.spent, { euro: true })} />
            </div>
          </Section>

          <Label>Frente al anterior · {cycleLabel(d.previous.start, d.previous.end, false)}</Label>
          <Section>
            <Rows>
              <Compare title="Gastado" cur={d.spent} prev={d.previous.spent} lowerIsBetter />
              <Compare title="Ahorrado" cur={d.saved} prev={d.previous.saved} />
              <Compare title="Ingresos" cur={d.income} prev={d.previous.income} />
            </Rows>
          </Section>

          {d.top_rises.length > 0 && (
            <>
              <Label>Lo que más subió</Label>
              <Section>
                <Rows>{d.top_rises.map(r => <Rise key={r.category_id ?? 'none'} r={r} />)}</Rows>
              </Section>
            </>
          )}

          <div style={{ margin: '22px 16px 0' }}>
            <Btn kind="secondary" icon="text-unordered" style={{ width: '100%' }}
              onClick={() => nav(`/transacciones?periodo=${range.start}_${range.end}`)}>
              Ver movimientos
            </Btn>
          </div>
        </>
      )}
    </div>
  )
}

function Figure({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ background: C.field, borderRadius: 16, padding: '10px 12px' }}>
      <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 700 }}>{k}</span>
      <span style={{ display: 'block', fontWeight: 800, marginTop: 2 }}>{v}</span>
    </div>
  )
}

function Compare({ title, cur, prev, lowerIsBetter }: { title: string; cur: number; prev: number; lowerIsBetter?: boolean }) {
  const money = useMoney()
  const pct = changePct(cur, prev)
  const better = pct == null ? null : lowerIsBetter ? pct <= 0 : pct >= 0
  return (
    <Row pad="13px 0" title={title} sub={`Antes ${money(prev, { euro: true })}`}
      trail={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {money(cur, { euro: true })}
          {pct != null && <Pill tone={pct === 0 ? 'muted' : better ? 'green' : 'red'}>{changeText(pct)}</Pill>}
        </span>
      } />
  )
}

function Rise({ r }: { r: CycleRise }) {
  const money = useMoney()
  return (
    <Row lead={<CatTile name={r.name} size={40} />} title={r.name} sub={`Antes ${money(r.previous, { euro: true })}`}
      trail={<span style={{ color: C.red }}>+{money(r.diff, { euro: true })}</span>} />
  )
}
