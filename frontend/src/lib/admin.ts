// Formatos del panel de administración.

/** 12400 → "12,4k"; 980 → "980"; 2_300_000 → "2,3M". */
export function formatCount(n: number): string {
  const f = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',')
  if (n >= 1_000_000) return `${f(n / 1_000_000)}M`
  if (n >= 1000) return `${f(n / 1000)}k`
  return String(n)
}

/** Bytes en la unidad más legible: "38 MB", "512 KB", "1,2 GB". */
export function formatBytes(b: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = b, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  const r = v >= 10 || i === 0 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString().replace('.', ',')
  return `${r} ${units[i]}`
}

/** Tiempo encendido: "3 d", "5 h", "12 min". */
export function formatUptime(s: number): string {
  if (s >= 86400) return `${Math.floor(s / 86400)} d`
  if (s >= 3600) return `${Math.floor(s / 3600)} h`
  return `${Math.max(0, Math.floor(s / 60))} min`
}

function dayDiff(iso: string, now: Date): number {
  const d = new Date(iso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z')
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((b - a) / 86400000)
}

/** Último acceso corto (PC): "Hoy", "Ayer", "Hace 3 días", "—". */
export function lastAccessShort(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '—'
  const d = dayDiff(iso, now)
  if (d <= 0) return 'Hoy'
  if (d === 1) return 'Ayer'
  return `Hace ${d} días`
}

/** Último acceso en fila de móvil: "Último acceso hoy", "Hace 2 días", "Nunca ha entrado". */
export function lastAccessLabel(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'Nunca ha entrado'
  const d = dayDiff(iso, now)
  if (d <= 0) return 'Último acceso hoy'
  if (d === 1) return 'Último acceso ayer'
  return `Hace ${d} días`
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** "alta en enero 2026". */
export function joinedLabel(iso: string): string {
  const d = new Date(iso)
  return `alta en ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const toDate = (iso: string) => new Date(iso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z')

/** Día relativo para avisos y registro: "Hoy", "Ayer", "Hace 3 días". */
export function timeAgo(iso: string, now = new Date()): string {
  return lastAccessShort(iso, now)
}

/** Hora local "14:05". */
export function clockTime(iso: string): string {
  const d = toDate(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
/** Fecha de una copia (hora local del servidor, sin zona): "17 nov · 03:00". */
export function backupWhen(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso)
  if (!m) return iso
  return `${Number(m[3])} ${SHORT_MONTHS[Number(m[2]) - 1]} · ${m[4]}:${m[5]}`
}
