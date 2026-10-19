import { useState } from 'react'
import type { Category } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b',
]

const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c)

export function CategoryForm({ initial, isSystem, pending, onSave, onCancel }: {
  initial?: Partial<Category>
  isSystem?: boolean
  pending?: boolean
  onSave: (d: Partial<Category>) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    icon: initial?.icon || '💰',
    color: initial?.color || '#6366f1',
    type: initial?.type || 'expense'
  })
  const name = form.name.trim()
  const valid = name.length > 0 && form.icon.trim().length > 0 && isHex(form.color)

  return (
    <div className="space-y-4">
      {/* Vista previa en vivo */}
      <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/40 p-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-xl"
          style={{ backgroundColor: categoryTint(form.color) }}
        >
          {form.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{name || 'Nombre de la categoría'}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isHex(form.color) ? form.color : undefined }} />
            {categoryTypeLabel(form.type)}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="cat-name">Nombre {isSystem && <span className="text-muted-foreground font-normal">(Sistema)</span>}</Label>
          <Input
            id="cat-name"
            value={form.name}
            autoFocus={!isSystem && !initial}
            maxLength={50}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            disabled={isSystem}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cat-icon">Emoji</Label>
          <Input id="cat-icon" value={form.icon} maxLength={8} className="text-center text-lg" onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} />
        </div>
      </div>
      {isSystem && (
        <p className="-mt-2 text-xs text-muted-foreground">
          El nombre y el tipo de las categorías del sistema no se pueden cambiar porque se usan en la categorización automática.
        </p>
      )}

      <div className="space-y-1.5">
        <Label>Tipo</Label>
        <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))} disabled={isSystem}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Color</Label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map(c => {
            const selected = form.color.toLowerCase() === c
            return (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                aria-pressed={selected}
                onClick={() => setForm(f => ({ ...f, color: c }))}
                className={cn(
                  'h-8 w-8 rounded-full transition-transform hover:scale-110',
                  selected && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                )}
                style={{ backgroundColor: c }}
              />
            )
          })}
        </div>
        <div className="flex gap-2">
          <input
            type="color"
            aria-label="Color personalizado"
            value={isHex(form.color) ? form.color : '#000000'}
            onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
            className="h-9 w-12 rounded border border-input cursor-pointer bg-transparent"
          />
          <Input
            value={form.color}
            aria-invalid={!isHex(form.color)}
            className={cn('font-mono', !isHex(form.color) && 'border-destructive')}
            onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button disabled={!valid || pending} onClick={() => onSave({ ...form, name })}>
          {pending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          Guardar
        </Button>
      </DialogFooter>
    </div>
  )
}
