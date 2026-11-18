// Asistente (tablero Chat): hoja sobre Inicio con la conversación.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { aiApi } from '@/lib/api'
import { chatSuggestions, historyFor, type ChatTurn } from '@/lib/chat'
import { useAuthStore } from '@/store/auth'
import { Icon } from '@/ui/Icon'
import { C, Empty, FONT, Sheet } from '@/ui/kit'
import Inicio from '@/screens/Inicio'

/** Negritas **así** y saltos de línea; el resto, texto plano. */
function Rich({ text }: { text: string }) {
  const out: ReactNode[] = []
  text.split(/(\*\*[^*]+\*\*)/g).forEach((p, i) => {
    out.push(p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>)
  })
  return <>{out}</>
}

function Bubble({ turn, pending }: { turn: ChatTurn; pending?: string | null }) {
  if (turn.role === 'user') return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '0 0 10px' }}>
      <span style={{ maxWidth: '78%', background: C.accent, color: C.white, borderRadius: '20px 20px 6px 20px', padding: '10px 14px', fontWeight: 600, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{turn.content}</span>
    </div>
  )
  return (
    <div style={{ display: 'flex', gap: 8, margin: '0 0 10px' }}>
      <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--avatar)', color: C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="sparkle" size={16} /></span>
      <span style={{ maxWidth: '80%', background: C.field, borderRadius: '20px 20px 20px 6px', padding: '10px 14px', fontWeight: 600, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        {turn.content ? <Rich text={turn.content} /> : <span style={{ color: C.muted }}>{pending || 'Pensando…'}</span>}
      </span>
    </div>
  )
}

export function ChatPanel() {
  const user = useAuthStore(s => s.user)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const suggestions = useMemo(() => chatSuggestions(), [])

  useEffect(() => () => abort.current?.abort(), [])
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight }) }, [turns, status])

  const send = async (msg: string) => {
    const q = msg.trim()
    if (!q || busy) return
    const history = historyFor(turns)
    setTurns(t => [...t, { role: 'user', content: q }, { role: 'assistant', content: '' }])
    setText(''); setBusy(true); setStatus(null)
    const ctrl = new AbortController(); abort.current = ctrl
    const append = (s: string) => setTurns(t => {
      const copy = t.slice(); const last = copy[copy.length - 1]
      copy[copy.length - 1] = { ...last, content: last.content + s }
      return copy
    })
    try {
      await aiApi.chat({ message: q, history }, ev => {
        if (ev.type === 'delta') append(ev.text)
        else if (ev.type === 'thinking') setStatus(ev.text.startsWith('Consultando') ? 'Consultando tus datos…' : 'Pensando…')
        else if (ev.type === 'error') append(ev.text)
      }, ctrl.signal)
    } catch (e) {
      if (!ctrl.signal.aborted) append(e instanceof Error ? e.message : 'No se pudo responder')
    } finally {
      setBusy(false); setStatus(null)
    }
  }

  if (user && !user.ai_enabled) return <div style={{ paddingBottom: 20 }}><Empty icon="sparkle" title="Asistente no disponible" text="Pide al administrador que te dé acceso." /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'min(calc(100dvh - 261px), 640px)', minHeight: 320 }}>
      <div ref={scroller} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {turns.length === 0 && (
          <div style={{ display: 'flex', gap: 8, margin: '0 0 10px' }}>
            <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--avatar)', color: C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="sparkle" size={16} /></span>
            <span style={{ maxWidth: '80%', background: C.field, borderRadius: '20px 20px 20px 6px', padding: '10px 14px', fontWeight: 600 }}>Pregúntame lo que quieras sobre tus gastos.</span>
          </div>
        )}
        {turns.map((t, i) => <Bubble key={i} turn={t} pending={i === turns.length - 1 ? status : null} />)}
      </div>
      <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '6px 0 12px', flex: 'none' }}>
        {suggestions.map(s => (
          <button key={s} type="button" disabled={busy} onClick={() => send(s)} style={{ height: 36, padding: '0 14px', border: 0, borderRadius: 99, background: C.field, color: C.text, font: `700 13px ${FONT}`, display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap', cursor: 'pointer', flex: 'none', boxShadow: 'var(--sh-card)' }}>{s}</button>
        ))}
      </div>
      <form onSubmit={e => { e.preventDefault(); send(text) }} style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>
        <label style={{ flex: 1, height: 50, borderRadius: 16, background: C.field, display: 'flex', alignItems: 'center', padding: '0 16px' }}>
          <input aria-label="Pregunta" placeholder="Pregunta sobre tus gastos" value={text} onChange={e => setText(e.target.value)} style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', color: C.text, font: `600 15px ${FONT}`, outline: 'none' }} />
        </label>
        <button type="submit" aria-label="Enviar" disabled={busy || !text.trim()} style={{ width: 50, height: 50, border: 0, borderRadius: 16, background: C.accent, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: busy || !text.trim() ? 0.6 : 1, flex: 'none' }}><Icon name="send-up" size={20} /></button>
      </form>
    </div>
  )
}

/** Ruta /chat: Inicio de fondo y el asistente en una hoja. */
export default function Chat() {
  const nav = useNavigate()
  const close = () => (window.history.length > 1 ? nav(-1) : nav('/'))
  return (
    <>
      <Inicio />
      <Sheet open onClose={close} title="Asistente"><ChatPanel /></Sheet>
    </>
  )
}
