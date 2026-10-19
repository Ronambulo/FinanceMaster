import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { catApi, trApi } from '@/lib/api'
import type { Category, CategoryRule } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'
import {
  Plus, Lock, Palette, Plug, LayoutGrid, Sparkles,
  Tags, ListFilter, Layers, Wrench, ChevronLeft, ChevronRight, Search,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth'
import { useFeaturesStore } from '@/store/features'
import { THEMES, ACCENT_COLORS, getTheme } from '@/lib/theme'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import { CategoryForm } from '@/components/CategoryForm'
import { CategoriesSection, movementsLabel } from '@/components/CategoriesSection'
import { RulesSection } from '@/components/RulesSection'
import { RuleDialog } from '@/components/RuleDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SystemCategoriesSection } from '@/components/SystemCategoriesSection'
import { AppearanceSection, getAccentId } from '@/components/AppearanceSection'
import { FeaturesSection } from '@/components/FeaturesSection'
import { SecuritySection } from '@/components/SecuritySection'
import { AiUsageSection } from '@/components/AiUsageSection'
import { IntegrationsSection } from '@/components/IntegrationsSection'
import { DiagnosticsSection } from '@/components/DiagnosticsSection'

type SectionId =
  | 'categories' | 'rules' | 'system'
  | 'appearance' | 'features'
  | 'security' | 'ai-usage'
  | 'integrations' | 'diagnostics'

interface SectionMeta {
  id: SectionId
  label: string
  desc: string
  icon: ComponentType<{ className?: string }>
  keywords: string
}

const GROUPS: { label: string; sections: SectionMeta[] }[] = [
  {
    label: 'Datos',
    sections: [
      { id: 'categories', label: 'Categorías', icon: Tags, keywords: 'categoria emoji color gasto ingreso personalizada',
        desc: 'Tus categorías personalizadas para clasificar movimientos.' },
      { id: 'rules', label: 'Reglas', icon: ListFilter, keywords: 'regla palabra clave importacion automatica categorizacion',
        desc: 'Si un movimiento contiene la palabra clave, se le asigna la categoría. Se aplican al importar y, si quieres, a lo ya importado.' },
      { id: 'system', label: 'Sistema', icon: Layers, keywords: 'sistema categorias predeterminadas',
        desc: 'Categorías predefinidas. Puedes cambiar su icono y su color.' },
    ],
  },
  {
    label: 'Preferencias',
    sections: [
      { id: 'appearance', label: 'Apariencia', icon: Palette, keywords: 'tema color acento oscuro claro grafica compacto densidad',
        desc: 'Tema, color de acento, colores de gráficas y densidad.' },
      { id: 'features', label: 'Funciones', icon: LayoutGrid, keywords: 'modulos logros deudas objetivos recurrentes activar',
        desc: 'Activa o desactiva módulos de la aplicación. Los cambios se aplican al instante.' },
    ],
  },
  {
    label: 'Cuenta',
    sections: [
      { id: 'security', label: 'Seguridad', icon: Lock, keywords: 'contraseña password cuenta eliminar borrar',
        desc: 'Contraseña y gestión de la cuenta.' },
      { id: 'ai-usage', label: 'Uso de IA', icon: Sparkles, keywords: 'ia inteligencia artificial tokens coste asistente',
        desc: 'Consumo del asistente de IA por mes.' },
    ],
  },
  {
    label: 'Avanzado',
    sections: [
      { id: 'integrations', label: 'Integraciones', icon: Plug, keywords: 'trade republic webhook token api atajo ios shortcut conectar sincronizar',
        desc: 'Trade Republic, webhooks, tokens de API y Atajo de iOS.' },
      { id: 'diagnostics', label: 'Diagnóstico', icon: Wrench, keywords: 'reparar tickers duplicados huerfanas balance canceladas',
        desc: 'Herramientas para corregir inconsistencias entre Trade Republic y los datos locales.' },
    ],
  },
]

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Settings() {
  const user = useAuthStore(s => s.user)
  const qc = useQueryClient()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const [query, setQuery] = useState('')

  const [newCatOpen, setNewCatOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<Category | null>(null)
  const [confirmDeleteRule, setConfirmDeleteRule] = useState<CategoryRule | null>(null)
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; rule: CategoryRule | null }>({ open: false, rule: null })

  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: catApi.list })
  const { data: rules } = useQuery({ queryKey: ['rules'], queryFn: catApi.listRules })
  const { data: usage } = useQuery({ queryKey: ['category-usage'], queryFn: catApi.usage })
  const { data: trStatus } = useQuery({ queryKey: ['tr-status'], queryFn: trApi.status, retry: false })
  const features = useFeaturesStore(s => s.features)

  const createCatMutation = useMutation({
    mutationFn: catApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['categories'] }); setNewCatOpen(false); toast('Categoría creada', 'success') },
    onError: (e: any) => toast(e.message, 'error'),
  })
  const updateCatMutation = useMutation({
    mutationFn: (data: Partial<Category> & { id: number }) => catApi.update(data.id, data),
    onSuccess: () => {
      // El icono/color/tipo se muestra en movimientos, reglas y gráficas
      qc.invalidateQueries()
      setEditingCat(null)
      toast('Categoría actualizada', 'success')
    },
    onError: (e: any) => toast(e.message, 'error'),
  })
  const deleteCatMutation = useMutation({
    mutationFn: catApi.delete,
    onSuccess: res => {
      qc.invalidateQueries()
      const extra = [
        res.moved > 0 && `${movementsLabel(res.moved)} a "Sin categorizar"`,
        res.rules_deleted > 0 && `${res.rules_deleted} ${res.rules_deleted === 1 ? 'regla borrada' : 'reglas borradas'}`,
      ].filter(Boolean).join(', ')
      toast(extra ? `Categoría eliminada: ${extra}` : 'Categoría eliminada', 'success')
      setConfirmDeleteCat(null)
    },
    onError: (e: any) => toast(e.message, 'error'),
  })
  const deleteRuleMutation = useMutation({
    mutationFn: catApi.deleteRule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rules'] }); toast('Regla eliminada', 'success'); setConfirmDeleteRule(null) },
    onError: (e: any) => toast(e.message, 'error'),
  })

  const userCats = categories?.filter(c => !c.is_system) || []
  const systemCats = categories?.filter(c => c.is_system) || []
  const deleteCatUsage = confirmDeleteCat ? usage?.[String(confirmDeleteCat.id)] ?? 0 : 0
  const deleteCatRules = confirmDeleteCat ? (rules || []).filter(r => r.category_id === confirmDeleteCat.id).length : 0
  const openNewRule = () => setRuleDialog({ open: true, rule: null })

  // ── Secciones visibles y sección activa (?tab=) ──
  const canSeeAi = !!(user?.ai_enabled || user?.is_admin)
  const groups = GROUPS
    .map(g => ({ ...g, sections: g.sections.filter(s => s.id !== 'ai-usage' || canSeeAi) }))
  const allSections = groups.flatMap(g => g.sections)
  const tabParam = searchParams.get('tab')
  const requested = allSections.find(s => s.id === tabParam)
  // En escritorio siempre hay una sección abierta; en móvil, sin ?tab= se muestra el índice
  const active = requested ?? (isDesktop ? allSections[0] : null)

  useEffect(() => {
    document.querySelector('.app-main')?.scrollTo({ top: 0 })
  }, [active?.id])

  const openSection = (id: SectionId) => {
    // En móvil se apila en el historial para que "atrás" vuelva al índice
    setSearchParams({ tab: id }, { replace: isDesktop })
  }
  const backToIndex = () => setSearchParams({})

  const q = normalize(query.trim())
  const filteredGroups = q
    ? groups
        .map(g => ({ ...g, sections: g.sections.filter(s => normalize(`${s.label} ${s.keywords}`).includes(q)) }))
        .filter(g => g.sections.length > 0)
    : groups

  // ── Pistas a la derecha de cada entrada ──
  const enabledFeatures = Object.values(features).filter(Boolean).length
  const totalFeatures = Object.keys(features).length
  const themeName = THEMES.find(t => t.id === getTheme())?.name
  const accentName = ACCENT_COLORS.find(a => a.id === getAccentId())?.name
  const counts: Partial<Record<SectionId, number>> = {
    categories: userCats.length,
    rules: rules?.length ?? 0,
    system: systemCats.length,
  }
  const hints: Partial<Record<SectionId, string>> = {
    appearance: [themeName, accentName].filter(Boolean).join(' · '),
    features: `${enabledFeatures} de ${totalFeatures} activas`,
    integrations: trStatus?.connected ? 'Conectado' : 'No conectado',
    diagnostics: trStatus && !trStatus.connected ? 'Requiere Trade Republic' : undefined,
  }
  const hintFor = (id: SectionId) => counts[id] !== undefined ? String(counts[id]) : hints[id]

  const headerAction = (id: SectionId): ReactNode => {
    if (id === 'categories') return <Button size="sm" onClick={() => setNewCatOpen(true)}><Plus className="h-4 w-4 mr-1.5" />Nueva categoría</Button>
    if (id === 'rules') return <Button size="sm" onClick={openNewRule}><Plus className="h-4 w-4 mr-1.5" />Nueva regla</Button>
    return null
  }

  const renderSection = (id: SectionId) => {
    switch (id) {
      case 'categories': return (
        <CategoriesSection
          categories={userCats}
          usage={usage}
          onEdit={setEditingCat}
          onDelete={setConfirmDeleteCat}
          onCreate={() => setNewCatOpen(true)}
        />
      )
      case 'rules': return (
        <RulesSection
          rules={rules || []}
          onEdit={r => setRuleDialog({ open: true, rule: r })}
          onDelete={setConfirmDeleteRule}
          onCreate={openNewRule}
        />
      )
      case 'system': return <SystemCategoriesSection categories={systemCats} onEdit={setEditingCat} />
      case 'appearance': return <AppearanceSection />
      case 'features': return <FeaturesSection />
      case 'security': return <SecuritySection />
      case 'ai-usage': return <AiUsageSection />
      case 'integrations': return <IntegrationsSection />
      case 'diagnostics': return <DiagnosticsSection onGoToIntegrations={() => openSection('integrations')} />
    }
  }

  const searchBox = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Buscar en ajustes"
        aria-label="Buscar en ajustes"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="h-10 pl-9"
      />
    </div>
  )

  const noResults = filteredGroups.length === 0 && (
    <p className="px-3 py-6 text-center text-sm text-muted-foreground">Sin resultados para "{query.trim()}"</p>
  )

  return (
    <div>
      {isDesktop ? (
        <div className="grid grid-cols-[232px_minmax(0,1fr)] gap-8">
          {/* Navegación lateral agrupada */}
          <nav aria-label="Secciones de ajustes" className="space-y-1">
            <div className="px-1 pb-3">
              <h1 className="text-xl font-semibold tracking-tight">Ajustes</h1>
              <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            </div>
            {searchBox}
            {filteredGroups.map(g => (
              <div key={g.label}>
                <p className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{g.label}</p>
                {g.sections.map(s => {
                  const Icon = s.icon
                  const selected = active?.id === s.id
                  const count = counts[s.id]
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openSection(s.id)}
                      aria-current={selected ? 'page' : undefined}
                      className={cn(
                        'flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors',
                        selected ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{s.label}</span>
                      {count !== undefined && <span className="text-xs tabular-nums opacity-80">{count}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
            {noResults}
          </nav>

          {/* Contenido de la sección */}
          {active && (
            <section className="min-w-0 space-y-5">
              <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold tracking-tight">{active.label}</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">{active.desc}</p>
                </div>
                <div className="shrink-0">{headerAction(active.id)}</div>
              </div>
              {renderSection(active.id)}
            </section>
          )}
        </div>
      ) : active ? (
        /* Móvil: detalle de una sección */
        <div className="space-y-5">
          <div>
            <button
              type="button"
              onClick={backToIndex}
              className="-ml-2 inline-flex h-11 items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-primary"
            >
              <ChevronLeft className="h-5 w-5" /> Ajustes
            </button>
            <div className="mt-1 flex items-start justify-between gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{active.label}</h1>
              <div className="shrink-0 pt-0.5">{headerAction(active.id)}</div>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{active.desc}</p>
          </div>
          {renderSection(active.id)}
        </div>
      ) : (
        /* Móvil: índice agrupado */
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
          </div>
          {searchBox}
          {filteredGroups.map(g => (
            <div key={g.label} className="space-y-1.5">
              <p className="px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/80">{g.label}</p>
              <Card className="divide-y divide-border overflow-hidden">
                {g.sections.map(s => {
                  const Icon = s.icon
                  const hint = hintFor(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => openSection(s.id)}
                      className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left transition-colors active:bg-secondary/60"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 truncate text-sm font-medium">{s.label}</span>
                      {hint && (
                        <span className={cn(
                          'truncate text-sm tabular-nums',
                          s.id === 'integrations' && trStatus?.connected ? 'text-positive' : 'text-muted-foreground',
                        )}>
                          {hint}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </button>
                  )
                })}
              </Card>
            </div>
          ))}
          {noResults}
        </div>
      )}

      {/* New category dialog */}
      <Dialog open={newCatOpen} onOpenChange={setNewCatOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva categoría</DialogTitle></DialogHeader>
          {newCatOpen && (
            <CategoryForm
              pending={createCatMutation.isPending}
              onSave={d => createCatMutation.mutate(d)}
              onCancel={() => setNewCatOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit category dialog */}
      <Dialog open={!!editingCat} onOpenChange={(open) => !open && setEditingCat(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar categoría</DialogTitle></DialogHeader>
          {editingCat && (
            <CategoryForm
              key={editingCat.id}
              initial={editingCat}
              isSystem={editingCat.is_system}
              pending={updateCatMutation.isPending}
              onSave={d => updateCatMutation.mutate({ ...d, id: editingCat.id })}
              onCancel={() => setEditingCat(null)}
            />
          )}
          {editingCat?.is_system && (
            <p className="text-xs text-muted-foreground">
              Las categorías del sistema son compartidas: el icono y el color que elijas se verán en todas las cuentas de esta instalación.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteCat !== null}
        title="Eliminar categoría"
        pending={deleteCatMutation.isPending}
        onConfirm={() => confirmDeleteCat && deleteCatMutation.mutate(confirmDeleteCat.id)}
        onCancel={() => setConfirmDeleteCat(null)}
      >
        <p>Se eliminará la categoría "{confirmDeleteCat?.name}". Esta acción no se puede deshacer.</p>
        {(deleteCatUsage > 0 || deleteCatRules > 0) && (
          <ul className="list-disc space-y-1 pl-5">
            {deleteCatUsage > 0 && <li>{movementsLabel(deleteCatUsage)} pasarán a "Sin categorizar".</li>}
            {deleteCatRules > 0 && <li>Se borrarán {deleteCatRules} {deleteCatRules === 1 ? 'regla asociada' : 'reglas asociadas'}.</li>}
          </ul>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDeleteRule !== null}
        title="Eliminar regla"
        pending={deleteRuleMutation.isPending}
        onConfirm={() => confirmDeleteRule && deleteRuleMutation.mutate(confirmDeleteRule.id)}
        onCancel={() => setConfirmDeleteRule(null)}
      >
        <p>
          Se eliminará la regla "{confirmDeleteRule?.keyword}" → {confirmDeleteRule?.category.name}.
          Los movimientos ya categorizados no cambian.
        </p>
      </ConfirmDialog>

      <RuleDialog
        open={ruleDialog.open}
        rule={ruleDialog.rule}
        categories={categories || []}
        onClose={() => setRuleDialog(d => ({ ...d, open: false }))}
      />
    </div>
  )
}
