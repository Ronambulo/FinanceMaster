import { useState } from 'react'
import type { Category } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, ChevronRight } from 'lucide-react'
import { categoryTint, categoryTypeLabel } from '@/components/CategoryForm'
import { cn } from '@/lib/utils'

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'expense', label: 'Gastos' },
  { id: 'income', label: 'Ingresos' },
] as const

type Filter = typeof FILTERS[number]['id']

function CategoryIconTile({ category, className }: { category: Category; className?: string }) {
  return (
    <span
      className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-lg', className)}
      style={{ backgroundColor: categoryTint(category.color) }}
    >
      {category.icon}
    </span>
  )
}

export function CategoriesSection({ categories, onEdit, onDelete }: {
  categories: Category[]
  onEdit: (c: Category) => void
  onDelete: (c: Category) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const visible = filter === 'all' ? categories : categories.filter(c => c.type === filter)

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Filtrar por tipo" className="inline-flex rounded-lg border border-border bg-secondary/50 p-1">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'h-9 rounded-md px-4 text-sm font-medium transition-colors',
              filter === f.id ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length > 0 ? (
        <Card className="divide-y divide-border overflow-hidden">
          {visible.map(c => (
            <div key={c.id} className="flex items-center gap-1 pr-2">
              <button
                type="button"
                onClick={() => onEdit(c)}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/60"
              >
                <CategoryIconTile category={c} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.name}</span>
                  <Badge variant="muted" className="mt-1 text-[11px]">{categoryTypeLabel(c.type)}</Badge>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground lg:hidden" />
              </button>
              <Button variant="ghost" size="icon" aria-label="Editar categoría" className="hidden h-11 w-11 lg:inline-flex" onClick={() => onEdit(c)}>
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Eliminar categoría" className="h-11 w-11" onClick={() => onDelete(c)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </Card>
      ) : (
        <p className="text-center py-10 text-sm text-muted-foreground">
          {categories.length === 0 ? 'No tienes categorías personalizadas' : 'No hay categorías de este tipo'}
        </p>
      )}
    </div>
  )
}
