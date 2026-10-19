import { cn } from '@/lib/utils'
import { GripVertical, EyeOff, Eye } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { WidgetId } from '@/hooks/useDashboardLayout'

export function SortableWidget({
  id, editing, visible, onToggle, children,
}: {
  id: WidgetId; editing: boolean; visible: boolean; onToggle: () => void; children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} className={cn(!visible && editing && 'opacity-40')}>
      {editing && (
        <div className="flex items-center justify-between px-1 mb-1">
          <button
            {...attributes}
            {...listeners}
            className="flex items-center gap-1.5 p-2 -m-2 text-xs text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <button
            onClick={onToggle}
            className="flex items-center gap-1 p-2 -m-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {visible ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      )}
      {(visible || editing) && children}
    </div>
  )
}
