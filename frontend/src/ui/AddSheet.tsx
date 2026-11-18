// Hoja "Nuevo movimiento" (tableros Anadir, Traspaso y UltraAnadir).
import { cur } from '@/lib/format'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { catApi, dashApi, txApi, type AccountBalance, type Category } from '@/lib/api'
import { accountName, categoriesFor, dayLabel, kindToType, parseAmount, signedAmount, typeKey, type TxKind } from '@/lib/movements'
import { usePreferencesStore } from '@/store/preferences'
import { useAddStore } from '@/store/add'
import { BankLogo } from './BankLogo'
import { CatTile, Icon } from './Icon'
import { Btn, C, FONT, Field, IconTile, Segmented, Sheet, SheetOption, useMoney } from './kit'
import { toast } from './Toast'

const LAST = 'fm-add-source'
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫']
const SAVE: Record<TxKind, string> = { expense: 'Guardar gasto', income: 'Guardar ingreso', transfer: 'Guardar traspaso' }
const DONE: Record<TxKind, string> = { expense: 'Gasto guardado', income: 'Ingreso guardado', transfer: 'Traspaso guardado' }

function localIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function readLast(): string | null {
  try { return localStorage.getItem(LAST) } catch { return null }
}
function writeLast(s: string) {
  try { localStorage.setItem(LAST, s) } catch { /* sin almacenamiento */ }
}

const chip = { height: 36, padding: '0 14px', border: 0, borderRadius: 99, background: C.field, color: C.text, font: `700 13px ${FONT}`, display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', cursor: 'pointer', flex: 'none', boxShadow: 'var(--sh-card)' } as const

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
  const ultra = usePreferencesStore(s => s.prefs.ui_mode === 'ultra')
  const [kind, setKind] = useState<TxKind>(ultra ? (initial === 'income' ? 'income' : 'expense') : initial)
  const [amount, setAmount] = useState('')
  const [catId, setCatId] = useState<number | null>(null)
  const [date, setDate] = useState(localIso())
  const [note, setNote] = useState('')
  const [source, setSource] = useState<string | null>(null)
  const [to, setTo] = useState<string | null>(null)
  const [sub, setSub] = useState<'account' | 'from' | 'to' | 'note' | null>(null)
  const [busy, setBusy] = useState(false)
  const dateRef = useRef<HTMLInputElement>(null)

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
  const value = parseAmount(amount)

  const press = (k: string) => setAmount(a => typeKey(a, k))
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sub || (e.target instanceof HTMLInputElement && e.target.type !== 'date')) return
      if (/^[\d,.]$/.test(e.key)) { press(e.key); e.preventDefault() }
      else if (e.key === 'Backspace') { press('⌫'); e.preventDefault() }
      else if (e.key === 'Enter') { save(); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const label = (s: string) => (s === 'manual' ? 'Efectivo' : accountName(s))
  const accLead = (s: string, size = 32) => (s === 'manual'
    ? <IconTile icon="wallet" size={size} radius={10} bg={C.soft} color={C.accentText} iconSize={size / 2} />
    : <BankLogo source={s} size={size} radius={10} />)
  const balanceOf = (s: string) => accs.find(a => a.source === s)?.balance ?? 0

  async function save() {
    if (busy) return
    if (!value || value <= 0) { toast('Escribe un importe', { error: true }); return }
    setBusy(true)
    try {
      if (kind === 'transfer') {
        if (!dst || dst === src) { toast('Elige dos cuentas distintas', { error: true }); return }
        const made = await txApi.transfer({ amount: value, date, from_source: src, to_source: dst, note: note.trim() || undefined })
        undoable(made.map(t => t.id))
      } else {
        const made = await txApi.create({
          date, type: kindToType(kind), amount: signedAmount(value, kind), name: cat?.name ?? (kind === 'income' ? 'Ingreso' : 'Gasto'),
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

  const openDate = () => {
    const el = dateRef.current
    if (!el) return
    try { el.showPicker() } catch { el.focus(); el.click() }
  }

  const amountView = (size: number, margin: string) => (
    <p style={{ margin, textAlign: 'center', fontSize: size, fontWeight: 800, letterSpacing: '-0.03em' }} aria-live="polite">
      {amount || '0'}
      <span style={{ color: C.muted }}>{cur()}</span>
    </p>
  )

  const keypad = (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
      {KEYS.map(k => (
        <button key={k} type="button" aria-label={k === '⌫' ? 'Borrar' : undefined} onClick={() => press(k)}
          style={{ height: 50, border: 0, borderRadius: 14, background: C.field, color: C.text, font: `700 22px ${FONT}`, cursor: 'pointer', boxShadow: 'var(--sh-card)' }}>{k}</button>
      ))}
    </div>
  )

  const saveBtn = (h: number) => (
    <Btn height={h} disabled={busy} onClick={save} style={{ margin: '14px 0 0' }}>{SAVE[kind]}</Btn>
  )

  const dateInput = (
    <input ref={dateRef} type="date" tabIndex={-1} aria-hidden="true" value={date} max={localIso()} onChange={e => e.target.value && setDate(e.target.value)}
      style={{ position: 'absolute', left: '50%', bottom: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />
  )

  const accountPicker = (
    <Sheet open={sub === 'account' || sub === 'from' || sub === 'to'} onClose={() => setSub(null)} title={sub === 'from' ? 'Desde' : sub === 'to' ? 'Hacia' : 'Cuenta'}>
      {accs.map(a => {
        const cur = sub === 'to' ? dst : src
        return (
          <SheetOption key={a.source} selected={a.source === cur} title={label(a.source)} sub={money(a.balance, { euro: true })} lead={accLead(a.source, 40)}
            onClick={() => {
              if (sub === 'to') setTo(a.source)
              else { setSource(a.source); if (a.source === dst) setTo(null) }
              setSub(null)
            }} />
        )
      })}
    </Sheet>
  )

  // ── Ultra simple: gasto o ingreso ─────────────────────────────────────────────
  if (ultra) {
    return (
      <Sheet open onClose={onClose} title={kind === 'income' ? 'Añadir ingreso' : 'Añadir gasto'}>
        {amountView(52, '6px 0 0')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 18 }}>
          {list.slice(0, 8).map(c => (
            <button key={c.id} type="button" aria-pressed={cat?.id === c.id} onClick={() => setCatId(c.id)}
              style={{ border: 0, borderRadius: 18, background: C.field, color: C.text, padding: '12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, font: `700 12px ${FONT}`, cursor: 'pointer', boxShadow: cat?.id === c.id ? 'inset 0 0 0 2px var(--c-5b52f0)' : 'var(--sh-card)', minWidth: 0 }}>
              <CatTile name={c.name} type={c.type} size={40} icon={19} />
              <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            </button>
          ))}
        </div>
        {keypad}
        {saveBtn(56)}
      </Sheet>
    )
  }

  return (
    <Sheet open onClose={onClose} title="Nuevo movimiento">
      <Segmented label="Tipo" value={kind} onChange={setKind} options={[['expense', 'Gasto'], ['income', 'Ingreso'], ['transfer', 'Traspaso']]} />

      {kind === 'transfer' ? (
        <>
          {amountView(46, '18px 0 6px')}
          <TransferPick title="Desde" lead={accLead(src)} text={`${label(src)} · ${money(balanceOf(src), { euro: true })}`} onClick={() => setSub('from')} />
          <div style={{ display: 'flex', justifyContent: 'center', margin: '-4px 0 4px', color: C.muted }}><Icon name="arrow-swap" size={18} /></div>
          <TransferPick title="Hacia" lead={dst ? accLead(dst) : undefined} text={dst ? `${label(dst)} · ${money(balanceOf(dst), { euro: true })}` : 'Elige cuenta'} onClick={() => setSub('to')} />
          <p style={{ margin: '2px 4px 0', fontSize: 13, color: C.muted, fontWeight: 600 }}>No cuenta como gasto ni ingreso</p>
          <Btn disabled={busy} onClick={save} style={{ margin: '18px 0 0' }}>{SAVE.transfer}</Btn>
        </>
      ) : (
        <>
          {amountView(46, '18px 0 0')}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <button type="button" onClick={openDate} style={{ ...chip, padding: '0 14px 0 11px' }}><Icon name="calendar" size={16} />{dayLabel(date, new Date())}</button>
            <button type="button" onClick={() => setSub('account')} style={chip}>{label(src)}</button>
            <button type="button" onClick={() => setSub('note')} style={{ ...chip, padding: '0 14px 0 11px', maxWidth: 160, overflow: 'hidden' }}>
              <Icon name="edit" size={16} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{note.trim() || 'Nota'}</span>
            </button>
            {dateInput}
          </div>
          <div className="fm-noscroll" style={{ display: 'flex', gap: 14, justifyContent: list.length > 6 ? 'flex-start' : 'space-between', marginTop: 18, overflowX: 'auto', paddingBottom: 2 }}>
            {list.map(c => {
              const on = cat?.id === c.id
              return (
                <button key={c.id} type="button" aria-pressed={on} onClick={() => setCatId(c.id)}
                  style={{ flex: 'none', width: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, border: 0, background: 'transparent', color: C.text, font: `700 11px ${FONT}`, padding: '4px 0 0', cursor: 'pointer' }}>
                  <CatTile name={c.name} type={c.type} size={46} icon={22} style={on ? { boxShadow: `0 0 0 2px ${C.pop}, 0 0 0 4px var(--c-5b52f0)` } : undefined} />
                  <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                </button>
              )
            })}
          </div>
          {keypad}
          {saveBtn(52)}
        </>
      )}

      {accountPicker}
      <Sheet open={sub === 'note'} onClose={() => setSub(null)} title="Nota">
        <Field id="add-nota" placeholder="Añadir nota" value={note} autoFocus onChange={e => setNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && setSub(null)} />
        <Btn onClick={() => setSub(null)}>Listo</Btn>
      </Sheet>
      {kind === 'transfer' && dateInput}
    </Sheet>
  )
}

function TransferPick({ title, lead, text, onClick }: { title: string; lead?: React.ReactNode; text: string; onClick: () => void }) {
  return (
    <div style={{ margin: '0 0 12px' }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: C.muted, margin: '0 0 6px 4px' }}>{title}</p>
      <button type="button" onClick={onClick} style={{ width: '100%', height: 52, boxSizing: 'border-box', border: 0, borderRadius: 16, background: C.field, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px 0 10px', color: C.text, font: `700 15px ${FONT}`, cursor: 'pointer', boxShadow: 'var(--sh-card)' }}>
        {lead}
        <span style={{ flex: 1, textAlign: 'left', paddingLeft: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{text}</span>
        <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-d" size={18} /></span>
      </button>
    </div>
  )
}
