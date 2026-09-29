import { useRef, useState } from 'react'
import type { TouchEvent } from 'react'
import { Outlet, NavLink, Link } from 'react-router-dom'
import {
  LayoutDashboard, ArrowLeftRight, TrendingUp,
  CreditCard, Target, Settings, LogOut, CalendarDays, Sparkles, Trophy, RefreshCw, Search, ShieldCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { useAuthStore } from '@/store/auth'
import { useChatStore } from '@/store/chat'
import { useFeaturesStore } from '@/store/features'
import { queryClient } from '@/lib/queryClient'

const PULL_THRESHOLD = 70
const PULL_MAX = 110

/* Pull-to-refresh manual: el contenedor <main> tiene su propio scroll (no es
   el documento), así que el gesto nativo del navegador nunca se activa aquí.
   Al soltar por encima del umbral, se invalidan todas las queries activas de
   React Query — recarga los datos de la pantalla actual sin un reload duro. */
function usePullToRefresh(scrollRef: React.RefObject<HTMLElement>) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const pulling = useRef(false)

  function onTouchStart(e: TouchEvent) {
    if (refreshing) return
    if ((scrollRef.current?.scrollTop ?? 1) <= 0) {
      startY.current = e.touches[0].clientY
      pulling.current = true
    } else {
      pulling.current = false
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (!pulling.current || refreshing) return
    const delta = e.touches[0].clientY - startY.current
    if (delta <= 0 || (scrollRef.current?.scrollTop ?? 0) > 0) {
      pulling.current = false
      setPullDistance(0)
      return
    }
    setPullDistance(Math.min(delta * 0.45, PULL_MAX))
  }

  async function onTouchEnd() {
    if (!pulling.current) return
    pulling.current = false
    if (pullDistance >= PULL_THRESHOLD) {
      setRefreshing(true)
      setPullDistance(PULL_THRESHOLD)
      try {
        await queryClient.invalidateQueries()
      } finally {
        setRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }

  return { pullDistance, refreshing, onTouchStart, onTouchMove, onTouchEnd }
}

function ProfileSheet({ onClose }: { onClose: () => void }) {
  const user     = useAuthStore(s => s.user)
  const logout   = useAuthStore(s => s.logout)
  const features = useFeaturesStore(s => s.features)

  const extra = [
    { to: '/logros',     icon: Trophy,    label: 'Logros',           show: features.achievements },
    { to: '/recurrentes',icon: RefreshCw, label: 'Recurrentes',      show: features.recurring },
  ].filter(n => n.show)

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="absolute bottom-0 inset-x-0 rounded-t-2xl border-t border-border bg-card p-5 space-y-2 animate-fade-up"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
      >
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

        {extra.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            onClick={onClose}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-accent transition-colors"
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            {label}
          </Link>
        ))}

        <Link
          to="/ajustes"
          onClick={onClose}
          className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-accent transition-colors"
        >
          <Settings className="h-4 w-4 text-muted-foreground" />
          Ajustes y apariencia
        </Link>

        {user?.is_admin && (
          <Link
            to="/admin"
            onClick={onClose}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium hover:bg-accent transition-colors"
          >
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Administración
          </Link>
        )}

        <button
          onClick={() => { logout(); onClose() }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-negative hover:bg-negative/10 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </button>

        <div style={{ height: 'calc(1.5rem + var(--safe-bottom))' }} />
      </div>
    </div>
  )
}

export function AppLayout() {
  const user     = useAuthStore(s => s.user)
  const features = useFeaturesStore(s => s.features)
  const [profileOpen, setProfileOpen] = useState(false)
  const { toggle: toggleChat, isOpen: chatOpen } = useChatStore()
  const mainRef = useRef<HTMLElement>(null)
  const { pullDistance, refreshing, onTouchStart, onTouchMove, onTouchEnd } = usePullToRefresh(mainRef)

  const mobileNav = [
    { to: '/',              icon: LayoutDashboard, label: 'Inicio',   show: true },
    { to: '/transacciones', icon: ArrowLeftRight,  label: 'Txns',     show: true },
    { to: '/monthly',       icon: CalendarDays,    label: 'Mensual',  show: true },
    { to: '/portfolio',     icon: TrendingUp,      label: 'Portfolio',show: true },
    { to: '/deudas',        icon: CreditCard,      label: 'Deudas',   show: features.debts },
    { to: '/objetivos',     icon: Target,          label: 'Metas',    show: features.goals },
  ].filter(n => n.show)

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
        <header
          className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-40"
<<<<<<< Updated upstream
          style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}
=======
          style={{ paddingTop: 'calc(0.75rem + var(--safe-top))' }}
>>>>>>> Stashed changes
        >
          <div className="flex items-center gap-2">
            <img
              src="https://raw.githubusercontent.com/Ronambulo/FinanceMaster/refs/heads/main/frontend/icon.png"
              alt="FinanceMaster"
              className="h-11 w-11 rounded-lg object-contain"
            />
            <span className="text-sm font-semibold tracking-tight">FinanceMaster</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary ring-1 ring-border transition-all active:scale-95"
              aria-label="Buscar"
            >
              <Search className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={toggleChat}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-95',
                chatOpen
                  ? 'bg-primary/20 ring-1 ring-primary/40'
                  : 'bg-secondary ring-1 ring-border',
              )}
            >
              <Sparkles className={cn('h-4 w-4', chatOpen ? 'text-primary' : 'text-muted-foreground')} />
            </button>
            <button
              onClick={() => setProfileOpen(true)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20 transition-all active:scale-95"
            >
              <span className="text-xs font-bold text-primary">{(user?.email?.[0] ?? '?').toUpperCase()}</span>
            </button>
          </div>
        </header>

<<<<<<< Updated upstream
        <main
          ref={mainRef}
          className="relative flex-1 overflow-y-auto p-4 pb-32 md:p-6 md:pb-6"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {pullDistance > 0 && (
            <div
              className="md:hidden pointer-events-none absolute inset-x-0 top-0 flex justify-center overflow-hidden transition-[height] duration-150"
              style={{ height: pullDistance }}
            >
              <div className="flex items-center justify-center pt-2">
                <RefreshCw
                  className={cn(
                    'h-5 w-5 text-primary transition-transform',
                    refreshing && 'animate-spin',
                  )}
                  style={
                    refreshing
                      ? undefined
                      : { transform: `rotate(${(pullDistance / PULL_THRESHOLD) * 180}deg)` }
                  }
                />
              </div>
            </div>
          )}
=======
        <main className="app-main flex-1 overflow-y-auto p-4 md:p-6">
>>>>>>> Stashed changes
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl"
<<<<<<< Updated upstream
        style={{ height: 'calc(78px + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
=======
        style={{ paddingBottom: 'var(--safe-bottom)' }}
>>>>>>> Stashed changes
      >
        <div
          className="grid h-[78px]"
          style={{ gridTemplateColumns: `repeat(${mobileNav.length}, minmax(0, 1fr))` }}
        >
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
