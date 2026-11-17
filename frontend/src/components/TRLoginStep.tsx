import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { trApi } from '@/lib/api'
import type { TRLoginMethod } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Smartphone } from 'lucide-react'

/* Segundo paso del login de Trade Republic (login web v2):
   - 'app': TR envía una notificación a la app del móvil; el backend espera la
     confirmación en segundo plano y aquí se consulta /tr/status hasta que conecta.
   - 'authenticator': la cuenta usa app de autenticación; se pide el código. */
export function TRLoginStep({ method, onConnected, onRestart, onCancel }: {
  method?: TRLoginMethod | null
  onConnected: () => void
  onRestart: () => void
  onCancel?: () => void
}) {
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [verifyError, setVerifyError] = useState<string | null>(null)
  const notified = useRef(false)
  // Solo cuenta el estado pedido tras montar: el de caché puede ser de un intento anterior
  const mountedAt = useRef(Date.now())

  const { data, dataUpdatedAt } = useQuery({
    queryKey: ['tr-status'],
    queryFn: trApi.status,
    retry: false,
    refetchOnMount: 'always',
    refetchInterval: q => {
      const s = q.state.dataUpdatedAt >= mountedAt.current ? q.state.data : undefined
      const m = s?.login_method ?? method
      const waiting = !s || (s.needs_2fa && !s.login_error)
      return m !== 'authenticator' && waiting ? 2000 : false
    },
  })
  const status = dataUpdatedAt >= mountedAt.current ? data : undefined
  const effectiveMethod = status?.login_method ?? method ?? 'app'
  // Si el servidor ya no tiene un login pendiente (p.ej. se reinició), no se espera en vano
  const lost = !!status && !status.connected && !status.needs_2fa && !status.login_error
  const loginError = status?.login_error
    ?? (lost ? 'Se perdió la solicitud de inicio de sesión (el servidor se reinició). Vuelve a conectar.' : null)

  useEffect(() => {
    if (status?.connected && !notified.current) {
      notified.current = true
      onConnected()
    }
  }, [status?.connected, onConnected])

  async function handleVerify() {
    if (code.length < 6 || verifying) return
    setVerifying(true)
    setVerifyError(null)
    try {
      await trApi.verify(code)
      await qc.invalidateQueries({ queryKey: ['tr-status'] })
    } catch (e: unknown) {
      setVerifyError(e instanceof Error ? e.message : 'Código incorrecto')
      setCode('')
    } finally {
      setVerifying(false)
    }
  }

  if (loginError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-negative rounded-lg bg-negative/10 px-3 py-2">{loginError}</p>
        <div className="flex gap-2">
          {onCancel && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onCancel}>Cancelar</Button>}
          <Button size="sm" onClick={onRestart}>Volver a intentar</Button>
        </div>
      </div>
    )
  }

  if (effectiveMethod === 'authenticator') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Introduce el código de 6 dígitos de tu app de autenticación.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            autoFocus
            placeholder="000000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && handleVerify()}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="w-32 text-center font-mono tracking-[0.3em]"
          />
          <Button size="sm" className="h-10" onClick={handleVerify} disabled={code.length < 6 || verifying}>
            {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verificar'}
          </Button>
          {onCancel && <Button size="sm" variant="ghost" className="h-10 text-muted-foreground" onClick={onCancel}>Cancelar</Button>}
        </div>
        {verifyError && <p className="text-xs text-negative rounded-lg bg-negative/10 px-2 py-1.5">{verifyError}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/40 p-3">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">Confirma el inicio de sesión en tu móvil</p>
          <p className="text-muted-foreground leading-relaxed">
            Abre la app de Trade Republic y acepta la solicitud de inicio de sesión. Tienes unos 2 minutos.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Esperando confirmación…
        </span>
        {onCancel && <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onCancel}>Cancelar</Button>}
      </div>
    </div>
  )
}
