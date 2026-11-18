// Diálogo de confirmación (tablero Confirmar). Uso: `if (await confirm({...})) …`
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { Icon, type AnyIcon } from './Icon'
import { Btn, C } from './kit'

type Ask = { title: string; text?: string; action?: string; icon?: AnyIcon; danger?: boolean }
type State = { ask: (Ask & { resolve: (ok: boolean) => void }) | null }
const useConfirmStore = create<State>(() => ({ ask: null }))

/** Pide confirmación; resuelve `true` si se pulsa la acción. */
export function confirm(ask: Ask): Promise<boolean> {
  useConfirmStore.getState().ask?.resolve(false)
  return new Promise(resolve => useConfirmStore.setState({ ask: { danger: true, ...ask, resolve } }))
}

export function ConfirmHost() {
  const ask = useConfirmStore(s => s.ask)
  const done = (ok: boolean) => { ask?.resolve(ok); useConfirmStore.setState({ ask: null }) }
  useEffect(() => {
    if (!ask) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') done(false) }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  if (!ask) return null
  const danger = ask.danger !== false
  return createPortal(
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 'calc(0px - var(--vb-gap, 0px))', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div aria-hidden="true" onClick={() => done(false)} style={{ position: 'absolute', inset: 0, background: 'var(--overlay)', animation: 'fm-fade .15s' }} />
      <div role="alertdialog" aria-modal="true" aria-label={ask.title} style={{ position: 'relative', width: '100%', maxWidth: 360, boxSizing: 'border-box', background: C.pop, borderRadius: 28, padding: '24px 20px 20px', boxShadow: 'var(--sh-sheet)', border: 'var(--pop-border)', color: C.text, animation: 'fm-fade .15s' }}>
        <div style={{ textAlign: 'center' }}>
          <span style={{ width: 64, height: 64, borderRadius: '50%', background: danger ? 'var(--c-3a1a1e)' : C.soft, color: danger ? C.red : C.accentText, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={ask.icon ?? (danger ? 'delete' : 'help')} size={28} />
          </span>
          <h2 style={{ margin: '14px 0 6px', fontSize: 20, fontWeight: 800 }}>{ask.title}</h2>
          {ask.text ? <p style={{ margin: '0 0 20px', color: C.muted, fontWeight: 600 }}>{ask.text}</p> : <div style={{ height: 14 }} />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Btn kind="secondary" onClick={() => done(false)} style={{ background: C.field, boxShadow: 'none' }}>Cancelar</Btn>
          <Btn kind={danger ? 'danger' : 'primary'} autoFocus onClick={() => done(true)}>{ask.action ?? 'Borrar'}</Btn>
        </div>
      </div>
    </div>,
    document.body,
  )
}
