import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { catApi, authApi } from '@/lib/api'
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
import { Plus, Trash2, Settings as SettingsIcon, Lock, Palette, Loader2, Check, Pencil } from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { THEMES, ACCENT_COLORS, THEME_KEY, ACCENT_KEY, applyTheme, getChartColors, saveChartColors, resetChartColors } from '@/lib/theme'
import type { ChartColors } from '@/lib/theme'

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

// ── Settings component ────────────────────────────────────────────────────────
export function Settings() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const { toast } = useToast()
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [newRuleOpen, setNewRuleOpen] = useState(false)
  const [ruleForm, setRuleForm] = useState({ keyword: '', category_id: '', field: 'name', priority: '0' })

  // Theme state
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'dark-blue')
  const [activeAccent, setActiveAccent] = useState(() => localStorage.getItem(ACCENT_KEY) || 'blue')

  // Chart colors state
  const [chartColors, setChartColors] = useState<Partial<ChartColors>>(() => getChartColors() || {})

  // Password change state
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })

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

      <Tabs defaultValue="categories">
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
    </div>
  )
}
