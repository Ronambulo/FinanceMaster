import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { catApi } from '@/lib/api'
import type { Category, CategoryRule } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'
import { RULE_FIELDS } from '@/components/RulesSection'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'

const emptyForm = { keyword: '', category_id: '', field: 'name' }

// Crear o editar una regla, con vista previa de los movimientos ya importados que coinciden
export function RuleDialog({ open, rule, categories, onClose }: {
  open: boolean
  rule: CategoryRule | null
  categories: Category[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState(emptyForm)
  const [applyExisting, setApplyExisting] = useState(true)

  useEffect(() => {
    if (!open) return
    setForm(rule
      ? { keyword: rule.keyword, category_id: String(rule.category_id), field: rule.field === 'description' ? 'name' : rule.field }
      : emptyForm)
    setApplyExisting(true)
  }, [open, rule])

  const keyword = form.keyword.trim()
  const valid = keyword.length >= 2 && !!form.category_id
  // Se debouncea una cadena (no un objeto) para que la referencia sea estable entre renders
  const debouncedKey = useDebouncedValue(JSON.stringify({ keyword, field: form.field, category_id: form.category_id }), 350)
  const debounced = JSON.parse(debouncedKey) as typeof form

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['rule-preview', debouncedKey],
    queryFn: () => catApi.previewRule({
      keyword: debounced.keyword,
      field: debounced.field,
      category_id: debounced.category_id ? Number(debounced.category_id) : undefined,
    }),
    enabled: open && debounced.keyword.length >= 2,
    placeholderData: prev => prev,
  })
  const showPreview = open && keyword.length >= 2 && !!preview

  const save = useMutation({
    mutationFn: async () => {
      const data = { keyword, category_id: Number(form.category_id), field: form.field }
      const saved = rule ? await catApi.updateRule(rule.id, data) : await catApi.createRule({ ...data, priority: 0 })
      const applied = applyExisting && preview && preview.applicable > 0 ? await catApi.applyRule(saved.id) : null
      return applied?.updated ?? 0
    },
    onSuccess: updated => {
      // Recategorizar cambia movimientos, estadísticas y presupuestos: se invalida todo
      if (updated > 0) qc.invalidateQueries()
      else qc.invalidateQueries({ queryKey: ['rules'] })
      const base = rule ? 'Regla actualizada' : 'Regla creada'
      toast(updated > 0 ? `${base}: ${updated} ${updated === 1 ? 'movimiento recategorizado' : 'movimientos recategorizados'}` : base, 'success')
      onClose()
    },
    onError: (e: any) => toast(e.message, 'error'),
  })

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{rule ? 'Editar regla' : 'Nueva regla de categorización'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rule-keyword">Palabra clave (contiene)</Label>
            <Input
              id="rule-keyword"
              placeholder={form.field === 'mcc' ? 'Ej: 5411' : 'Ej: netflix'}
              autoFocus
              value={form.keyword}
              onChange={e => setForm(f => ({ ...f, keyword: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">No distingue mayúsculas. Mínimo 2 caracteres.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 xs:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Busca en</Label>
              <Select value={form.field} onValueChange={v => setForm(f => ({ ...f, field: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULE_FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Categoría a asignar</Label>
              <Select value={form.category_id} onValueChange={v => setForm(f => ({ ...f, category_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.icon} {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Vista previa */}
          {showPreview && (
            <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                {previewLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {preview.matches === 0
                  ? 'Ningún movimiento importado coincide'
                  : `Coincide con ${preview.matches} ${preview.matches === 1 ? 'movimiento importado' : 'movimientos importados'}`}
              </p>
              {preview.samples.length > 0 && (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {preview.samples.map(s => <li key={s} className="truncate">{s}</li>)}
                </ul>
              )}
              {preview.applicable > 0 && (
                <label className="flex cursor-pointer items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    checked={applyExisting}
                    onChange={e => setApplyExisting(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
                  />
                  <span>
                    Aplicar también a {preview.applicable} {preview.applicable === 1 ? 'movimiento ya importado' : 'movimientos ya importados'}
                    <span className="block text-xs text-muted-foreground">
                      Los movimientos categorizados a mano o con IA no se tocan.
                    </span>
                  </span>
                </label>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {rule ? 'Guardar cambios' : 'Guardar regla'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
