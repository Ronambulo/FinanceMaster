// Dividir un gasto entre categorías (tablero Dividir).
import { cur } from '@/lib/format'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { catApi, txApi, type Category, type Transaction } from '@/lib/api'
import { amountText, categoriesFor, equalParts, parseAmount, txKind, txTitle } from '@/lib/movements'
import { useIsPC } from '@/app/Shell'
import { CatPickSheet } from '@/ui/CatPick'
import { CatTile, Icon } from '@/ui/Icon'
import { C, Divider, Empty, FONT, RoundBtn, Skeleton, useMoney } from '@/ui/kit'
import { toast } from '@/ui/Toast'

type Part = { key: number; category_id: number | null; text: string }
let seq = 0
const mk = (category_id: number | null, amount: number): Part => ({ key: ++seq, category_id, text: amountText(amount) })
const cents = (n: number) => Math.round(n * 100)

export default function Dividir() {
  const id = Number(useParams().id)
  const q = useQuery({ queryKey: ['transactions', 'one', id], queryFn: () => txApi.get(id), enabled: Number.isFinite(id) })
  const pc = useIsPC()
  if (q.isLoading) return <div style={{ padding: 16, display: 'grid', gap: 12 }}><Skeleton h={90} /><Skeleton h={200} /></div>
  if (!q.data) return <Empty icon="search" title="No encontrado" text="Este movimiento ya no existe." />
  return <Form tx={q.data} pc={pc} />
}

function Form({ tx, pc }: { tx: Transaction; pc: boolean }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const money = useMoney()
  const total = Math.abs(tx.amount)
  const [parts, setParts] = useState<Part[]>(() =>
    tx.split_parts?.length ? tx.split_parts.map(p => mk(p.category_id, p.amount)) : [mk(tx.category_id, total)])
  const [focus, setFocus] = useState<number | null>(null)
  const [pick, setPick] = useState<number | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const categories = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const all = categories.data ?? []
  const list = useMemo(() => categoriesFor(all, txKind(tx)), [all, tx])
  const catOf = (cid: number | null): Category | undefined => all.find(c => c.id === cid)

  const values = parts.map(p => parseAmount(p.text) ?? 0)
  const left = (cents(total) - values.reduce((s, v) => s + cents(v), 0)) / 100
  const ok = left === 0 && values.every(v => v > 0)
  const back = () => nav(`/transacciones/${tx.id}`, { replace: true })

  const setText = (key: number, text: string) => setParts(ps => ps.map(p => (p.key === key ? { ...p, text: text.replace(/[^\d,.]/g, '') } : p)))
  const spread = (n: number) => {
    let ps = parts.slice(0, n)
    while (ps.length < n) ps = [...ps, mk(null, 0)]
    const amounts = equalParts(total, n)
    setParts(ps.map((p, i) => ({ ...p, text: amountText(amounts[i]) })))
  }

  async function save() {
    if (!ok) { toast(left !== 0 ? 'Las partes no suman el total' : 'Cada parte necesita un importe', { error: true }); return }
    setBusy(true)
    try {
      await txApi.split(tx.id, parts.map((p, i) => ({ category_id: p.category_id, amount: values[i] })))
      qc.invalidateQueries()
      toast(parts.length > 1 ? `Dividido en ${parts.length} partes` : 'División quitada')
      back()
    } catch (e) { toast(e instanceof Error && e.message ? e.message : 'Algo ha fallado', { error: true }) } finally { setBusy(false) }
  }

  const m = pc ? 0 : 16
  const statusOk = left === 0
  return (
    <div style={pc ? { maxWidth: 560 } : { paddingBottom: 40 }}>
      <header style={{ padding: pc ? 0 : '18px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <RoundBtn icon="close" label="Cancelar" onClick={back} />
        <div style={{ flex: 1, minWidth: 0 }}><h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{txKind(tx) === 'income' ? 'Dividir ingreso' : 'Dividir gasto'}</h1></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" disabled={busy} onClick={save} style={{ height: 44, border: 0, borderRadius: 14, background: C.accent, color: C.white, font: `800 15px ${FONT}`, padding: '0 16px', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Guardar</button>
        </div>
      </header>
      <div style={{ textAlign: 'center', padding: '22px 20px 0' }}>
        <p style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{txTitle(tx)}</p>
        <p style={{ margin: '2px 0 0', fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em' }}>{money(tx.amount, { sign: true, euro: true })}</p>
      </div>
      <section style={{ margin: `20px ${m}px 0`, background: C.card, borderRadius: 24, padding: '6px 16px', boxShadow: 'var(--sh-card)' }}>
        {parts.map((p, i) => {
          const cat = catOf(p.category_id)
          const name = cat?.name ?? 'Sin categoría'
          return (
            <div key={p.key}>
              {i > 0 && <Divider margin="0" />}
              <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 112px 32px', gap: 10, alignItems: 'center', padding: '8px 0' }}>
                <button type="button" aria-label={`Categoría: ${name}`} onClick={() => setPick(p.key)} style={{ border: 0, padding: 0, background: 'transparent', cursor: 'pointer', display: 'flex' }}>
                  <CatTile name={cat?.name} type={cat?.type} size={40} icon={19} />
                </button>
                <button type="button" onClick={() => setPick(p.key)} style={{ border: 0, padding: 0, background: 'transparent', color: C.text, font: `700 15px ${FONT}`, textAlign: 'left', cursor: 'pointer', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</button>
                <label style={{ height: 44, borderRadius: 14, background: C.field, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 12px', fontWeight: 800, boxShadow: focus === p.key ? 'inset 0 0 0 2px var(--c-5b52f0)' : undefined, cursor: 'text' }}>
                  <input aria-label={`Importe de ${name}`} inputMode="decimal" value={p.text} onFocus={e => { setFocus(p.key); e.target.select() }} onBlur={() => setFocus(null)} onChange={e => setText(p.key, e.target.value)}
                    style={{ width: '100%', minWidth: 0, border: 0, background: 'transparent', color: C.text, font: `800 15px ${FONT}`, textAlign: 'right', outline: 'none', padding: 0 }} />
                  <span style={{ marginLeft: 4 }}>{cur()}</span>
                </label>
                {parts.length > 1 ? (
                  <button type="button" aria-label={`Quitar ${name}`} onClick={() => setParts(ps => ps.filter(x => x.key !== p.key))}
                    style={{ width: 32, height: 32, border: 0, borderRadius: '50%', background: 'transparent', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer' }}><Icon name="close" size={16} /></button>
                ) : <span />}
              </div>
            </div>
          )
        })}
        <button type="button" onClick={() => setPick('new')} style={{ width: '100%', height: 48, marginTop: 4, border: 0, background: 'transparent', color: C.accentText, font: `800 15px ${FONT}`, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 9px 0 0', cursor: 'pointer' }}>
          <Icon name="plus" size={18} />
          Añadir parte
        </button>
      </section>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: pc ? '14px 0 0' : '14px 20px 0', padding: '12px 16px', borderRadius: 16, background: statusOk ? 'var(--c-12301f)' : 'var(--c-3a2a14)', color: statusOk ? 'var(--c-6fe0a5)' : 'var(--c-ffc27a)', fontWeight: 800 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {statusOk && <Icon name="check-mark" size={18} />}
          {statusOk ? 'Cuadra' : left > 0 ? 'Falta' : 'Te pasas'}
        </span>
        <span>{left >= 0 ? `${amountText(left)} ${cur()} sin repartir` : `${amountText(left)} ${cur()} de más`}</span>
      </div>
      <div style={{ margin: pc ? '16px 0 0' : '16px 20px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {([['Mitad y mitad', () => spread(2)], ['Por partes iguales', () => spread(Math.max(parts.length, 2))]] as const).map(([label, fn]) => (
          <button key={label} type="button" onClick={fn} style={{ height: 36, padding: '0 14px', border: 0, borderRadius: 99, background: C.card, color: C.text, font: `700 13px ${FONT}`, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', cursor: 'pointer', flex: 'none', boxShadow: 'var(--sh-card)' }}>{label}</button>
        ))}
      </div>

      <CatPickSheet open={pick != null} title={pick === 'new' ? 'Nueva parte' : 'Categoría'} categories={list}
        current={typeof pick === 'number' ? parts.find(p => p.key === pick)?.category_id ?? null : null}
        onPick={c => {
          if (pick === 'new') setParts(ps => [...ps, mk(c.id, Math.max(left, 0))])
          else setParts(ps => ps.map(p => (p.key === pick ? { ...p, category_id: c.id } : p)))
        }}
        onClose={() => setPick(null)} />
    </div>
  )
}
