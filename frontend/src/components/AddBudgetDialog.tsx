import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { budgetApi } from '@/lib/api'
import type { Category } from '@/lib/api'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'

export function AddBudgetDialog({
  open, onClose, categories, currentMonth,
}: {
  open: boolean; onClose: () => void; categories: Category[]; currentMonth: string
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState({ category_id: '', amount: '', is_recurring: true })

  const mutation = useMutation({
    mutationFn: () => budgetApi.create({
      category_id: form.category_id ? Number(form.category_id) : undefined,
      amount: Number(form.amount),
      is_recurring: form.is_recurring,
      month: form.is_recurring ? undefined : currentMonth,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] })
      qc.invalidateQueries({ queryKey: ['budget-status'] })
      toast('Presupuesto creado', 'success')
      onClose()
      setForm({ category_id: '', amount: '', is_recurring: true })
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nuevo presupuesto</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Sin categoría" /></SelectTrigger>
              <SelectContent>
                {categories.filter(c => c.type === 'expense').map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.icon} {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Importe mensual (€)</Label>
            <Input type="number" step="0.01" placeholder="200.00"
              value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3">
            <input type="checkbox" id="recurring" checked={form.is_recurring}
              onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))}
              className="rounded border-border" />
            <Label htmlFor="recurring" className="cursor-pointer">Recurrente (todos los meses)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!form.amount || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
