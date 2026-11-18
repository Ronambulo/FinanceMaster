// Entrar y Crear cuenta (tableros Login, PCLogin y Registro).
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { Icon } from '@/ui/Icon'
import { Btn, C, Field, Progress, SubHeader } from '@/ui/kit'
import { useIsPC } from '@/app/Shell'
import { sparkPath } from '@/lib/home'
import { credentialToJSON, isCancel, passkeySupported, requestOptions, setDevicePasskey } from '@/lib/passkey'

const SESSION_ONLY = 'fm-session-only'
const SESSION_MARK = 'fm-session-alive'

/** Si el usuario no marcó "Recordarme", la sesión muere al cerrar el navegador. */
export function enforceRemember() {
  try {
    if (localStorage.getItem(SESSION_ONLY) === '1' && !sessionStorage.getItem(SESSION_MARK)) {
      localStorage.removeItem(SESSION_ONLY)
      useAuthStore.getState().logout()
    }
  } catch { /* sin almacenamiento */ }
}

function setRemember(remember: boolean) {
  try {
    if (remember) localStorage.removeItem(SESSION_ONLY)
    else { localStorage.setItem(SESSION_ONLY, '1'); sessionStorage.setItem(SESSION_MARK, '1') }
  } catch { /* sin almacenamiento */ }
}

function Logo({ size = 48 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span aria-hidden="true" style={{ width: size, height: size, borderRadius: 16, background: C.accent, color: C.white, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="wallet" size={26} /></span>
      <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>FinanceMaster</span>
    </div>
  )
}

function ErrorText({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <p role="alert" style={{ margin: '0 4px 12px', fontSize: 13, fontWeight: 700, color: C.red }}>{msg}</p>
}

function PasswordField({ id, label, value, onChange, placeholder, autoComplete }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; autoComplete: string }) {
  const [show, setShow] = useState(false)
  return (
    <Field id={id} label={label} icon="lock" type={show ? 'text' : 'password'} value={value} placeholder={placeholder} autoComplete={autoComplete}
      onChange={e => onChange(e.target.value)}
      trail={<button type="button" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShow(s => !s)} style={{ border: 0, background: 'transparent', color: C.muted, padding: 0, display: 'flex', cursor: 'pointer' }}><Icon name={show ? 'eye-invisible' : 'eye-open'} size={18} /></button>} />
  )
}

export function Login() {
  const pc = useIsPC()
  const nav = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [remember, setRem] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user.trim() || !pass) { setErr('Escribe usuario y contraseña'); return }
    setBusy(true); setErr(null)
    try {
      const r = await authApi.login({ email: user.trim(), password: pass })
      setRemember(remember)
      setAuth(r.user, r.access_token)
      nav('/', { replace: true })
    } catch {
      setErr('Usuario o contraseña incorrectos')
    } finally { setBusy(false) }
  }

  const withPasskey = async () => {
    setBusy(true); setErr(null)
    try {
      const o = await authApi.passkeyLoginOptions()
      const cred = await navigator.credentials.get({ publicKey: requestOptions(o.options) }) as PublicKeyCredential | null
      if (!cred) return
      const json = credentialToJSON(cred)
      const r = await authApi.passkeyLogin(o.key, json)
      setDevicePasskey(json.rawId as string)
      setRemember(remember)
      setAuth(r.user, r.access_token)
      nav('/', { replace: true })
    } catch (e) {
      if (!isCancel(e)) setErr(e instanceof Error && e.message ? e.message : 'No se pudo entrar con huella')
    } finally { setBusy(false) }
  }

  const form = (
    <form onSubmit={submit} noValidate>
      <Field id="login-user" label="Usuario" icon="user" type="text" value={user} autoComplete="username" autoCapitalize="none" onChange={e => setUser(e.target.value)} />
      <PasswordField id="login-pass" label="Contraseña" value={pass} onChange={setPass} placeholder="••••••••" autoComplete="current-password" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 4px 24px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: C.muted }}>
          <input type="checkbox" checked={remember} onChange={e => setRem(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--c-5b52f0)' }} />
          Recordarme
        </label>
        <button type="button" onClick={() => setHint(h => !h)} style={{ border: 0, background: 'transparent', padding: 0, font: `700 14px 'Manrope', sans-serif`, color: C.accentText, cursor: 'pointer' }}>¿La olvidaste?</button>
      </div>
      {hint && <p style={{ margin: '-12px 4px 16px', fontSize: 13, fontWeight: 600, color: C.muted }}>Pide al administrador que te la cambie desde Admin.</p>}
      <ErrorText msg={err} />
      <Btn type="submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Btn>
      {passkeySupported() && <Btn kind="secondary" icon="fingerprint" style={{ marginTop: 10, padding: '0 9px 0 0' }} disabled={busy} onClick={withPasskey}>Entrar con huella</Btn>}
    </form>
  )

  if (pc) {
    return (
      <div style={{ display: 'flex', minHeight: '100dvh' }}>
        <div style={{ width: 560, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
          <div style={{ width: 380 }}>
            <div style={{ margin: '0 0 28px' }}><Logo /></div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em' }}>Hola de nuevo</h1>
            <p style={{ margin: '6px 0 26px', color: C.muted, fontWeight: 600 }}>Entra para ver tus cuentas</p>
            {form}
            <p style={{ margin: '18px 0 0', textAlign: 'center', fontSize: 14, color: C.muted, fontWeight: 600 }}>
              ¿No tienes cuenta? <Link to="/registro" style={{ color: C.accentText, fontWeight: 800 }}>Crear una</Link>
            </p>
          </div>
        </div>
        <div style={{ flex: 1, background: C.card, borderRadius: 32, margin: 20, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 56, gap: 18, boxShadow: 'var(--sh-card)' }}>
          <p style={{ margin: 0, fontSize: 14, color: C.muted, fontWeight: 700 }}>Te quedan este mes</p>
          <p style={{ margin: 0, fontSize: 72, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>907,32 €</p>
          <DecorSpark />
          <p style={{ margin: 0, fontSize: 20, fontWeight: 800, maxWidth: 420 }}>Tu dinero, claro y en un vistazo.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', minHeight: '100dvh', boxSizing: 'border-box', paddingBottom: 90, maxWidth: 560, margin: '0 auto' }}>
      <div style={{ padding: '70px 24px 0' }}>
        <Logo />
        <h1 style={{ margin: '44px 0 6px', fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>Hola de nuevo</h1>
        <p style={{ margin: '0 0 28px', color: C.muted, fontWeight: 600 }}>Entra para ver tus cuentas</p>
        {form}
      </div>
      <p style={{ position: 'absolute', left: 0, right: 0, bottom: 34, margin: 0, textAlign: 'center', fontSize: 14, color: C.muted, fontWeight: 600 }}>
        ¿No tienes cuenta? <Link to="/registro" style={{ color: C.accentText, fontWeight: 800 }}>Crear cuenta</Link>
      </p>
    </div>
  )
}

/** Curva decorativa del panel derecho del login en PC. */
function DecorSpark() {
  const vals = [2, 5, 3.5, 9, 13, 11, 19, 23, 21, 29, 34, 43]
  const d = sparkPath(vals, 460, 110, 4)
  return (
    <div style={{ maxWidth: 460 }}>
      <svg aria-hidden="true" width="460" height="110" viewBox="0 0 460 110" style={{ display: 'block', maxWidth: '100%' }}>
        <defs>
          <linearGradient id="login-g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--c-8b85ff)" stopOpacity="0.32" />
            <stop offset="1" stopColor="var(--c-8b85ff)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={d.area} fill="url(#login-g)" />
        <path d={d.line} fill="none" stroke="var(--c-8b85ff)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {d.end && <circle cx={d.end[0]} cy={d.end[1]} r="4.5" fill="var(--c-8b85ff)" stroke="var(--c-1a1b23)" strokeWidth="2" />}
      </svg>
    </div>
  )
}

export function passwordStrength(p: string): { ratio: number; label: string; color: string } {
  let s = 0
  if (p.length >= 8) s++
  if (p.length >= 12) s++
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++
  if (/\d/.test(p)) s++
  if (/[^A-Za-z0-9]/.test(p)) s++
  if (!p) return { ratio: 0, label: '', color: C.muted }
  if (s <= 1) return { ratio: 0.33, label: 'Contraseña débil', color: C.red }
  if (s <= 3) return { ratio: 0.66, label: 'Contraseña buena', color: C.green }
  return { ratio: 1, label: 'Contraseña fuerte', color: C.green }
}

export function Registro() {
  const nav = useNavigate()
  const pc = useIsPC()
  const setAuth = useAuthStore(s => s.setAuth)
  const [name, setName] = useState('')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const st = passwordStrength(pass)
  // Enlace de invitación: trae el nombre propuesto y se marca como usado al crear la cuenta.
  const invite = useSearchParams()[0].get('invitacion') || undefined
  useEffect(() => {
    if (!invite) return
    authApi.invite(invite)
      .then(r => { if (r.display_name) setName(n => n || r.display_name!) })
      .catch(ex => setErr(ex instanceof Error && ex.message ? ex.message : 'La invitación no es válida'))
  }, [invite])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user.trim()) return setErr('Elige un usuario')
    if (pass.length < 8) return setErr('La contraseña necesita 8 caracteres o más')
    if (pass !== pass2) return setErr('Las contraseñas no coinciden')
    setBusy(true); setErr(null)
    try {
      const r = await authApi.register({ username: user.trim(), password: pass, display_name: name.trim() || undefined, invite })
      setAuth(r.user, r.access_token)
      nav('/bienvenida', { replace: true })
    } catch (ex) {
      setErr(ex instanceof Error && ex.message ? ex.message : 'No se pudo crear la cuenta')
    } finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100dvh', maxWidth: pc ? 440 : 560, margin: '0 auto', paddingTop: pc ? 40 : 0 }}>
      <SubHeader title="Crear cuenta" back="/login" />
      <form onSubmit={submit} noValidate style={{ padding: '24px 20px 40px' }}>
        <Field id="reg-name" label="Nombre" icon="user" type="text" value={name} autoComplete="name" onChange={e => setName(e.target.value)} />
        <Field id="reg-user" label="Usuario" icon="user-profile" type="text" placeholder="Elige un nombre de usuario" value={user} autoComplete="username" autoCapitalize="none" onChange={e => setUser(e.target.value)} />
        <PasswordField id="reg-pass" label="Contraseña" value={pass} onChange={setPass} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
        <PasswordField id="reg-pass2" label="Repite la contraseña" value={pass2} onChange={setPass2} autoComplete="new-password" />
        <div style={{ margin: '4px 0 20px', minHeight: 26 }}>
          {pass && <>
            <Progress ratio={st.ratio} color={st.color} />
            <p style={{ margin: '6px 4px 0', fontSize: 12, fontWeight: 700, color: st.color }}>{st.label}</p>
          </>}
        </div>
        <ErrorText msg={err} />
        <Btn type="submit" disabled={busy}>{busy ? 'Creando…' : 'Crear cuenta'}</Btn>
      </form>
    </div>
  )
}
