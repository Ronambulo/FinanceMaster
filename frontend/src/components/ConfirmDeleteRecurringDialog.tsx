import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Loader2 } from 'lucide-react'

export function ConfirmDeleteRecurringDialog({
  groupId, onClose, onConfirm, isPending,
}: {
  groupId: number | null
  onClose: () => void
  onConfirm: (id: number) => void
  isPending: boolean
}) {
  return (
    <Dialog open={groupId !== null} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-[320px]">
        <DialogHeader>
          <DialogTitle className="text-negative flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            Eliminar grupo recurrente
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mt-1">
          Se eliminará el grupo recurrente y dejará de detectarse automáticamente. Esta acción no se puede deshacer.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => groupId !== null && onConfirm(groupId)}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Borrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
