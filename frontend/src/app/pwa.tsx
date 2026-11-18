// Piezas invisibles de la PWA (se montan una vez en la raíz). Cada una existe
// porque algo fallaba sin ella en el iPhone con la app en la pantalla de inicio.
import { useEffect } from 'react'

declare const __BUILD_ID__: string

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

const CHECK_EVERY_MS = 5 * 60 * 1000
const RELOAD_GUARD_KEY = 'fm_reloaded_for_build'
const RETRY_AFTER_MS = 60 * 1000
const VERSION_PARAM = '_v'
const MAX_RELOADS = 3

/** Decide si toca recargar para `buildId` según el registro de intentos de esta sesión. */
export function reloadAttempt(guard: string | null, buildId: string, now: number): number | null {
  const [lastBuild, lastAt, tries] = (guard ?? '').split('@')
  const attempts = lastBuild === buildId ? Number(tries) || 1 : 0
  if (attempts && now - Number(lastAt) < RETRY_AFTER_MS * attempts) return null
  if (attempts >= MAX_RELOADS) return null
  return attempts + 1
}

/** Registra el service worker y se recarga sola cuando hay un despliegue nuevo. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!import.meta.env.PROD) return
    const url = new URL(window.location.href)
    if (url.searchParams.has(VERSION_PARAM)) {
      url.searchParams.delete(VERSION_PARAM)
      window.history.replaceState(window.history.state, '', url)
    }
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})

    let checking = false
    const check = async () => {
      if (checking || document.visibilityState !== 'visible') return
      checking = true
      try {
        const r = await fetch('/version.json', { cache: 'no-store' })
        if (!r.ok) return
        const { buildId } = (await r.json()) as { buildId?: string }
        if (!buildId || buildId === __BUILD_ID__) return
        // Nunca mientras se escribe (el gestor de contraseñas mueve el foco).
        if (document.activeElement?.matches('input, textarea, select')) return
        let guard: string | null = null
        try { guard = sessionStorage.getItem(RELOAD_GUARD_KEY) } catch { /* nada */ }
        const n = reloadAttempt(guard, buildId, Date.now())
        if (n == null) return
        try { sessionStorage.setItem(RELOAD_GUARD_KEY, `${buildId}@${Date.now()}@${n}`) } catch { /* nada */ }
        const next = new URL(window.location.href)
        next.searchParams.set(VERSION_PARAM, buildId)
        window.location.replace(next)
      } catch { /* sin red: luego */ } finally { checking = false }
    }
    void check()
    const iv = window.setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    return () => {
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
    }
  }, [])
  return null
}

/** iOS standalone: mide la altura real (la barra se quedaba flotando al abrir) y
 *  quita el difuminado de la barra de estado de iOS 27. */
export function StandaloneFix() {
  useEffect(() => {
    if (!(isStandalone() && isIos())) return
    const root = document.documentElement
    const measure = () => {
      root.style.setProperty('--app-height', `${window.innerHeight}px`)
      if (window.scrollY !== 0) window.scrollTo(0, 0)
    }
    measure()
    const timers = [100, 500, 1500].map(ms => window.setTimeout(measure, ms))
    window.addEventListener('pageshow', measure)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)

    const cover = document.createElement('div')
    const panel = document.createElement('div')
    cover.setAttribute('aria-hidden', 'true')
    panel.setAttribute('aria-hidden', 'true')
    Object.assign(cover.style, { display: 'none', position: 'fixed', inset: '0', zIndex: '2147483646', background: 'rgb(255 255 255 / 0.01)', pointerEvents: 'none' })
    Object.assign(panel.style, {
      position: 'fixed', top: '0', right: '0', bottom: '0', width: '90%', zIndex: '2147483647',
      background: 'rgb(255 255 255 / 0.01)', pointerEvents: 'none', transform: 'translateX(110%)', transition: 'transform 0.3s',
    })
    document.body.append(cover, panel)
    void panel.offsetWidth
    let back: number | undefined
    const frame = requestAnimationFrame(() => {
      cover.style.display = 'block'
      panel.style.transform = 'translateX(0%)'
      back = window.setTimeout(() => { cover.style.display = 'none'; panel.style.transform = 'translateX(110%)' }, 500)
    })
    return () => {
      timers.forEach(t => window.clearTimeout(t))
      window.clearTimeout(back)
      cancelAnimationFrame(frame)
      window.removeEventListener('pageshow', measure)
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      cover.remove(); panel.remove()
    }
  }, [])
  return null
}

/** iOS ignora user-scalable=no: se cancelan los gestos de pellizco a mano. */
export function NoZoom() {
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault()
    const pinch = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault() }
    const o = { passive: false } as const
    document.addEventListener('gesturestart', prevent, o)
    document.addEventListener('gesturechange', prevent, o)
    document.addEventListener('gestureend', prevent, o)
    document.addEventListener('touchmove', pinch, o)
    return () => {
      document.removeEventListener('gesturestart', prevent)
      document.removeEventListener('gesturechange', prevent)
      document.removeEventListener('gestureend', prevent)
      document.removeEventListener('touchmove', pinch)
    }
  }, [])
  return null
}

const TYPING = 'input, textarea, select, [contenteditable="true"]'

/** iOS sube la página para el teclado y a veces no la baja al cerrarlo. */
export function KeyboardFix() {
  useEffect(() => {
    let t: number | undefined
    const reset = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        if (document.activeElement?.matches(TYPING)) return
        if (window.scrollY !== 0 && document.documentElement.scrollHeight <= window.innerHeight + 1) window.scrollTo(0, 0)
      }, 100)
    }
    document.addEventListener('focusout', reset)
    window.visualViewport?.addEventListener('resize', reset)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('focusout', reset)
      window.visualViewport?.removeEventListener('resize', reset)
    }
  }, [])
  return null
}

export function PwaFixes() {
  return <><RegisterServiceWorker /><StandaloneFix /><NoZoom /><KeyboardFix /></>
}
