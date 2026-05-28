import { useState } from 'react'
import { Outlet, NavLink, Link } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp,
  CreditCard, Target, Settings, LogOut, X, CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '@/store/auth'

/* Mobile bottom-nav — 6 slots (Recurrentes vive dentro de Mensual) */
const mobileNav = [
  { to: '/',              icon: LayoutDashboard, label: 'Inicio' },
  { to: '/transacciones', icon: ArrowLeftRight,  label: 'Txns' },
  { to: '/monthly',       icon: CalendarDays,    label: 'Mensual' },
  { to: '/portfolio',     icon: TrendingUp,      label: 'Portfolio' },
  { to: '/deudas',        icon: CreditCard,      label: 'Deudas' },
  { to: '/objetivos',     icon: Target,          label: 'Metas' },
]

function ProfileSheet({ onClose }: { onClose: () => void }) {
  const user   = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute bottom-0 inset-x-0 rounded-t-2xl border-t border-border bg-card p-5 space-y-2 animate-fade-up">
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
        <div className="flex items-center gap-3 px-2 pb-3 border-b border-border/60">
          <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 ring-2 ring-primary/25 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">{(user?.email?.[0] ?? '?').toUpperCase()}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{user?.email}</p>
            <p className="text-xs text-muted-foreground">Mi cuenta</p>
          </div>
        </div>

        <Link
          to="/ajustes"
          onClick={onClose}
          className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-accent transition-colors"
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
          Ajustes y apariencia
        </Link>

        <button
          onClick={() => { logout(); onClose() }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-negative hover:bg-negative/10 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>

        <div className="h-6" />
      </div>
    </div>
  )
}

export function AppLayout() {
  const user         = useAuthStore(s => s.user)
  const [profileOpen, setProfileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Desktop sidebar ── */}
      <div className="hidden md:flex md:w-60 md:shrink-0">
        <div className="w-full">
          <Sidebar />
        </div>
      </div>

      {/* ── Main ── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <img
              src="/icon.png"
              alt="FinanceMaster"
              className="h-11 w-11 rounded-lg object-contain"
            />
            <span className="text-sm font-semibold tracking-tight">FinanceMaster</span>
          </div>
          <button
            onClick={() => setProfileOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20 transition-all active:scale-95"
          >
            <span className="text-xs font-bold text-primary">{(user?.email?.[0] ?? '?').toUpperCase()}</span>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 pb-32 md:p-6 md:pb-6">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom nav — 6 columnas fijas ── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 h-[78px] border-t border-border bg-background/95 backdrop-blur-xl">
        <div className="grid h-full grid-cols-6">
          {mobileNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => cn(
                'flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors duration-150',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className="h-[26px] w-[26px] transition-all duration-150"
                    style={isActive ? { filter: 'drop-shadow(0 0 6px currentColor)' } : undefined}
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {profileOpen && <ProfileSheet onClose={() => setProfileOpen(false)} />}
    </div>
  )
}
