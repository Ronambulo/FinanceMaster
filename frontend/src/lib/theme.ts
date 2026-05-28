// Theme and appearance utilities shared between Settings and App startup

export const THEMES = [
  {
    id: 'trade-republic',
    name: 'Trade Republic',
    preview: 'bg-gradient-to-br from-[#080910] to-[#111520]',
    vars: {
      '--background': '228 22% 5%',
      '--card':       '228 18% 9%',
      '--popover':    '228 20% 7%',
      '--secondary':  '228 14% 14%',
      '--muted':      '228 14% 12%',
      '--border':     '228 14% 15%',
      '--input':      '228 14% 14%',
      '--accent':     '228 14% 14%',
    },
  },
  {
    id: 'dark-blue',
    name: 'Azul oscuro',
    preview: 'bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]',
    vars: {
      '--background': '222 47% 11%',
      '--card':       '222 47% 14%',
      '--popover':    '222 47% 11%',
      '--secondary':  '217 33% 20%',
      '--muted':      '217 33% 17%',
      '--border':     '217 33% 20%',
      '--input':      '217 33% 20%',
      '--accent':     '217 33% 20%',
    },
  },
  {
    id: 'dark-green',
    name: 'Bosque',
    preview: 'bg-gradient-to-br from-[#0a1f14] to-[#1a4a2e]',
    vars: {
      '--background': '150 40% 8%',
      '--card':       '150 35% 11%',
      '--popover':    '150 40% 8%',
      '--secondary':  '150 25% 18%',
      '--muted':      '150 25% 15%',
      '--border':     '150 25% 18%',
      '--input':      '150 25% 18%',
      '--accent':     '150 25% 18%',
    },
  },
  {
    id: 'dark-purple',
    name: 'Púrpura',
    preview: 'bg-gradient-to-br from-[#1a0a2e] to-[#3d1a6e]',
    vars: {
      '--background': '270 40% 10%',
      '--card':       '270 35% 13%',
      '--popover':    '270 40% 10%',
      '--secondary':  '270 25% 20%',
      '--muted':      '270 25% 17%',
      '--border':     '270 25% 22%',
      '--input':      '270 25% 22%',
      '--accent':     '270 25% 20%',
    },
  },
  {
    id: 'dark-amber',
    name: 'Ámbar',
    preview: 'bg-gradient-to-br from-[#1f1500] to-[#4a3200]',
    vars: {
      '--background': '38 50% 8%',
      '--card':       '38 45% 11%',
      '--popover':    '38 50% 8%',
      '--secondary':  '38 30% 18%',
      '--muted':      '38 30% 15%',
      '--border':     '38 30% 20%',
      '--input':      '38 30% 20%',
      '--accent':     '38 30% 18%',
    },
  },
  {
    id: 'light',
    name: 'Modo claro',
    preview: 'bg-gradient-to-br from-[#f8fafc] to-[#e2e8f0]',
    vars: {
      '--background':       '210 40% 98%',
      '--foreground':       '222 47% 11%',
      '--card':             '0 0% 100%',
      '--card-foreground':  '222 47% 11%',
      '--popover':          '0 0% 100%',
      '--popover-foreground':'222 47% 11%',
      '--secondary':        '210 40% 92%',
      '--muted':            '210 40% 94%',
      '--muted-foreground': '215 16% 46%',
      '--border':           '214 32% 88%',
      '--input':            '214 32% 88%',
      '--accent':           '210 40% 92%',
      '--accent-foreground':'222 47% 11%',
      '--primary-foreground':'210 40% 98%',
    },
  },
]

export const ACCENT_COLORS = [
  { id: 'lime',   name: 'Lima (TR)',  h: '87',  s: '100%', l: '72%' },   // default — Trade Republic
  { id: 'blue',   name: 'Azul',       h: '217', s: '91%',  l: '60%' },
  { id: 'green',  name: 'Verde',      h: '142', s: '72%',  l: '50%' },
  { id: 'purple', name: 'Púrpura',    h: '270', s: '80%',  l: '65%' },
  { id: 'cyan',   name: 'Cian',       h: '187', s: '85%',  l: '50%' },
  { id: 'amber',  name: 'Ámbar',      h: '38',  s: '95%',  l: '55%' },
  { id: 'pink',   name: 'Rosa',       h: '330', s: '80%',  l: '60%' },
  { id: 'red',    name: 'Rojo',       h: '0',   s: '75%',  l: '55%' },
]

export const THEME_KEY  = 'fm_theme'
export const ACCENT_KEY = 'fm_accent'

/** Returns true when the accent color is light enough that dark text is needed on it */
function isLightAccent(accent: { l: string }): boolean {
  return parseFloat(accent.l) >= 60
}

export function applyTheme(themeId: string, accentId?: string) {
  const theme  = THEMES.find(t => t.id === themeId) || THEMES[0]
  const root   = document.documentElement
  const isLight = themeId === 'light'

  // ── Apply theme background/surface vars ──
  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))

  if (!isLight) {
    root.style.setProperty('--foreground',           '0 0% 94%')
    root.style.setProperty('--card-foreground',      '0 0% 94%')
    root.style.setProperty('--popover-foreground',   '0 0% 94%')
    root.style.setProperty('--accent-foreground',    '0 0% 90%')
    root.style.setProperty('--secondary-foreground', '0 0% 85%')
    root.style.setProperty('--muted-foreground',     '220 9% 46%')
    root.style.setProperty('--destructive',          '3 88% 62%')
    root.style.setProperty('--destructive-foreground','0 0% 98%')
    root.style.setProperty('--radius',               '0.875rem')
    // Semantic financial colors — fixed across dark themes
    root.style.setProperty('--positive', '87 100% 72%')
    root.style.setProperty('--negative', '3 88% 62%')
    root.style.setProperty('--warning',  '38 95% 58%')
  } else {
    root.style.setProperty('--muted-foreground',     '215 16% 46%')
    root.style.setProperty('--destructive',          '0 72% 51%')
    root.style.setProperty('--destructive-foreground','210 40% 98%')
    root.style.setProperty('--radius',               '0.875rem')
    // Semantic financial colors — adjusted for light mode
    root.style.setProperty('--positive', '142 72% 36%')
    root.style.setProperty('--negative', '0 72% 45%')
    root.style.setProperty('--warning',  '38 95% 42%')
  }

  // ── Apply accent color ──
  const resolvedAccentId = accentId || localStorage.getItem(ACCENT_KEY) || 'lime'
  const accent = ACCENT_COLORS.find(a => a.id === resolvedAccentId) || ACCENT_COLORS[0]
  const primaryVal = `${accent.h} ${accent.s} ${accent.l}`

  root.style.setProperty('--primary', primaryVal)
  root.style.setProperty('--ring',    primaryVal)

  // primary-foreground: dark text on light accents, light text on dark accents
  if (!isLight) {
    root.style.setProperty(
      '--primary-foreground',
      isLightAccent(accent) ? '228 22% 5%' : '0 0% 98%',
    )
  }
}
