// Importar CSV (tablero Importar) y revisión antes de guardar (tablero Revision).
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { catApi, txApi, type Category, type ImportPreview, type ImportReviewRow } from '@/lib/api'
import { categoriesFor } from '@/lib/movements'
import { useIsPC } from '@/app/Shell'
import { BankLogo, type BankId } from '@/ui/BankLogo'
import { CatPickSheet } from '@/ui/CatPick'
import { CatTile, Icon } from '@/ui/Icon'
import { BackBtn, Btn, RoundBtn, C, Divider, Label, Row, Section, Skeleton, Spinner, useMoney } from '@/ui/kit'
import { toast } from '@/ui/Toast'

const ORIGINS: { format: string; id: BankId; title: string; sub: string }[] = [
  { format: 'n26', id: 'n26', title: 'N26', sub: 'CSV del extracto' },
  { format: 'revolut', id: 'revolut', title: 'Revolut', sub: 'CSV del extracto' },
  { format: 'trade_republic', id: 'trade_republic', title: 'Trade Republic', sub: 'CSV o conexión directa' },
  { format: 'myinvestor', id: 'myinvestor', title: 'MyInvestor', sub: 'Órdenes de fondos' },
  { format: 'bbva', id: 'bbva', title: 'BBVA', sub: 'Excel o CSV del extracto' },
  { format: 'pluxee', id: 'pluxee', title: 'Pluxee', sub: 'Excel de movimientos' },
  { format: 'wise', id: 'other', title: 'Wise', sub: 'CSV del extracto' },
]
const PAGE = 200
const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'No se ha podido leer el archivo')

/** "Hoy", "Ayer", "Hace 3 días" o la fecha. */
export function agoLabel(iso: string | null, now = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
  const day = (x: Date) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 86400000)
  const n = day(now) - day(d)
  if (n <= 0) return 'Hoy'
  if (n === 1) return 'Ayer'
  if (n < 30) return `Hace ${n} días`
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

/** Filas de la revisión con compatibilidad para respuestas sin `rows`. */
export function reviewRows(p: ImportPreview): ImportReviewRow[] {
  if (p.rows) return p.rows
  return [
    ...p.new.map((r, i) => ({ ...r, key: i, status: 'new' as const, category_id: null, is_internal_transfer: false })),
    ...p.duplicates.map((r, i) => ({ ...r, key: p.new.length + i, status: (r.will_update ? 'update' : 'duplicate') as 'update' | 'duplicate', category_id: null, is_internal_transfer: false })),
  ]
}

type Review = { file: File; format: string; preview: ImportPreview }

// Archivo soltado en otra pantalla (Cuentas): Importar lo lee nada más abrirse.
let pending: File | null = null
export function useImportFile() {
  const nav = useNavigate()
  return (file: File) => { pending = file; nav('/importar') }
}

/** Zona que acepta soltar un archivo de movimientos en toda la pantalla y lo lleva a Importar. */
export function FileDrop({ children }: { children: ReactNode }) {
  const importFile = useImportFile()
  const [over, setOver] = useState(false)
  const depth = useRef(0)
  const isFile = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files')
  return (
    <div style={{ position: 'relative', minHeight: '100%' }}
      onDragEnter={e => { if (!isFile(e)) return; e.preventDefault(); depth.current++; setOver(true) }}
      onDragOver={e => { if (isFile(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' } }}
      onDragLeave={e => { if (!isFile(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false) }}
      onDrop={e => {
        if (!isFile(e)) return
        e.preventDefault(); depth.current = 0; setOver(false)
        const f = e.dataTransfer.files[0]
        if (f) importFile(f)
      }}>
      {children}
      {over && (
        <div style={{ position: 'fixed', inset: 12, zIndex: 50, pointerEvents: 'none', border: '2px dashed var(--c-5b52f0)', borderRadius: 28, background: 'color-mix(in srgb, var(--c-0f1015) 82%, transparent)', backdropFilter: 'blur(2px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: C.text }}>
          <span style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--avatar)', color: C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="file" size={30} /></span>
          <span style={{ fontWeight: 800, fontSize: 18 }}>Suelta para importar movimientos</span>
        </div>
      )}
    </div>
  )
}

export default function Importar() {
  const [review, setReview] = useState<Review | null>(null)
  return review ? <Revision {...review} onBack={() => setReview(null)} /> : <Pick onReady={setReview} />
}

function Pick({ onReady }: { onReady: (r: Review) => void }) {
  const pc = useIsPC()
  const input = useRef<HTMLInputElement>(null)
  const format = useRef('auto')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const history = useQuery({ queryKey: ['import-history'], queryFn: txApi.importHistory })

  async function load(file: File | undefined) {
    if (!file || busy) return
    setBusy(true)
    try {
      const preview = await txApi.previewImport(file, format.current)
      if (!reviewRows(preview).length) { toast(preview.errors[0] ?? 'El archivo no tiene movimientos', { error: true }); return }
      onReady({ file, format: format.current, preview })
    } catch (e) { toast(errText(e), { error: true }) } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  const choose = (f = 'auto') => { format.current = f; input.current?.click() }
  useEffect(() => {
    if (!pending) return
    const f = pending; pending = null
    format.current = 'auto'; load(f)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); format.current = 'auto'; load(e.dataTransfer.files[0]) }

  const m = pc ? 0 : 16
  return (
    <div style={pc ? { maxWidth: 640 } : { paddingBottom: 40 }}>
      <header style={{ padding: pc ? 0 : '18px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackBtn />
        <div style={{ flex: 1, minWidth: 0 }}><h1 style={{ margin: 0, fontSize: pc ? 28 : 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Importar</h1></div>
      </header>
      <input ref={input} type="file" accept=".csv,.txt,.xlsx,.xls,text/csv" hidden onChange={e => load(e.target.files?.[0])} />
      <div style={{ margin: `18px ${m}px 0` }}>
        <button type="button" disabled={busy} onClick={() => choose()} onDragOver={e => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}
          style={{ width: '100%', border: `2px dashed ${over ? 'var(--c-5b52f0)' : 'var(--c-2a2b38)'}`, borderRadius: 24, background: over ? C.soft : 'transparent', color: C.text, padding: '26px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer', font: 'inherit' }}>
          <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--avatar)', color: C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {busy ? <Spinner size={24} /> : <Icon name="file" size={26} />}
          </span>
          <span style={{ fontWeight: 800, fontSize: 16 }}>{busy ? 'Leyendo archivo' : 'Elegir archivo'}</span>
          <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Detectamos el banco automáticamente</span>
        </button>
      </div>

      <Label style={pc ? { margin: '22px 4px 8px' } : undefined}>O elige el origen</Label>
      <Section style={pc ? { margin: 0 } : undefined}>
        {ORIGINS.map((o, i) => (
          <div key={o.format}>
            {i > 0 && <Divider />}
            <Row lead={<BankLogo id={o.id} />} title={o.title} sub={o.sub} chevron onClick={() => choose(o.format)} />
          </div>
        ))}
      </Section>

      {(history.data?.length ?? 0) > 0 && (
        <>
          <Label style={pc ? { margin: '22px 4px 8px' } : undefined}>Últimas importaciones</Label>
          <Section pad="12px 16px" style={pc ? { margin: 0 } : undefined}>
            {history.data!.map((h, i) => (
              <div key={h.id}>
                {i > 0 && <Divider margin="10px 0" />}
                <Row pad="2px 0" title={h.filename ?? 'Archivo'} sub={`${agoLabel(h.created_at)} · ${h.imported === 1 ? '1 movimiento' : `${h.imported} movimientos`}`}
                  trail={h.errors > 0
                    ? <span style={{ background: 'var(--c-3a2a14)', color: 'var(--c-ffc27a)', borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{h.errors === 1 ? '1 error' : `${h.errors} errores`}</span>
                    : <span style={{ background: 'var(--c-12301f)', color: 'var(--c-6fe0a5)', borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>Hecho</span>} />
              </div>
            ))}
          </Section>
        </>
      )}
      {history.isLoading && <div style={{ margin: `22px ${m}px 0` }}><Skeleton h={64} /></div>}
    </div>
  )
}

const TAG = {
  new: { text: 'Nuevo', bg: 'var(--c-262546)', fg: 'var(--c-b3aeff)' },
  duplicate: { text: 'Duplicado', bg: 'var(--c-3a2e14)', fg: 'var(--c-ffc979)' },
  update: { text: 'Completa datos', bg: 'var(--c-262546)', fg: 'var(--c-b3aeff)' },
}

function Revision({ file, format, preview, onBack }: Review & { onBack: () => void }) {
  const pc = useIsPC()
  const nav = useNavigate()
  const qc = useQueryClient()
  const money = useMoney()
  const rows = useMemo(() => reviewRows(preview), [preview])
  const [off, setOff] = useState<Set<number>>(() => new Set())
  const [cats, setCats] = useState<Record<number, number | null>>({})
  const [pick, setPick] = useState<ImportReviewRow | null>(null)
  const [shown, setShown] = useState(PAGE)
  const [busy, setBusy] = useState(false)
  const categories = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const all = categories.data ?? []
  const catOf = (r: ImportReviewRow): Category | undefined => all.find(c => c.id === (r.key in cats ? cats[r.key] : r.category_id))

  const fresh = rows.filter(r => r.status === 'new')
  const dups = rows.filter(r => r.status !== 'new')
  const uncategorized = fresh.filter(r => !r.is_internal_transfer && !catOf(r)).length
  const chosen = fresh.filter(r => !off.has(r.key)).length
  const toggle = (k: number) => setOff(s => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })

  async function run() {
    if (busy) return
    setBusy(true)
    try {
      const res = await txApi.importCsv(file, format, { skip: [...off], categories: cats })
      qc.invalidateQueries()
      const extra = res.updated ? ` · ${res.updated} completados` : ''
      toast(`${res.imported === 1 ? '1 movimiento importado' : `${res.imported} movimientos importados`}${extra}`)
      nav('/transacciones', { replace: true })
    } catch (e) { toast(errText(e), { error: true }) } finally { setBusy(false) }
  }

  const m = pc ? 0 : 16
  const stat = (n: number, label: string, color: string) => (
    <div style={{ background: C.card, borderRadius: 16, padding: '10px 12px', boxShadow: 'var(--sh-card)' }}>
      <span style={{ display: 'block', fontSize: 20, fontWeight: 800, color }}>{n}</span>
      <span style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>{label}</span>
    </div>
  )
  const action = (
    <Btn icon="download" disabled={busy || chosen === 0} onClick={run} style={{ padding: '0 9px 0 0', opacity: chosen === 0 ? 0.5 : 1 }}>
      {busy ? 'Importando' : chosen === 1 ? 'Importar 1 movimiento' : `Importar ${chosen} movimientos`}
    </Btn>
  )

  return (
    <div style={pc ? { maxWidth: 640, paddingBottom: 40 } : { paddingBottom: 110 }}>
      <header style={{ padding: pc ? 0 : '18px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <RoundBtn icon="chev-l" label="Volver" onClick={onBack} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview.bank_label ?? 'Archivo'} · {file.name}</p>
          <h1 style={{ margin: 0, fontSize: pc ? 28 : 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Revisar importación</h1>
        </div>
      </header>
      <div style={{ margin: `16px ${m}px 0`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {stat(fresh.length, fresh.length === 1 ? 'Nuevo' : 'Nuevos', 'var(--c-b3aeff)')}
        {stat(dups.length, dups.length === 1 ? 'Duplicado' : 'Duplicados', 'var(--c-ffc979)')}
        {stat(uncategorized, 'Sin categoría', C.muted)}
      </div>
      {preview.errors.length > 0 && (
        <div style={{ margin: `12px ${m}px 0`, padding: '12px 16px', borderRadius: 16, background: 'var(--c-3a2a14)', color: 'var(--c-ffc27a)', fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="feedback-warning" size={18} />
          {preview.errors.length === 1 ? '1 fila no se ha podido leer' : `${preview.errors.length} filas no se han podido leer`}
        </div>
      )}
      <section style={{ margin: `12px ${m}px 0`, background: C.card, borderRadius: 24, padding: '4px 16px', boxShadow: 'var(--sh-card)' }}>
        {rows.slice(0, shown).map((r, i) => {
          const on = r.status === 'update' || (r.status === 'new' && !off.has(r.key))
          const cat = catOf(r)
          const name = r.name || r.symbol || 'Movimiento'
          const tag = TAG[r.status]
          return (
            <div key={r.key}>
              {i > 0 && <Divider margin="0" />}
              <div style={{ display: 'grid', gridTemplateColumns: '22px 36px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '9px 0', opacity: on ? 1 : 0.55 }}>
                <input type="checkbox" checked={on} disabled={r.status !== 'new'} onChange={() => toggle(r.key)} aria-label={`Importar ${name}`}
                  style={{ width: 20, height: 20, accentColor: 'var(--c-5b52f0)', margin: 0, cursor: r.status === 'new' ? 'pointer' : 'default' }} />
                <button type="button" disabled={r.status !== 'new'} aria-label={`Categoría de ${name}: ${cat?.name ?? 'Sin categoría'}`} onClick={() => setPick(r)}
                  style={{ border: 0, padding: 0, background: 'transparent', display: 'flex', cursor: r.status === 'new' ? 'pointer' : 'default' }}>
                  <CatTile name={r.is_internal_transfer ? 'Traspaso' : cat?.name} type={cat?.type} size={36} icon={17} />
                </button>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                  <span style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                    <span style={{ background: tag.bg, color: tag.fg, borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{tag.text}</span>
                  </span>
                </span>
                <span style={{ fontWeight: 700 }}>{money(r.amount, { sign: true })}</span>
              </div>
            </div>
          )
        })}
        {rows.length > shown && (
          <button type="button" onClick={() => setShown(s => s + PAGE)} style={{ width: '100%', height: 48, border: 0, background: 'transparent', color: C.accentText, font: `800 15px 'Manrope', sans-serif`, cursor: 'pointer' }}>
            Ver {Math.min(PAGE, rows.length - shown)} más
          </button>
        )}
      </section>
      <div style={pc ? { marginTop: 20, maxWidth: 320 } : { position: 'fixed', left: 20, right: 20, bottom: 'calc(30px - var(--vb-gap, 0px))', zIndex: 5 }}>{action}</div>

      <CatPickSheet open={pick != null} categories={pick ? categoriesFor(all, pick.amount > 0 ? 'income' : 'expense') : []}
        current={pick ? catOf(pick)?.id ?? null : null}
        onPick={c => pick && setCats(s => ({ ...s, [pick.key]: c.id }))} onClose={() => setPick(null)} />
    </div>
  )
}
