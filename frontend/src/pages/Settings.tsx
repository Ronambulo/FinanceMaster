import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { catApi, authApi } from '@/lib/api'
import { queryClient } from '@/App'
import type { Category } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Plus, Trash2, Settings as SettingsIcon, Lock, Palette, Loader2, Check, Pencil, Plug, Copy, Trash, LayoutGrid, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { THEMES, ACCENT_COLORS, THEME_KEY, ACCENT_KEY, applyTheme, getChartColors, saveChartColors, resetChartColors, getCompact, setCompact } from '@/lib/theme'
import type { ChartColors } from '@/lib/theme'
import { webhookApi, trApi, portfolioApi, getApiToken } from '@/lib/api'
import type { Webhook as WebhookType } from '@/lib/api'
import { useFeaturesStore } from '@/store/features'
import { FEATURES } from '@/lib/features'
import type { FeatureId } from '@/lib/features'

const CATEGORY_TYPES = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'investment', label: 'Inversión' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'internal', label: 'Interna' },
]


// ── Category form ─────────────────────────────────────────────────────────────
function CategoryForm({ initial, isSystem, onSave, onCancel }: { initial?: Partial<Category>; isSystem?: boolean; onSave: (d: Partial<Category>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ 
    name: initial?.name || '', 
    icon: initial?.icon || '💰', 
    color: initial?.color || '#6366f1', 
    type: initial?.type || 'expense' 
  })
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>Nombre {isSystem && <span className="text-muted-foreground font-normal">(Sistema)</span>}</Label>
          <Input 
            value={form.name} 
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
            disabled={isSystem}
            title={isSystem ? "El nombre de las categorías del sistema no se puede cambiar porque se usa para la categorización automática." : ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Emoji</Label>
          <Input value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Color</Label>
          <div className="flex gap-2">
            <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="h-9 w-12 rounded border border-input cursor-pointer bg-transparent" />
            <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => form.name && onSave(form)}>Guardar</Button>
      </DialogFooter>
    </div>
  )
}

// ── Features tab ─────────────────────────────────────────────────────────────
function FeaturesTab() {
  const { features, toggle } = useFeaturesStore()

  const featureList = Object.entries(FEATURES) as [FeatureId, typeof FEATURES[FeatureId]][]

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Activa o desactiva los módulos de la aplicación. Los cambios se aplican al instante.</p>
      {featureList.map(([id, meta]) => (
        <Card key={id}>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{meta.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>
            </div>
            <button
              role="switch"
              aria-checked={features[id]}
              onClick={() => toggle(id, !features[id])}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${features[id] ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform ${features[id] ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Integrations tab ─────────────────────────────────────────────────────────
const WEBHOOK_EVENTS = [
  'transaction.created', 'transaction.imported', 'recurring.detected',
  'goal.completed', 'achievement.unlocked',
]

function DiagnosticsTab() {
  const { toast } = useToast()
  const { data: trStatus } = useQuery({ queryKey: ['tr-status'], queryFn: trApi.status, retry: false })

  if (!trStatus?.connected) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Conecta Trade Republic en la pestaña Integraciones para usar las herramientas de diagnóstico.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-sm">Reparación de datos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Herramientas para corregir inconsistencias entre Trade Republic y la base de datos local.</p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() =>
              trApi.fixUnknown().then(r =>
                toast(r.deleted > 0 ? `${r.deleted} sin categoría eliminadas — vuelve a sincronizar` : 'Sin transacciones para reparar', 'success')
              )
            }>Reparar categorías</Button>
            <Button size="sm" variant="outline" onClick={() =>
              trApi.fixSecurities().then(r => toast(r.fixed > 0 ? `${r.fixed} operaciones movidas al portfolio` : 'Portfolio ya en orden', 'success'))
            }>Reparar portfolio</Button>
            <Button size="sm" variant="outline" onClick={() =>
              portfolioApi.fixTickers()
                .then(r => toast(
                  `Tickers: ${r.isins_found} encontrados, ${r.isins_not_found} sin resolver · Nombres: ${r.names_fixed} corregidos · Acciones estimadas: ${r.shares_estimated}`,
                  'success'
                ))
                .catch(e => toast(e.message || 'Error al estimar posiciones', 'error'))
            }>Estimar posiciones</Button>
            <Button size="sm" variant="outline" onClick={() =>
              trApi.fixTickers()
                .then(r => toast(
                  r.resolved > 0
                    ? `${r.resolved} de ${r.total} posiciones resueltas a tickers Yahoo`
                    : r.total === 0 ? 'Todas las posiciones ya tienen ticker' : `${r.skipped} posiciones sin resolver`,
                  r.resolved > 0 ? 'success' : 'info'
                ))
                .catch(e => toast(e.message || 'Error al resolver tickers', 'error'))
            }>Resolver tickers</Button>
            <Button size="sm" variant="outline" onClick={() =>
              trApi.fixCancelled()
                .then(r => toast(r.deleted > 0 ? `${r.deleted} canceladas eliminadas` : 'Sin canceladas', r.deleted > 0 ? 'success' : 'info'))
                .catch(e => toast(e.message || 'Error', 'error'))
            }>Limpiar canceladas</Button>
            <Button size="sm" variant="outline" onClick={() =>
              trApi.dedupe().then(r => toast(r.deleted > 0 ? `${r.deleted} duplicados eliminados` : 'Sin duplicados', 'success'))
            }>Limpiar duplicados</Button>
            <Button size="sm" variant="outline" onClick={() =>
              trApi.importMissing()
                .then(r => {
                  console.table(r.details)
                  toast(
                    r.imported > 0
                      ? `${r.imported} transacciones importadas`
                      : 'Sin transacciones pendientes',
                    r.imported > 0 ? 'success' : 'info'
                  )
                })
                .catch(e => toast(e.message || 'Error', 'error'))
            }>Importar pendientes</Button>
            <Button size="sm" variant="outline" onClick={() => {
              if (!confirm('Elimina transacciones cuyo external_id no existe en TR. ¿Continuar?')) return
              trApi.fixOrphans()
                .then(r => {
                  console.table(r.deleted_orphan)
                  toast(
                    r.total_deleted > 0 ? `${r.total_deleted} eliminadas` : 'Sin huérfanas',
                    r.total_deleted > 0 ? 'success' : 'info'
                  )
                })
                .catch(e => toast(e.message || 'Error', 'error'))
            }}>Limpiar huérfanas</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Diagnóstico</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Muestra información en la consola del navegador (F12) para detectar discrepancias de balance.</p>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() =>
              trApi.debugBalance().then(r => {
                const msg = `BD: €${r.db_sum} | TR: €${r.tr_timeline_sum} | Diff: €${r.db_vs_tr_diff} | Huérfanas: ${r.orphan_db_rows.length} | Faltan: ${r.missing_from_db.length} | Desajustes: ${r.amount_mismatches.length}`
                console.log('=== FALTAN EN BD ==='); console.table(r.missing_from_db)
                console.log('=== HUÉRFANAS BD ==='); console.table(r.orphan_db_rows)
                console.log('=== IMPORTES DISTINTOS ==='); console.table(r.amount_mismatches)
                console.log('=== SIN MAPEAR ==='); console.table(r.tr_unmapped_nonzero)
                toast(msg, r.db_vs_tr_diff === 0 ? 'success' : 'info')
              }).catch(e => toast(e.message || 'Error', 'error'))
            }>Diagnóstico balance</Button>
            <Button size="sm" variant="outline" onClick={() =>
              trApi.debugSkipped().then(r => {
                const msg = `TR total: ${r.total_events_from_tr} | En BD: ${r.already_in_db} | Canceladas omitidas: ${r.skipped_cancelled.length} | Otros: ${r.skipped_other.length} | Impacto: €${r.total_skipped_cash_impact}`
                console.log('=== CANCELADAS OMITIDAS ==='); console.table(r.skipped_cancelled)
                console.log('=== OTROS OMITIDOS ==='); console.table(r.skipped_other)
                toast(msg, 'info')
              }).catch(e => toast(e.message || 'Error', 'error'))
            }>Diagnóstico omitidos</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


function IntegrationsTab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: webhooks = [] } = useQuery({ queryKey: ['webhooks'], queryFn: webhookApi.list })
  const { data: trStatus } = useQuery({ queryKey: ['tr-status'], queryFn: trApi.status, retry: false })
  const [apiToken, setApiToken] = useState<string | null>(null)
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
              <div className="grid grid-cols-2 gap-2">
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
                <button onClick={() => toggleWh.mutate(wh.id)} className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${wh.is_active ? 'bg-positive/15 text-positive' : 'bg-muted text-muted-foreground'}`}>{wh.is_active ? 'activo' : 'pausado'}</button>
                <button onClick={() => deleteWh.mutate(wh.id)} className="text-muted-foreground hover:text-negative"><Trash className="h-3.5 w-3.5" /></button>
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

      {/* API token */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Token de API</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">Token de larga duración (365 días) para acceso externo via <code>Authorization: Bearer &lt;token&gt;</code>.</p>
          {apiToken ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs font-mono">{apiToken}</code>
              <button onClick={() => { navigator.clipboard.writeText(apiToken); toast('Copiado', 'success') }} className="text-muted-foreground hover:text-foreground"><Copy className="h-4 w-4" /></button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => getApiToken().then(r => setApiToken(r.token))}>Generar token</Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ── Settings component ────────────────────────────────────────────────────────
export function Settings() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'categories')
  const [newCatOpen, setNewCatOpen] = useState(false)

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab) { setActiveTab(tab); setSearchParams({}, { replace: true }) }
  }, [])
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [newRuleOpen, setNewRuleOpen] = useState(false)
  const [ruleForm, setRuleForm] = useState({ keyword: '', category_id: '', field: 'name', priority: '0' })

  // Theme state
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark-blue')
  const [activeAccent, setActiveAccent] = useState(() => localStorage.getItem(ACCENT_KEY) || 'blue')
  const [compact, setCompactState] = useState(() => getCompact())

  // Chart colors state
  const [chartColors, setChartColors] = useState<Partial<ChartColors>>(() => getChartColors() || {})

  // Password change state
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })

  // Delete account state
  const logout = useAuthStore(s => s.logout)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const { data: rules } = useQuery({ queryKey: ['rules'], queryFn: catApi.listRules })

  const createCatMutation = useMutation({
    mutationFn: catApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setNewCatOpen(false); toast('Categoría creada', 'success') },
  })
  const updateCatMutation = useMutation({
    mutationFn: (data: Partial<Category> & { id: number }) => catApi.update(data.id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setEditingCat(null); toast('Categoría actualizada', 'success') },
    onError: (e: any) => toast(e.message, 'error'),
  })
  const deleteCatMutation = useMutation({
    mutationFn: catApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); toast('Categoría eliminada', 'success') },
    onError: (e: any) => toast(e.message, 'error'),
  })
  const createRuleMutation = useMutation({
    mutationFn: catApi.createRule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rules'] }); setNewRuleOpen(false); toast('Regla creada', 'success') },
  })
  const deleteRuleMutation = useMutation({
    mutationFn: catApi.deleteRule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rules'] }); toast('Regla eliminada', 'success') },
  })
  const changePasswordMutation = useMutation({
    mutationFn: () => authApi.changePassword({ current_password: pwForm.current, new_password: pwForm.next }),
    onSuccess: () => {
      toast('Contraseña cambiada correctamente', 'success')
      setPwForm({ current: '', next: '', confirm: '' })
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  const handleThemeChange = (themeId: string) => {
    setActiveTheme(themeId)
    localStorage.setItem(THEME_KEY, themeId)
    applyTheme(themeId, activeAccent)
  }

  const handleAccentChange = (accentId: string) => {
    setActiveAccent(accentId)
    localStorage.setItem(ACCENT_KEY, accentId)
    applyTheme(activeTheme, accentId)
  }

  const handleCompactToggle = (val: boolean) => {
    setCompactState(val)
    setCompact(val)
  }

  const handleChartColorChange = (key: keyof ChartColors, value: string) => {
    const next = { ...chartColors, [key]: value }
    setChartColors(next)
    saveChartColors({ [key]: value })
  }

  const handleResetChartColors = () => {
    resetChartColors()
    setChartColors({})
  }

  const userCats = categories?.filter(c => !c.is_system) || []
  const systemCats = categories?.filter(c => c.is_system) || []

  const pwValid = pwForm.current && pwForm.next && pwForm.next === pwForm.confirm && pwForm.next.length >= 6

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Ajustes</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="categories">Mis categorías ({userCats.length})</TabsTrigger>
          <TabsTrigger value="rules">Reglas ({rules?.length || 0})</TabsTrigger>
          <TabsTrigger value="system">Sistema</TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette className="h-3.5 w-3.5 mr-1.5" />Apariencia
          </TabsTrigger>
          <TabsTrigger value="security">
            <Lock className="h-3.5 w-3.5 mr-1.5" />Seguridad
          </TabsTrigger>
          <TabsTrigger value="features">
            <LayoutGrid className="h-3.5 w-3.5 mr-1.5" />Funciones
          </TabsTrigger>
          <TabsTrigger value="integrations">
            <Plug className="h-3.5 w-3.5 mr-1.5" />Integraciones
          </TabsTrigger>
          <TabsTrigger value="diagnostics">
            Diagnóstico
          </TabsTrigger>
        </TabsList>

        {/* Categories */}
        <TabsContent value="categories" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={() => setNewCatOpen(true)}><Plus className="h-4 w-4 mr-2" /> Nueva categoría</Button>
          </div>
          <div className="grid gap-2">
            {userCats.map(c => (
              <Card key={c.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{c.icon}</span>
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <Badge variant="muted" className="text-xs">{CATEGORY_TYPES.find(t => t.value === c.type)?.label || c.type}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: c.color }} />
                    <Button variant="ghost" size="icon" onClick={() => setEditingCat(c)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteCatMutation.mutate(c.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {userCats.length === 0 && (
              <p className="text-center py-8 text-sm text-muted-foreground">No tienes categorías personalizadas</p>
            )}
          </div>
        </TabsContent>

        {/* Rules */}
        <TabsContent value="rules" className="space-y-4 mt-4">
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground max-w-md">Las reglas se aplican durante la importación: si el nombre de la transacción contiene la palabra clave, se asigna la categoría indicada.</p>
            <Button onClick={() => setNewRuleOpen(true)}><Plus className="h-4 w-4 mr-2" /> Nueva regla</Button>
          </div>
          <div className="grid gap-2">
            {rules?.map(r => (
              <Card key={r.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono text-xs">"{r.keyword}"</Badge>
                    <span className="text-muted-foreground text-sm">→</span>
                    <span>{r.category.icon} {r.category.name}</span>
                    <Badge variant="muted" className="text-xs">campo: {r.field}</Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteRuleMutation.mutate(r.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </CardContent>
              </Card>
            ))}
            {rules?.length === 0 && (
              <p className="text-center py-8 text-sm text-muted-foreground">Sin reglas de categorización</p>
            )}
          </div>
        </TabsContent>

        {/* System categories */}
        <TabsContent value="system" className="mt-4">
          <div className="grid gap-2">
            {systemCats.map(c => (
              <Card key={c.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{c.icon}</span>
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <Badge variant="muted" className="text-xs">{CATEGORY_TYPES.find(t => t.value === c.type)?.label || c.type}</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: c.color }} />
                    <Button variant="ghost" size="icon" onClick={() => setEditingCat(c)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Appearance */}
        <TabsContent value="appearance" className="mt-4 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Tema</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {THEMES.map(theme => (
                  <button
                    key={theme.id}
                    onClick={() => handleThemeChange(theme.id)}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                      activeTheme === theme.id ? 'border-primary scale-105 shadow-lg shadow-primary/20' : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className={`h-16 w-full ${theme.preview}`} />
                    <div className="p-2 bg-card text-left">
                      <p className="text-xs font-medium">{theme.name}</p>
                    </div>
                    {activeTheme === theme.id && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Color de acento</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {ACCENT_COLORS.map(accent => {
                  const bg = `hsl(${accent.h}, ${accent.s}, ${accent.l})`
                  return (
                    <button
                      key={accent.id}
                      onClick={() => handleAccentChange(accent.id)}
                      title={accent.name}
                      className={`relative w-10 h-10 rounded-full border-2 transition-all hover:scale-110 ${
                        activeAccent === accent.id ? 'border-white scale-110 shadow-lg' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: bg }}
                    >
                      {activeAccent === accent.id && (
                        <Check className="h-4 w-4 text-white absolute inset-0 m-auto" />
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-3">El color de acento afecta a botones, enlaces y elementos destacados.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Colores de gráficas</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {([
                { key: 'income'  as keyof ChartColors, label: 'Ingresos', default: '#a3e635' },
                { key: 'expense' as keyof ChartColors, label: 'Gastos',   default: '#ef5350' },
                { key: 'savings' as keyof ChartColors, label: 'Ahorro',   default: '#6366f1' },
              ] as { key: keyof ChartColors; label: string; default: string }[]).map(item => (
                <div key={item.key} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={chartColors[item.key] || item.default}
                    onChange={e => handleChartColorChange(item.key, e.target.value)}
                    className="h-9 w-12 rounded border border-input cursor-pointer bg-transparent shrink-0"
                  />
                  <Label className="flex-1 cursor-pointer">{item.label}</Label>
                  <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: chartColors[item.key] || item.default }} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={handleResetChartColors} className="mt-1">
                Restablecer predeterminados
              </Button>
              <p className="text-xs text-muted-foreground">Se aplica a las líneas de la gráfica de tendencia en Mensual.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Densidad de interfaz</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Modo compacto</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Reduce el espaciado para ver más contenido en pantalla.</p>
                </div>
                <button
                  role="switch"
                  aria-checked={compact}
                  onClick={() => handleCompactToggle(!compact)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${compact ? 'bg-primary' : 'bg-muted'}`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform ${compact ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-border/50 mt-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Módulos de la aplicación</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Gestiona las funciones activadas en la pestaña <strong className="text-foreground">Funciones</strong>.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security */}
        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium flex items-center gap-2"><Lock className="h-4 w-4" /> Cambiar contraseña</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Contraseña actual</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={pwForm.current}
                  onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nueva contraseña</Label>
                <Input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={pwForm.next}
                  onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Confirmar nueva contraseña</Label>
                <Input
                  type="password"
                  placeholder="Repite la nueva contraseña"
                  value={pwForm.confirm}
                  onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                  className={pwForm.confirm && pwForm.next !== pwForm.confirm ? 'border-red-500' : ''}
                />
                {pwForm.confirm && pwForm.next !== pwForm.confirm && (
                  <p className="text-xs text-negative">Las contraseñas no coinciden</p>
                )}
              </div>
              <Button
                disabled={!pwValid || changePasswordMutation.isPending}
                onClick={() => changePasswordMutation.mutate()}
              >
                {changePasswordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Cambiar contraseña
              </Button>
            </CardContent>
          </Card>

          <Card className="border-destructive/30 mt-6">
            <CardContent className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">
                Eliminar tu cuenta borrará permanentemente todos tus datos: transacciones, categorías, objetivos, portfolio y conexiones. Esta acción no se puede deshacer.
              </p>
              <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                Eliminar mi cuenta
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features" className="mt-4">
          <FeaturesTab />
        </TabsContent>

        <TabsContent value="integrations" className="mt-4 space-y-4">
          <IntegrationsTab />
        </TabsContent>

        <TabsContent value="diagnostics" className="mt-4">
          <DiagnosticsTab />
        </TabsContent>
      </Tabs>

      {/* New category dialog */}
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva categoría</DialogTitle></DialogHeader>
          <CategoryForm onSave={d => createCatMutation.mutate(d)} onCancel={() => setNewCatOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Edit category dialog */}
      <Dialog open={!!editingCat} onOpenChange={(open) => !open && setEditingCat(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar categoría</DialogTitle></DialogHeader>
          {editingCat && (
            <CategoryForm 
              initial={editingCat} 
              isSystem={editingCat.is_system}
              onSave={d => updateCatMutation.mutate({ ...d, id: editingCat.id })} 
              onCancel={() => setEditingCat(null)} 
            />
          )}
        </DialogContent>
      </Dialog>

      {/* New rule dialog */}
      <Dialog open={newRuleOpen} onOpenChange={setNewRuleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva regla de categorización</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Palabra clave (contiene)</Label>
              <Input placeholder="Ej: netflix" value={ruleForm.keyword} onChange={e => setRuleForm(f => ({ ...f, keyword: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoría a asignar</Label>
              <Select value={ruleForm.category_id} onValueChange={v => setRuleForm(f => ({ ...f, category_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar categoría..." /></SelectTrigger>
                <SelectContent>
                  {categories?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Campo a buscar</Label>
              <Select value={ruleForm.field} onValueChange={v => setRuleForm(f => ({ ...f, field: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Nombre del comercio</SelectItem>
                  <SelectItem value="description">Descripción</SelectItem>
                  <SelectItem value="mcc">Código MCC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewRuleOpen(false)}>Cancelar</Button>
              <Button onClick={() => ruleForm.keyword && ruleForm.category_id && createRuleMutation.mutate({ ...ruleForm, category_id: Number(ruleForm.category_id), priority: Number(ruleForm.priority) })}>
                Guardar regla
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete account confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={v => { if (!v) { setDeleteOpen(false); setDeleteConfirm('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Eliminar cuenta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Esta acción es <strong className="text-foreground">irreversible</strong>. Se eliminarán todos tus datos permanentemente.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Escribe tu email <strong className="text-foreground">{user?.email}</strong> para confirmar
              </Label>
              <Input
                placeholder={user?.email}
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                className="border-destructive/40 focus:border-destructive"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteConfirm('') }}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={deleteConfirm !== user?.email || deleteLoading}
                onClick={async () => {
                  setDeleteLoading(true)
                  try {
                    await authApi.deleteAccount()
                    localStorage.clear()
                    queryClient.clear()
                    logout()
                  } catch (e: any) {
                    toast(e.message || 'Error al eliminar la cuenta', 'error')
                    setDeleteLoading(false)
                  }
                }}
              >
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Eliminar cuenta definitivamente
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
