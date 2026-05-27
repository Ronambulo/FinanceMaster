import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { goalApi } from '@/lib/api'
import type { Goal, SavingsAllocation } from '@/lib/api'
import { formatCurrency, formatDate, currentMonth } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Plus, Trash2, Target, PiggyBank, TrendingUp, Loader2 } from 'lucide-react'

function GoalCard({ goal, onDelete, onUpdate }: { goal: Goal; onDelete: (id: number) => void; onUpdate: (id: number, d: Partial<Goal>) => void }) {
  const [editAmt, setEditAmt] = useState(false)
  const [newAmt, setNewAmt] = useState(String(goal.current_amount))

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold">{goal.name}</p>
              {goal.deadline && (
                <Badge variant={new Date(goal.deadline) < new Date() ? 'destructive' : 'muted'} className="text-xs">
                  {formatDate(goal.deadline)}
                </Badge>
              )}
            </div>
            {goal.type === 'EURO_TARGET' && goal.target_amount ? (
              <>
                <div className="flex items-center gap-3 text-sm mb-2">
                  <span className="text-muted-foreground">Objetivo: <span className="text-foreground font-medium">{formatCurrency(goal.target_amount)}</span></span>
                  {editAmt ? (
                    <div className="flex items-center gap-1">
                      <Input className="h-6 w-24 text-xs" value={newAmt} onChange={e => setNewAmt(e.target.value)} />
                      <Button size="sm" className="h-6 text-xs" onClick={() => { onUpdate(goal.id, { current_amount: Number(newAmt) }); setEditAmt(false) }}>OK</Button>
                    </div>
                  ) : (
                    <span className="text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => setEditAmt(true)}>
                      Acumulado: <span className="text-emerald-400 font-medium">{formatCurrency(goal.current_amount)}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={goal.progress_pct} className="flex-1 h-2" indicatorClassName="bg-primary" />
                  <span className="text-xs font-medium text-primary">{goal.progress_pct.toFixed(0)}%</span>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Objetivo: <span className="text-foreground font-medium">{goal.target_percent}% del ingreso mensual</span>
                {goal.category && <span className="ml-1">→ {goal.category === 'SAVINGS' ? '💰 Ahorro' : goal.category === 'INVESTMENT' ? '📈 Inversión' : '💳 Gastos'}</span>}
              </p>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={() => onDelete(goal.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function GoalForm({ onSave, onCancel }: { onSave: (d: Partial<Goal>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', type: 'EURO_TARGET' as const, target_amount: '', target_percent: '', category: 'SAVINGS', deadline: '' })
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nombre del objetivo</Label>
        <Input placeholder="Ej: Fondo de emergencia" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="EURO_TARGET">Meta en euros</SelectItem>
            <SelectItem value="PERCENT">Porcentaje de ingresos</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {form.type === 'EURO_TARGET' ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Importe objetivo (€)</Label>
            <Input type="number" step="0.01" value={form.target_amount} onChange={e => setForm(f => ({ ...f, target_amount: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Fecha límite (opcional)</Label>
            <Input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Porcentaje (%)</Label>
            <Input type="number" min="0" max="100" value={form.target_percent} onChange={e => setForm(f => ({ ...f, target_percent: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SAVINGS">Ahorro</SelectItem>
                <SelectItem value="INVESTMENT">Inversión</SelectItem>
                <SelectItem value="EXPENSES">Gastos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => form.name && onSave({
          name: form.name, type: form.type,
          target_amount: form.target_amount ? Number(form.target_amount) : undefined,
          target_percent: form.target_percent ? Number(form.target_percent) : undefined,
          category: form.category as any,
          deadline: form.deadline || undefined,
        })}>Guardar</Button>
      </DialogFooter>
    </div>
  )
}

export function Goals() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [newOpen, setNewOpen] = useState(false)
  const month = currentMonth()

  const { data: goals, isLoading } = useQuery({ queryKey: ['goals'], queryFn: goalApi.list })
  const { data: allocation } = useQuery({ queryKey: ['allocation', month], queryFn: () => goalApi.getAllocation(month) })

  const createMutation = useMutation({
    mutationFn: goalApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); setNewOpen(false); toast('Objetivo creado', 'success') },
  })
  const deleteMutation = useMutation({
    mutationFn: goalApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['goals'] }); toast('Objetivo eliminado', 'success') },
  })
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => goalApi.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  })
  const saveAllocation = useMutation({
    mutationFn: goalApi.upsertAllocation,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['allocation'] }); toast('Asignación guardada', 'success') },
  })

  const [alloc, setAlloc] = useState<SavingsAllocation | null>(null)
  const currentAlloc = alloc || allocation || { month, savings_pct: 20, investment_pct: 10, expenses_pct: 70 }
  const total = (currentAlloc.savings_pct || 0) + (currentAlloc.investment_pct || 0) + (currentAlloc.expenses_pct || 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Objetivos</h1>
          <p className="text-sm text-muted-foreground">Metas de ahorro e inversión</p>
        </div>
        <Button onClick={() => setNewOpen(true)}><Plus className="h-4 w-4 mr-2" /> Nuevo objetivo</Button>
      </div>

      {/* Savings allocation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><PiggyBank className="h-5 w-5 text-primary" />Asignación mensual de ingresos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { key: 'savings_pct', label: 'Ahorro', icon: '💰', color: 'text-emerald-400' },
              { key: 'investment_pct', label: 'Inversión', icon: '📈', color: 'text-blue-400' },
              { key: 'expenses_pct', label: 'Gastos', icon: '💳', color: 'text-amber-400' },
            ].map(({ key, label, icon, color }) => (
              <div key={key} className="space-y-1.5">
                <Label className="flex items-center gap-1">{icon} {label}</Label>
                <div className="relative">
                  <Input
                    type="number" min="0" max="100"
                    value={(currentAlloc as any)[key]}
                    onChange={e => setAlloc({ ...currentAlloc, [key]: Number(e.target.value) })}
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className={`text-sm ${total !== 100 ? 'text-red-400' : 'text-muted-foreground'}`}>
              Total: {total}% {total !== 100 && '(debe sumar 100%)'}
            </p>
            <Button size="sm" disabled={total !== 100} onClick={() => saveAllocation.mutate(currentAlloc)}>
              Guardar asignación
            </Button>
          </div>
          {/* Visual bar */}
          <div className="h-3 rounded-full overflow-hidden flex">
            <div className="bg-emerald-500 transition-all" style={{ width: `${currentAlloc.savings_pct}%` }} />
            <div className="bg-blue-500 transition-all" style={{ width: `${currentAlloc.investment_pct}%` }} />
            <div className="bg-amber-500 transition-all" style={{ width: `${currentAlloc.expenses_pct}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Goals list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {goals?.map(g => (
            <GoalCard key={g.id} goal={g} onDelete={id => deleteMutation.mutate(id)} onUpdate={(id, d) => updateMutation.mutate({ id, data: d })} />
          ))}
          {goals?.length === 0 && (
            <Card className="col-span-2"><CardContent className="py-12 text-center text-sm text-muted-foreground">
              No tienes objetivos activos. Crea uno para empezar a hacer seguimiento.
            </CardContent></Card>
          )}
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo objetivo</DialogTitle></DialogHeader>
          <GoalForm onSave={d => createMutation.mutate(d)} onCancel={() => setNewOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
