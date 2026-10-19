import { useState, type ReactNode } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { catApi, webhookApi, trApi, integrationsApi } from '@/lib/api'
import type { Category, Webhook as WebhookType, ApiToken } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { Loader2, Copy, Trash, Smartphone } from 'lucide-react'

const WEBHOOK_EVENTS = [
  'transaction.created', 'transaction.imported', 'recurring.detected',
  'goal.completed', 'achievement.unlocked',
]

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">{n}</span>
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function CopyBox({ text, onCopy, multiline }: { text: string; onCopy: (t: string) => void; multiline?: boolean }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-2">
      {multiline
        ? <pre className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs">{text}</pre>
        : <code className="min-w-0 flex-1 break-all font-mono text-xs">{text}</code>}
      <button onClick={() => onCopy(text)} className="shrink-0 text-muted-foreground hover:text-foreground">
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function CopyChip({ text, onCopy }: { text: string; onCopy: (t: string) => void }) {
  return (
    <button onClick={() => onCopy(text)} className="shrink-0 text-muted-foreground hover:text-foreground">
      <Copy className="h-3.5 w-3.5" />
    </button>
  )
}

// Fila clave/valor para el cuerpo JSON o las cabeceras del atajo: la clave
// siempre es texto literal a copiar; el valor solo lleva botón de copiar
// cuando también es texto literal (no cuando es una variable mágica que el
// usuario debe insertar a mano desde el selector de Atajos).
function KeyValueRow({ keyText, valueLabel, valueCopyText, onCopy }: { keyText: string; valueLabel: string; valueCopyText?: string; onCopy: (t: string) => void }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-muted/50 p-2">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all font-mono text-xs">{keyText}</code>
        <CopyChip text={keyText} onCopy={onCopy} />
      </div>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 break-words text-xs text-muted-foreground">→ {valueLabel}</span>
        {valueCopyText !== undefined && <CopyChip text={valueCopyText} onCopy={onCopy} />}
      </div>
    </div>
  )
}

export function IntegrationsSection() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: webhooks = [] } = useQuery({ queryKey: ['webhooks'], queryFn: webhookApi.list })
  const { data: trStatus } = useQuery({ queryKey: ['tr-status'], queryFn: trApi.status, retry: false })
  const { data: apiTokens = [] } = useQuery({ queryKey: ['api-tokens'], queryFn: integrationsApi.list })
  const [newTokenName, setNewTokenName] = useState('Atajo de iOS')
  const [justCreatedToken, setJustCreatedToken] = useState<string | null>(null)
  const createTokenMutation = useMutation({
    mutationFn: () => integrationsApi.create(newTokenName || 'Token sin nombre'),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['api-tokens'] }); setJustCreatedToken(r.token); setNewTokenName('Atajo de iOS') },
  })
  const revokeTokenMutation = useMutation({
    mutationFn: (id: number) => integrationsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-tokens'] }),
  })
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const expenseCategoryNames = (categories as Category[]).filter(c => c.type === 'expense').map(c => c.name)
  const quickUrl = `${window.location.origin}/api/transactions/quick`
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false)
  const copyText = (text: string, label = 'Copiado') => { navigator.clipboard.writeText(text); toast(label, 'success') }
  const [newWh, setNewWh] = useState({ url: '', events: [] as string[] })
  const [trPhone, setTrPhone] = useState('')
  const [trPin, setTrPin] = useState('')
  const [trCode, setTrCode] = useState('')
  const [trPhase, setTrPhase] = useState<'idle' | 'awaiting_2fa' | 'connected'>('idle')
  const [trLoading, setTrLoading] = useState(false)

  const createWh = useMutation({
    mutationFn: () => webhookApi.create(newWh),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['webhooks'] }); setNewWh({ url: '', events: [] }) },
  })
  const deleteWh = useMutation({
    mutationFn: (id: number) => webhookApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  })
  const toggleWh = useMutation({
    mutationFn: (id: number) => webhookApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  })

  const [trError, setTrError] = useState<string | null>(null)

  const handleTrConnect = async () => {
    setTrLoading(true)
    setTrError(null)
    try {
      const res = await trApi.connect(trPhone, trPin)
      setTrPhase(res.status === 'connected' ? 'connected' : 'awaiting_2fa')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al conectar'
      setTrError(msg)
    } finally { setTrLoading(false) }
  }
  const handleTrVerify = async () => {
    setTrLoading(true)
    setTrError(null)
    try {
      await trApi.verify(trCode)
      setTrPhase('connected')
      qc.invalidateQueries({ queryKey: ['tr-status'] })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Código incorrecto'
      setTrError(msg)
    } finally { setTrLoading(false) }
  }

  return (
    <div className="space-y-4">
      {/* Trade Republic */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Trade Republic API</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {trStatus?.connected || trPhase === 'connected' ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-positive">Conectado</p>
                {trStatus?.last_sync && <p className="text-xs text-muted-foreground">Última sync: {new Date(trStatus.last_sync).toLocaleString('es-ES')}</p>}
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={() =>
                  trApi.sync().then(r => {
                    const parts = [`${r.synced} nuevas`]
                    if (r.updated > 0) parts.push(`${r.updated} corregidas`)
                    toast(`Sync: ${parts.join(', ')}`, 'success')
                  })
                }>Sincronizar</Button>
                <Button size="sm" variant="destructive" onClick={() => { trApi.disconnect(); qc.invalidateQueries({ queryKey: ['tr-status'] }) }}>Desconectar</Button>
              </div>
            </div>
          ) : trPhase === 'awaiting_2fa' ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Introduce el código de 4 dígitos de la app de Trade Republic:</p>
              <div className="flex gap-2">
                <Input placeholder="0000" value={trCode} onChange={e => setTrCode(e.target.value)} className="w-24" maxLength={4} inputMode="numeric" />
                <Button size="sm" onClick={handleTrVerify} disabled={trLoading || trCode.length < 4}>
                  {trLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verificar'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setTrPhase('idle'); setTrCode(''); setTrError(null) }} className="text-muted-foreground">
                  Cancelar
                </Button>
              </div>
              {trError && <p className="text-xs text-negative rounded-lg bg-negative/10 px-2 py-1.5">{trError}</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">API no oficial vía WebSocket. El primer inicio de sesión puede tardar ~30 segundos.</p>
              <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                <Input placeholder="+34612345678" value={trPhone} onChange={e => setTrPhone(e.target.value)} />
                <Input placeholder="PIN (4 dígitos)" type="password" value={trPin} onChange={e => setTrPin(e.target.value)} maxLength={4} />
              </div>
              {trError && <p className="text-xs text-negative rounded-lg bg-negative/10 px-2 py-1.5">{trError}</p>}
              <Button size="sm" onClick={handleTrConnect} disabled={trLoading || !trPhone || !trPin}>
                {trLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Conectando…</> : 'Conectar'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Webhooks</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {(webhooks as WebhookType[]).map(wh => (
              <div key={wh.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="truncate font-mono text-muted-foreground">{wh.url}</p>
                  <p className="text-muted-foreground/60 mt-0.5">{wh.events.join(', ')}</p>
                </div>
                <button onClick={() => toggleWh.mutate(wh.id)} aria-label={wh.is_active ? 'Pausar webhook' : 'Activar webhook'} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${wh.is_active ? 'bg-positive/15 text-positive' : 'bg-muted text-muted-foreground'}`}>{wh.is_active ? 'activo' : 'pausado'}</button>
                <button onClick={() => deleteWh.mutate(wh.id)} aria-label="Eliminar webhook" className="text-muted-foreground hover:text-negative"><Trash className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {webhooks.length === 0 && <p className="text-xs text-muted-foreground">No hay webhooks configurados.</p>}
          </div>
          <div className="space-y-2 border-t border-border pt-3">
            <Input placeholder="https://mi-app.com/webhook" value={newWh.url} onChange={e => setNewWh(p => ({ ...p, url: e.target.value }))} className="text-xs" />
            <div className="flex flex-wrap gap-1.5">
              {WEBHOOK_EVENTS.map(ev => (
                <button key={ev} onClick={() => setNewWh(p => ({ ...p, events: p.events.includes(ev) ? p.events.filter(e => e !== ev) : [...p.events, ev] }))}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${newWh.events.includes(ev) ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                  {ev}
                </button>
              ))}
            </div>
            <Button size="sm" disabled={!newWh.url || newWh.events.length === 0} onClick={() => createWh.mutate()}>Añadir webhook</Button>
          </div>
        </CardContent>
      </Card>

      {/* API tokens */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Tokens de API</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Tokens de larga duración para clientes externos (p.ej. un Atajo de iOS) via <code>Authorization: Bearer &lt;token&gt;</code>. No caducan; revócalos aquí cuando quieras dejar de usarlos.
          </p>

          {justCreatedToken && (
            <div className="space-y-1.5 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs font-medium">Copia este token ahora — no se volverá a mostrar.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs font-mono">{justCreatedToken}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(justCreatedToken); toast('Copiado', 'success') }}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
              <button className="text-xs text-muted-foreground underline" onClick={() => setJustCreatedToken(null)}>Ocultar</button>
            </div>
          )}

          <div className="space-y-2">
            {(apiTokens as ApiToken[]).map(t => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{t.name}</p>
                  <p className="text-muted-foreground/60 mt-0.5 font-mono">{t.token_prefix}…</p>
                  <p className="text-muted-foreground/60 mt-0.5">
                    {t.last_used_at ? `Último uso: ${new Date(t.last_used_at).toLocaleString('es-ES')}` : 'Sin uso todavía'}
                  </p>
                </div>
                <button onClick={() => revokeTokenMutation.mutate(t.id)} className="text-muted-foreground hover:text-negative shrink-0"><Trash className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            {apiTokens.length === 0 && <p className="text-xs text-muted-foreground">No hay tokens generados.</p>}
          </div>

          <div className="flex gap-2 border-t border-border pt-3">
            <Input placeholder="Nombre (ej: Atajo de iOS)" value={newTokenName} onChange={e => setNewTokenName(e.target.value)} className="text-xs" />
            <Button size="sm" disabled={createTokenMutation.isPending} onClick={() => createTokenMutation.mutate()}>Generar token</Button>
          </div>
        </CardContent>
      </Card>

      {/* Atajo de iOS */}
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-1.5"><Smartphone className="h-4 w-4" />Atajo de iOS</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Crea a mano un Atajo de iOS para registrar un gasto en segundos: elige categoría, escribe el importe y lo manda a FinanceMaster.
          </p>
          <Button size="sm" variant="outline" onClick={() => setShortcutHelpOpen(true)}>Ver los pasos</Button>
        </CardContent>
      </Card>

      <Dialog open={shortcutHelpOpen} onOpenChange={setShortcutHelpOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear el Atajo a mano</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <Step n={1}>Abre la app <strong>Atajos</strong> en el iPhone y crea un atajo nuevo.</Step>

            <Step n={2}>
              <p>Añade la acción <strong>"Lista"</strong> y escribe cada categoría como un elemento:</p>
              <CopyBox text={expenseCategoryNames.join('\n') || 'Otros'} onCopy={copyText} multiline />
            </Step>

            <Step n={3}>
              <p>Añade <strong>"Elegir de la lista"</strong> justo después — se conecta sola a la Lista anterior. Prompt (opcional):</p>
              <CopyBox text="Elige categoría" onCopy={copyText} />
            </Step>

            <Step n={4}>
              <p>Añade <strong>"Preguntar"</strong>, tipo <strong>Número</strong>, con este texto:</p>
              <CopyBox text="Importe del gasto (€)" onCopy={copyText} />
            </Step>

            <Step n={5}>
              <p>Opcional: añade otro <strong>"Preguntar"</strong>, tipo <strong>Texto</strong>, para poder ponerle título al gasto. Texto del prompt:</p>
              <CopyBox text="Título (opcional)" onCopy={copyText} />
              <p>Y en <strong>"Respuesta por defecto"</strong> pon:</p>
              <CopyBox text="Gasto de Apple Pay" onCopy={copyText} />
              <p className="text-xs text-muted-foreground">Si te saltas este paso, FinanceMaster usa igualmente "Gasto de Apple Pay" como título por defecto.</p>
            </Step>

            <Step n={6}>
              <p>Añade <strong>"Obtener contenido de URL"</strong>:</p>
              <Field label="URL"><CopyBox text={quickUrl} onCopy={copyText} /></Field>
              <Field label="Método"><p className="text-xs font-medium">POST</p></Field>
              <Field label="Cuerpo de la petición (JSON)">
                <div className="space-y-2">
                  <KeyValueRow keyText="amount" valueLabel={'variable mágica del primer "Preguntar"'} onCopy={copyText} />
                  <KeyValueRow keyText="type" valueLabel={'texto literal "expense"'} valueCopyText="expense" onCopy={copyText} />
                  <KeyValueRow keyText="name" valueLabel={'variable mágica del "Preguntar" del título (paso 5) — si lo omitiste, deja este campo vacío'} onCopy={copyText} />
                  <KeyValueRow keyText="category_name" valueLabel={'variable mágica de "Elegir de la lista"'} onCopy={copyText} />
                </div>
              </Field>
              <Field label="Cabeceras">
                <div className="space-y-2">
                  <KeyValueRow keyText="Authorization" valueLabel={justCreatedToken ? 'token generado abajo' : 'genera un token abajo'} onCopy={copyText} />
                  {justCreatedToken ? (
                    <CopyBox text={`Bearer ${justCreatedToken}`} onCopy={copyText} />
                  ) : (
                    <Button size="sm" variant="outline" disabled={createTokenMutation.isPending} onClick={() => createTokenMutation.mutate()}>
                      {createTokenMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Generando…</> : 'Generar token'}
                    </Button>
                  )}
                </div>
              </Field>
            </Step>

            <Step n={7}>
              <p>Opcional: añade <strong>"Mostrar notificación"</strong> con este texto:</p>
              <CopyBox text="Gasto registrado ✅" onCopy={copyText} />
            </Step>
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setShortcutHelpOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
