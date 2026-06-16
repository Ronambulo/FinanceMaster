import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp,
  CreditCard, Target, Settings, LogOut, CalendarDays, Flame, Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { useInsightsUnreadCount } from '@/components/InsightsWidget'

const nav = [
  { to: '/',              icon: LayoutDashboard, label: 'Dashboard',      badge: 'insights' as const },
  { to: '/transacciones', icon: ArrowLeftRight,  label: 'Transacciones',  badge: null },
  { to: '/monthly',       icon: CalendarDays,    label: 'Mensual',        badge: null },
  { to: '/portfolio',     icon: TrendingUp,      label: 'Portfolio',      badge: null },
  { to: '/deudas',        icon: CreditCard,      label: 'Deudas',         badge: null },
  { to: '/objetivos',     icon: Target,          label: 'Objetivos',      badge: null },
  { to: '/fire',          icon: Flame,           label: 'FIRE',           badge: null },
]

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const logout = useAuthStore(s => s.logout)
  const user   = useAuthStore(s => s.user)
  const unreadInsights = useInsightsUnreadCount()

  return (
    <div className="flex h-full flex-col bg-background border-r border-border">
      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-5 py-6">
        {/* App icon */}
        <img
          src="https://raw.githubusercontent.com/Ronambulo/FinanceMaster/refs/heads/main/frontend/icon.png"
          alt="FinanceMaster"
          className="h-12 w-12 shrink-0 rounded-lg object-contain"
        />
        <div className="leading-tight">
          <span className="block text-sm font-semibold text-foreground tracking-tight">FinanceMaster</span>
          <span className="block text-[10px] text-muted-foreground/70 uppercase tracking-widest">Personal Finance</span>
        </div>
      </div>

      {/* ── Search / Ctrl+K ── */}
      <div className="px-3 pb-2">
        <button
          onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
          className="flex items-center gap-2 w-full rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">Buscar...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 font-mono text-[10px] text-muted-foreground/50">
            Ctrl K
          </kbd>
        </button>
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {nav.map(({ to, icon: Icon, label, badge }) => {
          const badgeCount = badge === 'insights' ? unreadInsights : 0
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onClose}
              className={({ isActive }) => cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
                'transition-all duration-150 ease-out',
                isActive
                  ? 'text-primary bg-primary/[0.08]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
              )}
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-200',
                      isActive ? 'h-5 bg-primary' : 'h-0 bg-transparent',
                    )}
                  />
                  <span className="relative shrink-0">
                    <Icon
                      className={cn(
                        'h-4 w-4 transition-colors duration-150',
                        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                      )}
                    />
                    {badgeCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-sky-500 px-0.5 text-[9px] font-bold text-white leading-none">
                        {badgeCount}
                      </span>
                    )}
                  </span>
                  <span className="truncate">{label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* ── Bottom ── */}
      <div className="px-3 pb-4 pt-2 border-t border-white/[0.06] space-y-0.5">
        <NavLink
          to="/ajustes"
          onClick={onClose}
          className={({ isActive }) => cn(
            'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
            'transition-all duration-150',
            isActive
              ? 'text-primary bg-primary/[0.08]'
              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]',
          )}
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-200',
                  isActive ? 'h-5 bg-primary' : 'h-0',
                )}
              />
              <Settings className="h-4 w-4 shrink-0" />
              <span>Ajustes</span>
            </>
          )}
        </NavLink>

        {/* User info */}
        <div className="flex items-center gap-2.5 px-3 py-2 mt-1 rounded-lg">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
            <span className="text-[10px] font-semibold text-primary">
              {(user?.email?.[0] ?? '?').toUpperCase()}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            title="Cerrar sesión"
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
