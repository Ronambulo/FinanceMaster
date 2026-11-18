// Tema "Suave": claro, oscuro o el del sistema. Los colores viven en index.css
// (`:root` = claro, `.dark` = oscuro); aquí solo se decide qué clase poner.

export type ThemeMode = 'system' | 'light' | 'dark'

export const THEMES: { id: ThemeMode; name: string; preview: string }[] = [
  { id: 'system', name: 'Sistema', preview: 'bg-gradient-to-br from-[#f2f3f7] from-50% to-[#0f1015] to-50%' },
  { id: 'light',  name: 'Claro',   preview: 'bg-[#f2f3f7]' },
  { id: 'dark',   name: 'Oscuro',  preview: 'bg-[#0f1015]' },
]

// Se mantiene por compatibilidad con pantallas antiguas; el acento ya es fijo.
export const ACCENT_COLORS = [
  { id: 'indigo', name: 'Índigo', h: '243', s: '75%', l: '59%' },
]

export const THEME_KEY        = 'fm_theme'
export const ACCENT_KEY       = 'fm_accent'
export const CHART_COLORS_KEY = 'fm_chart_colors'
export const COMPACT_KEY      = 'fm_compact'

/** Convierte cualquier valor guardado (incluidos los temas antiguos como
 *  'trade-republic' o 'dark-blue') a uno de los tres modos actuales. */
export function normalizeTheme(raw: string | null | undefined): ThemeMode {
  if (raw === 'system' || raw === 'light' || raw === 'dark') return raw
  if (!raw) return 'system'
  return 'dark'
}

export function resolveDark(mode: ThemeMode, prefersDark: boolean): boolean {
  return mode === 'dark' || (mode === 'system' && prefersDark)
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function safeSet(key: string, val: string | null) {
  try { val === null ? localStorage.removeItem(key) : localStorage.setItem(key, val) } catch { /* sin almacenamiento */ }
}

export function getTheme(): ThemeMode {
  return normalizeTheme(safeGet(THEME_KEY))
}

function prefersDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

let systemListener: ((e: MediaQueryListEvent) => void) | null = null

/** Aplica el modo y lo recuerda. El segundo argumento se ignora (antes era el acento). */
export function applyTheme(mode?: string | null, _accent?: string) {
  const m = normalizeTheme(mode ?? safeGet(THEME_KEY))
  safeSet(THEME_KEY, m)
  const root = document.documentElement
  const set = (dark: boolean) => {
    root.classList.toggle('dark', dark)
    root.style.colorScheme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1015' : '#f2f3f7')
  }
  set(resolveDark(m, prefersDark()))

  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (mq && systemListener) mq.removeEventListener?.('change', systemListener)
  systemListener = null
  if (mq && m === 'system') {
    systemListener = e => set(e.matches)
    mq.addEventListener?.('change', systemListener)
  }
}

export function getCompact(): boolean {
  return safeGet(COMPACT_KEY) === 'true'
}
export function setCompact(val: boolean): void {
  safeSet(COMPACT_KEY, val ? 'true' : null)
  document.documentElement.classList.toggle('compact', val)
}

export interface ChartColors { income: string; expense: string; savings: string }

export function getChartColors(): Partial<ChartColors> | null {
  try {
    const s = safeGet(CHART_COLORS_KEY)
    if (s) return JSON.parse(s)
  } catch { /* valor corrupto */ }
  return null
}
export function saveChartColors(colors: Partial<ChartColors>): void {
  const cur = getChartColors() || {}
  safeSet(CHART_COLORS_KEY, JSON.stringify({ ...cur, ...colors }))
}
export function resetChartColors(): void {
  safeSet(CHART_COLORS_KEY, null)
}
