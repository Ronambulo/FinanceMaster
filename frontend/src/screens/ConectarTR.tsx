// Conectar Trade Republic (tableros NovConectarTR, NovConectarTR2 y NovTRCodigo).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { trApi } from '@/lib/api'
import { useIsPC } from '@/app/Shell'
import { BankLogo } from '@/ui/BankLogo'
import { Icon } from '@/ui/Icon'
import { toast } from '@/ui/Toast'
import { Btn, C, Field, RoundBtn, Spinner } from '@/ui/kit'

type Step = 'login' | 'app' | 'code'
const errText = (e: unknown) => (e instanceof Error && e.message ? e.message : 'No se pudo conectar')

/** Normaliza el teléfono a formato internacional (por defecto España). */
export function normPhone(phone: string): string {
  const d = phone.replace(/[\s-]/g, '')
  if (d.startsWith('+')) return d
  if (d.startsWith('00')) return `+${d.slice(2)}`
  return `+34${d}`
}

/** "+34600123456" → "+34 600 ••• 456". */
export function maskPhone(phone: string): string {
  const d = phone.replace(/\s+/g, '')
  if (d.length < 7) return phone
  const cc = d.startsWith('+') ? d.slice(0, 3) : ''
  const rest = d.slice(cc.length)
  return `${cc ? cc + ' ' : ''}${rest.slice(0, 3)} ••• ${rest.slice(-3)}`
}

function Steps({ n }: { n: 1 | 2 }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <span style={{ flex: 1, height: 4, borderRadius: 99, background: C.accent }} />
      <span style={{ flex: 1, height: 4, borderRadius: 99, background: n === 2 ? C.accent : 'var(--track)' }} />
    </div>
  )
}

function Title({ title, text, margin }: { title: string; text: ReactNode; margin: string }) {
  return (
    <>
      <h2 style={{ margin: 0, textAlign: 'center', fontSize: 22, fontWeight: 800 }}>{title}</h2>
      <p style={{ margin, textAlign: 'center', color: C.muted, fontWeight: 600 }}>{text}</p>
    </>
  )
}

function PhoneMock() {
  return (
    <div aria-hidden="true" style={{ position: 'relative', width: 168, height: 236, margin: '0 auto', borderRadius: 30, background: 'var(--c-0b0b0f)', boxShadow: 'inset 0 0 0 6px var(--c-2a2b38)', overflow: 'hidden' }}>
      <span style={{ position: 'absolute', top: 14, left: '50%', width: 46, height: 12, marginLeft: -23, borderRadius: 99, background: 'var(--c-2a2b38)' }} />
      <div style={{ position: 'absolute', left: 10, right: 10, top: 46, borderRadius: 16, background: C.card, padding: 10, boxShadow: '0 6px 18px rgba(0,0,0,0.18)', color: C.text }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BankLogo id="trade_republic" size={24} radius={7} />
          <span style={{ fontSize: 11, fontWeight: 800 }}>Trade Republic</span>
        </div>
        <p style={{ margin: '8px 0 10px', fontSize: 12, fontWeight: 700, lineHeight: 1.3 }}>¿Iniciar sesión en un dispositivo nuevo?</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <span style={{ height: 28, borderRadius: 9, background: C.field, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Rechazar</span>
          <span style={{ height: 28, borderRadius: 9, background: C.accent, color: C.white, fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Aceptar</span>
        </div>
      </div>
    </div>
  )
}

function CodeBoxes({ value, onChange, onDone }: { value: string; onChange: (v: string) => void; onDone: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div role="group" aria-label="Código" onClick={() => ref.current?.focus()} style={{ position: 'relative', display: 'flex', justifyContent: 'center', gap: 10 }}>
      {[0, 1, 2, 3].map(i => (
        <span key={i} style={{ width: 52, height: 60, borderRadius: 16, background: C.field, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, boxShadow: i === Math.min(value.length, 3) ? `inset 0 0 0 2px ${C.accent}` : 'none' }}>{value[i] ?? ''}</span>
      ))}
      <input ref={ref} aria-label="Código de 4 cifras" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))} onKeyDown={e => { if (e.key === 'Enter') onDone() }}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', border: 0, background: 'transparent', color: 'transparent', caretColor: 'transparent' }} />
    </div>
  )
}

export default function ConectarTR() {
  const nav = useNavigate()
  const pc = useIsPC()
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('login')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)
  const canLogin = phone.trim().length > 5 && pin.length === 4

  function done() {
    qc.invalidateQueries()
    toast('Trade Republic conectado')
    trApi.sync().then(() => qc.invalidateQueries()).catch(() => {})
    nav('/cuentas/broker/trade_republic', { replace: true })
  }

  async function login() {
    if (busy || !canLogin) return
    setBusy(true)
    try {
      const r = await trApi.connect(normPhone(phone), pin)
      if (r.status === 'connected') { done(); return }
      setCode('')
      setWait(30)
      setStep(r.method === 'authenticator' ? 'code' : 'app')
    } catch (e) { toast(errText(e), { error: true }) } finally { setBusy(false) }
  }

  async function verify() {
    if (busy || code.length < 4) return
    setBusy(true)
    try { await trApi.verify(code); done() } catch (e) { toast(errText(e), { error: true }); setCode('') } finally { setBusy(false) }
  }

  // Esperando la confirmación en la app: consulta el estado cada 2 s.
  useEffect(() => {
    if (step !== 'app') return
    const t = window.setInterval(async () => {
      try {
        const s = await trApi.status()
        if (s.connected) { window.clearInterval(t); done() }
        else if (!s.needs_2fa && s.login_error) { window.clearInterval(t); toast(s.login_error, { error: true }); setStep('login') }
      } catch { /* reintenta en el siguiente ciclo */ }
    }, 2000)
    return () => window.clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  useEffect(() => {
    if (step !== 'code' || wait <= 0) return
    const t = window.setTimeout(() => setWait(w => w - 1), 1000)
    return () => window.clearTimeout(t)
  }, [step, wait])

  const back = () => (step === 'login' ? nav(-1) : setStep('login'))
  const link = { border: 0, background: 'none', padding: 0, color: C.accentText, font: "800 14px 'Manrope', sans-serif", cursor: 'pointer' } as const

  let body: ReactNode
  let action: ReactNode
  if (step === 'login') {
    body = (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '30px 0 18px' }}><BankLogo id="trade_republic" size={72} radius={23} /></div>
        <Title title="Tu número y PIN" text="Los mismos que usas en la app de Trade Republic" margin="6px 0 24px" />
        <Field label="Teléfono" icon="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+34 600 000 000" value={phone} onChange={e => setPhone(e.target.value)} />
        <Field label="PIN" icon="lock" type="password" inputMode="numeric" autoComplete="off" placeholder="••••" maxLength={4} value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))} onKeyDown={e => { if (e.key === 'Enter') login() }} />
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: C.field, borderRadius: 16, padding: '12px 14px', marginTop: 6 }}>
          <span style={{ color: C.accentText, display: 'flex', marginTop: 1 }}><Icon name="shield-security" size={18} /></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>El PIN no se guarda. Solo guardamos la sesión para sincronizar.</span>
        </div>
      </>
    )
    action = <Btn disabled={busy || !canLogin} onClick={login}>{busy ? 'Conectando' : 'Continuar'}</Btn>
  } else if (step === 'app') {
    body = (
      <>
        <div style={{ margin: '28px 0 22px' }}><PhoneMock /></div>
        <Title title="Acéptalo en tu móvil" text="Abre la app de Trade Republic y toca Aceptar en el aviso de inicio de sesión" margin="6px 12px 0" />
        <div role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '22px 0 0', height: 48, borderRadius: 16, background: C.field, fontWeight: 700 }}>
          <Spinner size={18} />Esperando confirmación
        </div>
        <p style={{ margin: '18px 0 0', textAlign: 'center', fontSize: 14, fontWeight: 600, color: C.muted }}>
          ¿No te sale el aviso? <button type="button" style={link} onClick={() => { setCode(''); setWait(30); setStep('code') }}>Usar código por SMS</button>
        </p>
      </>
    )
    action = <Btn kind="secondary" onClick={() => setStep('login')} style={{ background: C.field, boxShadow: 'none' }}>Cancelar</Btn>
  } else {
    body = (
      <>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '30px 0 18px' }}>
          <span style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--avatar)', color: C.accentText, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sms" size={32} /></span>
        </div>
        <Title title="Código por SMS" text={`Enviado al ${maskPhone(normPhone(phone))}`} margin="6px 0 26px" />
        <CodeBoxes value={code} onChange={setCode} onDone={verify} />
        <p style={{ margin: '22px 0 0', textAlign: 'center', fontSize: 14, fontWeight: 600, color: C.muted }}>
          {wait > 0
            ? <span style={{ color: C.accentText, fontWeight: 800 }}>Reenviar en 0:{String(wait).padStart(2, '0')}</span>
            : <button type="button" style={link} disabled={busy} onClick={login}>Reenviar código</button>}
        </p>
      </>
    )
    action = <Btn disabled={busy || code.length < 4} onClick={verify}>{busy ? 'Conectando' : 'Conectar'}</Btn>
  }

  return (
    <div style={{ minHeight: '100dvh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', maxWidth: pc ? 440 : undefined, margin: pc ? '0 auto' : undefined }}>
      <header style={{ padding: '18px 16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <RoundBtn icon="chev-l" label="Volver" onClick={back} />
        <h1 style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Conectar Trade Republic</h1>
      </header>
      <div style={{ padding: '20px 20px 0', flex: 1 }}>
        <Steps n={step === 'login' ? 1 : 2} />
        {body}
      </div>
      <div style={{ padding: '20px 20px 30px', position: 'sticky', bottom: 0, background: C.bg }}>{action}</div>
    </div>
  )
}
