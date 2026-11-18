// "Entrar con huella" (WebAuthn / passkeys). El servidor manda las opciones en
// JSON con base64url; aquí se pasan a ArrayBuffer para el navegador y vuelta.

const KEY = 'fm_passkey_id'

export function passkeySupported(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext && typeof window.PublicKeyCredential === 'function'
    && !!navigator.credentials
}

export function toBuf(b64url: string): ArrayBuffer {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out.buffer
}

export function toB64url(buf: ArrayBuffer | null | undefined): string | null {
  if (!buf) return null
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

type Desc = { id: string; type: string; transports?: string[] }
interface CreateJSON { challenge: string; user: { id: string; name: string; displayName: string }; excludeCredentials?: Desc[]; [k: string]: unknown }
interface GetJSON { challenge: string; allowCredentials?: Desc[]; [k: string]: unknown }

const desc = (l?: Desc[]) => (l ?? []).map(d => ({ ...d, id: toBuf(d.id) })) as PublicKeyCredentialDescriptor[]

export function creationOptions(json: string): PublicKeyCredentialCreationOptions {
  const o = JSON.parse(json) as CreateJSON
  return { ...o, challenge: toBuf(o.challenge), user: { ...o.user, id: toBuf(o.user.id) }, excludeCredentials: desc(o.excludeCredentials) } as unknown as PublicKeyCredentialCreationOptions
}

export function requestOptions(json: string): PublicKeyCredentialRequestOptions {
  const o = JSON.parse(json) as GetJSON
  return { ...o, challenge: toBuf(o.challenge), allowCredentials: desc(o.allowCredentials) } as unknown as PublicKeyCredentialRequestOptions
}

export function credentialToJSON(c: PublicKeyCredential): Record<string, unknown> {
  const r = c.response as AuthenticatorAttestationResponse & AuthenticatorAssertionResponse
  const response: Record<string, unknown> = { clientDataJSON: toB64url(r.clientDataJSON) }
  if ('attestationObject' in r && r.attestationObject) {
    response.attestationObject = toB64url(r.attestationObject)
    response.transports = typeof r.getTransports === 'function' ? r.getTransports() : []
  } else {
    response.authenticatorData = toB64url(r.authenticatorData)
    response.signature = toB64url(r.signature)
    response.userHandle = toB64url(r.userHandle)
  }
  return { id: c.id, rawId: toB64url(c.rawId), type: c.type, response, clientExtensionResults: c.getClientExtensionResults?.() ?? {} }
}

/** El usuario canceló o el sistema no dejó (no es un error que mostrar). */
export function isCancel(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'AbortError')
}

export function getDevicePasskey(): string | null {
  try { return localStorage.getItem(KEY) } catch { return null }
}
export function setDevicePasskey(id: string | null): void {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY) } catch { /* nada */ }
}
