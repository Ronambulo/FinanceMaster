// Copiar y compartir enlaces. En http (sin HTTPS) el portapapeles moderno no
// existe, así que se usa el método antiguo con un textarea.

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch { /* se intenta el método antiguo */ }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
  document.body.appendChild(ta)
  ta.select()
  ta.setSelectionRange(0, text.length)
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  ta.remove()
  return ok
}

export const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

/** Abre el menú de compartir del sistema. false si se cancela o no existe. */
export async function shareLink(url: string, title: string, text?: string): Promise<boolean> {
  if (!canShare()) return false
  try { await navigator.share({ url, title, text }); return true } catch { return false }
}

/** Enlace de invitación para abrir en este mismo servidor. */
export const inviteUrl = (token: string, origin = window.location.origin) =>
  `${origin}/registro?invitacion=${encodeURIComponent(token)}`
