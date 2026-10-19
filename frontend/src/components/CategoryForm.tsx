import { useState } from 'react'
import type { Category } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const CATEGORY_TYPES = [
  { value: 'expense', label: 'Gasto' },
  { value: 'income', label: 'Ingreso' },
  { value: 'investment', label: 'Inversión' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'internal', label: 'Interna' },
]

export function categoryTypeLabel(type: string) {
  return CATEGORY_TYPES.find(t => t.value === type)?.label || type
}

// Fondo suave con el color de la categoría (solo para hex #rrggbb)
export function categoryTint(color: string): string | undefined {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}26` : undefined
}

export function CategoryForm({ initial, isSystem, onSave, onCancel }: { initial?: Partial<Category>; isSystem?: boolean; onSave: (d: Partial<Category>) => void; onCancel: () => void }) {
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
      <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
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
