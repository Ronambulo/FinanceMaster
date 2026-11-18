// Editar un movimiento (tablero EditarGasto). Importe, fecha, tipo y cuenta solo en los manuales.
import { cur } from '@/lib/format'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { catApi, dashApi, txApi, type Category, type Transaction } from '@/lib/api'
import { accountName, amountText, categoriesFor, cleanAmount, isManualTx, kindToType, parseAmount, shortDate, signedAmount, toServerTime, txKind, txTime, type TxKind } from '@/lib/movements'
import { useIsPC } from '@/app/Shell'
import { BankLogo } from '@/ui/BankLogo'
import { CatPickSheet } from '@/ui/CatPick'
import { CatTile, Icon } from '@/ui/Icon'
import { Btn, C, Divider, Empty, FONT, Field, IconTile, PickField, RoundBtn, Segmented, Sheet, SheetOption, Skeleton, Switch } from '@/ui/kit'
import { toast } from '@/ui/Toast'

const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Algo ha fallado')
const TITLES: Record<TxKind, string> = { expense: 'Editar gasto', income: 'Editar ingreso', transfer: 'Editar traspaso' }

/** Quita el movimiento de las listas en caché para que desaparezca al momento. */
export function dropFromCache(qc: ReturnType<typeof useQueryClient>, id: number) {
  qc.setQueriesData({ queryKey: ['transactions'] }, (d: unknown) => {
    const x = d as { pages?: { items: Transaction[] }[] } | undefined
    if (!x?.pages) return d
    return { ...x, pages: x.pages.map(p => ({ ...p, items: p.items.filter(t => t.id !== id) })) }
  })
}

export default function EditarGasto() {
  const id = Number(useParams().id)
  const q = useQuery({ queryKey: ['transactions', 'one', id], queryFn: () => txApi.get(id), enabled: Number.isFinite(id) })
  const pc = useIsPC()
  if (q.isLoading) return <div style={{ padding: 16, display: 'grid', gap: 12 }}><Skeleton h={60} /><Skeleton h={300} /></div>
  if (!q.data) return <Empty icon="search" title="No encontrado" text="Este movimiento ya no existe." />
  return <Form tx={q.data} pc={pc} />
}

function Form({ tx, pc }: { tx: Transaction; pc: boolean }) {
  const nav = useNavigate()
  const qc = useQueryClient()
  const manual = isManualTx(tx)
  const [kind, setKind] = useState<TxKind>(txKind(tx))
  const [amount, setAmount] = useState(amountText(tx.amount))
  const [name, setName] = useState(tx.name || tx.description || '')
  const [catId, setCatId] = useState<number | null>(tx.category_id)
  const [source, setSource] = useState(tx.source || 'manual')
  const [date, setDate] = useState(tx.date.slice(0, 10))
  const [time, setTime] = useState(txTime(tx.datetime))
  const [note, setNote] = useState(tx.note ?? '')
  const [exclude, setExclude] = useState(tx.exclude_from_stats)
  const [sheet, setSheet] = useState<'cat' | 'account' | null>(null)
  const [busy, setBusy] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const categories = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: dashApi.accounts, enabled: manual })
  const list = useMemo(() => categoriesFor(categories.data ?? [], kind), [categories.data, kind])
  const cat: Category | undefined = (categories.data ?? []).find(c => c.id === catId) ?? (tx.category?.id === catId ? tx.category ?? undefined : undefined)
  useEffect(() => { if (manual && !pc) amountRef.current?.focus() }, [manual, pc])

  // En los importados el signo viene del banco: un gasto puede pasar a traspaso, no a ingreso.
  const kindOff = (k: TxKind) => !manual && k !== 'transfer' && k !== (tx.amount > 0 ? 'income' : 'expense')
  const back = () => nav(`/transacciones/${tx.id}`, { replace: true })

  async function save() {
    const data: Partial<Transaction> = {}
    if (name.trim() && name.trim() !== (tx.name || tx.description || '')) data.name = name.trim()
    if (catId !== tx.category_id && catId != null) data.category_id = catId
    if ((note.trim() || null) !== (tx.note || null)) data.note = note.trim()
    if (exclude !== tx.exclude_from_stats) data.exclude_from_stats = exclude
    if ((kind === 'transfer') !== tx.is_internal_transfer) data.is_internal_transfer = kind === 'transfer'
    if (manual) {
      const n = parseAmount(amount)
      if (n == null || n <= 0) { toast('Escribe un importe', { error: true }); amountRef.current?.focus(); return }
      const signed = signedAmount(n, kind)
      if (signed !== tx.amount) data.amount = signed
      const type = kindToType(kind, tx.type)
      if (type !== tx.type) data.type = type
      if (date !== tx.date.slice(0, 10)) data.date = date
      if (time && (date !== tx.date.slice(0, 10) || time !== txTime(tx.datetime))) data.datetime = toServerTime(date, time)
      if (source !== (tx.source || 'manual')) data.source = source
    }
    if (!Object.keys(data).length) { back(); return }
    setBusy(true)
    try {
      await txApi.update(tx.id, data)
      qc.invalidateQueries()
      toast('Cambios guardados')
      back()
    } catch (e) { toast(errText(e), { error: true }) } finally { setBusy(false) }
  }

  function remove() {
    const timer = setTimeout(async () => {
      try { await txApi.delete(tx.id) } catch (e) { toast(errText(e), { error: true }) }
      qc.invalidateQueries()
    }, 5000)
    dropFromCache(qc, tx.id)
    nav('/transacciones', { replace: true })
    toast('Movimiento borrado', { undo: () => { clearTimeout(timer); qc.invalidateQueries() } })
  }

  const pad = pc ? 0 : 16
  const sources = [...new Set([...(accounts.data ?? []).map(a => a.source).filter(s => s !== 'manual'), 'manual'])]
  const canSplit = kind !== 'transfer' && !tx.split_parent_id && !tx.link_group_id
  const openPicker = (el: HTMLInputElement | null) => {
    if (!el) return
    try { el.showPicker() } catch { el.focus(); el.click() }
  }

  return (
    <div style={pc ? { maxWidth: 560 } : { paddingBottom: 110 }}>
      <header style={{ padding: pc ? 0 : '18px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <RoundBtn icon="close" label="Cancelar" onClick={back} />
        <div style={{ flex: 1, minWidth: 0 }}><h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{TITLES[kind]}</h1></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" disabled={busy} onClick={save} style={{ height: 44, border: 0, borderRadius: 14, background: C.accent, color: C.white, font: `800 15px ${FONT}`, padding: '0 16px', cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>Guardar</button>
        </div>
      </header>
      <div style={{ padding: `14px ${pad}px 0` }}>
        <Segmented label="Tipo" value={kind} onChange={setKind} disabled={kindOff} options={[['expense', 'Gasto'], ['income', 'Ingreso'], ['transfer', 'Traspaso']]} />
      </div>
      <div style={{ margin: '18px 0 4px', display: 'flex', alignItems: 'baseline', justifyContent: 'center' }}>
        {manual ? (
          <input ref={amountRef} aria-label="Importe" inputMode="decimal" value={amount} onChange={e => setAmount(cleanAmount(e.target.value))}
            style={{ width: `${Math.max(amount.length, 1) + 0.5}ch`, maxWidth: '80%', border: 0, background: 'transparent', color: C.text, font: `800 46px ${FONT}`, letterSpacing: '-0.03em', textAlign: 'center', outline: 'none', caretColor: 'var(--c-b3aeff)', padding: 0 }} />
        ) : (
          <span style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-0.03em' }}>{amount}</span>
        )}
        <span style={{ fontSize: 28, fontWeight: 800, color: C.muted, marginLeft: 6 }}>{cur()}</span>
      </div>
      <div style={{ padding: `0 ${pad}px` }}>
        <Field label="Concepto" id="ed-concepto" value={name} onChange={e => setName(e.target.value)} />
        {kind !== 'transfer' && (
          <PickField label="Categoría" onClick={() => setSheet('cat')} lead={<CatTile name={cat?.name} type={cat?.type} size={30} icon={14} />}>{cat?.name ?? 'Sin categoría'}</PickField>
        )}
        <PickField label="Cuenta" disabled={!manual} onClick={() => setSheet('account')}
          lead={source === 'manual' ? <IconTile icon="wallet" size={30} radius={9} bg={C.soft} color={C.accentText} iconSize={16} /> : <BankLogo source={source} size={30} radius={9} />}>{accountName(source)}</PickField>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 10 }}>
          <div style={{ position: 'relative', minWidth: 0 }}>
            <PickField label="Fecha" disabled={!manual} onClick={() => openPicker(dateRef.current)}
              lead={<span style={{ color: C.muted, display: 'flex', paddingLeft: 4 }}><Icon name="calendar" size={18} /></span>}>{shortDate(date)}</PickField>
            {manual && <input ref={dateRef} type="date" tabIndex={-1} aria-hidden="true" value={date} max={new Date().toISOString().slice(0, 10)} onChange={e => e.target.value && setDate(e.target.value)} style={{ position: 'absolute', left: 0, bottom: 12, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />}
          </div>
          <div style={{ position: 'relative', minWidth: 0 }}>
            <PickField label="Hora" disabled={!manual} onClick={() => openPicker(timeRef.current)}
              lead={<span style={{ color: C.muted, display: 'flex', paddingLeft: 4 }}><Icon name="history-record" size={18} /></span>}>{time || 'Sin hora'}</PickField>
            {manual && <input ref={timeRef} type="time" tabIndex={-1} aria-hidden="true" value={time} onChange={e => e.target.value && setTime(e.target.value)} style={{ position: 'absolute', left: 0, bottom: 12, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />}
          </div>
        </div>
        <Field label="Nota" id="ed-nota" placeholder="Añadir nota" value={note} onChange={e => setNote(e.target.value)} style={{ margin: 0 }} />
      </div>
      <section style={{ margin: pc ? '12px 0 0' : '12px 16px 0', background: C.card, borderRadius: 24, padding: '4px 16px', boxShadow: 'var(--sh-card)' }}>
        {canSplit && (
          <>
            <a role="button" tabIndex={0} onClick={() => nav(`/transacciones/${tx.id}/dividir`)} onKeyDown={e => e.key === 'Enter' && nav(`/transacciones/${tx.id}/dividir`)}
              style={{ display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '9px 0', color: C.text, cursor: 'pointer' }}>
              <IconTile icon="pie" />
              <span><span style={{ display: 'block', fontWeight: 700 }}>Dividir en categorías</span></span>
              <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={18} /></span>
            </a>
            <Divider margin="2px 0" />
          </>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: canSplit ? '10px 0 8px' : '12px 0' }}>
          <span style={{ fontWeight: 700 }}>Excluir de estadísticas</span>
          <Switch on={exclude} onChange={setExclude} label="Excluir" />
        </div>
      </section>
      <div style={pc ? { marginTop: 20, maxWidth: 260 } : { position: 'fixed', left: 20, right: 20, bottom: 'calc(26px - var(--vb-gap, 0px))', zIndex: 5 }}>
        <Btn kind="danger" icon="delete" onClick={remove}>Borrar movimiento</Btn>
      </div>

      <CatPickSheet open={sheet === 'cat'} categories={list} current={catId} onPick={c => setCatId(c.id)} onClose={() => setSheet(null)} />
      <Sheet open={sheet === 'account'} onClose={() => setSheet(null)} title="Cuenta">
        {sources.map(s => (
          <SheetOption key={s} selected={s === source} title={accountName(s)} onClick={() => { setSource(s); setSheet(null) }}
            lead={s === 'manual' ? <IconTile icon="wallet" size={40} radius={13} bg={C.field} color={C.muted} /> : <BankLogo source={s} />} />
        ))}
      </Sheet>
    </div>
  )
}
