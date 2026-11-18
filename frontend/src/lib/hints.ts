// Pistas de gestos que se enseñan una sola vez por dispositivo.
const PREFIX = 'fm-hint:'

export function hintSeen(key: string): boolean {
  try { return localStorage.getItem(PREFIX + key) === '1' } catch { return true }
}

export function markHint(key: string): void {
  try { localStorage.setItem(PREFIX + key, '1') } catch { /* sin almacenamiento */ }
}
