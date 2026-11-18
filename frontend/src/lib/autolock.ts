// "Bloquear al salir": si la app pasa más de X minutos en segundo plano (o
// cerrada), al volver se cierra la sesión. Es un ajuste de cada dispositivo.

export const LOCK_CHOICES = [-1, 0, 1, 5, 15] as const
export type LockMinutes = (typeof LOCK_CHOICES)[number]

const KEY = 'fm_lock_minutes'
const HIDDEN_KEY = 'fm_hidden_at'

export function lockLabel(m: LockMinutes): string {
  if (m < 0) return 'Nunca'
  if (m === 0) return 'Al momento'
  return m === 1 ? 'Tras 1 minuto' : `Tras ${m} minutos`
}

export function getLockMinutes(): LockMinutes {
  try {
    const v = Number(localStorage.getItem(KEY))
    return localStorage.getItem(KEY) != null && (LOCK_CHOICES as readonly number[]).includes(v) ? (v as LockMinutes) : -1
  } catch { return -1 }
}

export function setLockMinutes(m: LockMinutes): void {
  try { localStorage.setItem(KEY, String(m)) } catch { /* sin almacenamiento */ }
}

/** ¿Hay que bloquear? `hiddenAt` y `now` en ms. */
export function shouldLock(hiddenAt: number | null, now: number, minutes: number): boolean {
  if (minutes < 0 || hiddenAt == null || !Number.isFinite(hiddenAt)) return false
  return now - hiddenAt >= minutes * 60_000
}

export function markHidden(now = Date.now()): void {
  try { localStorage.setItem(HIDDEN_KEY, String(now)) } catch { /* nada */ }
}

/** Lee y borra la marca de "salió a las…". */
export function takeHidden(): number | null {
  try {
    const v = localStorage.getItem(HIDDEN_KEY)
    localStorage.removeItem(HIDDEN_KEY)
    return v == null ? null : Number(v)
  } catch { return null }
}
