import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertTriangle, Loader2 } from 'lucide-react'

// Confirmación para acciones destructivas
export function ConfirmDialog({ open, title, children, confirmLabel = 'Borrar', pending, onConfirm, onCancel }: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel?: string
  pending?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={o => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-negative flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground mt-1 space-y-2">{children}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
