import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { Loader2, Lock } from 'lucide-react'
import { DeleteAccountDialog } from '@/components/DeleteAccountDialog'

export function SecuritySection() {
  const { toast } = useToast()
  const [pwForm, setPwForm] = useState({ current: '', next: '', confirm: '' })
  const [deleteOpen, setDeleteOpen] = useState(false)

  const changePasswordMutation = useMutation({
    mutationFn: () => authApi.changePassword({ current_password: pwForm.current, new_password: pwForm.next }),
    onSuccess: () => {
      toast('Contraseña cambiada correctamente', 'success')
      setPwForm({ current: '', next: '', confirm: '' })
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  const mismatch = !!pwForm.confirm && pwForm.next !== pwForm.confirm
  const tooShort = !!pwForm.next && pwForm.next.length < 6
  const pwValid = pwForm.current && pwForm.next && pwForm.next === pwForm.confirm && pwForm.next.length >= 6

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium flex items-center gap-2"><Lock className="h-4 w-4" /> Cambiar contraseña</CardTitle></CardHeader>
        <CardContent>
          <form
            className="space-y-4 max-w-md"
            onSubmit={e => { e.preventDefault(); if (pwValid) changePasswordMutation.mutate() }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="pw-current">Contraseña actual</Label>
              <Input
                id="pw-current"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={pwForm.current}
                onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-next">Nueva contraseña</Label>
              <Input
                id="pw-next"
                type="password"
                autoComplete="new-password"
                value={pwForm.next}
                onChange={e => setPwForm(f => ({ ...f, next: e.target.value }))}
              />
              <p className={tooShort ? 'text-xs text-negative' : 'text-xs text-muted-foreground'}>Mínimo 6 caracteres</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-confirm">Confirmar nueva contraseña</Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Repite la nueva contraseña"
                value={pwForm.confirm}
                onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                className={mismatch ? 'border-destructive' : ''}
              />
              {mismatch && <p className="text-xs text-negative">Las contraseñas no coinciden</p>}
            </div>
            <Button type="submit" disabled={!pwValid || changePasswordMutation.isPending}>
              {changePasswordMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Cambiar contraseña
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-destructive">Zona de peligro</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-lg">
              Eliminar tu cuenta borrará permanentemente todos tus datos: transacciones, categorías, objetivos, portfolio y conexiones. Esta acción no se puede deshacer.
            </p>
          </div>
          <Button variant="destructive" size="sm" className="shrink-0" onClick={() => setDeleteOpen(true)}>
            Eliminar cuenta
          </Button>
        </div>
      </div>

      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </div>
  )
}
