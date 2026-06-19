import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { txApi, catApi } from '@/lib/api'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { THEMES, ACCENT_COLORS, THEME_KEY, ACCENT_KEY, applyTheme } from '@/lib/theme'
import { Check, Plus, Loader2, ArrowLeft, ArrowRight } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useFeaturesStore } from '@/store/features'
import { FEATURES } from '@/lib/features'
import type { FeatureId } from '@/lib/features'
import { useAuthStore } from '@/store/auth'

const DONE_KEY = 'fm_onboarding_done'

type StepId = 'welcome' | 'theme' | 'features' | 'categories' | 'import' | 'done'

interface Step { id: StepId; emoji: string; title: string }

const STEPS: Step[] = [
  { id: 'welcome',    emoji: '👋', title: 'Bienvenido a FinanceMaster' },
  { id: 'theme',      emoji: '🎨', title: 'Elige tu apariencia'        },
  { id: 'features',   emoji: '⚡', title: 'Activa lo que necesitas'    },
  { id: 'categories', emoji: '🏷️', title: 'Tus categorías'            },
  { id: 'import',     emoji: '📤', title: 'Importa tus datos'          },
  { id: 'done',       emoji: '🎯', title: '¡Todo listo!'               },
]

// ── Theme ─────────────────────────────────────────────────────────────────────
function ThemeStep() {
  const [activeTheme,  setActiveTheme]  = useState(() => localStorage.getItem(THEME_KEY)  || 'trade-republic')
  const [activeAccent, setActiveAccent] = useState(() => localStorage.getItem(ACCENT_KEY) || 'lime')

  function selectTheme(id: string) {
    setActiveTheme(id); localStorage.setItem(THEME_KEY, id); applyTheme(id, activeAccent)
  }
  function selectAccent(id: string) {
    setActiveAccent(id); localStorage.setItem(ACCENT_KEY, id); applyTheme(activeTheme, id)
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50 font-semibold mb-3">Tema</p>
        <div className="grid grid-cols-3 gap-2">
          {THEMES.map(t => (
            <button key={t.id} onClick={() => selectTheme(t.id)}
              className={cn('relative h-16 rounded-xl border-2 overflow-hidden transition-all',
                activeTheme === t.id ? 'border-primary scale-[1.03] shadow-md shadow-primary/20' : 'border-transparent opacity-50 hover:opacity-80')}
            >
              <div className={cn('absolute inset-0', t.preview)} />
              <span className="absolute bottom-1.5 inset-x-0 text-center text-[10px] font-semibold text-white/90 drop-shadow">{t.name}</span>
              {activeTheme === t.id && (
                <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground/50 font-semibold mb-3">Color de acento</p>
        <div className="flex flex-wrap gap-2.5">
          {ACCENT_COLORS.map(a => (
            <button key={a.id} onClick={() => selectAccent(a.id)} title={a.name}
              className={cn('h-7 w-7 rounded-full border-2 transition-all',
                activeAccent === a.id ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-50 hover:opacity-90 hover:scale-105')}
              style={{ background: `hsl(${a.h} ${a.s} ${a.l})` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Features ──────────────────────────────────────────────────────────────────
function FeaturesStep() {
  const { features, toggle } = useFeaturesStore()
  const list = Object.entries(FEATURES) as [FeatureId, typeof FEATURES[FeatureId]][]
  return (
    <div className="space-y-1.5">
      {list.map(([id, meta]) => (
        <button key={id} onClick={() => toggle(id, !features[id])}
          className={cn('w-full flex items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all border',
            features[id] ? 'border-primary/40 bg-primary/[0.06]' : 'border-transparent bg-white/[0.03] hover:bg-white/[0.06]')}
        >
          <div className={cn('flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors h-5 w-5',
            features[id] ? 'border-primary bg-primary' : 'border-muted-foreground/30')}>
            {features[id] && <Check className="h-3 w-3 text-primary-foreground" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight">{meta.label}</p>
            <p className="text-[11px] text-muted-foreground/60">{meta.desc}</p>
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Categories ────────────────────────────────────────────────────────────────
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
      toast(e.message || 'Error', 'error')
    } finally { setAdding(false) }
  }

  const systemCats = categories?.filter(c =>  c.is_system) ?? []
  const customCats  = categories?.filter(c => !c.is_system) ?? []

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Estas son las categorías del sistema. Añade las tuyas ahora o más tarde en Ajustes.</p>
      {isLoading
        ? <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        : (
          <div className="max-h-32 overflow-y-auto rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
            <div className="flex flex-wrap gap-1.5">
              {systemCats.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs border border-white/[0.07]" style={{ color: c.color }}>
                  {c.icon} {c.name}
                </span>
              ))}
            </div>
            {customCats.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {customCats.map(c => (
                  <span key={c.id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs bg-primary/10 border border-primary/20 text-primary">
                    {c.icon} {c.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      <div className="flex gap-2">
        <Input value={newIcon} onChange={e => setNewIcon(e.target.value)} className="w-12 text-center text-lg px-1 shrink-0" maxLength={2} />
        <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nueva categoría..."
          onKeyDown={e => e.key === 'Enter' && addCategory()} className="flex-1" />
        <Button size="sm" onClick={addCategory} disabled={!newName.trim() || adding}>
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  )
}

// ── Wizard ────────────────────────────────────────────────────────────────────
export function OnboardingWizard() {
  const [open,    setOpen]    = useState(false)
  const [stepIdx, setStepIdx] = useState(0)
  const token = useAuthStore(s => s.token)

  const { data: txData, isSuccess } = useQuery({
    queryKey: ['tx-onboarding', token],
    queryFn:  () => txApi.list({ page: 1, page_size: 1, account_category: 'CASH' }),
    enabled:  !!token,
    staleTime: 0,
  })

  useEffect(() => {
    if (!isSuccess) return
    if (!localStorage.getItem(DONE_KEY) && (txData?.total ?? 0) === 0) {
      setOpen(true)
    }
  }, [isSuccess, txData])

  function close() { localStorage.setItem(DONE_KEY, '1'); setOpen(false) }
  function next()  { stepIdx < STEPS.length - 1 ? setStepIdx(s => s + 1) : close() }
  function back()  { if (stepIdx > 0) setStepIdx(s => s - 1) }

  const current = STEPS[stepIdx]
  const isFirst = stepIdx === 0
  const isLast  = stepIdx === STEPS.length - 1
  const pct     = Math.round(((stepIdx + 1) / STEPS.length) * 100)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) close() }}>
      <DialogContent className="w-[95vw] max-w-[600px] h-[580px] p-0 gap-0 flex flex-col overflow-hidden">

        {/* Progress */}
        <div className="h-[3px] w-full bg-white/[0.06] shrink-0">
          <div className="h-full bg-primary transition-all duration-400 ease-out" style={{ width: `${pct}%` }} />
        </div>

        {/* Step pills */}
        <div className="flex items-center justify-center gap-1.5 pt-4 shrink-0">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => i < stepIdx && setStepIdx(i)}
              disabled={i >= stepIdx}
              className={cn(
                'rounded-full transition-all duration-300',
                i === stepIdx  ? 'w-6 h-1.5 bg-primary' :
                i < stepIdx    ? 'w-1.5 h-1.5 bg-primary/40 hover:bg-primary/60 cursor-pointer' :
                                  'w-1.5 h-1.5 bg-white/[0.1] cursor-default',
              )}
            />
          ))}
        </div>

        {/* Header */}
        <div className="px-5 sm:px-8 pt-6 pb-2 text-center shrink-0">
          <div className="text-4xl mb-3">{current.emoji}</div>
          <h2 className="text-[17px] font-semibold tracking-tight">{current.title}</h2>
        </div>

        {/* Content — scrollable, fills space */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-2 min-h-0">
          {current.id === 'welcome' && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground text-center leading-relaxed">
                Tu centro de control financiero personal. Vamos a configurar todo en unos pasos — podrás cambiar cualquier cosa después desde Ajustes.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { emoji: '📊', label: 'Dashboard', desc: 'Resumen de tus finanzas' },
                  { emoji: '🔒', label: 'Privado',   desc: 'Todo en tu servidor'      },
                  { emoji: '🔗', label: 'Sync TR',   desc: 'Trade Republic en directo' },
                ].map(item => (
                  <div key={item.label} className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 text-center space-y-1">
                    <div className="text-2xl">{item.emoji}</div>
                    <p className="text-xs font-semibold">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground/50 leading-tight">{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {current.id === 'theme'      && <ThemeStep />}
          {current.id === 'features'   && <FeaturesStep />}
          {current.id === 'categories' && <CategoriesStep />}
          {current.id === 'import' && (
            <div className="space-y-2 py-2">
              {[
                { emoji: '📊', title: 'Importar CSV',             desc: 'Transacciones → Importar CSV' },
                { emoji: '🔗', title: 'Conectar Trade Republic',  desc: 'Ajustes → Integraciones'      },
                { emoji: '✏️', title: 'Añadir manualmente',       desc: 'Transacciones → Nueva'         },
              ].map(item => (
                <div key={item.title} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <span className="text-xl shrink-0">{item.emoji}</span>
                  <div>
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-[11px] text-muted-foreground/50">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {current.id === 'done' && (
            <div className="py-2 space-y-3">
              <div className="rounded-xl bg-primary/[0.06] border border-primary/20 px-5 py-5 text-center">
                <p className="text-sm font-semibold text-primary mb-1">¡Ya puedes empezar!</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Importa tus primeros datos y el dashboard cobrará vida. Puedes cambiar cualquier opción desde Ajustes en cualquier momento.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-5 sm:px-8 py-4 shrink-0 border-t border-white/[0.05]">
          <Button variant="ghost" size="sm" onClick={back} className={cn('gap-1', isFirst && 'invisible')}>
            <ArrowLeft className="h-3.5 w-3.5" /> Atrás
          </Button>
          <div className="flex-1" />
          {!isLast && (
            <Button variant="ghost" size="sm" onClick={close} className="text-muted-foreground/50 hover:text-muted-foreground text-xs">
              Saltar
            </Button>
          )}
          <Button size="sm" onClick={next} className="gap-1.5 px-5">
            {isLast ? '¡Empezar!' : <>Siguiente <ArrowRight className="h-3.5 w-3.5" /></>}
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  )
}
