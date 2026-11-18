// Piezas del lienzo de diseño, con las medidas exactas de las pantallas.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { Icon, type AnyIcon } from './Icon'
import { usePrivacyStore, MASK } from '@/store/privacy'
import { formatAmount, cur } from '@/lib/format'
import { usePreferencesStore } from '@/store/preferences'
import { useSwipeDismiss } from './drag'

export const C = {
  bg: 'var(--c-0f1015)', card: 'var(--c-1a1b23)', pop: 'var(--c-1f2029)', field: 'var(--c-23242e)',
  line: 'var(--c-2a2b38)', text: 'var(--c-f1f2f6)', muted: 'var(--c-9a9fb0)', accent: 'var(--c-5b52f0)',
  accentText: 'var(--c-b3aeff)', soft: 'var(--c-262546)', green: 'var(--c-6fe0a5)', red: 'var(--c-ff9b9b)',
  white: 'var(--c-ffffff)',
}
export const FONT = "'Manrope', sans-serif"

// ── Importes ────────────────────────────────────────────────────────────────
export function useMoney() {
  const hidden = usePrivacyStore(s => s.hidden)
  usePreferencesStore(s => s.prefs.currency) // re-render al cambiar de moneda
  return (n: number, opts: { sign?: boolean; euro?: boolean; decimals?: number } = {}) => {
    if (hidden) return opts.euro ? `${MASK} ${cur()}` : MASK
    const s = formatAmount(n, { sign: opts.sign, decimals: opts.decimals })
    return opts.euro ? `${s} ${cur()}` : s
  }
}

/** Importe con signo: ingresos en verde (+), gastos sin color (−). */
export function Amount({ value, euro, style }: { value: number; euro?: boolean; style?: CSSProperties }) {
  const money = useMoney()
  const pos = value > 0
  return <span style={{ fontWeight: 700, ...(pos ? { color: C.green } : {}), ...style }}>{money(value, { sign: true, euro })}</span>
}

// ── Botones ─────────────────────────────────────────────────────────────────
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement>

export function RoundBtn({ icon, label, size = 44, iconSize = 20, color, bg, style, ...rest }: BtnProps & { icon: AnyIcon; label: string; size?: number; iconSize?: number; color?: string; bg?: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...rest} style={{
      width: size, height: size, borderRadius: '50%', border: 0, background: bg ?? C.card, color: color ?? C.text,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: 'pointer', flex: 'none',
      boxShadow: 'var(--sh-card)', ...style,
    }}><Icon name={icon} size={iconSize} /></button>
  )
}

export function BackBtn({ to }: { to?: string }) {
  const nav = useNavigate()
  return <RoundBtn icon="chev-l" label="Volver" onClick={() => (to ? nav(to) : window.history.length > 1 ? nav(-1) : nav('/'))} />
}

export type BtnKind = 'primary' | 'secondary' | 'danger' | 'ghost'
export function Btn({ kind = 'primary', icon, children, style, height = 52, ...rest }: BtnProps & { kind?: BtnKind; icon?: AnyIcon; height?: number }) {
  const k: Record<BtnKind, CSSProperties> = {
    primary: { background: C.accent, color: C.white },
    secondary: { background: C.card, color: C.text, boxShadow: 'var(--sh-card)' },
    danger: { background: 'var(--c-3a1a1e)', color: C.red },
    ghost: { background: 'transparent', color: C.accentText },
  }
  return (
    <button type="button" {...rest} style={{
      width: '100%', height, margin: 0, border: 0, borderRadius: 16, font: `800 15px ${FONT}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      padding: icon ? '0 20px 0 15px' : '0 20px', cursor: rest.disabled ? 'default' : 'pointer', boxSizing: 'border-box', flex: 'none',
      opacity: rest.disabled ? 0.55 : 1, ...k[kind], ...style,
    }}>{icon && <Icon name={icon} size={20} />}{children}</button>
  )
}

export function Fab({ onClick, label = 'Añadir movimiento' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} style={{
      position: 'fixed', right: 22, bottom: 'calc(108px - var(--vb-gap, 0px))', width: 58, height: 58, borderRadius: 20, border: 0, background: C.accent,
      color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
      boxShadow: '0 8px 22px rgba(79,70,229,0.35)', zIndex: 30,
    }}><Icon name="plus" size={24} /></button>
  )
}

// ── Cabeceras ───────────────────────────────────────────────────────────────
export function Header({ title, sub, actions, style }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; style?: CSSProperties }) {
  return (
    <header style={{ padding: '22px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, ...style }}>
      <div style={{ minWidth: 0 }}>
        {sub != null && <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 500 }}>{sub}</p>}
        <h1 style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{title}</h1>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>{actions}</div>
    </header>
  )
}

export function SubHeader({ title, sub, actions, back }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <header style={{ padding: '18px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
      <BackBtn to={back} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {sub != null && <p style={{ margin: 0, fontSize: 13, color: C.muted, fontWeight: 600 }}>{sub}</p>}
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>{actions}</div>
    </header>
  )
}

export function Label({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <p style={{ margin: '22px 20px 8px', fontSize: 13, color: C.muted, fontWeight: 700, ...style }}>{children}</p>
}

export function DayHead({ label, total }: { label: ReactNode; total?: ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '18px 22px 8px' }}>
      <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>{label}</span>
      {total != null && <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>{total}</span>}
    </div>
  )
}

// ── Contenedores ────────────────────────────────────────────────────────────
export function Section({ children, style, pad = '4px 16px' }: { children: ReactNode; style?: CSSProperties; pad?: string }) {
  return <section style={{ margin: '0 16px', background: C.card, borderRadius: 24, padding: pad, boxShadow: 'var(--sh-card)', ...style }}>{children}</section>
}

export function Divider({ margin = '4px 0' }: { margin?: string }) {
  return <div style={{ height: 1, background: C.line, margin }} />
}

/** Une hijos con separadores. */
export function Rows({ children, margin }: { children: ReactNode[]; margin?: string }) {
  const kids = children.filter(Boolean)
  return <>{kids.map((c, i) => <div key={i}>{i > 0 && <Divider margin={margin} />}{c}</div>)}</>
}

// ── Filas ───────────────────────────────────────────────────────────────────
type RowProps = { lead?: ReactNode; title: ReactNode; sub?: ReactNode; trail?: ReactNode; chevron?: boolean; to?: string; onClick?: () => void; pad?: string; cols?: string; style?: CSSProperties }
export function Row({ lead, title, sub, trail, chevron, to, onClick, pad = '9px 0', cols, style }: RowProps) {
  const grid = cols ?? [lead ? '40px' : null, 'minmax(0, 1fr)', 'auto', chevron ? '18px' : null].filter(Boolean).join(' ')
  const inner = (
    <>
      {lead}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        {sub != null && sub !== '' && <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
      </span>
      <span style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{trail}</span>
      {chevron && <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={18} /></span>}
    </>
  )
  const st: CSSProperties = { display: 'grid', gridTemplateColumns: grid, gap: 12, alignItems: 'center', padding: pad, color: C.text, ...style }
  if (to) return <Link to={to} style={st}>{inner}</Link>
  if (onClick) return <a role="button" tabIndex={0} onClick={onClick} onKeyDown={e => e.key === 'Enter' && onClick()} style={{ ...st, cursor: 'pointer' }}>{inner}</a>
  return <div style={st}>{inner}</div>
}

/** Fila de ajustes: ficha 36/12 con icono morado. */
export function SetRow({ icon, title, sub, to, onClick, trail, tone }: { icon: AnyIcon; title: ReactNode; sub?: ReactNode; to?: string; onClick?: () => void; trail?: ReactNode; tone?: 'danger' }) {
  const lead = (
    <span aria-hidden="true" style={{ width: 36, height: 36, borderRadius: 12, background: tone === 'danger' ? 'var(--c-3a1a1e)' : C.soft, color: tone === 'danger' ? C.red : C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={18} /></span>
  )
  return <Row lead={lead} title={tone === 'danger' ? <span style={{ color: C.red }}>{title}</span> : title} sub={sub} to={to} onClick={onClick} cols="36px minmax(0, 1fr) auto" trail={trail ?? (to || onClick ? <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-r" size={18} /></span> : null)} />
}

/** Fila etiqueta / valor (detalle de un movimiento). */
export function KV({ k, v, onClick, pad = '13px 0' }: { k: ReactNode; v: ReactNode; onClick?: () => void; pad?: string }) {
  return (
    <div onClick={onClick} role={onClick ? 'button' : undefined} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: pad, cursor: onClick ? 'pointer' : undefined, gap: 12 }}>
      <span style={{ color: C.muted, fontWeight: 600 }}>{k}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, minWidth: 0 }}>{v}</span>
    </div>
  )
}

// ── Chips, buscador, campos ─────────────────────────────────────────────────
export function Chip({ active, icon, children, onClick, style }: { active?: boolean; icon?: AnyIcon; children: ReactNode; onClick?: () => void; style?: CSSProperties }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} style={{
      height: 36, padding: icon ? '0 14px 0 11px' : '0 14px', border: 0, borderRadius: 99,
      background: active ? C.accent : C.card, color: active ? C.white : C.text, font: `700 13px ${FONT}`,
      display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', cursor: 'pointer', flex: 'none',
      ...(active ? {} : { boxShadow: 'var(--sh-card)' }), ...style,
    }}>{icon && <Icon name={icon} size={16} />}{children}</button>
  )
}

export function ChipRow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="no-scrollbar" style={{ display: 'flex', gap: 8, padding: '12px 16px 0', overflowX: 'auto', ...style }}>{children}</div>
}

export function SearchBox({ value, onChange, placeholder, autoFocus, style }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean; style?: CSSProperties }) {
  return (
    <label style={{ flex: 1, height: 48, boxSizing: 'border-box', borderRadius: 16, background: C.card, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', color: C.muted, boxShadow: 'var(--sh-card)', ...style }}>
      <Icon name="search" size={18} />
      <input type="search" value={value} autoFocus={autoFocus} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', color: C.text, font: `600 15px ${FONT}`, outline: 'none' }} />
      {value && <button type="button" aria-label="Borrar búsqueda" onClick={() => onChange('')} style={{ border: 0, background: 'transparent', color: C.muted, padding: 0, display: 'flex', cursor: 'pointer' }}><Icon name="close" size={16} /></button>}
    </label>
  )
}

export function Field({ label, icon, trail, style, id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: string; icon?: AnyIcon; trail?: ReactNode }) {
  const fid = id ?? (label ? 'f-' + label.replace(/\W+/g, '-').toLowerCase() : undefined)
  return (
    <div style={{ margin: '0 0 12px', minWidth: 0, ...style }}>
      {label && <label htmlFor={fid} style={{ display: 'block', fontSize: 13, fontWeight: 700, color: C.muted, margin: '0 0 6px 4px' }}>{label}</label>}
      <div style={{ height: 52, boxSizing: 'border-box', borderRadius: 16, background: C.field, display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px' }}>
        {icon && <span style={{ color: C.muted, display: 'flex' }}><Icon name={icon} size={18} /></span>}
        <input id={fid} {...rest} style={{ flex: 1, minWidth: 0, width: 0, border: 0, background: 'transparent', color: C.text, font: `600 15px ${FONT}`, outline: 'none' }} />
        {trail}
      </div>
    </div>
  )
}

export function Switch({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)} style={{
      width: 48, height: 30, borderRadius: 99, border: 0, padding: 0, background: on ? C.accent : 'var(--track)',
      position: 'relative', cursor: disabled ? 'default' : 'pointer', flex: 'none', opacity: disabled ? 0.5 : 1, transition: 'background .15s',
    }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 24, height: 24, borderRadius: '50%', background: C.white, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'left .15s' }} />
    </button>
  )
}

export function Progress({ ratio, color, height = 6, style }: { ratio: number; color: string; height?: number; style?: CSSProperties }) {
  return (
    <div style={{ height, borderRadius: 99, background: 'var(--track)', overflow: 'hidden', ...style }}>
      <div style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, height: '100%', borderRadius: 99, background: color }} />
    </div>
  )
}

export function Ring({ ratio, size = 48, stroke = 6, color = C.green, children }: { ratio: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, h = size / 2
  const v = Math.max(0, Math.min(1, ratio)) * c
  return (
    <span style={{ position: 'relative', width: size, height: size, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg aria-hidden="true" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0 }}>
        <circle cx={h} cy={h} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle cx={h} cy={h} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${v.toFixed(1)} ${c.toFixed(1)}`} transform={`rotate(-90 ${h} ${h})`} />
      </svg>
      <span style={{ position: 'relative', fontSize: 12, fontWeight: 800 }}>{children}</span>
    </span>
  )
}

/** Ficha cuadrada con icono (36/12 por defecto). */
export function IconTile({ icon, size = 36, radius = 12, bg = C.soft, color = C.accentText, iconSize }: { icon: AnyIcon; size?: number; radius?: number; bg?: string; color?: string; iconSize?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: radius, background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name={icon} size={iconSize ?? Math.round(size / 2)} /></span>
}

export function Avatar({ name, size = 44 }: { name?: string | null; size?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: '50%', background: 'var(--avatar)', color: C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, flex: 'none' }}>{(name || '?').trim().charAt(0).toUpperCase()}</span>
}

export function Pill({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'red' | 'accent' | 'muted' }) {
  const t = { green: ['var(--c-12301f)', C.green], red: ['var(--c-3a1a1e)', C.red], accent: [C.soft, C.accentText], muted: [C.field, C.muted] }[tone]
  return <span style={{ background: t[0], color: t[1], borderRadius: 99, padding: '3px 10px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>{children}</span>
}

// ── Hoja inferior ───────────────────────────────────────────────────────────
/** Alto del teclado en pantalla (0 si está cerrado), según el visualViewport. */
export function useKeyboardInset(active = true) {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!active || !vv) return
    const read = () => {
      const gap = window.innerHeight - vv.height - vv.offsetTop
      setInset(gap > 80 ? Math.round(gap) : 0)
    }
    read()
    vv.addEventListener('resize', read)
    vv.addEventListener('scroll', read)
    return () => { vv.removeEventListener('resize', read); vv.removeEventListener('scroll', read) }
  }, [active])
  return inset
}

export function Sheet({ open, onClose, title, children, actions, label }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; actions?: ReactNode; label?: string }) {
  const kb = useKeyboardInset(open)
  useEffect(() => {
    if (!open) return
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [open, onClose])
  const panel = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  useSwipeDismiss(panel, overlay, onClose, open)
  if (!open) return null
  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 'calc(0px - var(--vb-gap, 0px))', zIndex: 60 }}>
      <div ref={overlay} aria-hidden="true" onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--overlay)', animation: 'fm-fade .15s' }} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)} style={{
        position: 'absolute', left: 0, right: 0, bottom: kb, maxHeight: kb ? `calc(100% - ${kb + 12}px)` : '92dvh', overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', boxSizing: 'border-box',
        padding: '12px 18px max(26px, env(safe-area-inset-bottom))', borderRadius: '32px 32px 0 0', background: C.pop, boxShadow: 'var(--sh-sheet)',
        border: 'var(--pop-border)', animation: 'fm-up .2s ease-out', margin: '0 auto', maxWidth: 560, color: C.text,
      }}>
        <span aria-hidden="true" style={{ display: 'block', width: 36, height: 5, margin: '0 auto 14px', borderRadius: 99, background: 'var(--c-4a4b58)' }} />
        {title != null && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 14px', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{title}</h2>
            <div style={{ display: 'flex', gap: 8 }}>{actions}<RoundBtn icon="close" label="Cerrar" size={40} bg={C.field} onClick={onClose} /></div>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** Opción de lista dentro de una hoja (radio). */
export function SheetOption({ icon, title, sub, selected, onClick, lead }: { icon?: AnyIcon; title: ReactNode; sub?: ReactNode; selected?: boolean; onClick: () => void; lead?: ReactNode }) {
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} style={{
      width: '100%', display: 'grid', gridTemplateColumns: (lead || icon ? '40px ' : '') + 'minmax(0, 1fr) 22px', gap: 12, alignItems: 'center', padding: '10px 0',
      border: 0, background: 'transparent', color: C.text, textAlign: 'left', font: 'inherit', cursor: 'pointer',
    }}>
      {lead ?? (icon && <IconTile icon={icon} size={40} radius={13} iconSize={19} />)}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700 }}>{title}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}>{sub}</span>}
      </span>
      <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: '50%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(selected ? { background: C.accent, color: C.white } : { boxShadow: 'inset 0 0 0 2px var(--track)' }) }}>{selected && <Icon name="check-mark" size={13} />}</span>
    </button>
  )
}

// ── Estados ─────────────────────────────────────────────────────────────────
export function Spinner({ size = 28 }: { size?: number }) {
  return <span aria-label="Cargando" role="status" style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', border: '3px solid var(--track)', borderTopColor: C.accent, animation: 'fm-spin .8s linear infinite' }} />
}

export function Skeleton({ h = 64, r = 24, style }: { h?: number; r?: number; style?: CSSProperties }) {
  return <div aria-hidden="true" style={{ height: h, borderRadius: r, background: C.card, animation: 'fm-pulse 1.4s ease-in-out infinite', ...style }} />
}

/** Estado vacío / error (tableros Vacío y Error). `full` = pantalla completa. */
export function Empty({ icon = 'text-unordered', title, text, action, full, tone = 'accent' }: { icon?: AnyIcon; title: string; text?: string; action?: ReactNode; full?: boolean; tone?: 'accent' | 'red' }) {
  const red = tone === 'red'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: full ? '110px 36px 0' : '40px 28px 0' }}>
      <span aria-hidden="true" style={{ width: 88, height: 88, borderRadius: '50%', background: red ? 'var(--c-3a1a1e)' : 'var(--avatar)', color: red ? 'var(--c-ff9b9b)' : C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name={icon} size={red ? 40 : 38} /></span>
      <h2 style={{ margin: '20px 0 6px', fontSize: 20, fontWeight: 800 }}>{title}</h2>
      {text && <p style={{ margin: 0, color: C.muted, fontWeight: 600, maxWidth: 360 }}>{text}</p>}
      {action && <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>{action}</div>}
    </div>
  )
}

/** Botón de texto secundario de los estados ("Añadir a mano", "Ahora no"). */
export function TextBtn({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <button type="button" onClick={onClick} style={{ height: 52, border: 0, borderRadius: 16, background: 'transparent', color: C.accentText, font: `800 15px ${FONT}`, padding: '0 20px', cursor: 'pointer' }}>{children}</button>
}

/** Pantalla de error con reintento. */
export function ErrorState({ title = 'Algo ha fallado', text, retry, retryLabel = 'Reintentar', retryIcon = 'refresh', dismiss, dismissLabel = 'Ahora no', full = true }: { title?: string; text?: string; retry?: () => void; retryLabel?: string; retryIcon?: AnyIcon; dismiss?: () => void; dismissLabel?: string; full?: boolean }) {
  return (
    <Empty full={full} tone="red" icon="feedback-error" title={title} text={text} action={(retry || dismiss) && <>
      {retry && <Btn icon={retryIcon} height={52} style={{ width: 'auto', padding: '0 20px 0 15px' }} onClick={retry}>{retryLabel}</Btn>}
      {dismiss && <TextBtn onClick={dismiss}>{dismissLabel}</TextBtn>}
    </>} />
  )
}

/** Piezas del tablero Cargando: barras de campo dentro de tarjetas. */
export function SkelBar({ w = '100%', h = 12, r = 8, m = 0 }: { w?: number | string; h?: number; r?: number; m?: number | string }) {
  return <span aria-hidden="true" style={{ display: 'block', width: w, height: h, borderRadius: r, background: C.field, margin: m, animation: 'fm-pulse 1.4s ease-in-out infinite' }} />
}

export function SkelHero({ style }: { style?: CSSProperties }) {
  return (
    <section aria-hidden="true" style={{ background: C.card, borderRadius: 28, padding: 20, boxShadow: 'var(--sh-card)', ...style }}>
      <SkelBar w="40%" />
      <SkelBar w="70%" h={40} r={12} m="10px 0 0" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}><SkelBar h={56} r={16} /><SkelBar h={56} r={16} /></div>
    </section>
  )
}

export function SkelChart({ style }: { style?: CSSProperties }) {
  return (
    <section aria-hidden="true" style={{ background: C.card, borderRadius: 24, padding: '16px 18px', boxShadow: 'var(--sh-card)', ...style }}>
      <SkelBar w="30%" /><SkelBar h={70} r={12} m="12px 0 0" />
    </section>
  )
}

export function SkelRows({ n = 4, style }: { n?: number; style?: CSSProperties }) {
  return (
    <section aria-hidden="true" style={{ background: C.card, borderRadius: 24, padding: '4px 16px', boxShadow: 'var(--sh-card)', ...style }}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 60px', gap: 12, alignItems: 'center', padding: '10px 0' }}>
          <SkelBar w={40} h={40} r={20} />
          <span><SkelBar w="60%" /><SkelBar w="35%" h={10} r={6} m="6px 0 0" /></span>
          <SkelBar w={60} />
        </div>
      ))}
    </section>
  )
}

/** Control segmentado (Gasto · Ingreso · Traspaso). */
export function Segmented<T extends string>({ value, options, onChange, label, disabled, style }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string; disabled?: (v: T) => boolean; style?: CSSProperties }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 13, background: 'var(--c-15161c)', ...style }}>
      {options.map(([v, text]) => {
        const on = v === value
        const off = !on && !!disabled?.(v)
        return (
          <button key={v} type="button" role="radio" aria-checked={on} disabled={off} onClick={() => onChange(v)} style={{
            flex: 1, height: 36, border: 0, borderRadius: 10, background: on ? C.card : 'transparent', color: on ? C.text : C.muted,
            font: `${on ? 800 : 700} 13px ${FONT}`, cursor: off ? 'default' : 'pointer', opacity: off ? 0.45 : 1,
            boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : undefined,
          }}>{text}</button>
        )
      })}
    </div>
  )
}

/** Botón con aspecto de campo que abre un selector (Categoría, Cuenta, Fecha). */
export function PickField({ label, lead, children, onClick, disabled, style }: { label: string; lead?: ReactNode; children: ReactNode; onClick?: () => void; disabled?: boolean; style?: CSSProperties }) {
  return (
    <div style={{ margin: '0 0 12px', minWidth: 0, ...style }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: C.muted, margin: '0 0 6px 4px' }}>{label}</p>
      <button type="button" aria-label={label} onClick={onClick} disabled={disabled} style={{
        width: '100%', height: 52, boxSizing: 'border-box', border: 0, borderRadius: 16, background: C.field, display: 'flex', alignItems: 'center', gap: 10,
        padding: '0 12px 0 10px', color: C.text, font: `700 15px ${FONT}`, cursor: disabled ? 'default' : 'pointer', boxShadow: 'var(--sh-card)',
      }}>
        {lead}
        <span style={{ flex: 1, textAlign: 'left', paddingLeft: 6, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
        {!disabled && <span style={{ color: C.muted, display: 'flex' }}><Icon name="chev-d" size={18} /></span>}
      </button>
    </div>
  )
}
