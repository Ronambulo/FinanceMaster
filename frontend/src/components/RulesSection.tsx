import { useState } from 'react'
import type { CategoryRule } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowRight, Trash2, ChevronRight, Search } from 'lucide-react'

// 'name' y 'description' buscan los dos en "nombre + descripción" del movimiento;
// 'description' se mantiene solo por compatibilidad con reglas antiguas.
export const RULE_FIELDS = [
  { value: 'name', label: 'Nombre o descripción' },
  { value: 'mcc', label: 'Código MCC' },
]

export function ruleFieldLabel(field: string) {
  if (field === 'description') return RULE_FIELDS[0].label
  return RULE_FIELDS.find(f => f.value === field)?.label || field
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function RulesSection({ rules, onEdit, onDelete, onCreate }: {
  rules: CategoryRule[]
  onEdit: (r: CategoryRule) => void
  onDelete: (r: CategoryRule) => void
  onCreate: () => void
}) {
  const [query, setQuery] = useState('')

  if (rules.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <p className="text-sm font-medium">Sin reglas de categorización</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Una regla asigna una categoría a los movimientos que contienen una palabra, por ejemplo "netflix" a Suscripciones.
        </p>
        <Button size="sm" onClick={onCreate}>Crear regla</Button>
      </Card>
    )
  }

  const q = normalize(query.trim())
  const visible = q
    ? rules.filter(r => normalize(`${r.keyword} ${r.category.name}`).includes(q))
    : rules

  return (
    <div className="space-y-4">
      {rules.length > 6 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar regla o categoría"
            aria-label="Buscar reglas"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
      )}

      {visible.length > 0 ? (
        <Card className="divide-y divide-border overflow-hidden">
          {visible.map(r => (
            <div key={r.id} className="flex items-center gap-1 pr-2">
              <button
                type="button"
                onClick={() => onEdit(r)}
                className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left transition-colors hover:bg-secondary/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <code className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs">"{r.keyword}"</code>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{r.category.icon} {r.category.name}</span>
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">Busca en: {ruleFieldLabel(r.field)}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              <Button variant="ghost" size="icon" aria-label="Eliminar regla" className="h-11 w-11 shrink-0" onClick={() => onDelete(r)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </Card>
      ) : (
        <p className="text-center py-10 text-sm text-muted-foreground">Sin resultados para "{query.trim()}"</p>
      )}
    </div>
  )
}
