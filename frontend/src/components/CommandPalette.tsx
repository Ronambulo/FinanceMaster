import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp, CalendarDays,
  RefreshCw, CreditCard, Target, Settings, Flame, Upload,
  Plus, Palette, Trophy, Moon, Sun, Minimize2, Maximize2,
  PiggyBank, FileText, FileSpreadsheet, Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCompact, setCompact, getTheme, applyTheme, ACCENT_KEY } from '@/lib/theme'

interface CmdItem {
  id: string
  label: string
  desc?: string
  icon: React.ReactNode
  action: () => void
  group: string
  keywords?: string
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [isDark, setIsDark] = useState(() => getTheme() !== 'light')
  const [isCompact, setIsCompact] = useState(() => getCompact())
  const navigate = useNavigate()

  const go = useCallback((path: string) => { navigate(path); setOpen(false) }, [navigate])

  function toggleTheme() {
    const next = isDark ? 'light' : 'trade-republic'
    const accent = localStorage.getItem(ACCENT_KEY) || 'lime'
    applyTheme(next, accent)
    setIsDark(!isDark)
    setOpen(false)
  }

  function toggleCompact() {
    const next = !isCompact
    setCompact(next)
    setIsCompact(next)
    setOpen(false)
  }

  const items: CmdItem[] = [
    // Navegación
    { id: 'dashboard',    group: 'Navegación', icon: <LayoutDashboard className="h-4 w-4" />, label: 'Dashboard',         desc: 'Resumen general y KPIs',              action: () => go('/'),              keywords: 'inicio home' },
    { id: 'transactions', group: 'Navegación', icon: <ArrowLeftRight  className="h-4 w-4" />, label: 'Transacciones',     desc: 'Ver y gestionar movimientos',         action: () => go('/transacciones'), keywords: 'movimientos gastos' },
    { id: 'monthly',      group: 'Navegación', icon: <CalendarDays    className="h-4 w-4" />, label: 'Mensual',           desc: 'Resumen por tramo de nómina',         action: () => go('/monthly'),       keywords: 'nomina tramo mes presupuesto' },
    { id: 'portfolio',    group: 'Navegación', icon: <TrendingUp      className="h-4 w-4" />, label: 'Portfolio',         desc: 'Inversiones y rentabilidad',          action: () => go('/portfolio'),     keywords: 'inversiones acciones etf' },
    { id: 'recurring',    group: 'Navegación', icon: <RefreshCw       className="h-4 w-4" />, label: 'Recurrentes',       desc: 'Suscripciones y pagos fijos',         action: () => go('/recurrentes'),   keywords: 'suscripciones pagos fijos' },
    { id: 'debts',        group: 'Navegación', icon: <CreditCard      className="h-4 w-4" />, label: 'Deudas',            desc: 'Préstamos y deudas pendientes',       action: () => go('/deudas'),        keywords: 'prestamo credito' },
    { id: 'goals',        group: 'Navegación', icon: <Target          className="h-4 w-4" />, label: 'Objetivos',         desc: 'Metas de ahorro e inversión',         action: () => go('/objetivos'),     keywords: 'metas ahorro objetivo' },
    { id: 'fire',         group: 'Navegación', icon: <Flame           className="h-4 w-4" />, label: 'Calculadora FIRE',  desc: '¿Cuándo puedes retirarte?',           action: () => go('/fire'),          keywords: 'independencia financiera jubilacion retiro' },
    { id: 'settings',     group: 'Navegación', icon: <Settings        className="h-4 w-4" />, label: 'Ajustes',           desc: 'Categorías, tema y seguridad',        action: () => go('/ajustes'),       keywords: 'configuracion tema color' },
    { id: 'achievements', group: 'Navegación', icon: <Trophy          className="h-4 w-4" />, label: 'Mis logros',        desc: 'Ver logros desbloqueados',            action: () => go('/ajustes?tab=achievements'), keywords: 'logros badges gamificacion' },

    // Acciones rápidas
    { id: 'import',       group: 'Acciones',   icon: <Upload          className="h-4 w-4" />, label: 'Importar CSV',      desc: 'Subir extracto de Trade Republic',    action: () => { navigate('/transacciones?import=1'); setOpen(false) }, keywords: 'trade republic csv subir' },
    { id: 'add-tx',       group: 'Acciones',   icon: <Plus            className="h-4 w-4" />, label: 'Nueva transacción', desc: 'Añadir movimiento manual',            action: () => { navigate('/transacciones?add=1'); setOpen(false) },    keywords: 'crear transaccion manual nueva' },
    { id: 'add-goal',     group: 'Acciones',   icon: <PiggyBank       className="h-4 w-4" />, label: 'Nuevo objetivo',    desc: 'Crear meta de ahorro',                action: () => { navigate('/objetivos?add=1'); setOpen(false) },         keywords: 'crear objetivo meta ahorro nuevo' },
    { id: 'export-pdf',   group: 'Acciones',   icon: <FileText        className="h-4 w-4" />, label: 'Exportar PDF',      desc: 'Descargar resumen del mes actual',    action: () => { navigate('/monthly?export=pdf'); setOpen(false) },     keywords: 'pdf descargar exportar' },
    { id: 'export-xlsx',  group: 'Acciones',   icon: <FileSpreadsheet className="h-4 w-4" />, label: 'Exportar Excel',    desc: 'Descargar Excel del mes actual',      action: () => { navigate('/monthly?export=xlsx'); setOpen(false) },    keywords: 'excel xlsx descargar exportar' },

    // Personalización
    { id: 'theme',        group: 'Apariencia', icon: isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />, label: isDark ? 'Modo claro' : 'Modo oscuro', desc: 'Cambiar entre tema claro y oscuro', action: toggleTheme,  keywords: 'tema oscuro claro color' },
    { id: 'compact',      group: 'Apariencia', icon: isCompact ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />, label: isCompact ? 'Desactivar modo compacto' : 'Activar modo compacto', desc: 'Reduce el espaciado de la interfaz', action: toggleCompact, keywords: 'compacto denso espaciado ui' },
    { id: 'palette',      group: 'Apariencia', icon: <Palette         className="h-4 w-4" />, label: 'Cambiar color de acento', desc: 'Personalizar el color principal', action: () => go('/ajustes?tab=appearance'), keywords: 'color acento tema palette' },
    { id: 'balance',      group: 'Apariencia', icon: <Wallet          className="h-4 w-4" />, label: 'Ver balance',       desc: 'Ir al dashboard principal',           action: () => go('/'),              keywords: 'balance patrimonio total' },
  ]

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const groups = [...new Set(items.map(i => i.group))]

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl mx-4 rounded-2xl border border-white/[0.1] bg-card shadow-2xl overflow-hidden animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        <Command>
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
            <svg className="h-4 w-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <Command.Input
              autoFocus
              placeholder="Buscar páginas, acciones..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground text-foreground"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[340px] overflow-y-auto p-2">
            <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
              Sin resultados
            </Command.Empty>

            {groups.map(group => (
              <Command.Group
                key={group}
                heading={group}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground/60"
              >
                {items.filter(i => i.group === group).map(item => (
                  <Command.Item
                    key={item.id}
                    value={`${item.label} ${item.desc ?? ''} ${item.keywords ?? ''}`}
                    onSelect={item.action}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors',
                      'data-[selected=true]:bg-primary/10',
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-muted-foreground data-[selected=true]:text-primary">
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight data-[selected=true]:text-primary">
                        {item.label}
                      </p>
                      {item.desc && (
                        <p className="text-[11px] text-muted-foreground/70 leading-tight mt-0.5 truncate">
                          {item.desc}
                        </p>
                      )}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span><kbd className="font-mono">↑↓</kbd> navegar</span>
            <span><kbd className="font-mono">↵</kbd> ejecutar</span>
            <span><kbd className="font-mono">Esc</kbd> cerrar</span>
            <span className="ml-auto opacity-40">Ctrl+K para abrir</span>
          </div>
        </Command>
      </div>
    </div>
  )
}
