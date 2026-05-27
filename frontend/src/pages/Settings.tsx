import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { catApi } from '@/lib/api'
import type { Category, CategoryRule } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Plus, Trash2, Settings as SettingsIcon } from 'lucide-react'
import { useAuthStore } from '@/store/auth'

const CATEGORY_TYPES = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'investment', label: 'Inversión' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'internal', label: 'Interna' },
]

function CategoryForm({ onSave, onCancel }: { onSave: (d: Partial<Category>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', icon: '💰', color: '#6366f1', type: 'expense' })
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label>Nombre</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
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

export function Settings() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const { toast } = useToast()
  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newRuleOpen, setNewRuleOpen] = useState(false)
  const [ruleForm, setRuleForm] = useState({ keyword: '', category_id: '', field: 'name', priority: '0' })

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const { data: rules } = useQuery({ queryKey: ['rules'], queryFn: catApi.listRules })

  const createCatMutation = useMutation({
    mutationFn: catApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setNewCatOpen(false); toast('Categoría creada', 'success') },
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

  const userCats = categories?.filter(c => !c.is_system) || []
  const systemCats = categories?.filter(c => c.is_system) || []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <SettingsIcon className="h-6 w-6" />
        <div>
          <h1 className="text-2xl font-bold">Ajustes</h1>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Mis categorías ({userCats.length})</TabsTrigger>
          <TabsTrigger value="rules">Reglas ({rules?.length || 0})</TabsTrigger>
          <TabsTrigger value="system">Categorías del sistema</TabsTrigger>
        </TabsList>

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

        <TabsContent value="system" className="mt-4">
          <div className="grid gap-2">
            {systemCats.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/30">
                <span className="text-xl">{c.icon}</span>
                <p className="text-sm">{c.name}</p>
                <Badge variant="muted" className="text-xs ml-auto">{c.type}</Badge>
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* New category dialog */}
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva categoría</DialogTitle></DialogHeader>
          <CategoryForm onSave={d => createCatMutation.mutate(d)} onCancel={() => setNewCatOpen(false)} />
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
