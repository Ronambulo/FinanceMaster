import type { Category } from '@/lib/api'
import { categoryTint } from '@/components/CategoryForm'

const GROUPS = [
  { label: 'Gastos', match: (t: string) => t === 'expense' },
  { label: 'Ingresos', match: (t: string) => t === 'income' },
  { label: 'Movimientos y otros', match: (t: string) => t !== 'expense' && t !== 'income' },
]

export function SystemCategoriesSection({ categories, onEdit }: { categories: Category[]; onEdit: (c: Category) => void }) {
  return (
    <div className="space-y-6">
      {GROUPS.map(g => {
        const items = categories.filter(c => g.match(c.type))
        if (items.length === 0) return null
        return (
          <section key={g.label} className="space-y-2.5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {g.label} <span className="tabular-nums">· {items.length}</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {items.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onEdit(c)}
                  title="Editar categoría"
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-card pl-1.5 pr-3.5 text-sm transition-colors hover:border-primary/50 hover:bg-secondary/60"
                >
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-sm"
                    style={{ backgroundColor: categoryTint(c.color) }}
                  >
                    {c.icon}
                  </span>
                  {c.name}
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
