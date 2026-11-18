// Tablero Error: la sincronización de un banco/bróker ha fallado.
import { useLocation, useNavigate } from 'react-router-dom'
import { ErrorState, SubHeader } from '@/ui/kit'

export const SOURCES: Record<string, { name: string; reconnect: string }> = {
  trade_republic: { name: 'Trade Republic', reconnect: '/cuentas/trade-republic' },
}

/** Mensaje para el usuario: si la sesión ya no vale, se pide volver a conectar. */
export function syncErrorText(name: string, raw?: string): string {
  const m = (raw ?? '').toLowerCase()
  if (!m || /sesi[oó]n|session|no conectado|expired|caduc|401|token/.test(m)) return `La sesión de ${name} ha caducado. Vuelve a conectar para seguir.`
  return raw!
}

export default function SyncError() {
  const nav = useNavigate()
  const st = (useLocation().state ?? {}) as { source?: string; message?: string }
  const src = SOURCES[st.source ?? 'trade_republic'] ?? SOURCES.trade_republic
  const back = () => (window.history.length > 1 ? nav(-1) : nav('/cuentas'))
  return (
    <div style={{ maxWidth: 560 }}>
      <SubHeader title={src.name} back="/cuentas" />
      <ErrorState title="No se pudo sincronizar" text={syncErrorText(src.name, st.message)}
        retry={() => nav(src.reconnect, { replace: true })} retryLabel="Volver a conectar" dismiss={back} />
    </div>
  )
}
