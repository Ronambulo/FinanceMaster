import { useState } from 'react'
import { authApi } from '@/lib/api'
import { queryClient } from '@/lib/queryClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth'

export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const { toast } = useToast()
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)

  const close = () => { onClose(); setDeleteConfirm('') }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) close() }}>
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
            <Button variant="outline" onClick={close}>
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
  )
}
