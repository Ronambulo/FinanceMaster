// Hoja para elegir categoría (cuadrícula de 4), sin aplicar nada: devuelve la elegida.
import { Link } from 'react-router-dom'
import type { Category } from '@/lib/api'
import { CatGlyph, Icon, catTone, toneColors } from './Icon'
import { C, FONT, Sheet } from './kit'

export function CatPickSheet({ open, title = 'Categoría', categories, current, onPick, onClose }: {
  open: boolean; title?: string; categories: Category[]; current?: number | null; onPick: (c: Category) => void; onClose: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px 6px' }}>
        {categories.map(c => {
          const t = catTone(c.name, c.type)
          const col = toneColors(t)
          const on = c.id === current
          return (
            <button key={c.id} type="button" aria-pressed={on} onClick={() => { onPick(c); onClose() }} style={{ border: 0, background: 'transparent', color: C.text, padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, font: `${on ? 800 : 700} 12px ${FONT}`, cursor: 'pointer', minWidth: 0 }}>
              <span aria-hidden="true" style={{ width: 48, height: 48, borderRadius: 24, background: col.bg, color: col.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none', boxShadow: on ? '0 0 0 2px var(--c-1f2029), 0 0 0 4px var(--c-5b52f0)' : undefined }}><CatGlyph name={c.name} tone={t} size={23} /></span>
              <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            </button>
          )
        })}
        <Link to="/ajustes/categorias" onClick={onClose} style={{ color: C.accentText, padding: '6px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, font: `800 12px ${FONT}` }}>
          <span style={{ width: 48, height: 48, borderRadius: '50%', boxShadow: 'inset 0 0 0 2px var(--track)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={20} /></span>
          Nueva
        </Link>
      </div>
    </Sheet>
  )
}
