import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, aiApi } from '@/lib/api'
import type { AdminUser, AdminStats } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { useAuthStore } from '@/store/auth'
import { MetricCard } from '@/components/MetricCard'
import {
  ShieldCheck, Ban, RotateCcw, Sparkles, Loader2, Users, Trash2, AlertTriangle, BarChart3,
  Landmark, Receipt, CreditCard, Target, RefreshCw, Wallet, Search, TrendingUp, UserCheck,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts'

const MONTH_LABELS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function monthLabel(ym: string) {
  const idx = Number(ym.slice(5, 7)) - 1
  return MONTH_LABELS[idx] ?? ym
}

const ChartTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover p-2.5 text-xs shadow-card-hover capitalize">
      <p className="mb-1 font-medium text-popover-foreground/80">{label}</p>
      <p className="font-semibold tabular-nums">{payload[0].value} {payload[0].value === 1 ? 'usuario nuevo' : 'usuarios nuevos'}</p>
    </div>
  )
}

const ADOPTION_ROWS: { key: keyof AdminStats; icon: any; label: string; accent: 'negative' | 'positive' | 'chart-2' | 'warning' }[] = [
  { key: 'users_with_debts', icon: CreditCard, label: 'Deudas', accent: 'negative' },
  { key: 'users_with_goals', icon: Target, label: 'Objetivos', accent: 'positive' },
  { key: 'users_with_recurring', icon: RefreshCw, label: 'Recurrentes', accent: 'chart-2' },
  { key: 'users_with_budgets', icon: Wallet, label: 'Presupuestos', accent: 'warning' },
]

const ADOPTION_STYLES: Record<string, { iconBg: string; iconText: string; barIndicator: string; text: string }> = {
  negative: { iconBg: 'bg-negative/10', iconText: 'text-negative', barIndicator: 'bg-negative', text: 'text-negative' },
  positive: { iconBg: 'bg-positive/10', iconText: 'text-positive', barIndicator: 'bg-positive', text: 'text-positive' },
  'chart-2': { iconBg: 'bg-chart-2/10', iconText: 'text-chart-2', barIndicator: 'bg-chart-2', text: 'text-chart-2' },
  warning: { iconBg: 'bg-warning/10', iconText: 'text-warning', barIndicator: 'bg-warning', text: 'text-warning' },
}

function AdoptionRow({ icon: Icon, label, count, total, accent }: { icon: any; label: string; count: number; total: number; accent: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const s = ADOPTION_STYLES[accent]
  return (
    <div className="flex items-center gap-3">
      <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', s.iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', s.iconText)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between text-xs">
          <span>{label}</span>
          <span className={cn('font-semibold tabular-nums', s.text)}>{pct}%</span>
        </div>
        <Progress value={pct} className="mt-1.5 h-1.5" indicatorClassName={s.barIndicator} />
      </div>
    </div>
  )
}

function AdminOverview({ stats }: { stats: AdminStats }) {
  const chartData = stats.signups_by_month.map(m => ({ ...m, label: monthLabel(m.month) }))
  const hasSignups = chartData.some(d => d.count > 0)
  const aiPct = stats.total_users > 0 ? Math.round((stats.ai_enabled_users / stats.total_users) * 100) : 0
  const avgAdoption = stats.total_users > 0
    ? Math.round(
        ADOPTION_ROWS.reduce((sum, r) => sum + (stats[r.key] as number), 0) / ADOPTION_ROWS.length / stats.total_users * 100,
      )
    : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard title="Usuarios totales" value={String(stats.total_users)} icon={Users} accent="positive" />
        <MetricCard title="Bancos conectados" value={String(stats.connected_bank_users)} icon={Landmark} accent="warning" delay={30} />
        <MetricCard title="Transacciones" value={stats.total_transactions.toLocaleString('es-ES')} icon={Receipt} accent="chart-4" delay={60} />
        <MetricCard title="Peticiones IA · 6 meses" value={String(stats.ai_usage.total_requests)} icon={Sparkles} accent="chart-2" delay={90} />
      </div>

      <Card className="animate-fade-up" style={{ animationDelay: '120ms' }}>
        <CardContent className="flex flex-col gap-6 p-5 sm:flex-row sm:items-center">
          <div className="flex-[1.3] min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Estado de cuentas</p>
            <div className="mt-2.5 flex h-2.5 overflow-hidden rounded-full bg-secondary">
              {stats.total_users > 0 ? (
                <>
                  <div className="bg-positive" style={{ width: `${(stats.active_users / stats.total_users) * 100}%` }} />
                  <div className="bg-negative" style={{ width: `${(stats.closed_users / stats.total_users) * 100}%` }} />
                </>
              ) : (
                <div className="w-full bg-secondary" />
              )}
            </div>
            <div className="mt-2.5 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-positive" /> Activas <strong className="text-foreground">{stats.active_users}</strong></span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-negative" /> Cerradas <strong className="text-foreground">{stats.closed_users}</strong></span>
            </div>
          </div>

          <div className="hidden h-10 w-px bg-border sm:block" />

          <div className="flex flex-1 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chart-2/10">
              <Sparkles className="h-4 w-4 text-chart-2" />
            </div>
            <div>
              <p className="text-lg font-semibold leading-none tabular-nums">{stats.ai_enabled_users} <span className="text-xs font-medium text-muted-foreground">de {stats.total_users} · {aiPct}%</span></p>
              <p className="mt-1 text-[11px] text-muted-foreground">Con acceso a IA</p>
            </div>
          </div>

          <div className="hidden h-10 w-px bg-border sm:block" />

          <div className="flex flex-1 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-positive/10">
              <TrendingUp className="h-4 w-4 text-positive" />
            </div>
            <div>
              <p className="text-lg font-semibold leading-none tabular-nums">{avgAdoption}%</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Adopción media de funciones</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-4 pb-0">
            <CardTitle className="flex items-center justify-between text-sm font-medium">
              <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-muted-foreground" /> Nuevos registros</span>
              <span className="text-xs font-normal text-muted-foreground">Últimos 6 meses</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ left: -20, top: 4 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} className="capitalize" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--secondary))' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {!hasSignups && (
              <p className="mt-1 text-center text-[11px] italic text-muted-foreground">Aún es pronto para ver una tendencia.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-0">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <BarChart3 className="h-4 w-4 text-muted-foreground" /> Adopción de funciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4 pt-3">
            {ADOPTION_ROWS.map(r => (
              <AdoptionRow key={r.label} icon={r.icon} label={r.label} count={stats[r.key] as number} total={stats.total_users} accent={r.accent} />
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="p-4 pb-0">
          <CardTitle className="flex items-center justify-between text-sm font-medium">
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-muted-foreground" /> Uso de IA — todos los usuarios</span>
            <span className="text-xs font-normal text-muted-foreground">Últimos 6 meses</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-3">
          <div className="flex items-center divide-x divide-border text-center">
            <div className="flex-1">
              <p className="text-xl font-semibold tabular-nums">{stats.ai_usage.total_requests}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Peticiones</p>
            </div>
            <div className="flex-1">
              <p className="text-xl font-semibold tabular-nums">{stats.ai_usage.total_tokens.toLocaleString('es-ES')}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Tokens totales</p>
            </div>
            <div className="flex-[1.3]">
              <p className="text-xl font-semibold tabular-nums">{stats.ai_usage.total_estimated_cost.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {stats.ai_usage.cost_per_1k_tokens > 0 ? 'Coste estimado' : 'Coste estimado · modelo autoalojado, sin coste por token'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function UserUsageDialog({ u, open, onOpenChange }: { u: AdminUser; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: usage, isLoading } = useQuery({
    queryKey: ['admin-user-usage', u.id],
    queryFn: () => adminApi.getUserUsage(u.id),
    enabled: open,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Uso de IA — {u.email}</DialogTitle>
        </DialogHeader>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </div>
        )}
        {usage && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-secondary/50 p-2.5">
                <p className="text-lg font-semibold">{usage.total_requests}</p>
                <p className="text-[10px] text-muted-foreground">Peticiones</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-2.5">
                <p className="text-lg font-semibold">{usage.total_tokens.toLocaleString('es-ES')}</p>
                <p className="text-[10px] text-muted-foreground">Tokens totales</p>
              </div>
              <div className="rounded-lg bg-secondary/50 p-2.5">
                <p className="text-lg font-semibold">{usage.total_estimated_cost > 0 ? `${usage.total_estimated_cost.toFixed(2)}€` : '—'}</p>
                <p className="text-[10px] text-muted-foreground">Coste estimado</p>
              </div>
            </div>

            {usage.months.length > 0 ? (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {usage.months.slice().reverse().map(m => (
                  <div key={m.month} className="flex items-center justify-between text-xs px-2.5 py-2 rounded-lg bg-secondary/30">
                    <span className="font-medium">{m.month}</span>
                    <span className="text-muted-foreground">{m.requests} peticiones</span>
                    <span className="text-muted-foreground">{m.total_tokens.toLocaleString('es-ES')} tok</span>
                    {m.estimated_cost > 0 && <span className="font-medium">{m.estimated_cost.toFixed(2)}€</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground py-4">Sin uso registrado todavía.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function UserRow({ u }: { u: AdminUser }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const currentUser = useAuthStore(s => s.user)
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [usageOpen, setUsageOpen] = useState(false)
  const [modelDraft, setModelDraft] = useState(u.ai_model ?? '')

  const { data: modelsData } = useQuery({
    queryKey: ['ai-models'],
    queryFn: aiApi.listModels,
    enabled: !!currentUser?.is_admin,
    staleTime: 5 * 60_000,
    retry: false,
  })

  const setActive = useMutation({
    mutationFn: (isActive: boolean) => adminApi.setActive(u.id, isActive),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast(u.is_active ? 'Cuenta cerrada' : 'Cuenta reactivada', 'success')
    },
    onError: (e: any) => toast(e.message || 'Error', 'error'),
  })

  const setAi = useMutation({
    mutationFn: ({ enabled, model }: { enabled: boolean; model: string | null }) => adminApi.setAi(u.id, enabled, model),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast('Acceso a IA actualizado', 'success')
    },
    onError: (e: any) => toast(e.message || 'Error', 'error'),
  })

  const deleteUser = useMutation({
    mutationFn: () => adminApi.deleteUser(u.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      toast('Cuenta eliminada permanentemente', 'success')
      setConfirmDelete(false)
      setDeleteConfirmText('')
    },
    onError: (e: any) => toast(e.message || 'Error', 'error'),
  })

  const isSelf = currentUser?.id === u.id

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold uppercase',
              u.is_admin ? 'bg-positive/10 text-positive' : !u.is_active ? 'bg-negative/10 text-negative' : 'bg-chart-2/10 text-chart-2',
            )}>
              {u.email.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold truncate">{u.email}</p>
                {u.is_admin && <Badge variant="success">Admin</Badge>}
                {!u.is_active && <Badge variant="destructive">Cerrada</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                @{u.username} · registrado {new Date(u.created_at).toLocaleDateString('es-ES')}
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Button size="sm" variant="ghost" onClick={() => setUsageOpen(true)}>
              <BarChart3 className="h-3.5 w-3.5" />
              Uso de IA
            </Button>
            {!isSelf && (
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant={u.is_active ? 'outline' : 'default'}
                  onClick={() => u.is_active ? setConfirmClose(true) : setActive.mutate(true)}
                  disabled={setActive.isPending}
                >
                  {setActive.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : u.is_active ? <Ban className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                  {u.is_active ? 'Cerrar' : 'Reactivar'}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Borrar
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-border/60">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <button
            role="switch"
            aria-checked={u.ai_enabled}
            disabled={u.is_admin || setAi.isPending}
            onClick={() => setAi.mutate({ enabled: !u.ai_enabled, model: u.ai_enabled ? null : (modelDraft || modelsData?.default || null) })}
            title={u.is_admin ? 'Los admins ya tienen acceso a la IA' : ''}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${u.ai_enabled || u.is_admin ? 'bg-primary' : 'bg-muted'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform ${u.ai_enabled || u.is_admin ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
          <span className="text-xs text-muted-foreground shrink-0">Acceso a IA</span>

          {u.ai_enabled && !u.is_admin && (
            <div className="flex-1 min-w-[140px]">
              <Select
                value={u.ai_model ?? undefined}
                onValueChange={v => { setModelDraft(v); setAi.mutate({ enabled: true, model: v }) }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Modelo..." />
                </SelectTrigger>
                <SelectContent>
                  {(modelsData?.models ?? []).map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                  {!modelsData?.models.length && u.ai_model && (
                    <SelectItem value={u.ai_model}>{u.ai_model}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>¿Cerrar esta cuenta?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {u.email} no podrá iniciar sesión hasta que la reactives. Sus datos no se borran.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClose(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => { setActive.mutate(false); setConfirmClose(false) }}
            >
              Cerrar cuenta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={v => { setConfirmDelete(v); if (!v) setDeleteConfirmText('') }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Borrar cuenta definitivamente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Esta acción es <strong className="text-foreground">irreversible</strong>. Se eliminarán permanentemente todos los datos de <strong className="text-foreground">{u.email}</strong>: transacciones, categorías, deudas, objetivos, conexiones bancarias y todo lo demás.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Escribe <strong className="text-foreground">{u.email}</strong> para confirmar
              </Label>
              <Input
                placeholder={u.email}
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                className="border-destructive/40 focus:border-destructive"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmDelete(false); setDeleteConfirmText('') }}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteConfirmText !== u.email || deleteUser.isPending}
              onClick={() => deleteUser.mutate()}
            >
              {deleteUser.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Borrar cuenta definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <UserUsageDialog u={u} open={usageOpen} onOpenChange={setUsageOpen} />
    </Card>
  )
}

export function Admin() {
  const { data: users, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: adminApi.listUsers,
  })
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.getStats,
  })
  const [search, setSearch] = useState('')

  const filteredUsers = useMemo(() => {
    if (!users) return users
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(u => u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q))
  }, [users, search])

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Administración</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Gestiona las cuentas registradas y el acceso a las funciones de IA. Por defecto, ningún usuario nuevo tiene acceso a la IA.
        </p>
      </div>

      {statsLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando métricas...
        </div>
      )}
      {stats && <AdminOverview stats={stats} />}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Cuentas ({users?.length ?? 0})</h2>
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por email o usuario..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando usuarios...
          </div>
        )}

        {!isLoading && !users?.length && (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground py-8">
            <Users className="h-6 w-6" />
            No hay usuarios registrados.
          </div>
        )}

        {!isLoading && !!users?.length && !filteredUsers?.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">Ningún usuario coincide con "{search}".</p>
        )}

        <div className="space-y-3">
          {filteredUsers?.map(u => <UserRow key={u.id} u={u} />)}
        </div>
      </div>
    </div>
  )
}
