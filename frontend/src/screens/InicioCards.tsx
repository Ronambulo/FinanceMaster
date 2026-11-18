// Tarjetas opcionales de Inicio y la hoja para ordenarlas u ocultarlas.
import { usePeriodWords } from '@/hooks/usePeriodWords'
import { useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dashApi, type Insight } from '@/lib/api'
import { weekdayDay } from '@/lib/home'
import { HOME_CARDS, HOME_CARD_IDS, type HomeCard } from '@/lib/preferences'
import { usePreferencesStore } from '@/store/preferences'
import { Icon, type AnyIcon } from '@/ui/Icon'
import { Btn, C, Divider, Sheet, Switch, useMoney } from '@/ui/kit'
import { CardHead, MerchantTile } from '@/ui/tx'

const card = { background: C.card, boxShadow: 'var(--sh-card)' } as const
export const cardBox = (pc?: boolean): CSSProperties => pc
  ? { ...card, borderRadius: 22, padding: '20px 24px' }
  : { ...card, margin: '12px 16px 0', borderRadius: 24, padding: '16px 18px' }

/** Recurrentes que deberían cobrarse en el periodo y aún no han llegado. */
export function PendingCard({ pc, start, end }: { pc?: boolean; start: string; end: string }) {
  const money = useMoney()
  const w = usePeriodWords()
  const q = useQuery({ queryKey: ['pending-recurring', start, end], queryFn: () => dashApi.pendingRecurring(start, end), enabled: !!start && !!end })
  const list = q.data ?? []
  if (list.length === 0) return null
  const total = list.reduce((s, g) => s + Math.abs(g.avg_amount), 0)
  return (
    <section style={cardBox(pc)}>
      <Link to="/recurrentes" style={{ display: 'block', color: C.text }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Por cobrar {w.this}</h2>
          <span style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{money(-total, { sign: true })}</span>
        </div>
        {list.slice(0, 3).map(g => (
          <div key={g.group_id} style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '8px 0 0' }}>
            <MerchantTile name={g.display_name} merchant={g.merchant} category={g.category_name} type="expense" size={32} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.display_name}</span>
              {g.next_expected_date && <span style={{ display: 'block', fontSize: 12, color: C.muted, fontWeight: 600 }}>{weekdayDay(g.next_expected_date)}</span>}
            </span>
            <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{money(-Math.abs(g.avg_amount))}</span>
          </div>
        ))}
        {list.length > 3 && <p style={{ margin: '8px 0 0', fontSize: 13, color: C.accentText, fontWeight: 800 }}>{`Y ${list.length - 3} más`}</p>}
      </Link>
    </section>
  )
}

const SEVERITY: Record<string, { icon: AnyIcon; color: string }> = {
  warning: { icon: 'feedback-warning', color: C.red },
  positive: { icon: 'feedback-success', color: C.green },
  info: { icon: 'sparkle', color: C.accentText },
}

/** Avisos calculados por el servidor (gasto inusual, rachas, etc.). */
export function InsightsCard({ pc }: { pc?: boolean }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['insights'], queryFn: dashApi.insights, staleTime: 10 * 60_000 })
  const list = (q.data ?? []).filter(i => !i.is_read).slice(0, 3)
  if (list.length === 0) return null
  const read = async (i: Insight) => {
    qc.setQueryData<Insight[]>(['insights'], old => old?.map(x => (x.id === i.id ? { ...x, is_read: true } : x)))
    try { await dashApi.markInsightRead(i.id) } catch { qc.invalidateQueries({ queryKey: ['insights'] }) }
  }
  return (
    <section style={cardBox(pc)}>
      <CardHead title="Avisos" />
      {list.map((i, n) => {
        const s = SEVERITY[i.severity] ?? SEVERITY.info
        return (
          <div key={i.id}>
            {n > 0 && <Divider margin="0" />}
            <div style={{ display: 'grid', gridTemplateColumns: '24px minmax(0, 1fr) 32px', gap: 10, alignItems: 'start', padding: '10px 0 4px' }}>
              <span style={{ color: s.color, display: 'flex', paddingTop: 1 }}><Icon name={s.icon} size={20} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>{i.title}</span>
                <span style={{ display: 'block', fontSize: 13, color: C.muted, fontWeight: 600, marginTop: 2 }}>{i.message}</span>
              </span>
              <button type="button" aria-label={`Ocultar ${i.title}`} onClick={() => read(i)} style={{ width: 32, height: 32, border: 0, borderRadius: 10, background: 'transparent', color: C.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Icon name="close" size={15} /></button>
            </div>
          </div>
        )
      })}
    </section>
  )
}

/** Ordenar (arrastrando el asa) y mostrar u ocultar tarjetas de Inicio. */
export function CustomizeHome({ open, onClose, available }: { open: boolean; onClose: () => void; available: HomeCard[] }) {
  const saved = usePreferencesStore(s => s.prefs.home_cards)
  const update = usePreferencesStore(s => s.update)
  const [order, setOrder] = useState<HomeCard[]>([])
  const [on, setOn] = useState<Set<HomeCard>>(new Set())
  const [prevOpen, setPrevOpen] = useState(false)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      const shown = saved.filter(c => available.includes(c))
      setOrder([...shown, ...HOME_CARD_IDS.filter(c => available.includes(c) && !shown.includes(c))])
      setOn(new Set(shown))
    }
  }
  const drag = useRef<{ id: HomeCard; y0: number; h: number; from: number } | null>(null)
  const [dragging, setDragging] = useState<{ id: HomeCard; dy: number } | null>(null)

  const down = (id: HomeCard) => (e: RPointerEvent<HTMLElement>) => {
    const row = e.currentTarget.closest('[data-row]') as HTMLElement | null
    if (!row) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id, y0: e.clientY, h: row.offsetHeight, from: order.indexOf(id) }
    setDragging({ id, dy: 0 })
  }
  const move = (e: RPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y0
    const target = Math.max(0, Math.min(order.length - 1, d.from + Math.round(dy / d.h)))
    if (target !== order.indexOf(d.id)) {
      const next = order.filter(x => x !== d.id)
      next.splice(target, 0, d.id)
      setOrder(next)
    }
    setDragging({ id: d.id, dy: dy - (target - d.from) * d.h })
  }
  // Cada cambio se guarda al momento: no hay botón de guardar que olvidar.
  const persist = (o: HomeCard[], s: Set<HomeCard>) => {
    // Las que ahora no se pueden mostrar (módulo apagado) conservan su sitio.
    const unavailable = saved.filter(c => !available.includes(c))
    update({ home_cards: [...o.filter(c => s.has(c)), ...unavailable] }).catch(() => { /* el store ya revierte */ })
  }
  const up = () => {
    if (drag.current && order.indexOf(drag.current.id) !== drag.current.from) persist(order, on)
    drag.current = null; setDragging(null)
  }
  const toggle = (id: HomeCard, v: boolean) => {
    const n = new Set(on); if (v) n.add(id); else n.delete(id)
    setOn(n); persist(order, n)
  }

  return (
    <Sheet open={open} onClose={onClose} title="Personalizar Inicio">
      <div>
        {order.map((id, i) => {
          const isDrag = dragging?.id === id
          return (
            <div key={id} data-row style={{
              display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', gap: 10, alignItems: 'center', padding: '8px 0',
              borderTop: i ? '1px solid var(--c-2a2b38)' : undefined, background: C.pop, position: 'relative', zIndex: isDrag ? 2 : undefined,
              transform: isDrag ? `translateY(${dragging.dy}px)` : undefined, boxShadow: isDrag ? 'var(--sh-card)' : undefined, borderRadius: isDrag ? 14 : undefined,
            }}>
              <span role="button" aria-label={`Mover ${HOME_CARDS[id]}`} tabIndex={0}
                onPointerDown={down(id)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                onKeyDown={e => {
                  const k = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0
                  if (!k) return
                  e.preventDefault()
                  const j = Math.max(0, Math.min(order.length - 1, i + k))
                  const next = order.filter(x => x !== id); next.splice(j, 0, id); setOrder(next); persist(next, on)
                }}
                style={{ width: 32, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, cursor: 'grab', touchAction: 'none' }}><Icon name="grip" size={18} /></span>
              <span style={{ fontWeight: 700, color: on.has(id) ? C.text : C.muted }}>{HOME_CARDS[id]}</span>
              <Switch label={HOME_CARDS[id]} on={on.has(id)} onChange={v => toggle(id, v)} />
            </div>
          )
        })}
      </div>
      <div style={{ paddingTop: 14 }}><Btn onClick={onClose}>Listo</Btn></div>
    </Sheet>
  )
}

export function CustomizeLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, margin: '18px auto 0', height: 40, padding: '0 14px 0 10px', border: 0, background: 'transparent', color: C.muted, font: "700 14px 'Manrope', sans-serif", cursor: 'pointer' }}>
      <Icon name="sliders" size={16} />{children}
    </button>
  )
}
