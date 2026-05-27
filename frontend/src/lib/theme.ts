// Theme and appearance utilities shared between Settings and App startup

export const THEMES = [
  {
    id: 'dark-blue',
    name: 'Azul oscuro',
    preview: 'bg-gradient-to-br from-[#0f172a] to-[#1e3a5f]',
    vars: {
      '--background': '222 47% 11%',
      '--card': '222 47% 14%',
      '--primary': '217 91% 60%',
      '--secondary': '217 33% 20%',
      '--muted': '217 33% 17%',
      '--border': '217 33% 20%',
      '--input': '217 33% 20%',
      '--ring': '217 91% 60%',
      '--accent': '217 33% 20%',
    },
  },
  {
    id: 'dark-green',
    name: 'Verde esmeralda',
    preview: 'bg-gradient-to-br from-[#0a1f14] to-[#1a4a2e]',
    vars: {
      '--background': '150 40% 8%',
      '--card': '150 35% 11%',
      '--primary': '142 72% 50%',
      '--secondary': '150 25% 18%',
      '--muted': '150 25% 15%',
      '--border': '150 25% 18%',
      '--input': '150 25% 18%',
      '--ring': '142 72% 50%',
      '--accent': '150 25% 18%',
    },
  },
  {
    id: 'dark-purple',
    name: 'Púrpura',
    preview: 'bg-gradient-to-br from-[#1a0a2e] to-[#3d1a6e]',
    vars: {
      '--background': '270 40% 10%',
      '--card': '270 35% 13%',
      '--primary': '270 80% 65%',
      '--secondary': '270 25% 20%',
      '--muted': '270 25% 17%',
      '--border': '270 25% 22%',
      '--input': '270 25% 22%',
      '--ring': '270 80% 65%',
      '--accent': '270 25% 20%',
    },
  },
  {
    id: 'dark-red',
    name: 'Rojo oscuro',
    preview: 'bg-gradient-to-br from-[#1f0a0a] to-[#4a1a1a]',
    vars: {
      '--background': '0 40% 8%',
      '--card': '0 35% 11%',
      '--primary': '0 75% 55%',
      '--secondary': '0 25% 18%',
      '--muted': '0 25% 15%',
      '--border': '0 25% 20%',
      '--input': '0 25% 20%',
      '--ring': '0 75% 55%',
      '--accent': '0 25% 18%',
    },
  },
  {
    id: 'dark-amber',
    name: 'Ámbar dorado',
    preview: 'bg-gradient-to-br from-[#1f1500] to-[#4a3200]',
    vars: {
      '--background': '38 50% 8%',
      '--card': '38 45% 11%',
      '--primary': '38 95% 55%',
      '--secondary': '38 30% 18%',
      '--muted': '38 30% 15%',
      '--border': '38 30% 20%',
      '--input': '38 30% 20%',
      '--ring': '38 95% 55%',
      '--accent': '38 30% 18%',
    },
  },
  {
    id: 'light',
    name: 'Modo claro',
    preview: 'bg-gradient-to-br from-[#f8fafc] to-[#e2e8f0]',
    vars: {
      '--background': '210 40% 98%',
      '--foreground': '222 47% 11%',
      '--card': '0 0% 100%',
      '--card-foreground': '222 47% 11%',
      '--primary': '217 91% 60%',
      '--secondary': '210 40% 92%',
      '--muted': '210 40% 94%',
      '--muted-foreground': '215 16% 46%',
      '--border': '214 32% 88%',
      '--input': '214 32% 88%',
      '--ring': '217 91% 60%',
      '--accent': '210 40% 92%',
      '--primary-foreground': '210 40% 98%',
    },
  },
]

export const ACCENT_COLORS = [
  { id: 'blue', name: 'Azul', h: '217', s: '91%', l: '60%' },
  { id: 'green', name: 'Verde', h: '142', s: '72%', l: '50%' },
  { id: 'purple', name: 'Púrpura', h: '270', s: '80%', l: '65%' },
  { id: 'red', name: 'Rojo', h: '0', s: '75%', l: '55%' },
  { id: 'amber', name: 'Ámbar', h: '38', s: '95%', l: '55%' },
  { id: 'cyan', name: 'Cian', h: '187', s: '85%', l: '50%' },
  { id: 'pink', name: 'Rosa', h: '330', s: '80%', l: '60%' },
  { id: 'lime', name: 'Lima', h: '80', s: '70%', l: '50%' },
]

export const THEME_KEY = 'fm_theme'
export const ACCENT_KEY = 'fm_accent'

export function applyTheme(themeId: string, accentId?: string) {
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0]
  const root = document.documentElement
  const isLight = themeId === 'light'

  Object.entries(theme.vars).forEach(([k, v]) => root.style.setProperty(k, v))

  if (!isLight) {
    root.style.setProperty('--foreground', '210 40% 98%')
    root.style.setProperty('--card-foreground', '210 40% 98%')
    root.style.setProperty('--popover', theme.vars['--background'])
    root.style.setProperty('--popover-foreground', '210 40% 98%')
    root.style.setProperty('--accent-foreground', '210 40% 98%')
    root.style.setProperty('--secondary-foreground', '210 40% 98%')
    root.style.setProperty('--destructive', '0 72% 51%')
    root.style.setProperty('--destructive-foreground', '210 40% 98%')
    root.style.setProperty('--radius', '0.75rem')
    root.style.setProperty('--muted-foreground', '215 20% 65%')
    root.style.setProperty('--primary-foreground', theme.vars['--background'])
  } else {
    root.style.setProperty('--foreground', '222 47% 11%')
    root.style.setProperty('--card-foreground', '222 47% 11%')
    root.style.setProperty('--popover', '0 0% 100%')
    root.style.setProperty('--popover-foreground', '222 47% 11%')
    root.style.setProperty('--accent-foreground', '222 47% 11%')
    root.style.setProperty('--secondary-foreground', '222 47% 11%')
    root.style.setProperty('--destructive', '0 72% 51%')
    root.style.setProperty('--destructive-foreground', '210 40% 98%')
    root.style.setProperty('--radius', '0.75rem')
    root.style.setProperty('--muted-foreground', '215 16% 46%')
    root.style.setProperty('--primary-foreground', '210 40% 98%')
  }

  const resolvedAccent = accentId || localStorage.getItem(ACCENT_KEY) || 'blue'
  const accent = ACCENT_COLORS.find(a => a.id === resolvedAccent)
  if (accent) {
    const val = `${accent.h} ${accent.s} ${accent.l}`
    root.style.setProperty('--primary', val)
    root.style.setProperty('--ring', val)
  }
}
