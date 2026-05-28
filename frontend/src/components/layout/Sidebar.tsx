import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp,
  CreditCard, Target, Settings, LogOut, CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'

const nav = [
  { to: '/',              icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transacciones', icon: ArrowLeftRight,  label: 'Transacciones' },
  { to: '/monthly',       icon: CalendarDays,    label: 'Mensual' },
  { to: '/portfolio',     icon: TrendingUp,      label: 'Portfolio' },
  { to: '/deudas',        icon: CreditCard,      label: 'Deudas' },
  { to: '/objetivos',     icon: Target,          label: 'Objetivos' },
]

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const logout = useAuthStore(s => s.logout)
  const user   = useAuthStore(s => s.user)

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

      {/* ── Nav ── */}
      <nav className="flex-1 px-3 py-2 space-y-0.5">
        {nav.map(({ to, icon: Icon, label }) => (
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
                {/* Active left indicator */}
                <span
                  className={cn(
                    'absolute left-0 top-1/2 -translate-y-1/2 w-[3px] rounded-r-full transition-all duration-200',
                    isActive ? 'h-5 bg-primary' : 'h-0 bg-transparent',
                  )}
                />
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-colors duration-150',
                    isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                />
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
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
