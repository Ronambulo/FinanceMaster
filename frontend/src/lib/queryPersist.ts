// Guarda en el dispositivo la última respuesta de cada consulta para que, al
// abrir la app, Inicio y Cuentas se pinten al momento con esos datos mientras
// se piden los nuevos (que llegan por detrás y los sustituyen sin parpadeo).
import { dehydrate, hydrate, type QueryClient } from '@tanstack/react-query'

const PREFIX = 'fm-qc:'
const VERSION = 1
const MAX_AGE = 3 * 24 * 3600_000
const MAX_QUERY = 400_000
const MAX_TOTAL = 2_500_000
// Nada de administración, chat ni consultas efímeras de búsqueda.
const SKIP = new Set(['admin', 'chat', 'ai', 'search', 'stock-search', 'import-preview'])

const keyFor = (userId: number | string) => `${PREFIX}${userId}`

function read(k: string): string | null {
  try { return localStorage.getItem(k) } catch { return null }
}

/** Vuelca en `client` lo guardado para este usuario (síncrono, antes del primer render). */
export function restoreQueries(client: QueryClient, userId: number | string | null | undefined) {
  if (userId == null) return
  const raw = read(keyFor(userId))
  if (!raw) return
  try {
    const saved = JSON.parse(raw) as { v: number; at: number; state: unknown }
    if (saved.v !== VERSION || Date.now() - saved.at > MAX_AGE) return
    hydrate(client, saved.state as Parameters<typeof hydrate>[1])
  } catch { /* copia rota: se ignora */ }
}

/** Escucha la caché y la guarda (con retardo) para el usuario actual. Devuelve la baja. */
export function persistQueries(client: QueryClient, getUserId: () => number | string | null | undefined) {
  let timer = 0
  const save = () => {
    timer = 0
    const id = getUserId()
    if (id == null) return
    const state = dehydrate(client, {
      shouldDehydrateQuery: q => {
        if (q.state.status !== 'success' || SKIP.has(String(q.queryKey[0]))) return false
        try { return JSON.stringify(q.state.data).length <= MAX_QUERY } catch { return false }
      },
    })
    try {
      const out = JSON.stringify({ v: VERSION, at: Date.now(), state })
      if (out.length > MAX_TOTAL) return
      localStorage.setItem(keyFor(id), out)
    } catch { /* sin espacio o sin almacenamiento */ }
  }
  const unsub = client.getQueryCache().subscribe(e => {
    if (e.type !== 'updated' || e.action.type !== 'success') return
    if (!timer) timer = window.setTimeout(save, 1500)
  })
  const flush = () => { if (document.visibilityState === 'hidden' && timer) { clearTimeout(timer); save() } }
  document.addEventListener('visibilitychange', flush)
  return () => { unsub(); clearTimeout(timer); document.removeEventListener('visibilitychange', flush) }
}

/** Al cerrar sesión no queda nada guardado en el dispositivo. */
export function forgetQueries() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX)) localStorage.removeItem(k)
    }
  } catch { /* nada */ }
}
