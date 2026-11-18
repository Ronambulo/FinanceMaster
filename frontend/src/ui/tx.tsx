// Piezas compartidas de movimientos: ficha de comercio, fila, mini gráfico y barras.
import type { CSSProperties, ReactNode } from 'react'
import type { Transaction } from '@/lib/api'
import { accountName, dayLabel, needsReview, txNet, txTitle } from '@/lib/movements'
import { sparkPath } from '@/lib/home'
import { CatGlyph, CatTile, Icon, catTone, toneColors, toneIcon } from './Icon'
import { Amount, C, Row, useMoney } from './kit'

const BRANDS: [RegExp, string, string][] = [
  [/netflix/i, '#e50914', 'N'],
  [/spotify/i, '#1db954', 'S'],
]

/** Logotipo de marca conocida o, si no, la ficha de su categoría. */
export function MerchantTile({ name, category, type, size = 40, radius }: { name: string; category?: string | null; type?: string | null; size?: number; radius?: number }) {
  const b = BRANDS.find(([re]) => re.test(name))
  if (b) {
    return (
      <span aria-hidden="true" style={{ width: size, height: size, borderRadius: radius ?? size / 2, background: `var(--c-${b[1].slice(1)})`, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: size >= 40 ? 18 : 17, flex: 'none' }}>{b[2]}</span>
    )
  }
  return <CatTile name={category} type={type} size={size} radius={radius} />
}

const SHORT_WD = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
/** "Hoy", "Ayer" o "Lun 16". */
export function shortDayLabel(iso: string, today: Date): string {
  const l = dayLabel(iso, today)
  if (l === 'Hoy' || l === 'Ayer') return l
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`)
  return `${SHORT_WD[d.getDay()]} ${d.getDate()}`
}

export function txLead(tx: Transaction, size = 40) {
  const title = txTitle(tx)
  return <ReviewDot on={needsReview(tx)}><MerchantTile name={title} category={tx.category?.name} type={tx.category?.type} size={size} /></ReviewDot>
}

/** Punto de "nuevo, categoría sin revisar" en la esquina de la ficha. */
export function ReviewDot({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>
  return (
    <span style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
      {children}
      <span role="img" aria-label="Nuevo, categoría sin revisar" title="Nuevo · categoría sin revisar"
        style={{ position: 'absolute', top: -1, right: -1, width: 12, height: 12, borderRadius: 6, background: C.accent, boxShadow: `0 0 0 2.5px ${C.card}` }} />
    </span>
  )
}

/** Número de movimientos de una fusión (incluido el principal), o 0. */
export function mergedCount(tx: Transaction): number {
  if (tx.link_group_id == null) return 0
  return (tx.linked_transactions?.length ?? 0) + 1
}

/** "N26" o "N26 · ⛓ 3" si es una fusión. */
export function MergedPill({ tx }: { tx: Transaction }) {
  const n = mergedCount(tx)
  if (!n) return null
  return (
    <span aria-label={`Fusión de ${n} movimientos`} title={`Fusión de ${n} movimientos`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 18, padding: '0 6px 0 5px', borderRadius: 9, background: C.soft, color: C.accentText, fontSize: 11, fontWeight: 800, flex: 'none' }}>
      <Icon name="link" size={11} />{n}
    </span>
  )
}

export function TxSub({ tx }: { tx: Transaction }) {
  if (!mergedCount(tx)) return <>{accountName(tx.source)}</>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{accountName(tx.source)}</span>
      <MergedPill tx={tx} />
    </span>
  )
}

/** Fila de movimiento: ficha, título, "Hoy · N26" y el importe. */
export function TxRow({ tx, sub, to, onClick, style, trail }: { tx: Transaction; sub?: ReactNode; to?: string; onClick?: () => void; style?: CSSProperties; trail?: ReactNode }) {
  return (
    <Row lead={txLead(tx)} title={txTitle(tx)} sub={sub ?? <TxSub tx={tx} />} to={to ?? (onClick ? undefined : `/transacciones/${tx.id}`)} onClick={onClick} style={style}
      trail={trail ?? <Amount value={txNet(tx)} />} />
  )
}

/** Mini gráfico de línea con degradado (patrimonio, evolución). */
export function Spark({ values, width, height, id }: { values: number[]; width: number; height: number; id: string }) {
  if (values.length < 2) return null
  const d = sparkPath(values, width, height, 4)
  return (
    <svg role="img" aria-label="Evolución" width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', maxWidth: '100%' }}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--c-8b85ff)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--c-8b85ff)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={d.area} fill={`url(#${id})`} />
      <path d={d.line} fill="none" stroke="var(--c-8b85ff)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {d.end && <circle cx={d.end[0]} cy={d.end[1]} r="4.5" fill="var(--c-8b85ff)" stroke="var(--c-1a1b23)" strokeWidth="2" />}
    </svg>
  )
}

/** Barra de categoría del bloque "Este mes". */
export function CatBar({ name, total, ratio, tile = 32, pad = '7px 0', gap = 5 }: { name: string; total: number; ratio: number; tile?: number; pad?: string; gap?: number }) {
  const money = useMoney()
  const t = catTone(name)
  const c = toneColors(t)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${tile}px 1fr auto`, gap: 12, alignItems: 'center', padding: pad }}>
      <span aria-hidden="true" style={{ width: tile, height: tile, borderRadius: tile / 2, background: c.bg, color: c.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><CatGlyph name={name} tone={t} size={tile === 32 ? 15 : 16} /></span>
      <span style={{ display: 'flex', flexDirection: 'column', gap }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span>
        <div style={{ height: 6, borderRadius: 99, background: 'var(--track)', overflow: 'hidden' }}><div style={{ width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`, height: '100%', borderRadius: 99, background: c.fg }} /></div>
      </span>
      <span style={{ fontWeight: 700 }}>{money(total)}</span>
    </div>
  )
}

/** Cabecera de bloque: "Este mes" + enlace "ver todo". */
export function CardHead({ title, link, onLink }: { title: ReactNode; link?: ReactNode; onLink?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: 0 }}>
      <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>{title}</h2>
      {link && <button type="button" onClick={onLink} style={{ border: 0, background: 'transparent', padding: 0, fontSize: 13, color: C.accentText, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>{link}</button>}
    </div>
  )
}
