// Gastos compartidos (módulo opcional): qué parte de tus gastos te deben otras personas.
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { shareApi, type TxShare } from '@/lib/api'
import { cur as curSym } from '@/lib/format'
import { parseAmount, shortDate } from '@/lib/movements'
import { amountInput as fmtAuto, equalSplit, sharesValid } from '@/lib/shares'
import { useIsPC } from '@/app/Shell'
import { Btn, C, Empty, ErrorState, Field, FONT, Label, Row, Rows, Section, Sheet, SkelRows, SubHeader, useMoney } from '@/ui/kit'
import { Icon } from '@/ui/Icon'
import { confirm } from '@/ui/Confirm'
import { toast } from '@/ui/Toast'

const errText = (e: unknown) => (e instanceof Error ? e.message : 'Algo ha fallado')

function useInvalidateShares() {
  const qc = useQueryClient()
  return () => { qc.invalidateQueries({ queryKey: ['shares'] }) }
}

const initial = (name: string) => (
  <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', background: C.field, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
    {name.trim().charAt(0).toUpperCase()}
  </span>
)

export default function Compartidos() {
  const money = useMoney()
  const pc = useIsPC()
  const invalidate = useInvalidateShares()
  const q = useQuery({ queryKey: ['shares'], queryFn: shareApi.list })
  const [person, setPerson] = useState<string | null>(null)
  const d = q.data
  const pending = d?.people.filter(p => p.owed > 0) ?? []
  const done = d?.people.filter(p => p.owed <= 0) ?? []

  return (
    <div style={pc ? { maxWidth: 680 } : { paddingBottom: 40 }}>
      <SubHeader title="Gastos compartidos" back="/plan" />
      {q.isError ? <ErrorState text="No se pudieron cargar" retry={() => q.refetch()} /> : !d ? <SkelRows n={3} style={{ marginTop: 18 }} /> : d.people.length === 0 ? (
        <Empty icon="group" title="Nada compartido"
          text="Abre un gasto y toca Compartir para apuntar lo que le toca pagar a otra persona." />
      ) : (
        <>
          <Section pad="20px" style={{ marginTop: 18 }}>
            <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 700 }}>Te deben</p>
            <p style={{ margin: '4px 0 0', fontSize: 38, fontWeight: 800, letterSpacing: '-0.03em', color: d.total_owed > 0 ? C.green : C.text }}>
              {money(d.total_owed, { euro: true })}
            </p>
          </Section>
          {pending.length > 0 && (
            <>
              <Label>Pendiente</Label>
              <Section>
                <Rows>{pending.map(p => (
                  <Row key={p.person} lead={initial(p.person)} title={p.person} sub={p.count === 1 ? '1 gasto' : `${p.count} gastos`} chevron
                    onClick={() => setPerson(p.person)} trail={<span style={{ color: C.green }}>{money(p.owed, { euro: true })}</span>} />
                ))}</Rows>
              </Section>
            </>
          )}
          {done.length > 0 && (
            <>
              <Label>Saldado</Label>
              <Section>
                <Rows>{done.map(p => (
                  <Row key={p.person} lead={initial(p.person)} title={p.person} chevron onClick={() => setPerson(p.person)}
                    trail={<span style={{ color: C.muted }}>{money(p.settled, { euro: true })}</span>} />
                ))}</Rows>
              </Section>
            </>
          )}
        </>
      )}
      {person && d && (
        <PersonSheet person={person} items={d.items.filter(i => i.person === person)} onClose={() => setPerson(null)} onChange={invalidate} />
      )}
    </div>
  )
}

function PersonSheet({ person, items, onClose, onChange }: { person: string; items: TxShare[]; onClose: () => void; onChange: () => void }) {
  const money = useMoney()
  const owed = items.filter(i => !i.settled).reduce((s, i) => s + i.amount, 0)
  async function settleAll() {
    const ok = await confirm({ title: 'Marcar como pagado', text: `${person} te ha pagado ${money(owed, { euro: true })}.`, action: 'Marcar pagado' })
    if (!ok) return
    try { await shareApi.settlePerson(person); onChange(); toast('Saldado'); onClose() } catch (e) { toast(errText(e), { error: true }) }
  }
  async function toggle(i: TxShare) {
    try { await shareApi.settle(i.id, !i.settled); onChange() } catch (e) { toast(errText(e), { error: true }) }
  }
  return (
    <Sheet open onClose={onClose} title={person}>
      <Rows>{items.map(i => (
        <Row key={i.id} title={i.tx_name ?? 'Gasto'} sub={i.tx_date ? shortDate(i.tx_date) : undefined} onClick={() => toggle(i)}
          trail={
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={i.settled ? { color: C.muted, textDecoration: 'line-through' } : { color: C.green }}>{money(i.amount, { euro: true })}</span>
              <span aria-label={i.settled ? 'Pagado' : 'Pendiente'} style={{
                width: 24, height: 24, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i.settled ? C.accent : 'transparent', border: i.settled ? 0 : `2px solid var(--track)`, color: C.white, boxSizing: 'border-box',
              }}>{i.settled && <Icon name="check-mark" size={14} />}</span>
            </span>
          } />
      ))}</Rows>
      {owed > 0 && <Btn onClick={settleAll} style={{ marginTop: 14 }}>Me lo ha pagado todo</Btn>}
    </Sheet>
  )
}

/** Hoja para repartir un gasto: quién paga cuánto. Se abre desde el detalle del movimiento. */
export function ShareSheet({ txId, total, onClose }: { txId: number; total: number; onClose: () => void }) {
  const qc = useQueryClient()
  const current = useQuery({ queryKey: ['shares', 'tx', txId], queryFn: () => shareApi.forTx(txId) })
  const [rows, setRows] = useState<{ person: string; amount: string }[] | null>(null)
  const list = rows ?? (current.data
    ? (current.data.length ? current.data.map(s => ({ person: s.person, amount: fmtAuto(s.amount) })) : [{ person: '', amount: '' }])
    : null)
  const parsed = (list ?? []).map(r => ({ person: r.person.trim(), amount: parseAmount(r.amount) ?? 0 }))
  const filled = parsed.filter(r => r.person || r.amount)
  const ok = sharesValid(filled, total)
  const set = (i: number, k: 'person' | 'amount', v: string) => setRows((list ?? []).map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const save = useMutation({
    mutationFn: () => shareApi.setForTx(txId, filled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shares'] })
      toast(filled.length ? 'Gasto compartido' : 'Ya no se comparte')
      onClose()
    },
    onError: e => toast(errText(e), { error: true }),
  })
  const split = () => {
    const amounts = equalSplit(total, (list ?? []).length)
    setRows((list ?? []).map((r, i) => ({ ...r, amount: fmtAuto(amounts[i]) })))
  }
  return (
    <Sheet open onClose={onClose} title="Compartir gasto">
      {!list ? <SkelRows n={2} /> : (
        <>
          {list.map((r, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) 40px', gap: 8, alignItems: 'end' }}>
              <Field label={i === 0 ? 'Persona' : undefined} placeholder="Nombre" value={r.person} onChange={e => set(i, 'person', e.target.value)} />
              <Field label={i === 0 ? 'Le toca' : undefined} inputMode="decimal" placeholder="0,00" value={r.amount} onChange={e => set(i, 'amount', e.target.value)}
                trail={<span style={{ color: C.muted, fontWeight: 700 }}>{curSym()}</span>} />
              <button type="button" aria-label="Quitar" onClick={() => setRows(list.length === 1 ? [{ person: '', amount: '' }] : list.filter((_, j) => j !== i))}
                style={{ height: 52, marginBottom: 12, border: 0, background: 'transparent', color: C.muted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 16, margin: '0 4px 14px' }}>
            <button type="button" onClick={() => setRows([...list, { person: '', amount: '' }])} style={linkBtn}>Añadir persona</button>
            <button type="button" onClick={split} style={linkBtn}>A partes iguales</button>
          </div>
          <Btn disabled={!ok || save.isPending} onClick={() => save.mutate()}>Guardar</Btn>
        </>
      )}
    </Sheet>
  )
}

const linkBtn = { height: 36, border: 0, background: 'transparent', color: C.accentText, font: `800 14px ${FONT}`, padding: 0, cursor: 'pointer' } as const
