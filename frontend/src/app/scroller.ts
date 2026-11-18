// En móvil la página no hace scroll: lo hace el contenedor del armazón (así iOS
// no puede mover la app entera ni la barra). Aquí se registra para subir arriba.
let el: HTMLElement | null = null

export function setScroller(node: HTMLElement | null) { el = node }

export function scrollToTop(smooth = false) {
  const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto'
  if (el) el.scrollTo({ top: 0, behavior })
  window.scrollTo({ top: 0, behavior })
}

/** Tirar para recargar: el dedo recorre `dy` px y el indicador baja menos (resistencia). */
export const PULL_TRIGGER = 64
export const PULL_MAX = 96
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0
  return Math.min(PULL_MAX, dy * 0.5)
}
