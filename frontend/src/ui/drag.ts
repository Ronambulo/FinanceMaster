// Gestos de las hojas que salen desde abajo:
//  · useSwipeDismiss: con el contenido arriba del todo, arrastrar hacia abajo
//    mueve la hoja con el dedo; al soltar se cierra si se ha bajado bastante o
//    con un golpe rápido, y si no vuelve a su sitio.
//  · Pull: canal para abrir una hoja arrastrando desde otro elemento (la barra
//    de navegación), de modo que la hoja siga al dedo mientras se abre.
import { useEffect, useRef, type RefObject } from 'react'

const EASE = 'cubic-bezier(.2,.8,.3,1)'
const SLOP = 6

/** ¿Hay algún contenedor con scroll vertical entre `target` y `root` que no esté arriba? */
function scrolledInside(target: EventTarget | null, root: HTMLElement): boolean {
  let n = target instanceof HTMLElement ? target : null
  while (n) {
    if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight + 1) return true
    if (n === root) break
    n = n.parentElement
  }
  return false
}

/**
 * `collapse`: en vez de salir por abajo, la hoja se encoge hasta quedarse en la
 * barra de la que salió. Devuelve cuánto puede bajar su borde superior.
 */
export function useSwipeDismiss(panel: RefObject<HTMLElement>, overlay: RefObject<HTMLElement>, onClose: () => void, enabled: boolean, collapse?: () => number) {
  const shrink = useRef(collapse)
  shrink.current = collapse
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const el = panel.current
    if (!el || !enabled) return
    let state: 'idle' | 'maybe' | 'drag' = 'idle'
    let x0 = 0, y0 = 0, dy = 0, lastY = 0, lastT = 0, v = 0, max = Infinity
    const ov = () => overlay.current
    const put = (y: number) => {
      el.style.transform = y ? `translateY(${y}px)` : ''
      if (max !== Infinity) el.style.clipPath = y ? clipBottom(y) : ''
    }
    const start = (e: TouchEvent) => {
      state = 'idle'
      if (e.touches.length !== 1 || scrolledInside(e.target, el)) return
      const t = e.touches[0]
      x0 = t.clientX; y0 = lastY = t.clientY; lastT = e.timeStamp; dy = 0; v = 0
      state = 'maybe'
    }
    const move = (e: TouchEvent) => {
      if (state === 'idle') return
      const t = e.touches[0]
      if (state === 'maybe') {
        const ddy = t.clientY - y0, ddx = t.clientX - x0
        if (Math.abs(ddy) < SLOP && Math.abs(ddx) < SLOP) return
        if (ddy <= 0 || Math.abs(ddx) > Math.abs(ddy) || el.scrollTop > 0) { state = 'idle'; return }
        state = 'drag'; y0 = t.clientY
        const c = shrink.current?.()
        max = c != null && c > 0 ? c : Infinity
        el.style.transition = 'none'
        const o = ov(); if (o) o.style.transition = 'none'
      }
      e.preventDefault()
      dy = Math.min(max, Math.max(0, t.clientY - y0))
      const dt = e.timeStamp - lastT
      if (dt > 0) v = 0.8 * ((t.clientY - lastY) / dt) + 0.2 * v
      lastY = t.clientY; lastT = e.timeStamp
      put(dy)
      const o = ov(); if (o) o.style.opacity = String(Math.max(0, 1 - dy / Math.max(max === Infinity ? el.offsetHeight : max, 1)))
    }
    const end = () => {
      if (state !== 'drag') { state = 'idle'; return }
      state = 'idle'
      const h = el.offsetHeight
      const o = ov()
      const span = max === Infinity ? h : max
      if (dy > Math.min(140, span * 0.3) || (v > 0.5 && dy > 20)) {
        el.style.transition = `transform .2s ${EASE}, clip-path .2s ${EASE}`
        put(max === Infinity ? h + 40 : max)
        if (o) { o.style.transition = 'opacity .2s'; o.style.opacity = '0' }
        window.setTimeout(() => close.current(), 190)
      } else {
        el.style.transition = `transform .25s ${EASE}, clip-path .25s ${EASE}`
        put(0)
        if (o) { o.style.transition = 'opacity .25s'; o.style.opacity = '' }
      }
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [panel, overlay, enabled])
}

/** Recorta la parte de abajo de la hoja para que, al bajarla, su borde inferior no se mueva. */
const clipBottom = (y: number) => `inset(0 0 ${y}px 0 round 24px)`

/** Distancia entre el borde superior de la hoja y el de la barra de abajo. */
export function gapToBar(el: HTMLElement): number {
  const bar = document.querySelector<HTMLElement>('[data-bottom-nav]')
  if (!bar) return 0
  const prev = el.style.transform
  el.style.transform = ''
  const d = bar.getBoundingClientRect().top - el.getBoundingClientRect().top
  el.style.transform = prev
  return d
}

/** Canal entre quien arrastra (la barra) y la hoja que se abre. */
export interface Pull {
  dy: number
  apply: ((dy: number) => void) | null
  release: ((v: number) => void) | null
}
export const createPull = (): Pull => ({ dy: 0, apply: null, release: null })

/**
 * Lado de la hoja: la coloca según `pull.dy` (px arrastrados hacia arriba) y al
 * soltar se completa o vuelve. Si el dedo llega al final, se completa sola.
 */
export function usePullOpen(pull: Pull | undefined, panel: RefObject<HTMLElement>, overlay: RefObject<HTMLElement>, active: boolean, onOpened: () => void, onCancel: () => void) {
  const cb = useRef({ onOpened, onCancel })
  cb.current = { onOpened, onCancel }
  useEffect(() => {
    const el = panel.current
    if (!pull || !el || !active) return
    // La hoja sale de la propia barra: empieza con su parte de arriba encajada
    // sobre ella y crece hacia arriba, sin que se vean dos barras.
    const h = Math.max(1, gapToBar(el) || el.offsetHeight)
    let done = false
    const place = (dy: number, anim?: string) => {
      const p = Math.min(1, Math.max(0, dy / h))
      const y = (1 - p) * h
      el.style.transition = anim ? `transform ${anim}, clip-path ${anim}` : 'none'
      el.style.transform = `translateY(${y}px)`
      // Solo se ve la parte que ha "crecido" desde la barra: su borde de abajo
      // se queda quieto y el de arriba sube con el dedo.
      el.style.clipPath = clipBottom(y)
      const o = overlay.current
      if (o) { o.style.transition = anim ? `opacity ${anim}` : 'none'; o.style.opacity = String(p) }
    }
    const finish = () => {
      done = true
      place(h, `.22s ${EASE}`)
      window.setTimeout(() => { el.style.transform = ''; el.style.clipPath = ''; const o = overlay.current; if (o) o.style.opacity = ''; cb.current.onOpened() }, 220)
    }
    pull.apply = dy => {
      if (done) return
      if (dy >= h) { finish(); return }
      place(dy)
    }
    pull.release = v => {
      if (done) return
      if (pull.dy > h * 0.3 || v > 0.5) finish()
      else { done = true; place(0, `.2s ${EASE}`); window.setTimeout(() => cb.current.onCancel(), 200) }
    }
    place(pull.dy)
    return () => { pull.apply = null; pull.release = null }
  }, [pull, panel, overlay, active])
}
