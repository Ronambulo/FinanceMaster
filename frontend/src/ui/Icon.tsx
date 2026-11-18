import type { CSSProperties } from 'react'
import { CAT_ICONS, ICONS, type IconName } from './iconData'
import { usePreferencesStore } from '@/store/preferences'
import { catKey, useCatEmojiStore } from '@/store/catEmoji'

export type CatKey = keyof typeof CAT_ICONS
export type AnyIcon = IconName | `cat-${CatKey}`
type Def = { vb: string; stroke: boolean; body: string }

function defOf(name: AnyIcon): Def {
  if (name.startsWith('cat-')) return CAT_ICONS[name.slice(4) as CatKey] ?? ICONS.tag
  return ICONS[name as IconName] ?? ICONS.tag
}

/** Icono de la librería del lienzo. */
export function Icon({ name, size = 20, style }: { name: AnyIcon; size?: number; style?: CSSProperties }) {
  const def = defOf(name)
  const p = def.stroke
    ? { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
    : { fill: 'currentColor' }
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox={def.vb} style={{ flex: 'none', ...style }} {...p}
      dangerouslySetInnerHTML={{ __html: def.body }} />
  )
}

// ── Categorías ──────────────────────────────────────────────────────────────
export type CatTone = CatKey | 'otros'

const OTROS_DARK: [string, string] = ['#262734', '#c9ccd8']

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

const RULES: [RegExp, CatTone][] = [
  [/transfer|traspaso|interna/, 'traspaso'],
  [/inversion|trading|broker|fondo|cripto|etf/, 'inversion'],
  [/nomina|salario|sueldo|ingreso|interes|dividend|pension/, 'nomina'],
  [/regalo|saveback|cashback|donacion/, 'regalos'],
  [/\bbar\b|cafe/, 'cafe'],
  [/super|restaur|comida|aliment|rapida|delivery|glovo/, 'comida'],
  [/transporte|taxi|uber|cabify|gasolin|metro|bus|tren|renfe|parking|coche/, 'transporte'],
  [/vuelo|hotel|viaje|airbnb/, 'viajes'],
  [/software|apps|suscrip|streaming|telefono|internet|movil/, 'suscripciones'],
  [/farmacia|medic|salud|dentista|seguro medico/, 'salud'],
  [/entreten|ocio|deporte|cine|juego|gimnasio|concierto/, 'ocio'],
  [/vivienda|alquiler|hipoteca|suministro|luz|agua|gas\b|seguro|impuesto|comunidad|hogar/, 'vivienda'],
]

/** Tono de una categoría según su nombre (y su tipo como último recurso). */
export function catTone(name?: string | null, type?: string | null): CatTone {
  const n = norm(name ?? '')
  for (const [re, tone] of RULES) if (re.test(n)) return tone
  if (type === 'income') return 'nomina'
  if (type === 'internal') return 'traspaso'
  if (type === 'investment') return 'inversion'
  return 'otros'
}

const v = (hex: string) => `var(--c-${hex.slice(1).toLowerCase()})`

/** [fondo, icono] del tono como variables de tema. */
export function toneColors(t: CatTone): { bg: string; fg: string } {
  const [b, f] = t === 'otros' ? OTROS_DARK : CAT_ICONS[t].dark
  return { bg: v(b), fg: v(f) }
}

export function toneIcon(t: CatTone): AnyIcon {
  if (t === 'otros') return 'tag'
  if (t === 'vivienda') return 'home'
  return `cat-${t}`
}

/** Ficha de categoría del lienzo (40/20 en listas, 32/16 en barras…). */
/** Emoji de la categoría si el usuario los prefiere y la categoría tiene uno. */
export function useCatEmoji(name?: string | null): string | null {
  const mode = usePreferencesStore(s => s.prefs.cat_icons)
  const emoji = useCatEmojiStore(s => (name ? s.map[catKey(name)] : undefined))
  return mode === 'emoji' && emoji ? emoji : null
}

/** Dibujo o emoji de una categoría, para meter dentro de su círculo de color. */
export function CatGlyph({ name, type, tone, size }: { name?: string | null; type?: string | null; tone?: CatTone; size: number }) {
  const emoji = useCatEmoji(name)
  if (emoji) return <span style={{ fontSize: Math.round(size * 1.2), lineHeight: 1 }}>{emoji}</span>
  return <Icon name={toneIcon(tone ?? catTone(name, type))} size={size} />
}

export function CatTile({ name, type, tone, size = 40, radius, icon, style }: {
  name?: string | null; type?: string | null; tone?: CatTone; size?: number; radius?: number; icon?: number; style?: CSSProperties
}) {
  const t = tone ?? catTone(name, type)
  const c = toneColors(t)
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: radius ?? size / 2, background: c.bg, color: c.fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', ...style,
    }}>
      <CatGlyph name={name} tone={t} size={icon ?? Math.round(size * 0.475)} />
    </span>
  )
}
