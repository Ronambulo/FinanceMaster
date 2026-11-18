// Avisos push del navegador. La parte pura (qué estado mostrar, la clave VAPID)
// se prueba sin navegador; el resto habla con el service worker.
import { pushApi } from './api'

/** unsupported: el navegador no puede; needsInstall: iPhone sin la app en la pantalla de inicio;
 *  denied: el usuario bloqueó los avisos; off/on: se puede activar o ya están activos aquí. */
export type PushState = 'unsupported' | 'needsInstall' | 'denied' | 'off' | 'on'

export interface PushEnv {
  ios: boolean
  standalone: boolean
  hasPush: boolean            // PushManager + serviceWorker + Notification
  permission: NotificationPermission | 'unknown'
  subscribed: boolean
}

export function pushState(e: PushEnv): PushState {
  // En iPhone solo hay push desde la app instalada (iOS 16.4+); fuera de ella ni existe PushManager.
  if (e.ios && !e.standalone) return 'needsInstall'
  if (!e.hasPush) return 'unsupported'
  if (e.permission === 'denied') return 'denied'
  return e.subscribed && e.permission === 'granted' ? 'on' : 'off'
}

/** Clave pública VAPID (base64url) a los bytes que pide `pushManager.subscribe`. */
export function urlBase64ToUint8Array(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Nombre corto del dispositivo para la lista del servidor. */
export function deviceName(ua: string): string {
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Windows/.test(ua)) return 'Windows'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Linux/.test(ua)) return 'Linux'
  return 'Navegador'
}

// ── Navegador ───────────────────────────────────────────────────────────────

function hasPushApi(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration()
  if (reg) return reg
  // En desarrollo no se registra solo (ver pwa.tsx): para avisos hace falta igual.
  try { return await navigator.serviceWorker.register('/sw.js') } catch { return null }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!hasPushApi()) return null
  const reg = await registration()
  return reg ? reg.pushManager.getSubscription() : null
}

export async function readPushEnv(ios: boolean, standalone: boolean): Promise<PushEnv> {
  const hasPush = hasPushApi()
  let subscribed = false
  if (hasPush) {
    const sub = await currentSubscription()
    if (sub) {
      // El navegador puede tener una suscripción que el servidor ya olvidó (o de otra cuenta).
      try { subscribed = (await pushApi.status(sub.endpoint)).this_device } catch { subscribed = false }
    }
  }
  return {
    ios, standalone, hasPush, subscribed,
    permission: hasPush ? Notification.permission : 'unknown',
  }
}

/** Pide permiso, se suscribe y lo registra en el servidor. Devuelve el estado final. */
export async function enablePush(): Promise<PushState> {
  if (!hasPushApi()) return 'unsupported'
  const perm = await Notification.requestPermission()
  if (perm === 'denied') return 'denied'
  if (perm !== 'granted') return 'off'
  const reg = await registration()
  if (!reg) return 'unsupported'
  await navigator.serviceWorker.ready
  const { key } = await pushApi.key()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource })
  }
  await pushApi.subscribe(sub.toJSON(), deviceName(navigator.userAgent))
  return 'on'
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  try { await pushApi.unsubscribe(sub.endpoint) } finally { await sub.unsubscribe().catch(() => false) }
}
