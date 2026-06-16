import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { txApi, catApi } from '@/lib/api'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { THEMES, ACCENT_COLORS, THEME_KEY, ACCENT_KEY, applyTheme } from '@/lib/theme'
import { Check, Plus, Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/toast'

const DONE_KEY = 'fm_onboarding_done'

type StepId = 'welcome' | 'theme' | 'categories' | 'import' | 'done'

interface Step {
  id: StepId
  emoji: string
  title: string
}

const STEPS: Step[] = [
  { id: 'welcome',    emoji: '👋', title: '¡Bienvenido a FinanceMaster!' },
  { id: 'theme',      emoji: '🎨', title: 'Elige tu apariencia' },
  { id: 'categories', emoji: '🏷️', title: 'Tus categorías' },
  { id: 'import',     emoji: '📤', title: 'Importa tus movimientos' },
  { id: 'done',       emoji: '🎯', title: '¡Todo listo!' },
]

// ── Theme step ────────────────────────────────────────────────────────────────
function ThemeStep() {
  const [activeTheme, setActiveTheme]   = useState(() => localStorage.getItem(THEME_KEY) || 'trade-republic')
  const [activeAccent, setActiveAccent] = useState(() => localStorage.getItem(ACCENT_KEY) || 'lime')

  function selectTheme(id: string) {
    setActiveTheme(id)
    localStorage.setItem(THEME_KEY, id)
    applyTheme(id, activeAccent)
  }

  function selectAccent(id: string) {
    setActiveAccent(id)
    localStorage.setItem(ACCENT_KEY, id)
    applyTheme(activeTheme, id)
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Tema de fondo</p>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map(t => (
            <button
              key={t.id}
              onClick={() => selectTheme(t.id)}
              className={cn(
                'relative h-14 rounded-xl border-2 transition-all overflow-hidden',
                activeTheme === t.id ? 'border-primary shadow-lg shadow-primary/20' : 'border-transparent opacity-70 hover:opacity-100',
              )}
            >
              <div className={cn('absolute inset-0', t.preview)} />
              <span className="absolute inset-0 flex items-end justify-center pb-1.5 text-[10px] font-medium text-white/80 drop-shadow">
                {t.name}
              </span>
              {activeTheme === t.id && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">Color de acento</p>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map(a => (
            <button
              key={a.id}
              onClick={() => selectAccent(a.id)}
              title={a.name}
              className={cn(
                'h-7 w-7 rounded-full border-2 transition-all',
                activeAccent === a.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-70 hover:opacity-100 hover:scale-105',
              )}
              style={{ background: `hsl(${a.h} ${a.s} ${a.l})` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Categories step ───────────────────────────────────────────────────────────
function CategoriesStep() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { data: categories, isLoading } = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState('📦')
  const [adding, setAdding] = useState(false)

  async function addCategory() {
    if (!newName.trim()) return
    setAdding(true)
    try {
      await catApi.create({ name: newName.trim(), icon: newIcon, color: '#888888', type: 'expense' })
      qc.invalidateQueries({ queryKey: ['categories'] })
      setNewName('')
      toast(`Categoría "${newName.trim()}" creada`, 'success')
    } catch (e: any) {
      toast(e.message || 'Error al crear categoría', 'error')
    } finally {
      setAdding(false)
    }
  }

  const systemCats = categories?.filter(c => c.is_system) ?? []
  const customCats = categories?.filter(c => !c.is_system) ?? []

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground leading-relaxed">
        Estas son las categorías del sistema. Puedes añadir las tuyas propias ahora o en Ajustes más adelante.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-muted/30 p-3">
          <div className="flex flex-wrap gap-1.5">
            {systemCats.map(c => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-white/[0.04] border border-white/[0.07]"
                style={{ color: c.color }}
              >
                {c.icon} {c.name}
              </span>
            ))}
          </div>
          {customCats.length > 0 && (
            <>
              <p className="text-[11px] text-muted-foreground mt-2 mb-1.5">Tus categorías</p>
              <div className="flex flex-wrap gap-1.5">
                {customCats.map(c => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-primary/10 border border-primary/20 text-primary"
                  >
                    {c.icon} {c.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Añadir categoría personalizada</p>
        <div className="flex gap-2">
          <Input
            value={newIcon}
            onChange={e => setNewIcon(e.target.value)}
            placeholder="🏷️"
            className="w-14 text-center text-lg px-1"
            maxLength={2}
          />
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nombre de la categoría..."
            onKeyDown={e => e.key === 'Enter' && addCategory()}
            className="flex-1"
          />
          <Button size="sm" onClick={addCategory} disabled={!newName.trim() || adding}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function OnboardingWizard() {
  const [open, setOpen] = useState(false)
  const [stepIdx, setStepIdx] = useState(0)

  const { data: txData, isSuccess } = useQuery({
    queryKey: ['tx-onboarding'],
    queryFn: () => txApi.list({ page: 1, page_size: 1, account_category: 'CASH' }),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!isSuccess) return
    const done = localStorage.getItem(DONE_KEY)
    if (!done && (txData?.total ?? 0) === 0) {
      setOpen(true)
    }
  }, [isSuccess, txData])

  function close() {
    localStorage.setItem(DONE_KEY, '1')
    setOpen(false)
  }

  function next() {
    if (stepIdx < STEPS.length - 1) setStepIdx(s => s + 1)
    else close()
  }

  const current = STEPS[stepIdx]

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) close() }}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 w-full bg-white/[0.06]">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-7 space-y-5">
          {/* Step dots */}
          <div className="flex gap-1.5 justify-center">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === stepIdx ? 'w-6 bg-primary' : i < stepIdx ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-white/[0.1]',
                )}
              />
            ))}
          </div>

          {/* Header */}
          <div className="text-center space-y-1">
            <div className="text-4xl mb-2">{current.emoji}</div>
            <h2 className="text-lg font-semibold tracking-tight">{current.title}</h2>
          </div>

          {/* Step content */}
          {current.id === 'welcome' && (
            <p className="text-sm text-muted-foreground leading-relaxed text-center">
              Tu centro de control financiero personal. En unos minutos tendrás tus finanzas bajo control.
              Empecemos eligiendo cómo quieres que se vea la app.
            </p>
          )}

          {current.id === 'theme' && <ThemeStep />}

          {current.id === 'categories' && <CategoriesStep />}

          {current.id === 'import' && (
            <p className="text-sm text-muted-foreground leading-relaxed text-center">
              Descarga el CSV de Trade Republic (o cualquier banco compatible) y súbelo desde
              <strong className="text-foreground"> Transacciones → Importar CSV</strong>.
              Tus datos nunca salen de tu servidor.
            </p>
          )}

          {current.id === 'done' && (
            <p className="text-sm text-muted-foreground leading-relaxed text-center">
              Todo listo. Ve a Transacciones e importa tu primer CSV — el dashboard cobrará vida
              en cuanto tengas datos. Si conectas Trade Republic en Ajustes, la sincronización
              es automática. ¡Empieza hoy!
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="sm" onClick={close} className="text-muted-foreground">
              Saltar
            </Button>
            <Button onClick={next}>
              {stepIdx < STEPS.length - 1 ? 'Siguiente →' : '¡Empezar!'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
