import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SettingsSwitch } from '@/components/SettingsSwitch'
import { Check } from 'lucide-react'
import { THEMES, ACCENT_COLORS, THEME_KEY, ACCENT_KEY, applyTheme, getTheme, getChartColors, saveChartColors, resetChartColors, getCompact, setCompact } from '@/lib/theme'
import type { ChartColors } from '@/lib/theme'
import { cn } from '@/lib/utils'

const CHART_ITEMS: { key: keyof ChartColors; label: string; default: string }[] = [
  { key: 'income',  label: 'Ingresos', default: '#a3e635' },
  { key: 'expense', label: 'Gastos',   default: '#ef5350' },
  { key: 'savings', label: 'Ahorro',   default: '#6366f1' },
]

// Formas fijas de muestra para la vista previa de colores de gráficas
const PREVIEW_LINES: Record<keyof ChartColors, string> = {
  income:  '0,30 25,24 50,27 75,16 100,19 125,10 150,13',
  expense: '0,38 25,34 50,40 75,31 100,36 125,28 150,32',
  savings: '0,48 25,45 50,46 75,42 100,40 125,37 150,34',
}

export function getAccentId(): string {
  return localStorage.getItem(ACCENT_KEY) || 'lime'
}

export function AppearanceSection() {
  const [activeTheme, setActiveTheme] = useState(getTheme)
  const [activeAccent, setActiveAccent] = useState(getAccentId)
  const [compact, setCompactState] = useState(getCompact)
  const [chartColors, setChartColors] = useState<Partial<ChartColors>>(() => getChartColors() || {})

  const handleThemeChange = (themeId: string) => {
    setActiveTheme(themeId)
    localStorage.setItem(THEME_KEY, themeId)
    applyTheme(themeId, activeAccent)
  }

  const handleAccentChange = (accentId: string) => {
    setActiveAccent(accentId)
    localStorage.setItem(ACCENT_KEY, accentId)
    applyTheme(activeTheme, accentId)
  }

  const handleCompactToggle = (val: boolean) => {
    setCompactState(val)
    setCompact(val)
  }

  const handleChartColorChange = (key: keyof ChartColors, value: string) => {
    setChartColors(prev => ({ ...prev, [key]: value }))
    saveChartColors({ [key]: value })
  }

  const handleResetChartColors = () => {
    resetChartColors()
    setChartColors({})
  }

  const colorOf = (item: typeof CHART_ITEMS[number]) => chartColors[item.key] || item.default
  const accentName = ACCENT_COLORS.find(a => a.id === activeAccent)?.name

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Tema</CardTitle></CardHeader>
        <CardContent>
          <div className="-mx-6 flex snap-x gap-3 overflow-x-auto px-6 pb-1 lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0">
            {THEMES.map(theme => {
              const selected = activeTheme === theme.id
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => handleThemeChange(theme.id)}
                  aria-pressed={selected}
                  className={cn(
                    'relative w-36 shrink-0 snap-start overflow-hidden rounded-xl border-2 text-left transition-colors lg:w-auto',
                    selected ? 'border-primary' : 'border-border hover:border-primary/50',
                  )}
                >
                  <div className={cn('h-16 w-full', theme.preview)} />
                  <div className="bg-card px-3 py-2">
                    <p className="text-xs font-medium">{theme.name}</p>
                  </div>
                  {selected && (
                    <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Color de acento</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2.5">
            {ACCENT_COLORS.map(accent => {
              const selected = activeAccent === accent.id
              return (
                <button
                  key={accent.id}
                  type="button"
                  onClick={() => handleAccentChange(accent.id)}
                  title={accent.name}
                  aria-label={accent.name}
                  aria-pressed={selected}
                  className={cn(
                    'relative h-11 w-11 rounded-full transition-transform hover:scale-105',
                    selected && 'ring-2 ring-foreground ring-offset-2 ring-offset-card',
                  )}
                  style={{ backgroundColor: `hsl(${accent.h}, ${accent.s}, ${accent.l})` }}
                >
                  {selected && <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" />}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-secondary/40 px-3 py-2.5">
            <span className="text-xs text-muted-foreground">Acento: <span className="font-medium text-foreground">{accentName}</span></span>
            <div className="ml-auto flex items-center gap-3">
              <Button size="sm" className="h-7 px-3 text-xs" tabIndex={-1}>Botón</Button>
              <span className="text-xs font-medium text-primary underline underline-offset-2">Enlace</span>
              <Badge variant="success" className="text-[11px]">Etiqueta</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">Colores de gráficas</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <svg viewBox="0 0 150 52" preserveAspectRatio="none" className="h-16 w-full rounded-lg border border-border bg-secondary/40" aria-hidden="true">
            {CHART_ITEMS.map(item => (
              <polyline
                key={item.key}
                points={PREVIEW_LINES[item.key]}
                fill="none"
                stroke={colorOf(item)}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <div className="grid gap-2 sm:grid-cols-3">
            {CHART_ITEMS.map(item => (
              <label key={item.key} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2">
                <input
                  type="color"
                  value={colorOf(item)}
                  onChange={e => handleChartColorChange(item.key, e.target.value)}
                  className="h-8 w-10 shrink-0 cursor-pointer rounded border border-input bg-transparent"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="block font-mono text-[11px] uppercase text-muted-foreground">{colorOf(item)}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Se aplica a las líneas de la gráfica de tendencia en Mensual.</p>
            <Button variant="outline" size="sm" onClick={handleResetChartColors}>Restablecer predeterminados</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Modo compacto</p>
            <p className="text-xs text-muted-foreground mt-0.5">Reduce el espaciado para ver más contenido en pantalla.</p>
          </div>
          <SettingsSwitch checked={compact} onChange={handleCompactToggle} label="Modo compacto" />
        </CardContent>
      </Card>
    </div>
  )
}
