import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { debtApi } from '@/lib/api'
import type { Debt } from '@/lib/api'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Plus, Trash2, CreditCard, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

function DebtForm({ onSave, onCancel }: { onSave: (d: Partial<Debt>) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: '', total_amount: '', direction: 'I_OWE' as const, due_date: '', description: '' })
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Nombre</Label>
        <Input placeholder="Ej: Préstamo coche" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Importe total (€)</Label>
          <Input type="number" step="0.01" value={form.total_amount} onChange={e => setForm(f => ({ ...f, total_amount: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Dirección</Label>
          <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v as any }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="I_OWE">Yo debo</SelectItem>
              <SelectItem value="OWED_TO_ME">Me deben</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Fecha límite (opcional)</Label>
        <Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={() => form.name && form.total_amount && onSave({ ...form, total_amount: Number(form.total_amount), due_date: form.due_date || undefined })}>
          Guardar
        </Button>
      </DialogFooter>
    </div>
  )
}

function DebtCard({ debt, onAddPayment, onDelete }: { debt: Debt; onAddPayment: (d: Debt) => void; onDelete: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false)
  const pct = debt.total_amount > 0 ? Math.min(100, (debt.paid_amount / debt.total_amount) * 100) : 0

  return (
    <Card className={debt.is_settled ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold">{debt.name}</p>
              {debt.is_settled && <Badge variant="success">Saldado</Badge>}
              {debt.due_date && !debt.is_settled && (
                <Badge variant={new Date(debt.due_date) < new Date() ? 'destructive' : 'muted'} className="text-xs">
                  {formatDate(debt.due_date)}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm mb-2">
              <span className="text-muted-foreground">Total: <span className="text-foreground font-medium">{formatCurrency(debt.total_amount)}</span></span>
              <span className="text-muted-foreground">Pagado: <span className="text-emerald-400 font-medium">{formatCurrency(debt.paid_amount)}</span></span>
              <span className="text-muted-foreground">Pendiente: <span className="text-red-400 font-medium">{formatCurrency(debt.remaining_amount)}</span></span>
            </div>
            <Progress value={pct} className="h-1.5" indicatorClassName="bg-emerald-500" />
          </div>
          <div className="flex gap-1 shrink-0">
            {!debt.is_settled && (
              <Button variant="outline" size="sm" onClick={() => onAddPayment(debt)}>+ Pago</Button>
            )}
            <Button variant="ghost" size="icon" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(debt.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>
        {expanded && debt.payments.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            {debt.payments.map(p => (
              <div key={p.id} className="flex justify-between text-xs text-muted-foreground">
                <span>{formatDate(p.payment_date)}{p.note ? ` — ${p.note}` : ''}</span>
                <span className="text-emerald-400 font-medium">+{formatCurrency(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function Debts() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [newDebtOpen, setNewDebtOpen] = useState(false)
  const [paymentDebt, setPaymentDebt] = useState<Debt | null>(null)
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: new Date().toISOString().slice(0, 10), note: '' })

  const { data: debts, isLoading } = useQuery({ queryKey: ['debts'], queryFn: debtApi.list })

  const createMutation = useMutation({
    mutationFn: debtApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debts'] }); setNewDebtOpen(false); toast('Deuda creada', 'success') },
  })
  const deleteMutation = useMutation({
    mutationFn: debtApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debts'] }); toast('Deuda eliminada', 'success') },
  })
  const addPaymentMutation = useMutation({
    mutationFn: ({ id, data }: any) => debtApi.addPayment(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['debts'] }); setPaymentDebt(null); toast('Pago registrado', 'success') },
  })

  const iOwe = debts?.filter(d => d.direction === 'I_OWE') || []
  const owedToMe = debts?.filter(d => d.direction === 'OWED_TO_ME') || []
  const totalIOwe = iOwe.filter(d => !d.is_settled).reduce((s, d) => s + d.remaining_amount, 0)
  const totalOwedToMe = owedToMe.filter(d => !d.is_settled).reduce((s, d) => s + d.remaining_amount, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Deudas</h1>
          <p className="text-sm text-muted-foreground">Control de lo que debes y te deben</p>
        </div>
        <Button onClick={() => setNewDebtOpen(true)}><Plus className="h-4 w-4 mr-2" /> Nueva deuda</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Yo debo (pendiente)</p>
          <p className="text-2xl font-bold text-red-400">-{formatCurrency(totalIOwe)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">Me deben (pendiente)</p>
          <p className="text-2xl font-bold text-emerald-400">+{formatCurrency(totalOwedToMe)}</p>
        </CardContent></Card>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <Tabs defaultValue="i_owe">
          <TabsList>
            <TabsTrigger value="i_owe">Yo debo ({iOwe.length})</TabsTrigger>
            <TabsTrigger value="owed_to_me">Me deben ({owedToMe.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="i_owe" className="space-y-3 mt-4">
            {iOwe.map(d => <DebtCard key={d.id} debt={d} onAddPayment={setPaymentDebt} onDelete={id => deleteMutation.mutate(id)} />)}
            {iOwe.length === 0 && <p className="text-center py-8 text-muted-foreground text-sm">Sin deudas pendientes</p>}
          </TabsContent>
          <TabsContent value="owed_to_me" className="space-y-3 mt-4">
            {owedToMe.map(d => <DebtCard key={d.id} debt={d} onAddPayment={setPaymentDebt} onDelete={id => deleteMutation.mutate(id)} />)}
            {owedToMe.length === 0 && <p className="text-center py-8 text-muted-foreground text-sm">Nadie te debe dinero</p>}
          </TabsContent>
        </Tabs>
      )}

      {/* New debt dialog */}
      <Dialog open={newDebtOpen} onOpenChange={setNewDebtOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva deuda</DialogTitle></DialogHeader>
          <DebtForm onSave={d => createMutation.mutate(d)} onCancel={() => setNewDebtOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* Add payment dialog */}
      <Dialog open={!!paymentDebt} onOpenChange={() => setPaymentDebt(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar pago — {paymentDebt?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Importe (€)</Label>
              <Input type="number" step="0.01" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm(f => ({ ...f, payment_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Nota (opcional)</Label>
              <Input value={paymentForm.note} onChange={e => setPaymentForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPaymentDebt(null)}>Cancelar</Button>
              <Button onClick={() => paymentDebt && addPaymentMutation.mutate({ id: paymentDebt.id, data: { ...paymentForm, amount: Number(paymentForm.amount) } })}>
                Guardar pago
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
