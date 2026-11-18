// Detalle de un movimiento (tablero NovDetalle): categoría, cuenta, fecha, nota y "otros del comercio".
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { catApi, txApi } from '@/lib/api'
import { accountName, longDateTime, needsReview, shortDate, txNet, txTitle } from '@/lib/movements'
import { useIsPC } from '@/app/Shell'
import { BankLogo } from '@/ui/BankLogo'
import { CatTile } from '@/ui/Icon'
import { BackBtn, Btn, C, Divider, Empty, FONT, KV, RoundBtn, Skeleton, useMoney } from '@/ui/kit'
import { TxRow } from '@/ui/tx'
import { toast } from '@/ui/Toast'
import { CatSheet } from './Movimientos'

export default function Detalle() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const pc = useIsPC()
  const money = useMoney()
  const [cat, setCat] = useState(false)
  const q = useQuery({ queryKey: ['transactions', 'one', id], queryFn: () => txApi.get(id), enabled: Number.isFinite(id) })
  const tx = q.data
  const sim = useQuery({ queryKey: ['similar', id], queryFn: () => txApi.similar(id), enabled: !!tx })
  const categories = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const one = useMemo(() => (tx ? [tx] : null), [tx])
  const edit = () => nav(`/transacciones/${id}/editar`)
  const qc = useQueryClient()
  async function confirmCat() {
    try { await txApi.confirm([id]); qc.invalidateQueries({ queryKey: ['transactions'] }); toast('Categoría confirmada') }
    catch (e) { toast(e instanceof Error ? e.message : 'Algo ha fallado', { error: true }) }
  }
  async function unlink(group: number) {
    try { await txApi.unlink(group); qc.invalidateQueries(); toast('Movimientos separados') }
    catch (e) { toast(e instanceof Error ? e.message : 'Algo ha fallado', { error: true }) }
  }

  const header = (
    <header style={{ padding: pc ? 0 : '18px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
      <BackBtn />
      <div style={{ flex: 1, minWidth: 0 }}><h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }} /></div>
      <div style={{ display: 'flex', gap: 8 }}>{tx && <RoundBtn icon="edit" label="Editar" onClick={edit} />}</div>
    </header>
  )

  if (q.isLoading) return <div style={pc ? { maxWidth: 640 } : undefined}>{header}<div style={{ padding: 16, display: 'grid', gap: 12 }}><Skeleton h={150} /><Skeleton h={230} /></div></div>
  if (!tx) return <div style={pc ? { maxWidth: 640 } : undefined}>{header}<Empty icon="search" title="No encontrado" text="Este movimiento ya no existe." /></div>

  const merchant = sim.data?.merchant ?? ''
  const others = sim.data?.count ?? 0
  const c = tx.category
  const card = { margin: pc ? '22px 0 0' : '22px 16px 0', background: C.card, borderRadius: 24, padding: '4px 18px', boxShadow: 'var(--sh-card)' }

  return (
    <div style={{ ...(pc ? { maxWidth: 640 } : { paddingBottom: 110 }) }}>
      {header}
      <div style={{ textAlign: 'center', padding: '18px 20px 0' }}>
        <CatTile name={c?.name} type={c?.type} size={64} icon={31} style={{ display: 'inline-flex' }} />
        <p style={{ margin: '12px 0 0', fontSize: 18, fontWeight: 800 }}>{txTitle(tx)}</p>
        <p style={{ margin: '2px 0 0', fontSize: 42, fontWeight: 800, letterSpacing: '-0.03em', ...(txNet(tx) > 0 ? { color: C.green } : {}) }}>{money(txNet(tx), { sign: true, euro: true })}</p>
      </div>
      {needsReview(tx) && (
        <section style={{ ...card, padding: '14px 14px 14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: C.accent, flex: 'none' }} />
          <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 15 }}>{c ? '¿Es correcta la categoría?' : 'Sin categoría'}</span>
          {c
            ? <><button type="button" onClick={() => setCat(true)} style={pillBtn(false)}>Cambiar</button><button type="button" onClick={confirmCat} style={pillBtn(true)}>Sí</button></>
            : <button type="button" onClick={() => setCat(true)} style={pillBtn(true)}>Elegir</button>}
        </section>
      )}
      <section style={needsReview(tx) ? { ...card, marginTop: 12 } : card}>
        <KV k="Categoría" onClick={tx.is_internal_transfer ? undefined : () => setCat(true)} v={<><CatTile name={c?.name} type={c?.type} size={26} icon={12} />{c?.name ?? 'Sin categoría'}</>} />
        <Divider margin="0" />
        <KV k="Cuenta" v={<><BankLogo source={tx.source} size={26} radius={8} />{accountName(tx.source)}</>} />
        <Divider margin="0" />
        <KV k="Fecha" v={longDateTime(tx.date, tx.datetime)} />
        <Divider margin="0" />
        <KV k="Nota" onClick={edit} v={tx.note
          ? <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.note}</span>
          : <span style={{ fontSize: 15, color: C.muted, fontWeight: 700 }}>Sin nota</span>} />
      </section>
      {tx.link_group_id != null && (tx.linked_transactions?.length ?? 0) > 0 && (() => {
        const all = [tx, ...tx.linked_transactions!].sort((a, b) => (b.datetime ?? b.date).localeCompare(a.datetime ?? a.date))
        return (
          <section style={{ ...card, margin: pc ? '12px 0 0' : '12px 16px 0', padding: '6px 18px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 2px' }}>
              <span style={{ fontWeight: 800 }}>{`Fusión de ${all.length} movimientos`}</span>
              <button type="button" onClick={() => unlink(tx.link_group_id!)} style={{ height: 36, border: 0, background: "transparent", color: C.accentText, font: `800 14px ${FONT}`, padding: 0, cursor: "pointer" }}>Separar</button>
            </div>
            {all.map(l => (
              <TxRow key={l.id} tx={{ ...l, effective_amount: null, link_group_id: null }} to={l.id === tx.id ? undefined : `/transacciones/${l.id}`}
                onClick={l.id === tx.id ? () => undefined : undefined}
                sub={`${shortDate(l.date)} · ${accountName(l.source)}`} />
            ))}
            <Divider margin="0" />
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0 4px', fontWeight: 800 }}>
              <span>Total</span><span style={txNet(tx) > 0 ? { color: C.green } : undefined}>{money(txNet(tx), { sign: true, euro: true })}</span>
            </div>
          </section>
        )
      })()}
      {merchant && others > 0 && (
        <section style={{ ...card, margin: pc ? '12px 0 0' : '12px 16px 0', padding: '14px 18px' }}>
          <Link to={`/comercio/${encodeURIComponent(merchant)}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: 0, color: C.text }}>
            <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{others === 1 ? `Otro de ${merchant}` : `Otros ${others} de ${merchant}`}</span></span>
            <span style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}><span style={{ color: C.accentText, fontWeight: 800, fontSize: 14 }}>Ver</span></span>
          </Link>
        </section>
      )}
      <div style={pc ? { marginTop: 20, maxWidth: 260 } : { position: 'fixed', left: 20, right: 20, bottom: 'calc(30px - var(--vb-gap, 0px))', zIndex: 5 }}>
        <Btn icon="edit" onClick={edit}>Editar</Btn>
      </div>
      <CatSheet txs={cat ? one : null} categories={categories.data ?? []} onClose={() => setCat(false)} />
    </div>
  )
}

function pillBtn(primary: boolean) {
  return { height: 36, padding: '0 14px', borderRadius: 18, border: 0, background: primary ? C.accent : C.soft, color: primary ? C.white : C.accentText, font: `800 14px ${FONT}`, cursor: 'pointer', flex: 'none' } as const
}
