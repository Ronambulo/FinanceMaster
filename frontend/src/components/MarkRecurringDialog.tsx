import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { recurringApi } from '@/lib/api'
import type { MonthlyDetailRow } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'

export function MarkRecurringDialog({ tx, onClose }: { tx: MonthlyDetailRow; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [name, setName] = useState(tx.name ?? '')
  const [period, setPeriod] = useState('30')

  const mutation = useMutation({
    mutationFn: () => recurringApi.createFromTx({
      transaction_id: tx.id,
      display_name: name,
      period_days: Number(period),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring'] })
      qc.invalidateQueries({ queryKey: ['monthly-detail'] })
      toast('Marcado como recurrente', 'success')
      onClose()
    },
    onError: (e: any) => toast(e.message ?? 'Error', 'error'),
  })

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Marcar como recurrente</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre del gasto recurrente" />
          </div>
          <div className="space-y-1.5">
            <Label>Periodicidad</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Semanal</SelectItem>
                <SelectItem value="14">Quincenal</SelectItem>
                <SelectItem value="30">Mensual</SelectItem>
                <SelectItem value="90">Trimestral</SelectItem>
                <SelectItem value="365">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Importe: {formatCurrency(Math.abs(tx.amount))}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
