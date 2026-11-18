// Hoja "Nuevo movimiento": la misma en modo simple y normal, en móvil y en PC.
// El importe se escribe con el teclado del sistema (numérico en el móvil).
import { cur } from '@/lib/format'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { catApi, dashApi, txApi, type AccountBalance, type Category } from '@/lib/api'
import { accountName, categoriesFor, chipDate, cleanAmount, clockTime, isoDay, kindToType, parseAmount, signedAmount, toServerTime, type TxKind } from '@/lib/movements'
import { useAddStore } from '@/store/add'
import { BankLogo } from './BankLogo'
import { CatPickSheet } from './CatPick'
import { CatTile, Icon } from './Icon'
import { Btn, C, FONT, Field, IconTile, Segmented, Sheet, SheetOption, useMoney } from './kit'
import { toast } from './Toast'

const LAST = 'fm-add-source'
const SAVE: Record<TxKind, string> = { expense: 'Guardar gasto', income: 'Guardar ingreso', transfer: 'Guardar traspaso' }
const DONE: Record<TxKind, string> = { expense: 'Gasto guardado', income: 'Ingreso guardado', transfer: 'Traspaso guardado' }
const SHOWN = 7 // categorías a la vista; la octava casilla abre todas

function readLast(): string | null {
  try { return localStorage.getItem(LAST) } catch { return null }
}
function writeLast(s: string) {
  try { localStorage.setItem(LAST, s) } catch { /* sin almacenamiento */ }
}
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return isoDay(d) }

const chip = { height: 36, border: 0, borderRadius: 99, background: C.field, color: C.text, font: `700 13px ${FONT}`, display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap', cursor: 'pointer', flex: 'none' } as const

/** Hoja global; se monta una vez junto a los avisos. */
export function AddSheet() {
  const kind = useAddStore(s => s.kind)
  const close = useAddStore(s => s.close)
  if (!kind) return null
  return <AddForm initial={kind} onClose={close} />
}

function AddForm({ initial, onClose }: { initial: TxKind; onClose: () => void }) {
  const qc = useQueryClient()
  const money = useMoney()
  const [kind, setKind] = useState<TxKind>(initial)
  const [amount, setAmount] = useState('')
  const [catId, setCatId] = useState<number | null>(null)
  const [date, setDate] = useState(isoDay(new Date()))
  const [time, setTime] = useState(clockTime())
  const [note, setNote] = useState('')
  const [source, setSource] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [sub, setSub] = useState<'account' | 'from' | 'to' | 'note' | 'when' | 'cats' | null>(null)
  const [busy, setBusy] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)

  const categories = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: dashApi.accounts })
  const list = useMemo(() => categoriesFor(categories.data ?? [], kind === 'income' ? 'income' : 'expense'), [categories.data, kind])
  const accs: AccountBalance[] = useMemo(() => {
    const a = (accounts.data ?? []).filter(x => x.source !== 'manual')
    return [...a, { source: 'manual', label: 'Efectivo', balance: (accounts.data ?? []).find(x => x.source === 'manual')?.balance ?? 0, count: 0, last_date: null }]
  }, [accounts.data])

  // Cuenta por defecto: la última usada, si no la primera de banco.
  const src = source ?? (accs.some(a => a.source === readLast()) ? readLast()! : accs[0]?.source ?? 'manual')
  const dst = to ?? accs.find(a => a.source !== src)?.source ?? null
  const cat: Category | undefined = list.find(c => c.id === catId) ?? (kind !== 'transfer' ? list[0] : undefined)
  // La elegida desde "Todas" se pone delante para que se vea marcada.
  const shown = useMemo(() => {
    const first = list.slice(0, SHOWN)
    return cat && !first.some(c => c.id === cat.id) ? [cat, ...first.slice(0, SHOWN - 1)] : first
  }, [list, cat])
  const value = parseAmount(amount)

  // El teclado del móvil solo se abre si el foco llega dentro del toque que abrió la hoja.
  useEffect(() => { amountRef.current?.focus({ preventScroll: true }) }, [])

  const label = (s: string) => (s === 'manual' ? 'Efectivo' : accountName(s))
  const accLead = (s: string, size = 24, radius = 8) => (s === 'manual'
    ? <IconTile icon="wallet" size={size} radius={radius} bg={C.soft} color={C.accentText} iconSize={Math.round(size / 2)} />
    : <BankLogo source={s} size={size} radius={radius} />)
  const balanceOf = (s: string) => accs.find(a => a.source === s)?.balance ?? 0

  async function save() {
    if (busy) return
    if (!value || value <= 0) { toast('Escribe un importe', { error: true }); amountRef.current?.focus(); return }
    setBusy(true)
    const datetime = toServerTime(date, time)
    try {
      if (kind === 'transfer') {
        if (!dst || dst === src) { toast('Elige dos cuentas distintas', { error: true }); return }
        const made = await txApi.transfer({ amount: value, date, datetime, from_source: src, to_source: dst, note: note.trim() || undefined })
        undoable(made.map(t => t.id))
      } else {
        const made = await txApi.create({
          date, datetime, type: kindToType(kind), amount: signedAmount(value, kind), name: cat?.name ?? (kind === 'income' ? 'Ingreso' : 'Gasto'),
          category_id: cat?.id ?? null, source: src, note: note.trim() || null,
        })
        undoable([made.id])
      }
      writeLast(src)
      onClose()
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : 'Algo ha fallado', { error: true })
    } finally { setBusy(false) }
  }

  function undoable(ids: number[]) {
    qc.invalidateQueries()
    toast(DONE[kind], {
      undo: async () => {
        await Promise.all(ids.map(id => txApi.delete(id).catch(() => undefined)))
        qc.invalidateQueries()
      },
    })
  }

  const swap = () => { if (dst) { setSource(dst); setTo(src) } }

  return (
    <Sheet open onClose={onClose} title="Nuevo movimiento">
      <Segmented label="Tipo" value={kind} onChange={setKind} options={[['expense', 'Gasto'], ['income', 'Ingreso'], ['transfer', 'Traspaso']]} />

      <label style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', margin: '20px 0 0', cursor: 'text' }}>
        <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>Importe</span>
        <input ref={amountRef} inputMode="decimal" enterKeyHint="done" autoComplete="off" placeholder="0" value={amount}
          onChange={e => setAmount(cleanAmount(e.target.value))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
          style={{ width: `${Math.max(amount.length, 1) + 0.6}ch`, maxWidth: '78%', border: 0, background: 'transparent', color: C.text, font: `800 54px ${FONT}`, letterSpacing: '-0.04em', textAlign: 'center', outline: 'none', caretColor: 'var(--c-b3aeff)', padding: 0, lineHeight: 1.1 }} />
        <span style={{ fontSize: 34, fontWeight: 800, color: C.muted, marginLeft: 4 }}>{cur()}</span>
      </label>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setSub('when')} style={{ ...chip, padding: '0 14px 0 11px', background: C.soft, color: C.accentText, fontWeight: 800 }}>
          <Icon name="calendar" size={16} />{chipDate(date, new Date())} · {time}
        </button>
        {kind !== 'transfer' && (
          <button type="button" onClick={() => setSub('account')} style={{ ...chip, padding: '0 14px 0 6px' }}>{accLead(src)}{label(src)}</button>
        )}
        <button type="button" aria-label={note.trim() ? `Nota: ${note.trim()}` : 'Añadir nota'} onClick={() => setSub('note')}
          style={{ ...chip, ...(note.trim() ? { padding: '0 14px 0 11px', maxWidth: 170 } : { width: 36, justifyContent: 'center', padding: 0 }) }}>
          <Icon name="edit" size={16} />
          {note.trim() && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{note.trim()}</span>}
        </button>
      </div>

      {kind === 'transfer' ? (
        <div style={{ position: 'relative', display: 'grid', gap: 8, marginTop: 20 }}>
          <AccountRow title="Desde" lead={accLead(src, 40, 12)} name={label(src)} balance={money(balanceOf(src), { euro: true })} onClick={() => setSub('from')} />
          <AccountRow title="Hacia" lead={dst ? accLead(dst, 40, 12) : undefined} name={dst ? label(dst) : 'Elige cuenta'} balance={dst ? money(balanceOf(dst), { euro: true }) : ''} onClick={() => setSub('to')} />
          <button type="button" aria-label="Intercambiar cuentas" onClick={swap}
            style={{ position: 'absolute', right: 112, top: 'calc(50% - 18px)', width: 36, height: 36, borderRadius: '50%', border: 0, padding: 0, background: C.soft, color: C.accentText, boxShadow: `0 0 0 4px ${C.pop}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <Icon name="arrow-swap" size={17} />
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px 4px', marginTop: 18 }}>
          {shown.map(c => {
            const on = cat?.id === c.id
            return (
              <button key={c.id} type="button" aria-pressed={on} onClick={() => setCatId(c.id)} style={tileBtn}>
                <CatTile name={c.name} type={c.type} size={46} icon={22} style={on ? { boxShadow: `0 0 0 2px ${C.pop}, 0 0 0 4px var(--c-5b52f0)` } : undefined} />
                <span style={{ ...tileText, color: on ? C.text : C.muted, fontWeight: on ? 800 : 700 }}>{c.name}</span>
              </button>
            )
          })}
          {list.length > shown.length && (
            <button type="button" onClick={() => setSub('cats')} style={tileBtn}>
              <span style={{ width: 46, height: 46, borderRadius: 15, background: C.field, color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="dots" size={22} /></span>
              <span style={{ ...tileText, color: C.muted }}>Todas</span>
            </button>
          )}
        </div>
      )}

      <Btn height={56} disabled={busy} onClick={save} style={{ margin: '20px 0 0' }}>{SAVE[kind]}</Btn>

      {/* Hojas secundarias */}
      <Sheet open={sub === 'account' || sub === 'from' || sub === 'to'} onClose={() => setSub(null)} title={sub === 'from' ? 'Desde' : sub === 'to' ? 'Hacia' : 'Cuenta'}>
        {accs.map(a => (
          <SheetOption key={a.source} selected={a.source === (sub === 'to' ? dst : src)} title={label(a.source)} sub={money(a.balance, { euro: true })} lead={accLead(a.source, 40, 10)}
            onClick={() => {
              if (sub === 'to') setTo(a.source)
              else { setSource(a.source); if (a.source === dst) setTo(null) }
              setSub(null)
            }} />
        ))}
      </Sheet>
      <Sheet open={sub === 'note'} onClose={() => setSub(null)} title="Nota">
        <Field id="add-nota" placeholder="Añadir nota" value={note} autoFocus maxLength={200} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && setSub(null)} />
        <Btn onClick={() => setSub(null)}>Listo</Btn>
      </Sheet>
      {sub === 'when' && <WhenSheet date={date} time={time} onDone={(d, t) => { setDate(d); setTime(t); setSub(null) }} onClose={() => setSub(null)} />}
      <CatPickSheet open={sub === 'cats'} categories={list} current={cat?.id} onPick={c => setCatId(c.id)} onClose={() => setSub(null)} />
    </Sheet>
  )
}

const tileBtn = { border: 0, background: 'transparent', color: C.text, padding: '4px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer', minWidth: 0, font: 'inherit' } as const
const tileText = { fontSize: 11.5, lineHeight: 1.2, textAlign: 'center', maxWidth: '100%', overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as const

/** Hoja de fecha y hora: atajos de día y los selectores del sistema. */
function WhenSheet({ date, time, onDone, onClose }: { date: string; time: string; onDone: (d: string, t: string) => void; onClose: () => void }) {
  const [d, setD] = useState(date)
  const [t, setT] = useState(time)
  const quick: [string, string][] = [['Hoy', daysAgo(0)], ['Ayer', daysAgo(1)], ['Anteayer', daysAgo(2)]]
  return (
    <Sheet open onClose={onClose} title="Fecha y hora">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {quick.map(([l, v]) => {
          const on = d === v
          return (
            <button key={l} type="button" aria-pressed={on} onClick={() => setD(v)}
              style={{ height: 44, border: 0, borderRadius: 14, background: on ? C.soft : C.field, color: on ? C.accentText : C.text, boxShadow: on ? 'inset 0 0 0 2px var(--c-5b52f0)' : 'none', font: `${on ? 800 : 700} 14px ${FONT}`, cursor: 'pointer' }}>{l}</button>
          )
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 10, marginTop: 16 }}>
        <Field label="Fecha" id="add-fecha" type="date" icon="calendar" value={d} max={daysAgo(0)} onChange={e => e.target.value && setD(e.target.value)} style={{ margin: 0 }} />
        <Field label="Hora" id="add-hora" type="time" icon="history-record" value={t} onChange={e => e.target.value && setT(e.target.value)} style={{ margin: 0 }} />
      </div>
      <button type="button" onClick={() => { setD(daysAgo(0)); setT(clockTime()) }}
        style={{ margin: '8px 0 0', height: 40, border: 0, background: 'transparent', color: C.accentText, font: `800 14px ${FONT}`, padding: '0 4px', cursor: 'pointer' }}>Usar la hora actual</button>
      <Btn height={56} onClick={() => onDone(d, t)} style={{ marginTop: 10 }}>Listo</Btn>
    </Sheet>
  )
}

function AccountRow({ title, lead, name, balance, onClick }: { title: string; lead?: React.ReactNode; name: string; balance: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ height: 62, boxSizing: 'border-box', border: 0, borderRadius: 18, background: C.field, display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px 0 10px', color: C.text, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
      {lead ?? <span style={{ width: 40, height: 40, borderRadius: 12, background: C.card }} />}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>{title}</span>
        <span style={{ fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>{balance}</span>
    </button>
  )
}
