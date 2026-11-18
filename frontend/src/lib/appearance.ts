// Ajustes de apariencia de este dispositivo: color de acento, tamaño del texto,
// animaciones reducidas y ocultar importes al abrir. Viven en el navegador.

export type AccentId = 'morado' | 'azul' | 'verde' | 'naranja' | 'rosa'
export type TextSize = 'normal' | 'grande' | 'enorme'

type Tones = { accent: string; light: string; text: string; soft: string; bar: string }
export const ACCENTS: { id: AccentId; name: string; swatch: string; dark: Tones; light: Tones }[] = [
  { id: 'morado', name: 'Morado', swatch: '#5b52f0',
    dark: { accent: '#5b52f0', light: '#8b85ff', text: '#b3aeff', soft: '#262546', bar: '#4f46e5' },
    light: { accent: '#4f46e5', light: '#4f46e5', text: '#4f46e5', soft: '#eceefe', bar: '#b3aeff' } },
  { id: 'azul', name: 'Azul', swatch: '#2f7fd0',
    dark: { accent: '#2f7fd0', light: '#6aa8ec', text: '#9cc6f5', soft: '#16283d', bar: '#2f7fd0' },
    light: { accent: '#1f6fbf', light: '#1f6fbf', text: '#1f6fbf', soft: '#e3effb', bar: '#9cc6f5' } },
  { id: 'verde', name: 'Verde', swatch: '#1f9d63',
    dark: { accent: '#1f9d63', light: '#4fc98e', text: '#8fe0b6', soft: '#13301f', bar: '#1f9d63' },
    light: { accent: '#177a4d', light: '#177a4d', text: '#177a4d', soft: '#e2f4ea', bar: '#8fe0b6' } },
  { id: 'naranja', name: 'Naranja', swatch: '#e07a00',
    dark: { accent: '#e07a00', light: '#ffa64d', text: '#ffc27a', soft: '#3a2a14', bar: '#e07a00' },
    light: { accent: '#c2410c', light: '#c2410c', text: '#c2410c', soft: '#fdecdf', bar: '#ffc27a' } },
  { id: 'rosa', name: 'Rosa', swatch: '#d1467f',
    dark: { accent: '#d1467f', light: '#f07aaa', text: '#f7a8c8', soft: '#3a1a2b', bar: '#d1467f' },
    light: { accent: '#be185d', light: '#be185d', text: '#be185d', soft: '#fce7f0', bar: '#f7a8c8' } },
]

export const TEXT_SIZES: { id: TextSize; name: string; short: string; zoom: number }[] = [
  { id: 'normal', name: 'Normal', short: 'A', zoom: 1 },
  { id: 'grande', name: 'Grande', short: 'A+', zoom: 1.1 },
  { id: 'enorme', name: 'Muy grande', short: 'A++', zoom: 1.2 },
]

export const ACCENT_KEY = 'fm-accent'
export const TEXT_KEY = 'fm-text-size'
export const MOTION_KEY = 'fm-reduce-motion'
export const HIDE_ON_OPEN_KEY = 'fm-hide-on-open'

function get(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function put(key: string, val: string | null) {
  try { val === null ? localStorage.removeItem(key) : localStorage.setItem(key, val) } catch { /* sin almacenamiento */ }
}

export function getAccent(): AccentId {
  const v = get(ACCENT_KEY)
  return ACCENTS.some(a => a.id === v) ? (v as AccentId) : 'morado'
}
export function getTextSize(): TextSize {
  const v = get(TEXT_KEY)
  return TEXT_SIZES.some(t => t.id === v) ? (v as TextSize) : 'normal'
}
export const getReduceMotion = () => get(MOTION_KEY) === '1'
export const getHideOnOpen = () => get(HIDE_ON_OPEN_KEY) === '1'

/** CSS que sobreescribe las variables del acento (vacío para el morado de serie). */
export function accentCss(id: AccentId): string {
  if (id === 'morado') return ''
  const a = ACCENTS.find(x => x.id === id)!
  const vars = (t: Tones) =>
    `--c-5b52f0:${t.accent};--c-8b85ff:${t.light};--c-b3aeff:${t.text};--c-262546:${t.soft};--c-4f46e5:${t.bar};`
  return `html:root{${vars(a.light)}}html.dark{${vars(a.dark)}}`
}

function applyAccent(id: AccentId) {
  if (typeof document === 'undefined') return
  let el = document.getElementById('fm-accent') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'fm-accent'
    document.head.appendChild(el)
  }
  el.textContent = accentCss(id)
}

function applyText(size: TextSize) {
  const z = TEXT_SIZES.find(t => t.id === size)!.zoom
  document.documentElement.style.setProperty('zoom', z === 1 ? '' : String(z))
}

function applyMotion(on: boolean) {
  document.documentElement.classList.toggle('reduce-motion', on)
}

export function setAccent(id: AccentId) { put(ACCENT_KEY, id === 'morado' ? null : id); applyAccent(id) }
export function setTextSize(s: TextSize) { put(TEXT_KEY, s === 'normal' ? null : s); applyText(s) }
export function setReduceMotion(on: boolean) { put(MOTION_KEY, on ? '1' : null); applyMotion(on) }
export function setHideOnOpen(on: boolean) { put(HIDE_ON_OPEN_KEY, on ? '1' : null) }

/** Al arrancar la app. */
export function applyAppearance() {
  applyAccent(getAccent())
  applyText(getTextSize())
  applyMotion(getReduceMotion())
}
