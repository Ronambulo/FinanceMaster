// Aviso inferior con "Deshacer" (tableros Toast y CatHecho).
import { useEffect } from 'react'
import { create } from 'zustand'
import { Icon } from './Icon'
import { FONT } from './kit'

type Msg = { id: number; text: string; undo?: () => void; error?: boolean }
const useToastStore = create<{ msg: Msg | null; set: (m: Msg | null) => void }>(set => ({ msg: null, set: msg => set({ msg }) }))

let seq = 0
/** Muestra un aviso. Con `undo`, añade el botón Deshacer. */
export function toast(text: string, opts: { undo?: () => void; error?: boolean } = {}) {
  useToastStore.getState().set({ id: ++seq, text, ...opts })
}

export function ToastHost({ pc }: { pc?: boolean }) {
  const msg = useToastStore(s => s.msg)
  const set = useToastStore(s => s.set)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => set(null), msg.undo ? 5000 : 3500)
    return () => clearTimeout(t)
  }, [msg, set])
  if (!msg) return null
  return (
    <div role="status" style={{
      position: 'fixed', left: pc ? 'auto' : 16, right: pc ? 32 : 16, bottom: pc ? 28 : 'calc(108px - var(--vb-gap, 0px))', zIndex: 90,
      width: pc ? 420 : undefined, maxWidth: pc ? undefined : 528, margin: pc ? undefined : '0 auto',
      minHeight: 56, boxSizing: 'border-box', borderRadius: 18, background: 'var(--c-f1f2f6)', color: 'var(--c-14161f)',
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 8px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
    }}>
      <span style={{ color: msg.error ? '#e5484d' : 'var(--c-186a3b)', display: 'flex' }}><Icon name={msg.error ? 'feedback-error' : 'feedback-success'} size={20} /></span>
      <span style={{ flex: 1, fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{msg.text}</span>
      {msg.undo && (
        <button type="button" onClick={() => { msg.undo?.(); set(null) }} style={{ height: 40, border: 0, borderRadius: 12, background: 'transparent', color: 'var(--c-4f46e5)', font: `800 14px ${FONT}`, padding: '0 12px', cursor: 'pointer' }}>Deshacer</button>
      )}
    </div>
  )
}
