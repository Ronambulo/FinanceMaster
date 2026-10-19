import type { CategoryRule } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, Trash2 } from 'lucide-react'

export const RULE_FIELDS = [
  { value: 'name', label: 'Nombre del comercio' },
  { value: 'description', label: 'Descripción' },
  { value: 'mcc', label: 'Código MCC' },
]

export function RulesSection({ rules, onDelete }: { rules: CategoryRule[]; onDelete: (id: number) => void }) {
  if (rules.length === 0) {
    return <p className="text-center py-10 text-sm text-muted-foreground">Sin reglas de categorización</p>
  }

  return (
    <Card className="divide-y divide-border overflow-hidden">
      {rules.map(r => (
        <div key={r.id} className="flex items-center gap-3 py-2.5 pl-4 pr-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <code className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs">"{r.keyword}"</code>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="font-medium">{r.category.icon} {r.category.name}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Busca en: {RULE_FIELDS.find(f => f.value === r.field)?.label || r.field}
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Eliminar regla" className="h-11 w-11 shrink-0" onClick={() => onDelete(r.id)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
    </Card>
  )
}
