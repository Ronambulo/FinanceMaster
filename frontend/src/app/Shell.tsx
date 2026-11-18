// Armazón de la app: barra inferior + menú "Más" en móvil, barra lateral y
// paleta Ctrl K en PC. Medidas copiadas del lienzo de diseño.
import { useEffect, useMemo, useRef, useState, type ReactNode, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Icon, type AnyIcon } from '@/ui/Icon'
import { C, FONT, RoundBtn, Avatar, Btn } from '@/ui/kit'
import { Boundary } from '@/ui/Boundary'
import { hintSeen, markHint } from '@/lib/hints'
import { createPull, gapToBar, usePullOpen, useSwipeDismiss, type Pull } from '@/ui/drag'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePreferencesStore } from '@/store/preferences'
import { useAuthStore } from '@/store/auth'
import { usePrivacyStore } from '@/store/privacy'
import { openAdd } from '@/store/add'
import { getLockMinutes, markHidden, shouldLock, takeHidden } from '@/lib/autolock'
import { queryClient } from '@/lib/queryClient'
import { miApi, trApi } from '@/lib/api'
import { toast } from '@/ui/Toast'
import { PULL_TRIGGER, pullDistance, scrollToTop, setScroller } from '@/app/scroller'
import { usePeriodWords } from '@/hooks/usePeriodWords'
import { allNav, isActive, moreNav, primaryNav, type NavIcon, type NavItem } from '@/lib/nav'

export const NAV_ICON: Record<NavIcon, AnyIcon> = {
  home: 'home', list: 'text-unordered', wallet: 'bank-card', plan: 'compass', settings: 'settings', more: 'dots',
  'chart-up': 'cat-inversion', repeat: 'repeat', target: 'safe-open', debt: 'receipt', calendar: 'calendar',
  trophy: 'trophy', tags: 'tag', import: 'upload', shield: 'shield-security', sparkle: 'sparkle',
}

export function useIsPC() {
  return useMediaQuery('(min-width: 1024px)')
}

function useNav() {
  const prefs = usePreferencesStore(s => s.prefs)
  const user = useAuthStore(s => s.user)
  const isAdmin = !!user?.is_admin
  const each = usePeriodWords().each
  return useMemo(() => {
    // "Mes a mes" pasa a "Ciclo a ciclo" cuando los periodos van por ciclos.
    const name = (l: NavItem[]) => l.map(i => (i.id === 'monthly' ? { ...i, label: each } : i))
    return {
      primary: name(primaryNav(prefs)),
      more: name(moreNav(prefs, { isAdmin })),
      all: name(allNav(prefs, { isAdmin })),
    }
  }, [prefs, isAdmin, each])
}

// ── Móvil ──────────────────────────────────────────────────────────────────
const tabStyle = (active: boolean, min = 56): CSSProperties => ({
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: min, padding: '6px 0',
  color: active ? C.accentText : C.muted, fontSize: 11, fontWeight: active ? 800 : 700,
})

function Tabs({ items, onNavigate, min }: { items: NavItem[]; onNavigate?: () => void; min?: number }) {
  const loc = useLocation()
  return (
    <>
      {items.map(i => {
        const a = isActive(i, loc.pathname, loc.search)
        return (
          <Link key={i.id} to={i.to} aria-current={a ? 'page' : undefined} onClick={onNavigate} style={tabStyle(a, min)}>
            <Icon name={NAV_ICON[i.icon]} size={22} />
            {i.label}
          </Link>
        )
      })}
    </>
  )
}

/** Arrastrar sobre la barra no debe desplazar la página de debajo (iOS). */
function useNoScrollThrough(ref: RefObject<HTMLElement>, allowX = false) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let x0 = 0, y0 = 0, axis: '' | 'x' | 'y' = ''
    const start = (e: TouchEvent) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; axis = '' }
    const stop = (e: TouchEvent) => {
      if (allowX) {
        const dx = Math.abs(e.touches[0].clientX - x0), dy = Math.abs(e.touches[0].clientY - y0)
        if (!axis && dx + dy > 4) axis = dx > dy ? 'x' : 'y'
        if (axis !== 'y') return
      }
      e.preventDefault()
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', stop, { passive: false })
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', stop) }
  })
}

/** Barra de Ultra simple con más de tres pestañas: se desliza en horizontal; las pestañas
 *  de los bordes se encogen y se desvanecen, y la activa se centra sola al cambiar de ruta. */
function ScrollTabs({ items }: { items: NavItem[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const loc = useLocation()
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const paint = () => {
      raf = 0
      const box = el.getBoundingClientRect()
      const mid = box.left + box.width / 2, half = box.width / 2
      for (const kid of Array.from(el.children) as HTMLElement[]) {
        const r = kid.getBoundingClientRect()
        const d = Math.min(1, Math.abs(r.left + r.width / 2 - mid) / half)
        const k = Math.max(0, d - 0.55) / 0.45
        kid.style.transform = `scale(${1 - 0.16 * k})`
        kid.style.opacity = String(1 - 0.6 * k)
      }
      const max = el.scrollWidth - el.clientWidth
      const l = el.scrollLeft > 2 ? 22 : 0, rr = el.scrollLeft < max - 2 ? 22 : 0
      const mask = `linear-gradient(to right, transparent 0, #000 ${l}px, #000 calc(100% - ${rr}px), transparent 100%)`
      el.style.maskImage = mask
      el.style.setProperty('-webkit-mask-image', mask)
    }
    const on = () => { if (!raf) raf = requestAnimationFrame(paint) }
    paint()
    el.addEventListener('scroll', on, { passive: true })
    window.addEventListener('resize', on)
    return () => { el.removeEventListener('scroll', on); window.removeEventListener('resize', on); cancelAnimationFrame(raf) }
  }, [items.length])
  useEffect(() => {
    const el = ref.current
    const a = el?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!el || !a) return
    const left = a.offsetLeft - (el.clientWidth - a.offsetWidth) / 2
    el.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [loc.pathname, loc.search, items.length])
  return (
    <div ref={ref} className="no-scrollbar" style={{
      display: 'flex', alignItems: 'center', width: '100%', height: '100%', overflowX: 'auto', overflowY: 'hidden',
      scrollSnapType: 'x mandatory', overscrollBehaviorX: 'contain', touchAction: 'pan-x', WebkitOverflowScrolling: 'touch',
    } as CSSProperties}>
      {items.map(i => {
        const a = isActive(i, loc.pathname, loc.search)
        return (
          <Link key={i.id} to={i.to} aria-current={a ? 'page' : undefined}
            style={{ ...tabStyle(a, 0), flex: '0 0 33.333%', boxSizing: 'border-box', scrollSnapAlign: 'center', transition: 'transform .18s ease-out, opacity .18s ease-out, color .2s', willChange: 'transform' }}>
            <Icon name={NAV_ICON[i.icon]} size={22} />
            {i.label}
          </Link>
        )
      })}
    </div>
  )
}

const NAV_BOTTOM = 'calc(max(18px, env(safe-area-inset-bottom) - 8px) - var(--vb-gap, 0px))'

let navBobbed = false

function BottomNav({ onMore, canMore, pull, onPeek, hidden }: { onMore: () => void; canMore: boolean; pull: Pull; onPeek: () => void; hidden?: boolean }) {
  const { primary } = useNav()
  const ultra = usePreferencesStore(s => s.prefs.ui_mode === 'ultra')
  const g = useRef({ y0: 0, lastY: 0, lastT: 0, v: 0, peeking: false })
  const ref = useRef<HTMLElement>(null)
  // Hasta que se descubra el gesto, la barra se asoma una vez por sesión.
  const [bob, setBob] = useState(false)
  useEffect(() => {
    if (ultra || !canMore || navBobbed || hintSeen('nav')) return
    const a = window.setTimeout(() => { navBobbed = true; setBob(true) }, 1600)
    const b = window.setTimeout(() => setBob(false), 1600 + 1300)
    return () => { clearTimeout(a); clearTimeout(b) }
  }, [ultra, canMore])
  const peekNow = () => { markHint('nav'); setBob(false); onPeek() }
  const moreNow = () => { markHint('nav'); onMore() }
  const scrolls = ultra && primary.length > 3
  useNoScrollThrough(ref, scrolls)
  if (ultra) {
    return (
      <nav ref={ref} aria-label="Principal" style={{ touchAction: scrolls ? 'pan-x' : 'none', overflow: 'hidden',
        position: 'fixed', left: 56, right: 56, bottom: NAV_BOTTOM, height: 62, boxSizing: 'border-box', padding: scrolls ? '0 4px' : '0 8px',
        borderRadius: 24, background: C.pop, border: 'var(--pop-border)', boxShadow: 'var(--sh-nav)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around', zIndex: 40, maxWidth: 448, margin: '0 auto',
      }}>
        {scrolls ? <ScrollTabs items={primary} /> : <Tabs items={primary} min={64} />}
      </nav>
    )
  }
  return (
    <nav ref={ref} aria-label="Principal" data-bottom-nav=""
      onTouchStart={e => { const y = e.touches[0].clientY; g.current = { y0: y, lastY: y, lastT: e.timeStamp, v: 0, peeking: false } }}
      onTouchMove={e => {
        if (!canMore) return
        const s = g.current, y = e.touches[0].clientY, dy = s.y0 - y
        const dt = e.timeStamp - s.lastT
        if (dt > 0) s.v = 0.8 * ((s.lastY - y) / dt) + 0.2 * s.v
        s.lastY = y; s.lastT = e.timeStamp
        if (!s.peeking) { if (dy < 8) return; s.peeking = true; s.y0 = y; pull.dy = 0; peekNow(); return }
        pull.dy = Math.max(0, dy)
        pull.apply?.(pull.dy)
      }}
      onTouchEnd={() => { const s = g.current; if (s.peeking) { s.peeking = false; pull.release?.(s.v) } }}
      onTouchCancel={() => { const s = g.current; if (s.peeking) { s.peeking = false; pull.release?.(0) } }}
      style={{
        touchAction: 'none', position: 'fixed', left: 16, right: 16, bottom: NAV_BOTTOM, height: 74, boxSizing: 'border-box', padding: '8px 10px 0',
        borderRadius: 24, background: C.pop, border: 'var(--pop-border)', boxShadow: 'var(--sh-nav)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around', zIndex: 40, maxWidth: 560, margin: '0 auto',
        animation: bob ? 'fm-bob 1.2s ease-in-out' : undefined, opacity: hidden ? 0 : 1,
      }}>
      {canMore && (
        <button type="button" aria-label="Más secciones" onClick={moreNow} style={{ position: 'absolute', top: 0, left: '50%', width: 80, height: 16, marginLeft: -40, border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}>
          <span aria-hidden="true" style={{ position: 'absolute', top: 6, left: '50%', width: 36, height: 5, marginLeft: -18, borderRadius: 99, background: 'var(--c-4a4b58)' }} />
        </button>
      )}
      <Tabs items={primary} />
    </nav>
  )
}

function MoreMenu({ open, peek, pull, onOpened, onCancel, onClose }: {
  open: boolean; peek: boolean; pull: Pull; onOpened: () => void; onCancel: () => void; onClose: () => void
}) {
  if (!open && !peek) return null
  return <MorePanel open={open} peek={peek} pull={pull} onOpened={onOpened} onCancel={onCancel} onClose={onClose} />
}

function MorePanel({ open, peek, pull, onOpened, onCancel, onClose }: {
  open: boolean; peek: boolean; pull: Pull; onOpened: () => void; onCancel: () => void; onClose: () => void
}) {
  const { primary, more } = useNav()
  const panel = useRef<HTMLElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  // Si se abrió arrastrando, la entrada ya la ha hecho el dedo: sin animación.
  const [dragged] = useState(peek)
  usePullOpen(pull, panel, overlay, peek && !open, onOpened, onCancel)
  useSwipeDismiss(panel, overlay, onClose, open, () => (panel.current ? gapToBar(panel.current) : 0))
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 'calc(0px - var(--vb-gap, 0px))', zIndex: 70, pointerEvents: open ? undefined : 'none' }}>
      <div ref={overlay} aria-hidden="true" onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--overlay)', animation: dragged ? undefined : 'fm-fade .15s', opacity: dragged && !open ? 0 : undefined }} />
      <nav ref={panel} aria-label="Principal" style={{
        position: 'absolute', left: 16, right: 16, bottom: NAV_BOTTOM, boxSizing: 'border-box', padding: '0 12px 14px', borderRadius: 24,
        background: C.pop, boxShadow: 'var(--sh-sheet)', border: 'var(--pop-border)', animation: dragged ? undefined : 'fm-up .2s ease-out',
        maxWidth: 560, margin: '0 auto', color: C.text, transform: dragged && !open ? 'translateY(110%)' : undefined,
      }}>
        <div style={{ position: 'relative', height: 72, boxSizing: 'border-box', paddingTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
          <button type="button" aria-label="Cerrar" onClick={onClose} style={{ position: 'absolute', top: 0, left: '50%', width: 80, height: 16, marginLeft: -40, border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }}>
            <span aria-hidden="true" style={{ position: 'absolute', top: 6, left: '50%', width: 36, height: 5, marginLeft: -18, borderRadius: 99, background: 'var(--c-4a4b58)' }} />
          </button>
          <Tabs items={primary} onNavigate={onClose} />
        </div>
        <div style={{ height: 1, background: C.line, margin: '0 4px 14px' }} />
        <MoreGrid items={more} onNavigate={onClose} />
      </nav>
    </div>,
    document.body,
  )
}

// Herramientas de la app: van aparte, más discretas que las secciones.
const UTILITY_IDS = new Set(['categories', 'import', 'settings', 'admin'])

function MoreGrid({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  const loc = useLocation()
  const sections = items.filter(i => !UTILITY_IDS.has(i.id))
  const tools = items.filter(i => UTILITY_IDS.has(i.id))
  return (
    <>
      {sections.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {sections.map(i => {
            const a = isActive(i, loc.pathname, loc.search)
            return (
              <Link key={i.id} to={i.to} onClick={onNavigate} aria-current={a ? 'page' : undefined} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 4px 12px', borderRadius: 18,
                background: a ? C.soft : C.field, color: a ? C.accentText : C.text, fontSize: 12.5, fontWeight: 700, minWidth: 0,
              }}>
                <span style={{ width: 40, height: 40, borderRadius: 13, background: a ? C.accent : C.soft, color: a ? C.white : C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={NAV_ICON[i.icon]} size={21} />
                </span>
                <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</span>
              </Link>
            )
          })}
        </div>
      )}
      {tools.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${tools.length}, minmax(0, 1fr))`, gap: 8, marginTop: sections.length ? 12 : 0 }}>
          {tools.map(i => {
            const a = isActive(i, loc.pathname, loc.search)
            return (
              <Link key={i.id} to={i.to} onClick={onNavigate} aria-current={a ? 'page' : undefined} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, height: 60, padding: '0 4px', borderRadius: 14, minWidth: 0,
                background: a ? C.soft : 'transparent', border: `1px solid ${a ? 'transparent' : C.line}`, boxSizing: 'border-box',
                color: a ? C.accentText : C.muted, fontSize: 12, fontWeight: 700,
              }}>
                <Icon name={NAV_ICON[i.icon]} size={19} />
                <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.label}</span>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}

// ── PC ─────────────────────────────────────────────────────────────────────
const sideLink = (active: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 12, height: 42, padding: '0 12px', borderRadius: 12, flex: 'none',
  background: active ? C.soft : 'transparent', color: active ? C.accentText : C.muted, fontWeight: active ? 800 : 700, fontSize: 14,
})

function SideLink({ item }: { item: NavItem }) {
  const loc = useLocation()
  const a = isActive(item, loc.pathname, loc.search)
  return <Link to={item.to} aria-current={a ? 'page' : undefined} style={sideLink(a)}><Icon name={NAV_ICON[item.icon]} size={20} />{item.label}</Link>
}

function Sidebar() {
  const { primary, more } = useNav()
  const user = useAuthStore(s => s.user)
  const loc = useLocation()
  const settings = primary.find(i => i.id === 'settings') ?? more.find(i => i.id === 'settings')
  const top = primary.filter(i => i.id !== 'settings')
  const extra = more.filter(i => !['settings', 'categories', 'import'].includes(i.id))
  return (
    <aside style={{ width: 232, flex: 'none', boxSizing: 'border-box', padding: '22px 14px', background: C.pop, borderRight: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 0, height: '100dvh', overflowY: 'auto' }} className="no-scrollbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px 22px' }}>
        <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 10, background: C.accent, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="wallet" size={18} /></span>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em' }}>FinanceMaster</span>
      </div>
      {top.map(i => <SideLink key={i.id} item={i} />)}
      {extra.length > 0 && <p style={{ margin: '18px 12px 6px', fontSize: 12, fontWeight: 700, color: C.muted }}>Más</p>}
      {extra.map(i => <SideLink key={i.id} item={i} />)}
      <div style={{ flex: 1 }} />
      {settings && <SideLink item={settings} />}
      <Link to="/ajustes/perfil" aria-current={loc.pathname === '/ajustes/perfil' ? 'page' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 10px 0', marginTop: 8, borderTop: `1px solid ${C.line}` }}>
        <Avatar name={user?.username} size={34} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>{user?.username}</span>
      </Link>
    </aside>
  )
}

/** Cabecera de página en PC: título + buscador Ctrl K + acciones. */
export function PCHeader({ title, sub, actions, search = true, add = true }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; search?: boolean; add?: boolean }) {
  const openPalette = usePaletteStore()
  const nav = useNavigate()
  const hidden = usePrivacyStore(s => s.hidden)
  const toggle = usePrivacyStore(s => s.toggle)
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, margin: '0 0 22px' }}>
      <div style={{ minWidth: 0 }}>
        {sub != null && <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>{sub}</p>}
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h1>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {search && (
          <button type="button" onClick={openPalette} aria-label="Buscar" style={{ width: 300, height: 42, boxSizing: 'border-box', borderRadius: 14, background: C.card, display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px 0 14px', color: C.muted, boxShadow: 'var(--sh-card)', border: 0, cursor: 'text', font: `600 14px ${FONT}` }}>
            <Icon name="search" size={17} />
            <span style={{ flex: 1, textAlign: 'left' }}>Buscar o saltar a…</span>
            <span style={{ fontSize: 12, fontWeight: 800, background: C.field, borderRadius: 8, padding: '3px 7px', color: C.text }}>Ctrl K</span>
          </button>
        )}
        {actions}
        {search && <RoundBtn icon={hidden ? 'eye-invisible' : 'eye-open'} label={hidden ? 'Mostrar importes' : 'Ocultar importes'} onClick={toggle} />}
        {add && <Btn icon="plus" height={42} style={{ width: 'auto' }} onClick={() => openAdd()}>Añadir</Btn>}
      </div>
    </header>
  )
}

// Estado mínimo de la paleta sin otra dependencia.
let paletteOpen: (() => void) | null = null
function usePaletteStore() { return () => paletteOpen?.() }

type Cmd = { id: string; label: string; icon: AnyIcon; to: string; keys?: string; group: 'Ir a' | 'Acciones' }

function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { all, primary } = useNav()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const KEYS: Record<string, string> = { home: 'G I', movements: 'G M', accounts: 'G C', plan: 'G P', settings: 'G A' }
  const cmds: Cmd[] = useMemo(() => [
    ...all.map(i => ({ id: i.id, label: i.label, icon: NAV_ICON[i.icon], to: i.to, keys: KEYS[i.id], group: 'Ir a' as const })),
    { id: 'add', label: 'Añadir gasto', icon: 'plus', to: '/anadir', keys: 'N', group: 'Acciones' },
    { id: 'transfer', label: 'Nuevo traspaso', icon: 'swap', to: '/traspaso', keys: 'T', group: 'Acciones' },
    { id: 'tr', label: 'Sincronizar Trade Republic', icon: 'refresh', to: '/cuentas/trade-republic', group: 'Acciones' },
    { id: 'csv', label: 'Importar CSV', icon: 'upload', to: '/importar', group: 'Acciones' },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [all])
  // Sin buscar: solo las pestañas principales y las dos acciones rápidas. Al escribir, todo.
  const qq = q.trim().toLowerCase()
  const list = qq
    ? cmds.filter(c => c.label.toLowerCase().includes(qq))
    : cmds.filter(c => c.id === 'add' || c.id === 'transfer' || primary.some(i => i.id === c.id))
  useEffect(() => { setSel(0) }, [q, open])
  useEffect(() => { if (!open) setQ('') }, [open])
  if (!open) return null
  const go = (c?: Cmd) => { if (!c) return; onClose(); nav(c.to) }
  const groups = (['Ir a', 'Acciones'] as const).map(g => ({ g, items: list.filter(c => c.group === g) })).filter(x => x.items.length)
  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
      <div aria-hidden="true" onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--overlay)' }} />
      <div role="dialog" aria-label="Paleta de comandos" style={{ position: 'absolute', left: '50%', top: 120, width: 560, marginLeft: -280, boxSizing: 'border-box', background: C.card, border: `1px solid ${C.line}`, borderRadius: 22, boxShadow: 'var(--sh-sheet)', padding: 10, color: C.text }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 12, height: 50, padding: '0 12px', color: C.muted, borderBottom: `1px solid ${C.line}` }}>
          <Icon name="search" size={20} />
          <input type="search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Busca una pantalla o una acción" aria-label="Buscar comando"
            onKeyDown={e => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(list.length - 1, s + 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)) }
              if (e.key === 'Enter') go(list[sel])
            }}
            style={{ flex: 1, border: 0, background: 'transparent', color: C.text, font: `700 16px ${FONT}`, outline: 'none' }} />
          <span style={{ fontSize: 12, fontWeight: 800, background: C.field, borderRadius: 8, padding: '3px 7px', color: C.text }}>Esc</span>
        </label>
        {groups.map(({ g, items }) => (
          <div key={g}>
            <p style={{ margin: '10px 10px 4px', fontSize: 12, fontWeight: 700, color: C.muted }}>{g}</p>
            {items.map(c => {
              const idx = list.indexOf(c)
              return (
                <a key={c.id} role="button" tabIndex={-1} onMouseEnter={() => setSel(idx)} onClick={() => go(c)} style={{ display: 'flex', alignItems: 'center', gap: 12, height: 42, padding: '0 12px', borderRadius: 12, background: idx === sel ? C.soft : 'transparent', fontWeight: 700, cursor: 'pointer' }}>
                  <span style={{ color: C.accentText, display: 'flex' }}><Icon name={c.icon} size={18} /></span>
                  {c.label}
                  {c.keys && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: C.muted }}>{c.keys}</span>}
                </a>
              )
            })}
          </div>
        ))}
        {list.length === 0 && <p style={{ margin: '14px 12px', color: C.muted, fontWeight: 600 }}>Sin resultados</p>}
      </div>
    </div>,
    document.body,
  )
}

/** Atajos de teclado en PC: Ctrl K, N, T y "G + letra". */
function useShortcuts(open: () => void) {
  const nav = useNavigate()
  useEffect(() => {
    let g = false, t: number | undefined
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); return }
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (g) {
        g = false
        const to = { i: '/', m: '/transacciones', c: '/cuentas', p: '/plan', a: '/ajustes' }[k]
        if (to) nav(to)
        return
      }
      if (k === 'g') { g = true; window.clearTimeout(t); t = window.setTimeout(() => { g = false }, 900) }
      else if (k === 'n') openAdd()
      else if (k === 't') openAdd('transfer')
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [nav, open])
}

// ── Layout ─────────────────────────────────────────────────────────────────
/** Bloquear al salir: al volver tras X minutos fuera, cierra la sesión. */
function useAutoLock() {
  const nav = useNavigate()
  useEffect(() => {
    const check = () => {
      if (shouldLock(takeHidden(), Date.now(), getLockMinutes())) {
        useAuthStore.getState().logout()
        nav('/login', { replace: true })
      }
    }
    const onVis = () => (document.visibilityState === 'hidden' ? markHidden() : check())
    check()
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [nav])
}

export function AppLayout({ children, bare }: { children: ReactNode; bare?: boolean }) {
  const pc = useIsPC()
  const [more, setMore] = useState(false)
  const [peek, setPeek] = useState(false)
  const pull = useRef(createPull()).current
  const [pal, setPal] = useState(false)
  const { more: moreItems } = useNav()
  const ultra = usePreferencesStore(s => s.prefs.ui_mode === 'ultra')
  const loc = useLocation()
  useEffect(() => { paletteOpen = () => setPal(true); return () => { paletteOpen = null } }, [])
  useEffect(() => { setMore(false); setPeek(false); setPal(false); scrollToTop() }, [loc.pathname])
  useShortcuts(() => setPal(true))
  useAutoLock()
  useBankAutoConnect()

  if (pc) {
    return (
      <div style={{ display: 'flex', minHeight: '100dvh' }}>
        <Sidebar />
        <main style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '28px 32px' }}><Boundary resetKey={loc.pathname}>{children}</Boundary></main>
        <Palette open={pal} onClose={() => setPal(false)} />
      </div>
    )
  }
  return <MobileShell bare={bare} resetKey={loc.pathname} onMore={() => setMore(true)} canMore={moreItems.length > 0 && !ultra && !more}
    navPull={pull} onPeek={() => setPeek(true)} navHidden={peek || more}
    menu={<MoreMenu open={more} peek={peek} pull={pull} onOpened={() => { setMore(true); setPeek(false) }} onCancel={() => setPeek(false)} onClose={() => setMore(false)} />}>{children}</MobileShell>
}

let autoConnectedFor: string | null = null
/** Al abrir la app, reconecta Trade Republic y MyInvestor con las credenciales guardadas (una vez por sesión). */
function useBankAutoConnect() {
  const token = useAuthStore(s => s.token)
  useEffect(() => {
    if (!token || autoConnectedFor === token) return
    autoConnectedFor = token
    const banks = [
      { name: 'Trade Republic', key: 'tr-status', run: trApi.autoConnect },
      { name: 'MyInvestor', key: 'mi-status', run: miApi.autoConnect },
    ]
    for (const b of banks) {
      b.run().then(r => {
        if (r.status === 'connected') queryClient.invalidateQueries({ queryKey: [b.key] })
        // 'needs_2fa' nunca manda un código nuevo: solo avisa de uno pendiente.
        else if (r.status === 'needs_2fa') { queryClient.invalidateQueries({ queryKey: [b.key] }); toast(`${b.name}: confirma el acceso para sincronizar`) }
        else if (r.status === 'error') toast(`${b.name}: ${r.message ?? 'no se pudo conectar'}`, { error: true })
        // 'no_credentials' → silencioso
      }).catch(() => {})
    }
  }, [token])
}

/** Tirar hacia abajo desde arriba del todo vuelve a pedir los datos de la pestaña. */
function usePullToRefresh(ref: RefObject<HTMLElement>) {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const s = { x: 0, y: 0, on: false, pull: 0, busy: false }
    const set = (v: number) => { s.pull = v; setPull(v) }
    const start = (e: TouchEvent) => {
      s.on = !s.busy && el.scrollTop <= 0 && e.touches.length === 1
      s.x = e.touches[0].clientX; s.y = e.touches[0].clientY
    }
    const move = (e: TouchEvent) => {
      if (!s.on) return
      const dx = e.touches[0].clientX - s.x
      const dy = e.touches[0].clientY - s.y
      if (s.pull === 0) {
        // Solo cuenta un gesto claramente hacia abajo; uno lateral (deslizar fila) o hacia arriba se deja pasar.
        if (dy < 0 || Math.abs(dx) > 10 || el.scrollTop > 0) { s.on = false; return }
        if (dy < 6) return
        setDragging(true)
      }
      e.preventDefault()
      set(pullDistance(dy))
    }
    const end = async () => {
      if (!s.on) return
      s.on = false
      setDragging(false)
      if (s.pull < PULL_TRIGGER) { set(0); return }
      s.busy = true; setBusy(true); set(PULL_TRIGGER * 0.75)
      const t0 = Date.now()
      try { await queryClient.refetchQueries({ type: 'active' }) } catch { /* el error ya se ve en la pantalla */ }
      await new Promise(r => setTimeout(r, Math.max(0, 450 - (Date.now() - t0))))
      s.busy = false; setBusy(false); set(0)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [ref])
  return { pull, busy, dragging }
}

function MobileShell({ children, bare, resetKey, onMore, canMore, menu, navPull, onPeek, navHidden }: {
  children: ReactNode; bare?: boolean; resetKey: string; onMore: () => void; canMore: boolean; menu: ReactNode; navPull: Pull; onPeek: () => void; navHidden?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { setScroller(ref.current); return () => setScroller(null) }, [])
  const { pull, busy, dragging } = usePullToRefresh(ref)
  const ready = pull >= PULL_TRIGGER || busy
  const ease = dragging ? 'none' : 'transform .25s, opacity .25s'
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 'var(--app-height)', overflow: 'clip' }}>
      {/* Franja opaca bajo la barra de estado: el contenido no se ve pasar por debajo. */}
      <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 'env(safe-area-inset-top)', background: C.bg, zIndex: 30 }} />
      <div role={busy ? 'status' : undefined} aria-label={busy ? 'Actualizando' : undefined} aria-hidden={!busy} style={{
        position: 'absolute', left: '50%', top: 'calc(env(safe-area-inset-top) + 8px)', width: 36, height: 36, marginLeft: -18, borderRadius: 99,
        background: C.pop, border: 'var(--pop-border)', boxShadow: 'var(--sh-nav)', color: ready ? C.accentText : C.muted,
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, pointerEvents: 'none',
        opacity: Math.min(1, pull / (PULL_TRIGGER * 0.6)), transform: `translateY(${pull - 44}px)`, transition: ease,
      }}>
        <span style={{ display: 'flex', transform: busy ? undefined : `rotate(${pull * 4}deg)`, animation: busy ? 'fm-spin .8s linear infinite' : undefined }}>
          <Icon name="refresh" size={18} />
        </span>
      </div>
      <div ref={ref} className="no-scrollbar" style={{ height: '100%', overflowY: 'auto', overscrollBehaviorY: 'none', WebkitOverflowScrolling: 'touch' }}>
        <div style={{
          maxWidth: 560, margin: '0 auto', position: 'relative', minHeight: '100%', boxSizing: 'border-box',
          paddingTop: 'env(safe-area-inset-top)', paddingBottom: bare ? 40 : 120,
          transform: pull ? `translateY(${pull}px)` : undefined, transition: dragging ? 'none' : 'transform .25s',
        }}>
          <Boundary resetKey={resetKey}>{children}</Boundary>
        </div>
      </div>
      {!bare && <BottomNav onMore={onMore} canMore={canMore} pull={navPull} onPeek={onPeek} hidden={navHidden} />}
      {menu}
    </div>
  )
}

