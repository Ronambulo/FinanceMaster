// Movimientos (tableros Movimientos, Filtros, AgruparMenu, AgruparCategoria, AgruparComercio,
// CatDeslizar, CatHoja, CatHecho, CatVarios, Toast y PCMovimientos).
import { scrollToTop } from '@/app/scroller'
import { cur } from '@/lib/format'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type MouseEvent as RMouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery, useQueryClient, type UseInfiniteQueryResult, type InfiniteData } from '@tanstack/react-query'
import { catApi, dashApi, txApi, type AccountBalance, type Category, type Transaction, type TransactionListResponse } from '@/lib/api'
import {
  EMPTY_FILTERS, accountName, activeFilterCount, needsReview, categoriesFor, countLabel, filterParams, groupByDay, groupFilter, groupSections,
  monthKey, monthName, periodLabel, recentMonths, shortDate, txKind, txNet, txTitle,
  type FilterKind, type GroupMode, type GroupSection, type MovFilters, type SectionGroup,
} from '@/lib/movements'
import { useIsPC } from '@/app/Shell'
import { BankLogo } from '@/ui/BankLogo'
import { CatGlyph, CatTile, Icon, catTone, toneColors, toneIcon, type AnyIcon } from '@/ui/Icon'
import { Amount, Btn, C, Chip, ChipRow, DayHead, Divider, Empty, FONT, Fab, Field, Header, IconTile, RoundBtn, SearchBox, Section, Sheet, SheetOption, SkelRows, Skeleton, Switch, TextBtn, useMoney } from '@/ui/kit'
import { MergedPill, MerchantTile, TxSub, shortDayLabel, txLead } from '@/ui/tx'
import { openAdd } from '@/store/add'
import { usePreferencesStore } from '@/store/preferences'
import { toast } from '@/ui/Toast'
import { hintSeen, markHint } from '@/lib/hints'

type Params = Record<string, string | number | undefined>

const TIPO: Record<string, FilterKind> = { gastos: 'expense', ingresos: 'income', traspasos: 'transfer' }
const AGRUPAR: Record<string, GroupMode> = { dia: 'day', categoria: 'category', comercio: 'merchant', cuenta: 'account' }
const GROUP_LABEL: Record<GroupMode, string> = { day: 'Día', category: 'Categoría', merchant: 'Comercio', account: 'Cuenta' }
const GROUP_OPTIONS: { id: GroupMode; icon: AnyIcon }[] = [
  { id: 'day', icon: 'calendar' }, { id: 'category', icon: 'tag' }, { id: 'merchant', icon: 'wallet' }, { id: 'account', icon: 'bank-card' },
]

const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'Algo ha fallado')

const PERIOD_KEY = 'fm.movimientos.periodo'
/** Último periodo elegido (solo "Este mes" o "Todo", que no caducan). */
function savedPeriod(): string | null {
  try { const v = localStorage.getItem(PERIOD_KEY); return v === '' || v === 'this' ? v : null } catch { return null }
}

function initialFilters(sp: URLSearchParams): MovFilters {
  const cat = Number(sp.get('categoria'))
  return {
    ...EMPTY_FILTERS,
    kind: TIPO[sp.get('tipo') ?? ''] ?? '',
    period: sp.get('periodo') ?? savedPeriod() ?? EMPTY_FILTERS.period,
    categoryIds: cat ? [cat] : [],
    sources: sp.get('cuenta') ? [sp.get('cuenta') as string] : [],
  }
}

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

// ── Pantalla ────────────────────────────────────────────────────────────────

export default function Movimientos() {
  const pc = useIsPC()
  const ultra = usePreferencesStore(s => s.prefs.ui_mode === 'ultra')
  const nav = useNavigate()
  const qc = useQueryClient()
  const money = useMoney()
  const [sp] = useSearchParams()
  const today = useMemo(() => new Date(), [])

  const [filters, setFilters] = useState<MovFilters>(() => initialFilters(sp))
  useEffect(() => {
    if (sp.has('periodo') || (filters.period !== '' && filters.period !== 'this')) return
    try { localStorage.setItem(PERIOD_KEY, filters.period) } catch { /* sin almacenamiento */ }
  }, [filters.period, sp])
  const [search, setSearch] = useState(sp.get('q') ?? '')
  const q = useDebounced(search.trim())
  const [mode, setMode] = useState<GroupMode>(AGRUPAR[sp.get('agrupar') ?? ''] ?? 'day')
  const [split, setSplit] = useState(true)
  const [hideTransfers, setHideTransfers] = useState(true)
  const [sheet, setSheet] = useState<'' | 'filters' | 'group' | 'account'>('')
  const [catFor, setCatFor] = useState<Transaction[] | null>(null)
  const [selected, setSelected] = useState<Set<number> | null>(null)
  const [hiddenIds, setHiddenIds] = useState<Set<number>>(new Set())

  const params: Params = useMemo(() => ({ ...filterParams(filters, today), search: q || undefined }), [filters, q, today])
  const categories = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const accounts = useQuery({ queryKey: ['accounts', 'tx-sources'], queryFn: dashApi.txSources })
  const accountList = (accounts.data ?? []).filter(a => (a.tx_count ?? a.count) > 0)

  const list = useInfiniteQuery({
    queryKey: ['transactions', 'list', params],
    queryFn: ({ pageParam }) => txApi.list({ ...params, page: pageParam, page_size: 50 }),
    initialPageParam: 1,
    getNextPageParam: last => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
    enabled: mode === 'day',
  })
  const groupParams: Params = { ...params, hide_transfers: hideTransfers ? 'true' : undefined }
  const groups = useQuery({
    queryKey: ['transactions', 'groups', mode, groupParams],
    queryFn: () => txApi.groups(mode === 'day' ? 'category' : mode, groupParams),
    enabled: mode !== 'day',
  })

  const items = useMemo(() => (list.data?.pages.flatMap(p => p.items) ?? []).filter(t => !hiddenIds.has(t.id)), [list.data, hiddenIds])
  const days = useMemo(() => groupByDay(items, today), [items, today])
  const total = mode === 'day' ? (list.data?.pages[0]?.total ?? 0) - hiddenIds.size : (groups.data ?? []).reduce((s, g) => s + g.count, 0)
  const sections = useMemo(() => groupSections(groups.data ?? [], split), [groups.data, split])
  const periodText = filters.period === 'this' ? monthName(monthKey(today)) : periodLabel(filters.period)
  const clearPeriod = filters.period !== '' && (
    <span role="button" tabIndex={0} aria-label="Quitar filtro de fecha" onClick={e => { e.stopPropagation(); setFilters(f => ({ ...f, period: '' })) }}
      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setFilters(f => ({ ...f, period: '' })) } }}
      style={{ display: 'inline-flex', marginRight: -6, opacity: 0.85 }}><Icon name="close" size={14} /></span>
  )
  const loading = mode === 'day' ? list.isLoading : groups.isLoading
  const empty = !loading && (mode === 'day' ? items.length === 0 : sections.length === 0)
  const narrowed = !!q || activeFilterCount(filters) > 0

  // Selección múltiple
  const selTxs = useMemo(() => (selected ? items.filter(t => selected.has(t.id)) : []), [items, selected])
  function toggle(id: number) {
    setSelected(s => {
      const n = new Set(s ?? [])
      if (n.has(id)) n.delete(id); else n.add(id)
      return n.size ? n : null
    })
  }

  // Borrar con "Deshacer": se oculta ya y se borra al cerrar el aviso.
  function remove(ids: number[]) {
    setHiddenIds(s => new Set([...s, ...ids]))
    setSelected(null)
    let cancelled = false
    const t = setTimeout(async () => {
      if (cancelled) return
      await Promise.allSettled(ids.map(id => txApi.delete(id)))
      qc.invalidateQueries()
    }, 5000)
    toast(ids.length === 1 ? 'Movimiento borrado' : `${ids.length} movimientos borrados`, {
      undo: () => { cancelled = true; clearTimeout(t); setHiddenIds(s => { const n = new Set(s); ids.forEach(i => n.delete(i)); return n }) },
    })
  }

  async function exclude(txs: Transaction[]) {
    setSelected(null)
    try {
      await Promise.all(txs.map(t => txApi.update(t.id, { exclude_from_stats: true })))
      qc.invalidateQueries()
      toast(txs.length === 1 ? 'Excluido de las cuentas' : `${txs.length} excluidos de las cuentas`, {
        undo: async () => { await Promise.all(txs.map(t => txApi.update(t.id, { exclude_from_stats: false }))); qc.invalidateQueries() },
      })
    } catch (e) { toast(errText(e), { error: true }) }
  }

  async function moveTo(source: string) {
    const txs = selTxs
    setSheet('')
    setSelected(null)
    const res = await Promise.allSettled(txs.map(t => txApi.update(t.id, { source })))
    const ok = res.filter(r => r.status === 'fulfilled').length
    qc.invalidateQueries()
    if (ok === txs.length) toast(ok === 1 ? `Movido a ${accountName(source)}` : `${ok} movidos a ${accountName(source)}`)
    else toast(ok ? `${ok} movidos; los importados del banco no se pueden cambiar de cuenta` : 'Los movimientos importados del banco no se pueden cambiar de cuenta', { error: !ok })
  }

  async function confirmCats(txs: Transaction[]) {
    const ids = txs.filter(t => needsReview(t)).map(t => t.id)
    setSelected(null)
    try {
      await txApi.confirm(ids)
      qc.invalidateQueries({ queryKey: ['transactions'] })
      toast(ids.length === 1 ? 'Categoría confirmada' : `${ids.length} categorías confirmadas`)
    } catch (e) { toast(errText(e), { error: true }) }
  }

  async function merge(txs: Transaction[]) {
    if (txs.some(t => t.link_group_id != null)) { toast('Alguno ya está fusionado; sepáralo antes desde su detalle', { error: true }); return }
    setSelected(null)
    try {
      const primary = await txApi.link(txs.map(t => t.id))
      qc.invalidateQueries()
      toast(`${txs.length} movimientos fusionados`, {
        undo: async () => { if (primary.link_group_id != null) { await txApi.unlink(primary.link_group_id); qc.invalidateQueries() } },
      })
    } catch (e) { toast(errText(e), { error: true }) }
  }

  function seeGroup(m: Exclude<GroupMode, 'day'>, key: string) {
    if (m === 'category' && key !== 'none') setFilters(f => ({ ...f, categoryIds: [Number(key)] }))
    if (m === 'account') setFilters(f => ({ ...f, sources: [key] }))
    setMode('day')
    scrollToTop()
  }

  const setKind = (kind: FilterKind) => setFilters(f => ({ ...f, kind }))
  const toggleSource = (s: string) => setFilters(f => ({ ...f, sources: f.sources.includes(s) ? f.sources.filter(x => x !== s) : [...f.sources, s] }))

  const body = loading
    ? (pc ? <div style={{ display: 'grid', gap: 10 }}>{[0, 1, 2].map(i => <Skeleton key={i} h={52} />)}</div>
      : <div style={{ padding: '18px 16px 0', display: 'grid', gap: 12 }}><SkelRows n={5} /><SkelRows n={3} /></div>)
    : empty
      ? (narrowed
        ? <Empty icon="search" title="Nada por aquí" text="Prueba con otra búsqueda u otros filtros."
            action={<Btn kind="secondary" style={{ width: 'auto' }} onClick={() => { setFilters(EMPTY_FILTERS); setSearch('') }}>Quitar filtros</Btn>} />
        : <Empty full={!pc} icon="text-unordered" title="Aún no hay movimientos" text="Importa el extracto de tu banco o añade uno a mano"
            action={<><Btn icon="upload" height={52} style={{ width: 'auto', padding: '0 20px 0 15px' }} onClick={() => nav('/importar')}>Importar CSV</Btn><TextBtn onClick={() => openAdd()}>Añadir a mano</TextBtn></>} />)
      : mode !== 'day'
        ? <GroupedView mode={mode} sections={sections} params={params} today={today} pc={pc} onSeeAll={seeGroup} />
        : null

  const sheets = (
    <>
      <FiltersSheet open={sheet === 'filters'} onClose={() => setSheet('')} value={filters} search={q} today={today}
        categories={categories.data ?? []} accounts={accountList} onApply={f => { setFilters(f); setSheet('') }} />
      <GroupSheet open={sheet === 'group'} onClose={() => setSheet('')} mode={mode} split={split} hideTransfers={hideTransfers}
        onApply={(m, s, h) => { setMode(m); setSplit(s); setHideTransfers(h); setSheet('') }} />
      <CatSheet txs={catFor} categories={categories.data ?? []} onClose={() => setCatFor(null)} onDone={() => setSelected(null)} />
      <Sheet open={sheet === 'account'} onClose={() => setSheet('')} title="Cuenta">
        {[...accountList.map(a => a.source).filter(s => s !== 'manual'), 'manual'].map(s => (
          <SheetOption key={s} lead={s === 'manual' ? <IconTile icon="wallet" size={40} radius={13} bg={C.field} color={C.muted} /> : <BankLogo source={s} />}
            title={accountName(s)} onClick={() => moveTo(s)} />
        ))}
      </Sheet>
    </>
  )

  const groupChip = (
    <Chip icon="layers" active={mode !== 'day'} onClick={() => setSheet('group')}>{mode === 'day' ? 'Agrupar' : `Agrupar: ${GROUP_LABEL[mode]}`}</Chip>
  )

  // ── PC ──
  if (pc) {
    const srcLabel = filters.sources.length ? filters.sources.map(accountName).join(', ') : 'Todas las cuentas'
    const catNames = (categories.data ?? []).filter(c => filters.categoryIds.includes(c.id)).map(c => c.name)
    const amountLabel = filters.min || filters.max ? `${filters.min || '0'} – ${filters.max || '∞'}` : 'Importe'
    return (
      <div>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, margin: '0 0 22px' }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>{Math.max(0, total)} {filters.period === 'this' ? 'este mes' : `· ${periodText}`}</p>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>Movimientos</h1>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <label style={{ width: 300, height: 42, boxSizing: 'border-box', borderRadius: 14, background: C.card, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px 0 14px', color: C.muted, boxShadow: 'var(--sh-card)' }}>
              <Icon name="search" size={17} />
              <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar movimientos" aria-label="Buscar"
                style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', color: C.text, font: `600 14px ${FONT}`, outline: 'none' }} />
              <span style={{ fontSize: 12, fontWeight: 800, background: C.field, borderRadius: 8, padding: '3px 7px', color: C.text }}>Ctrl K</span>
            </label>
            {!ultra && <Btn kind="secondary" icon="upload" height={42} style={{ width: 'auto', background: C.card, borderRadius: 16, padding: '0 20px 0 15px' }} onClick={() => nav('/importar')}>Importar</Btn>}
            <Btn icon="plus" height={42} style={{ width: 'auto', borderRadius: 16, padding: '0 20px 0 15px' }} onClick={() => openAdd()}>Añadir</Btn>
          </div>
        </header>
        {!ultra && <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <Chip active={filters.period !== ''} onClick={() => setSheet('filters')}>{filters.period === 'this' ? 'Este mes' : periodText}{clearPeriod}</Chip>
          <Chip icon="bank-card" active={filters.sources.length > 0} onClick={() => setSheet('filters')}>{srcLabel}</Chip>
          <Chip icon="tag" active={catNames.length > 0} onClick={() => setSheet('filters')}>{catNames.length ? catNames.join(', ') : 'Categoría'}</Chip>
          <Chip icon="filter" active={!!(filters.min || filters.max)} onClick={() => setSheet('filters')}>{amountLabel}</Chip>
          {groupChip}
        </div>}
        {body ?? (
          <section style={{ background: C.card, borderRadius: 22, padding: '16px 8px 6px', boxShadow: 'var(--sh-card)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>{['Fecha', 'Concepto', 'Categoría', 'Cuenta', 'Importe'].map((h, i) => (
                  <th key={h} scope="col" style={{ textAlign: i === 4 ? 'right' : 'left', padding: '0 16px 10px', fontSize: 12, fontWeight: 700, color: C.muted }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {items.map(tx => <PCRow key={tx.id} tx={tx} onOpen={() => nav(`/transacciones/${tx.id}`)} onCategory={() => setCatFor([tx])} onConfirm={() => confirmCats([tx])} />)}
              </tbody>
            </table>
            <LoadMore q={list} />
          </section>
        )}
        {sheets}
      </div>
    )
  }

  // ── Móvil ──
  return (
    <div>
      <div>
      <div style={{ position: 'relative' }}>
      {selected && (
        <header style={{ position: 'absolute', inset: 0, zIndex: 2, background: C.bg, padding: '0 16px', display: 'flex', alignItems: 'flex-end', gap: 12, animation: 'fm-fade .15s' }}>
          <RoundBtn icon="close" label="Salir de la selección" bg={C.card} onClick={() => setSelected(null)} />
          <h1 style={{ flex: 1, margin: 0, fontSize: 22, fontWeight: 800 }}>{selected.size === 1 ? '1 seleccionado' : `${selected.size} seleccionados`}</h1>
          <button type="button" onClick={() => setSelected(new Set(items.map(t => t.id)))} style={{ height: 44, border: 0, background: 'transparent', color: C.accentText, font: `800 15px ${FONT}`, padding: '0 6px', cursor: 'pointer' }}>Todos</button>
        </header>
      )}
        <div style={selected ? { visibility: 'hidden' } : undefined} aria-hidden={selected ? true : undefined}>
          <Header title="Movimientos" sub={ultra ? periodText : `${periodText} · ${countLabel(Math.max(0, total))}`} />
        </div>
      </div>
        <div style={selected ? { opacity: 0.35, pointerEvents: 'none', transition: 'opacity .15s' } : { transition: 'opacity .15s' }} aria-hidden={selected ? true : undefined}>
          <div style={{ margin: '14px 16px 0', display: 'flex', gap: 8 }}>
            <SearchBox value={search} onChange={setSearch} placeholder="Buscar movimientos" />
            {!ultra && <RoundBtn icon="filter" label="Filtros" onClick={() => setSheet('filters')}
              {...(filters.categoryIds.length || filters.min || filters.max ? { bg: C.soft, color: C.accentText } : {})} />}
          </div>
          {ultra ? <div style={{ height: 6 }} /> : <ChipRow>
            {groupChip}
            <Chip active={!filters.kind} onClick={() => setKind('')}>Todo</Chip>
            <Chip active={filters.kind === 'expense'} onClick={() => setKind('expense')}>Gastos</Chip>
            <Chip active={filters.kind === 'income'} onClick={() => setKind('income')}>Ingresos</Chip>
            <Chip icon="calendar" active={filters.period !== 'this' && filters.period !== ''} onClick={() => setSheet('filters')}>{periodText}{clearPeriod}</Chip>
            {accountList.map(a => <Chip key={a.source} active={filters.sources.includes(a.source)} onClick={() => toggleSource(a.source)}>{accountName(a.source)}</Chip>)}
          </ChipRow>}
        </div>
      </div>

      {body ?? (
        <>
          {days.map((d, di) => (
            <div key={d.day}>
              <DayHead label={d.label} total={money(d.net, { sign: true })} />
              <Section pad="0 16px" style={{ overflow: 'clip' }}>
                {d.items.map((tx, i) => (
                  <div key={tx.id}>
                    {i > 0 && <Divider margin="0" />}
                    <MovRow tx={tx} hint={di === 0 && i === 0} first={i === 0} last={i === d.items.length - 1} selecting={!!selected} selected={!!selected?.has(tx.id)} onToggle={() => toggle(tx.id)}
                      onLongPress={() => setSelected(new Set([tx.id]))} onCategory={() => setCatFor([tx])} onDelete={() => remove([tx.id])} onConfirm={() => confirmCats([tx])} />
                  </div>
                ))}
              </Section>
            </div>
          ))}
          <LoadMore q={list} />
        </>
      )}

      {selected ? createPortal(
        <nav aria-label="Acciones" style={{ animation: 'fm-up .18s ease-out', position: 'fixed', left: 16, right: 16, bottom: 'calc(max(18px, env(safe-area-inset-bottom) - 8px) - var(--vb-gap, 0px))', height: 74, boxSizing: 'border-box', padding: '0 8px', borderRadius: 24, background: C.pop, border: 'var(--pop-border)', boxShadow: 'var(--sh-nav)', display: 'flex', alignItems: 'center', zIndex: 45, maxWidth: 528, margin: '0 auto' }}>
          <BarBtn icon="tag" color={C.accentText} onClick={() => setCatFor(selTxs)}>Categoría</BarBtn>
          <BarBtn icon="bank-card" onClick={() => setSheet('account')}>Cuenta</BarBtn>
          {selTxs.some(t => needsReview(t)) && <BarBtn icon="check-mark" color={C.accentText} onClick={() => confirmCats(selTxs)}>Confirmar</BarBtn>}
          <BarBtn icon="layers" disabled={selTxs.length < 2} onClick={() => merge(selTxs)}>Fusionar</BarBtn>
          <BarBtn icon="eye-invisible" onClick={() => exclude(selTxs)}>Excluir</BarBtn>
          <BarBtn icon="delete" color={C.red} onClick={() => remove(selTxs.map(t => t.id))}>Borrar</BarBtn>
        </nav>, document.body,
      ) : (
        <div style={{ position: 'fixed', right: 22, bottom: 'calc(108px - var(--vb-gap, 0px))', zIndex: 41 }}><Fab onClick={() => openAdd()} /></div>
      )}
      {sheets}
    </div>
  )
}

function BarBtn({ icon, color = C.text, onClick, disabled, children }: { icon: AnyIcon; color?: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', color, opacity: disabled ? 0.4 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '8px 0', font: `700 11px ${FONT}`, cursor: disabled ? 'default' : 'pointer' }}>
      <Icon name={icon} size={22} />{children}
    </button>
  )
}

function LoadMore({ q }: { q: UseInfiniteQueryResult<InfiniteData<TransactionListResponse>> }) {
  const ref = useRef<HTMLDivElement>(null)
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q
  useEffect(() => {
    const el = ref.current
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting && !isFetchingNextPage) fetchNextPage() }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])
  return <div ref={ref} style={{ height: 1 }} />
}

// ── Filas ───────────────────────────────────────────────────────────────────

function lead(tx: Transaction) {
  if (tx.is_internal_transfer) {
    return <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--c-262734)', color: 'var(--c-c9ccd8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="swap" size={19} /></span>
  }
  return txLead(tx)
}

function RowInner({ tx, leadNode }: { tx: Transaction; leadNode?: ReactNode }) {
  return (
    <>
      {leadNode ?? lead(tx)}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txTitle(tx)}</span>
        <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}><TxSub tx={tx} /></span>
      </span>
      <span style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}><Amount value={txNet(tx)} /></span>
    </>
  )
}

const ROW_GRID: CSSProperties = { display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '9px 0', color: C.text }

const canConfirm = (tx: Transaction) => needsReview(tx) && tx.category_id != null

const NO_SELECT = { userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as CSSProperties

function MovRow({ tx, hint, first, last, selecting, selected, onToggle, onLongPress, onCategory, onDelete, onConfirm }: {
  tx: Transaction; hint?: boolean; first: boolean; last: boolean; selecting: boolean; selected: boolean; onToggle: () => void; onLongPress: () => void; onCategory: () => void; onDelete: () => void; onConfirm: () => void
}) {
  const pad = { paddingTop: first ? 13 : 9, paddingBottom: last ? 13 : 9 }
  if (selecting) {
    const check = <span style={{ width: 40, height: 40, borderRadius: '50%', background: C.accent, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="check-mark" size={18} /></span>
    return (
      <a role="button" tabIndex={0} aria-pressed={selected} onClick={onToggle} onKeyDown={e => e.key === 'Enter' && onToggle()}
        style={{ ...ROW_GRID, ...pad, ...NO_SELECT, cursor: 'pointer', margin: '0 -16px', paddingLeft: 16, paddingRight: 16, background: selected ? C.soft : undefined, transition: 'background .12s' }}>
        <RowInner tx={tx} leadNode={selected ? check : undefined} />
      </a>
    )
  }
  return (
    <Swipe hint={hint} onCategory={onCategory} onDelete={onDelete} onLongPress={onLongPress} onConfirm={canConfirm(tx) ? onConfirm : undefined}>
      <Link to={`/transacciones/${tx.id}`} draggable={false} style={{ ...ROW_GRID, ...pad, ...NO_SELECT }}><RowInner tx={tx} leadNode={tx.is_internal_transfer ? undefined : (
        <span role="button" tabIndex={0} aria-label="Cambiar categoría" style={{ display: 'flex', cursor: 'pointer' }}
          onClick={e => { e.preventDefault(); e.stopPropagation(); onCategory() }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onCategory() } }}>{lead(tx)}</span>
      )} /></Link>
    </Swipe>
  )
}

const SWIPE_W = 152
/** Recorrido máximo hacia la derecha y punto a partir del cual se confirma. */
const CONFIRM_MAX = 140
const CONFIRM_AT = 80

/**
 * Deslizar a la izquierda: Categoría y Borrar. Deslizar a la derecha (si está
 * sin revisar): la categoría es correcta. Mantener pulsado: seleccionar.
 */
function Swipe({ children, hint, onCategory, onDelete, onLongPress, onConfirm }: { children: ReactNode; hint?: boolean; onCategory: () => void; onDelete: () => void; onLongPress: () => void; onConfirm?: () => void }) {
  const [x, setX] = useState(0)
  const [drag, setDrag] = useState(false)
  const [slow, setSlow] = useState(false)
  // La primera vez, la primera fila asoma sus botones y se explica el gesto.
  useEffect(() => {
    if (!hint || hintSeen('swipe') || !window.matchMedia?.('(pointer: coarse)').matches) return
    const a = window.setTimeout(() => { setSlow(true); setX(-96) }, 900)
    const b = window.setTimeout(() => setX(0), 1900)
    const c = window.setTimeout(() => { setSlow(false); markHint('swipe'); toast('Desliza a la izquierda para cambiar la categoría o borrar, y a la derecha en los nuevos para dar la categoría por buena. Mantén pulsado para elegir varios.') }, 2300)
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c) }
  }, [hint])
  const st = useRef<{ x0: number; y0: number; base: number; axis: '' | 'x' | 'y'; timer: number; moved: boolean } | null>(null)
  const suppress = useRef(false)

  function down(e: RPointerEvent) {
    if (e.pointerType === 'mouse') return
    const s = { x0: e.clientX, y0: e.clientY, base: x, axis: '' as '' | 'x' | 'y', timer: 0, moved: false }
    s.timer = window.setTimeout(() => { suppress.current = true; st.current = null; navigator.vibrate?.(10); onLongPress() }, 450)
    st.current = s
  }
  function move(e: RPointerEvent) {
    const s = st.current
    if (!s) return
    const dx = e.clientX - s.x0, dy = e.clientY - s.y0
    if (!s.axis && Math.abs(dx) + Math.abs(dy) > 8) { s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; clearTimeout(s.timer) }
    if (s.axis === 'x') {
      s.moved = true; setDrag(true)
      const nx = Math.max(-SWIPE_W, Math.min(onConfirm && s.base === 0 ? CONFIRM_MAX : 0, s.base + dx))
      if (onConfirm && (x < CONFIRM_AT) !== (nx < CONFIRM_AT) && nx > 0) navigator.vibrate?.(8)
      setX(nx)
    }
  }
  function up(cancel = false) {
    const s = st.current
    st.current = null
    if (!s) return
    clearTimeout(s.timer)
    if (s.moved) {
      if (!cancel) suppress.current = true
      setDrag(false)
      if (!cancel && onConfirm && x >= CONFIRM_AT) { setX(0); onConfirm(); return }
      setX(v => (v < -SWIPE_W / 2.5 ? -SWIPE_W : 0))
    }
  }
  function clickCapture(e: RMouseEvent) {
    if (suppress.current) { suppress.current = false; e.preventDefault(); e.stopPropagation(); return }
    if (x !== 0) { e.preventDefault(); e.stopPropagation(); setX(0) }
  }
  const act = (fn: () => void) => () => { setX(0); fn() }
  const btn: CSSProperties = { width: 76, border: 0, font: `800 12px ${FONT}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }

  return (
    <div style={{ position: 'relative', margin: '0 -16px', overflow: 'hidden' }}>
      {x > 0 && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 22, background: x >= CONFIRM_AT ? C.accent : 'var(--c-262734)', color: x >= CONFIRM_AT ? C.white : C.accentText, font: `800 13px ${FONT}`, transition: 'background .15s, color .15s' }}>
          <span style={{ display: 'flex', transform: `scale(${x >= CONFIRM_AT ? 1.15 : 1})`, transition: 'transform .15s' }}><Icon name="check-mark" size={20} /></span>
          Correcta
        </div>
      )}
      {x < 0 && (
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, display: 'flex' }}>
          <button type="button" onClick={act(onCategory)} style={{ ...btn, background: C.accent, color: C.white }}><Icon name="tag" size={20} />Categoría</button>
          <button type="button" onClick={act(onDelete)} style={{ ...btn, background: 'var(--c-3a1a1e)', color: 'var(--c-ff9b9b)' }}><Icon name="delete" size={20} />Borrar</button>
        </div>
      )}
      <div onPointerDown={down} onPointerMove={move} onPointerUp={() => up()} onPointerCancel={() => up(true)} onClickCapture={clickCapture}
        onContextMenu={e => e.preventDefault()}
        style={{ position: 'relative', padding: '0 16px', background: C.card, transform: `translateX(${x}px)`, transition: drag ? 'none' : slow ? 'transform .45s cubic-bezier(.3,.7,.3,1)' : 'transform .2s', touchAction: 'pan-y', ...NO_SELECT, boxShadow: x < 0 ? 'var(--sh-card)' : undefined } as CSSProperties}>
        {children}
      </div>
    </div>
  )
}

function PCRow({ tx, onOpen, onCategory, onConfirm }: { tx: Transaction; onOpen: () => void; onCategory: () => void; onConfirm: () => void }) {
  const [dotHover, setDotHover] = useState(false)
  const [hover, setHover] = useState(false)
  const t = catTone(tx.category?.name, tx.category?.type)
  const c = tx.is_internal_transfer ? { bg: 'var(--c-262734)', fg: 'var(--c-c9ccd8)' } : toneColors(t)
  const td: CSSProperties = { padding: '11px 16px' }
  return (
    <tr onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ borderTop: '1px solid var(--c-2a2b38)', cursor: 'pointer', background: hover ? C.field : undefined }}>
      <td style={{ ...td, color: C.muted, fontWeight: 600, whiteSpace: 'nowrap' }}>{shortDate(tx.date)}</td>
      <td style={{ ...td, fontWeight: 700 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {canConfirm(tx) ? (
            <button type="button" aria-label="Nuevo: marcar la categoría como correcta" title="Nuevo · pulsa para marcar la categoría como correcta"
              onClick={e => { e.stopPropagation(); onConfirm() }} onMouseEnter={() => setDotHover(true)} onMouseLeave={() => setDotHover(false)}
              style={{ width: 20, height: 20, margin: '-6px', padding: 0, border: 0, borderRadius: 10, flex: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: dotHover ? C.accent : 'transparent', color: C.white }}>
              {dotHover ? <Icon name="check-mark" size={11} /> : <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: C.accent }} />}
            </button>
          ) : needsReview(tx) && <span role="img" aria-label="Nuevo, sin categoría" title="Nuevo · sin categoría" style={{ width: 8, height: 8, borderRadius: 4, background: C.accent, flex: 'none' }} />}
          <span>{txTitle(tx)}</span>
          <MergedPill tx={tx} />
        </span>
      </td>
      <td style={td}>
        <button type="button" onClick={e => { e.stopPropagation(); onCategory() }} style={{ display: 'flex', alignItems: 'center', gap: 10, border: 0, background: 'transparent', padding: 0, color: C.text, font: `700 14px ${FONT}`, cursor: 'pointer' }}>
          <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 14, background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>{tx.is_internal_transfer ? <Icon name="swap" size={13} /> : <CatGlyph name={tx.category?.name} tone={t} size={13} />}</span>
          <span style={{ color: tx.category || tx.is_internal_transfer ? C.text : C.muted }}>{tx.is_internal_transfer ? 'Traspaso' : tx.category?.name ?? 'Sin categoría'}</span>
        </button>
      </td>
      <td style={{ ...td, fontWeight: 600 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><BankLogo source={tx.source} size={22} radius={7} />{accountName(tx.source)}</span>
      </td>
      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 700 }}><Amount value={txNet(tx)} /></td>
    </tr>
  )
}

// ── Vista agrupada ──────────────────────────────────────────────────────────

function GroupedView({ mode, sections, params, today, pc, onSeeAll }: {
  mode: Exclude<GroupMode, 'day'>; sections: GroupSection[]; params: Params; today: Date; pc: boolean; onSeeAll: (m: Exclude<GroupMode, 'day'>, key: string) => void
}) {
  const money = useMoney()
  const noun = mode === 'merchant' ? 'comercios' : ''
  return (
    <div style={pc ? { maxWidth: 760 } : undefined}>
      {sections.map(s => {
        const name = s.kind === 'expense' ? 'Gastos' : s.kind === 'income' ? 'Ingresos' : 'Total'
        const max = Math.max(...s.groups.map(g => Math.abs(g.net)), 0)
        const sp: Params = s.kind === 'all' ? params : { ...params, type_group: s.kind }
        return (
          <div key={s.kind}>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: pc ? '18px 6px 8px' : '18px 22px 8px', fontSize: 13, color: mode === 'merchant' ? C.muted : C.text, fontWeight: 800 }}>
              <span>{name}{noun && ` · ${s.groups.length} ${noun}`}</span>
              <span>{money(s.total, { sign: true })}</span>
            </div>
            <Section pad={mode === 'merchant' ? '4px 16px' : '2px 16px'} style={pc ? { margin: 0 } : undefined}>
              {s.groups.map((g, i) => (
                <div key={g.key}>
                  {i > 0 && <Divider margin={mode === 'merchant' ? '4px 0' : '0'} />}
                  {mode === 'merchant'
                    ? <MerchantGroup g={g} />
                    : <ExpandGroup mode={mode} g={g} max={max} params={sp} today={today} onSeeAll={() => onSeeAll(mode, g.key)} />}
                </div>
              ))}
            </Section>
          </div>
        )
      })}
    </div>
  )
}

function MerchantGroup({ g }: { g: SectionGroup }) {
  const money = useMoney()
  return (
    <Link to={`/comercio/${encodeURIComponent(g.label)}`} style={{ display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto 18px', gap: 12, alignItems: 'center', padding: '10px 0', color: C.text }}>
      <MerchantTile name={g.label} category={g.category_name} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
        <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}>{countLabel(g.count)}</span>
      </span>
      <span style={{ fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap', color: g.net > 0 ? C.green : C.text }}>{money(g.net, { sign: true })}</span>
      <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={18} /></span>
    </Link>
  )
}

function ExpandGroup({ mode, g, max, params, today, onSeeAll }: { mode: 'category' | 'account'; g: SectionGroup; max: number; params: Params; today: Date; onSeeAll: () => void }) {
  const [open, setOpen] = useState(false)
  const money = useMoney()
  const color = mode === 'category' ? toneColors(catTone(g.label)).fg : C.accentText
  const kids = useQuery({
    queryKey: ['transactions', 'group', mode, g.key, params],
    queryFn: () => txApi.list({ ...params, ...groupFilter(mode, g), page: 1, page_size: 5 }),
    enabled: open,
  })
  const ratio = max > 0 ? Math.abs(g.net) / max : 0
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} style={{ width: '100%', border: 0, background: 'transparent', font: 'inherit', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '40px minmax(0, 1fr) auto 18px', gap: 12, alignItems: 'center', padding: '10px 0 6px', color: C.text }}>
        {mode === 'category' ? <CatTile name={g.label} /> : <BankLogo source={g.key} />}
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
          <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}>{countLabel(g.count)}</span>
        </span>
        <span style={{ fontWeight: 800, whiteSpace: 'nowrap', color: g.net > 0 ? C.green : C.text }}>{money(g.net, { sign: true })}</span>
        <span style={{ color: C.muted, display: 'flex' }}><Icon name={open ? 'chev-d' : 'chev-r'} size={18} /></span>
      </button>
      <div style={{ margin: '0 0 8px 52px', height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.round(ratio * 100)}%`, height: '100%', borderRadius: 99, background: color }} />
      </div>
      {open && (
        <div>
          {(kids.data?.items ?? []).map(tx => (
            <Link key={tx.id} to={`/transacciones/${tx.id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center', padding: '7px 0 7px 52px', color: C.text }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txTitle(tx)}</span>
                <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}>{shortDayLabel(tx.date, today)} · {accountName(tx.source)}</span>
              </span>
              <span style={{ fontSize: 14, whiteSpace: 'nowrap' }}><Amount value={txNet(tx)} /></span>
            </Link>
          ))}
          {kids.isLoading && <div style={{ padding: '7px 0 7px 52px', color: C.muted, fontSize: 13, fontWeight: 600 }}>Cargando…</div>}
          {g.count > 5 && (mode === 'account' || g.key !== 'none') && (
            <button type="button" onClick={onSeeAll} style={{ display: 'block', border: 0, background: 'transparent', padding: '6px 0 10px 52px', color: C.accentText, font: `800 14px ${FONT}`, cursor: 'pointer' }}>Ver los {g.count}</button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Hoja: Filtros ───────────────────────────────────────────────────────────

function SheetLabel({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, margin: '0 2px 10px' }}>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.text }}>{children}</p>
      {extra}
    </div>
  )
}
const inSheet = (active: boolean): CSSProperties | undefined => (active ? undefined : { background: C.field, boxShadow: 'none' })
const Wrap = ({ children }: { children: ReactNode }) => <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
const FGroup = ({ children }: { children: ReactNode }) => <section style={{ padding: '18px 0', borderTop: '1px solid var(--c-2a2b38)', minWidth: 0 }}>{children}</section>
const Count = ({ n, onClear }: { n: number; onClear: () => void }) => n ? (
  <button type="button" onClick={onClear} style={{ border: 0, background: 'transparent', padding: 0, color: C.accentText, font: `700 13px ${FONT}`, cursor: 'pointer' }}>Quitar {n}</button>
) : null

/** Botón de selección múltiple en rejilla: icono, nombre recortado y marca. */
function PickTile({ on, lead, label, onClick }: { on: boolean; lead: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} title={label} style={{
      minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 8px 8px', borderRadius: 16, border: 0, cursor: 'pointer',
      background: on ? C.soft : C.field, color: C.text, font: `700 14px ${FONT}`, textAlign: 'left',
      boxShadow: on ? `inset 0 0 0 2px ${C.accent}` : 'none',
    }}>
      {lead}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {on && <span aria-hidden="true" style={{ width: 20, height: 20, borderRadius: 10, background: C.accent, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="check-mark" size={12} /></span>}
    </button>
  )
}

const CAT_PREVIEW = 6

function FiltersSheet({ open, onClose, value, onApply, search, categories, accounts, today }: {
  open: boolean; onClose: () => void; value: MovFilters; onApply: (f: MovFilters) => void; search: string
  categories: Category[]; accounts: AccountBalance[]; today: Date
}) {
  const [d, setD] = useState(value)
  const [months, setMonths] = useState(false)
  const [allCats, setAllCats] = useState(false)
  useEffect(() => { if (open) { setD(value); setMonths(/^\d{4}-\d{2}$/.test(value.period)); setAllCats(false) } }, [open, value])
  const count = useQuery({
    queryKey: ['transactions', 'count', d, search],
    queryFn: () => txApi.list({ ...filterParams(d, today), search: search || undefined, page: 1, page_size: 1 }),
    enabled: open,
  })
  const set = (patch: Partial<MovFilters>) => setD(x => ({ ...x, ...patch }))
  const cats = categories.filter(c => (d.kind === 'income' ? c.type === 'income' : d.kind === 'expense' ? c.type === 'expense' : c.type === 'expense' || c.type === 'income'))
  // Las elegidas siempre se ven aunque la lista esté plegada.
  const shown = allCats ? cats : [...cats.slice(0, CAT_PREVIEW), ...cats.slice(CAT_PREVIEW).filter(c => d.categoryIds.includes(c.id))]
  const kinds: [FilterKind, string][] = [['', 'Todo'], ['expense', 'Gastos'], ['income', 'Ingresos'], ['transfer', 'Traspasos']]
  const n = count.data?.total
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(150px, 100%), 1fr))', gap: 8 }
  const yr = String(today.getFullYear())

  return (
    <Sheet open={open} onClose={onClose} title="Filtros">
      <div style={{ paddingBottom: 18 }}>
        <div role="radiogroup" aria-label="Tipo" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', background: 'var(--c-15161c)', padding: 3, borderRadius: 14 }}>
          {kinds.map(([k, l]) => {
            const on = d.kind === k
            return (
              <button key={l} type="button" role="radio" aria-checked={on} onClick={() => set({ kind: k, categoryIds: [] })} style={{ minWidth: 0, height: 38, border: 0, borderRadius: 11, background: on ? C.card : 'transparent', color: on ? C.text : C.muted, font: `${on ? 800 : 700} 13px ${FONT}`, cursor: 'pointer', boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 4px' }}>{l}</button>
            )
          })}
        </div>
      </div>

      <FGroup>
        <SheetLabel>Fecha</SheetLabel>
        <Wrap>
          {([['this', 'Este mes'], ['last', 'Mes pasado'], ['3m', '3 meses'], ['', 'Todo']] as const).map(([p, l]) => (
            <Chip key={p} active={d.period === p && !months} style={inSheet(d.period === p && !months)} onClick={() => { setMonths(false); set({ period: p }) }}>{l}</Chip>
          ))}
          <Chip icon="calendar" active={months} style={inSheet(months)} onClick={() => setMonths(m => !m)}>{months && /^\d{4}-\d{2}$/.test(d.period) ? monthName(d.period) : 'Otro mes'}</Chip>
        </Wrap>
        {months && (
          <div role="radiogroup" aria-label="Mes" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginTop: 12, padding: 6, borderRadius: 18, background: 'var(--c-15161c)' }}>
            {recentMonths(today, 12).slice().reverse().map(m => {
              const on = d.period === m
              return (
                <button key={m} type="button" role="radio" aria-checked={on} aria-label={`${monthName(m)} ${m.slice(0, 4)}`} onClick={() => set({ period: m })} style={{
                  minWidth: 0, height: 44, border: 0, borderRadius: 12, cursor: 'pointer', background: on ? C.accent : 'transparent', color: on ? C.white : C.text,
                  font: `700 13px ${FONT}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.15,
                }}>
                  <span>{monthName(m).slice(0, 3)}</span>
                  {m.slice(0, 4) !== yr && <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.7 }}>{m.slice(0, 4)}</span>}
                </button>
              )
            })}
          </div>
        )}
      </FGroup>

      {accounts.length > 0 && (
        <FGroup>
          <SheetLabel extra={<Count n={d.sources.length} onClear={() => set({ sources: [] })} />}>Cuentas</SheetLabel>
          <div style={grid}>
            {accounts.map(a => {
              const on = d.sources.includes(a.source)
              return <PickTile key={a.source} on={on} lead={<BankLogo source={a.source} size={30} radius={10} />} label={accountName(a.source)}
                onClick={() => set({ sources: on ? d.sources.filter(s => s !== a.source) : [...d.sources, a.source] })} />
            })}
          </div>
        </FGroup>
      )}

      {d.kind !== 'transfer' && cats.length > 0 && (
        <FGroup>
          <SheetLabel extra={<Count n={d.categoryIds.length} onClear={() => set({ categoryIds: [] })} />}>Categorías</SheetLabel>
          <div style={grid}>
            {shown.map(c => {
              const on = d.categoryIds.includes(c.id)
              return <PickTile key={c.id} on={on} lead={<CatTile name={c.name} type={c.type} size={30} radius={10} icon={15} />} label={c.name}
                onClick={() => set({ categoryIds: on ? d.categoryIds.filter(x => x !== c.id) : [...d.categoryIds, c.id] })} />
            })}
          </div>
          {cats.length > CAT_PREVIEW && (
            <button type="button" aria-expanded={allCats} onClick={() => setAllCats(a => !a)} style={{ marginTop: 10, width: '100%', height: 40, border: 0, borderRadius: 14, background: 'transparent', color: C.accentText, font: `700 14px ${FONT}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {allCats ? 'Ver menos' : `Ver todas (${cats.length})`}
              <span style={{ display: 'flex', transform: allCats ? 'rotate(180deg)' : undefined }}><Icon name="chev-d" size={14} /></span>
            </button>
          )}
        </FGroup>
      )}

      <FGroup>
        <SheetLabel>Importe</SheetLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 10 }}>
          <Field label="Desde" id="f-min" placeholder="0,00" inputMode="decimal" value={d.min} onChange={e => set({ min: e.target.value })} style={{ margin: 0 }} trail={<span style={{ color: C.muted, fontWeight: 700 }}>{cur()}</span>} />
          <Field label="Hasta" id="f-max" placeholder="Sin límite" inputMode="decimal" value={d.max} onChange={e => set({ max: e.target.value })} style={{ margin: 0 }} trail={<span style={{ color: C.muted, fontWeight: 700 }}>{cur()}</span>} />
        </div>
      </FGroup>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 10, position: 'sticky', bottom: 0, zIndex: 1, margin: '0 -18px', padding: '12px 18px 0', background: C.pop, borderTop: '1px solid var(--c-2a2b38)' }}>
        <Btn kind="secondary" style={{ background: C.field }} onClick={() => { setMonths(false); setD(EMPTY_FILTERS) }}>Limpiar</Btn>
        <Btn onClick={() => onApply(d)}>{n == null ? 'Ver resultados' : n === 1 ? 'Ver 1 resultado' : `Ver ${n} resultados`}</Btn>
      </div>
    </Sheet>
  )
}

// ── Hoja: Agrupar por ───────────────────────────────────────────────────────

function GroupSheet({ open, onClose, mode, split, hideTransfers, onApply }: {
  open: boolean; onClose: () => void; mode: GroupMode; split: boolean; hideTransfers: boolean; onApply: (m: GroupMode, split: boolean, hide: boolean) => void
}) {
  const [m, setM] = useState(mode)
  const [s, setS] = useState(split)
  const [h, setH] = useState(hideTransfers)
  useEffect(() => { if (open) { setM(mode); setS(split); setH(hideTransfers) } }, [open, mode, split, hideTransfers])
  return (
    <Sheet open={open} onClose={onClose} title="Agrupar por">
      {GROUP_OPTIONS.map(o => {
        const on = m === o.id
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => setM(o.id)} style={{ width: '100%', border: 0, background: 'transparent', font: 'inherit', color: C.text, textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center', padding: '9px 0' }}>
            <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 14, background: on ? C.soft : C.field, color: on ? C.accentText : C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={o.icon} size={19} /></span>
            <span style={{ fontWeight: 700 }}>{GROUP_LABEL[o.id]}</span>
            <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: '50%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(on ? { background: C.accent, color: C.white } : { boxShadow: 'inset 0 0 0 2px var(--track)' }) }}>{on && <Icon name="check-mark" size={14} />}</span>
          </button>
        )
      })}
      <Divider margin="8px 0" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12, padding: '8px 0' }}>
        <span style={{ fontWeight: 700 }}>Separar ingresos y gastos</span>
        <Switch on={s} onChange={setS} label="Separar ingresos y gastos" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12, padding: '8px 0 18px' }}>
        <span style={{ fontWeight: 700 }}>Ocultar traspasos</span>
        <Switch on={h} onChange={setH} label="Ocultar traspasos" />
      </div>
      <Btn onClick={() => onApply(m, s, h)}>Aplicar</Btn>
    </Sheet>
  )
}

// ── Hoja: Categoría (uno o varios) ──────────────────────────────────────────

export function CatSheet({ txs, categories, onClose, onDone }: { txs: Transaction[] | null; categories: Category[]; onClose: () => void; onDone?: () => void }) {
  const qc = useQueryClient()
  const money = useMoney()
  const one = txs && txs.length === 1 ? txs[0] : null
  const current = one?.category_id ?? null
  const kind = txs?.[0] ? txKind(txs[0]) : 'expense'
  const list = useMemo(() => {
    const l = categoriesFor(categories, kind)
    const cur = l.find(c => c.id === current)
    return cur ? [cur, ...l.filter(c => c !== cur)] : l
  }, [categories, kind, current])
  const [sel, setSel] = useState<number | null>(current)
  const [same, setSame] = useState(true)
  const [rule, setRule] = useState(true)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setSel(current); setSame(true); setRule(true) }, [txs, current])
  const sim = useQuery({ queryKey: ['similar', one?.id], queryFn: () => txApi.similar(one!.id), enabled: !!one })
  const merchant = sim.data?.merchant ?? ''
  const others = sim.data?.count ?? 0
  const selCat = list.find(c => c.id === sel)
  const sum = (txs ?? []).reduce((s, t) => s + txNet(t), 0)
  const changed = !!selCat && (!one || sel !== current || (same && others > 0))
  // Sin cambiar nada, el botón confirma la categoría que puso la regla o la IA.
  const keep = !!one && canConfirm(one) && sel === current && !(same && others > 0)

  async function confirmKeep() {
    if (!one) return
    setBusy(true)
    try {
      await txApi.confirm([one.id])
      qc.invalidateQueries({ queryKey: ['transactions'] })
      onClose()
      onDone?.()
      toast('Categoría confirmada')
    } catch (e) {
      toast(errText(e), { error: true })
    } finally { setBusy(false) }
  }

  async function apply() {
    if (!txs || !selCat) return
    setBusy(true)
    try {
      const r = await txApi.bulkCategory({ ids: txs.map(t => t.id), category_id: selCat.id, include_same_merchant: !!one && others > 0 && same, create_rule: !!one && !!merchant && rule })
      qc.invalidateQueries()
      onClose()
      onDone?.()
      const text = one && r.updated > 1 ? `${r.updated} de ${merchant} pasados a ${selCat.name}` : r.updated === 1 ? `Pasado a ${selCat.name}` : `${r.updated} pasados a ${selCat.name}`
      toast(text, { undo: async () => { await txApi.bulkCategoryUndo({ previous: r.previous, rule_ids: r.rule_ids }); qc.invalidateQueries() } })
    } catch (e) {
      toast(errText(e), { error: true })
    } finally { setBusy(false) }
  }

  const sw = (label: string, on: boolean, set: (v: boolean) => void) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12, padding: '8px 0' }}>
      <span style={{ fontWeight: 700 }}>{label}</span>
      <Switch on={on} onChange={set} label={label} />
    </div>
  )

  return (
    <Sheet open={!!txs} onClose={onClose} title="Categoría">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '-4px 0 12px' }}>
        {one ? txLead(one, 36) : <IconTile icon="tag" size={36} radius={18} bg={C.field} color={C.muted} />}
        <span style={{ flex: 1, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{one ? txTitle(one) : countLabel(txs?.length ?? 0)}</span>
        <span style={{ fontWeight: 800 }}>{money(sum, { sign: true, euro: true })}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px 6px' }}>
        {list.map(c => {
          const t = catTone(c.name, c.type)
          const col = toneColors(t)
          const on = c.id === sel
          return (
            <button key={c.id} type="button" aria-pressed={on} onClick={() => setSel(c.id)} style={{ border: 0, background: 'transparent', color: C.text, padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, font: `${on ? 800 : 700} 12px ${FONT}`, cursor: 'pointer', minWidth: 0 }}>
              <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 24, background: col.bg, color: col.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', boxShadow: on ? `0 0 0 2px var(--c-1f2029), 0 0 0 4px var(--c-5b52f0)` : undefined }}><CatGlyph name={c.name} tone={t} size={23} /></span>
              <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              {c.id === current && <span style={{ fontSize: 10, color: C.muted, fontWeight: 800, marginTop: -4 }}>Ahora</span>}
            </button>
          )
        })}
        <Link to="/ajustes/categorias" onClick={onClose} style={{ color: C.accentText, padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, font: `800 12px ${FONT}` }}>
          <span style={{ width: 48, height: 48, borderRadius: '50%', boxShadow: 'inset 0 0 0 2px var(--track)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={20} /></span>
          Nueva
        </Link>
      </div>
      {one && merchant && selCat && (
        <>
          <Divider margin="10px 0 4px" />
          {others > 0 && sw(`Cambiar también ${others === 1 ? 'el otro' : `los otros ${others}`} de ${merchant}`, same, setSame)}
          {sw(`Usar siempre ${selCat.name} para ${merchant}`, rule, setRule)}
        </>
      )}
      <div style={{ marginTop: 12 }}>
        {keep
          ? <Btn icon="check-mark" disabled={busy} onClick={confirmKeep}>{`${selCat?.name ?? 'La categoría'} es correcta`}</Btn>
          : <Btn disabled={!changed || busy} onClick={apply}>{selCat ? `Cambiar a ${selCat.name}` : 'Elige una categoría'}</Btn>}
      </div>
    </Sheet>
  )
}
