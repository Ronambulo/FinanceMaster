import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { ToastProvider } from '@/components/ui/toast'
import { useAuthStore } from '@/store/auth'
import { AppLayout } from '@/components/layout/AppLayout'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Dashboard } from '@/pages/Dashboard'
import { CommandPalette } from '@/components/CommandPalette'
import { OnboardingWizard } from '@/components/OnboardingWizard'
import { AiChat } from '@/components/AiChat'
import { useCallback, useEffect, useState, Suspense, lazy } from 'react'

const Transactions = lazy(() => import('@/pages/Transactions').then(m => ({ default: m.Transactions })))
const Portfolio = lazy(() => import('@/pages/Portfolio').then(m => ({ default: m.Portfolio })))
const Recurring = lazy(() => import('@/pages/Recurring').then(m => ({ default: m.Recurring })))
const Debts = lazy(() => import('@/pages/Debts').then(m => ({ default: m.Debts })))
const Goals = lazy(() => import('@/pages/Goals').then(m => ({ default: m.Goals })))
const Monthly = lazy(() => import('@/pages/Monthly').then(m => ({ default: m.Monthly })))
const Settings = lazy(() => import('@/pages/Settings').then(m => ({ default: m.Settings })))
const Admin = lazy(() => import('@/pages/Admin').then(m => ({ default: m.Admin })))
const AchievementsPage = lazy(() => import('@/pages/Achievements').then(m => ({ default: m.AchievementsPage })))
import { applyTheme, THEME_KEY, ACCENT_KEY, getCompact } from '@/lib/theme'
import { useFeaturesStore } from '@/store/features'
import type { FeatureId } from '@/lib/features'
import { WifiOff, Loader2, Smartphone } from 'lucide-react'
import { trApi } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TRLoginStep } from '@/components/TRLoginStep'
import { useTR2FAStore } from '@/store/tr2fa'

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const on  = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (!offline) return null
  return (
    <div
      className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-2 bg-amber-500/90 backdrop-blur-sm py-1.5 text-xs font-medium text-amber-950"
      style={{ paddingTop: 'calc(0.375rem + var(--safe-top))' }}
    >
      <WifiOff className="h-3.5 w-3.5" />
      Sin conexión — mostrando datos en caché
    </div>
  )
}

/* ── Modal de login de Trade Republic — se muestra cuando el auto-connect deja
   un inicio de sesión pendiente (confirmar en la app o código del autenticador).
   `onClose` solo oculta el diálogo (el login pendiente sigue y se puede retomar);
   `onVerified` se dispara únicamente cuando la sesión queda conectada. */
export function TwoFAModal({ open, onClose, onVerified }: { open: boolean; onClose: () => void; onVerified?: () => void }) {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [attempt, setAttempt] = useState(0)
  const [restarting, setRestarting] = useState(false)

  const handleConnected = useCallback(() => {
    toast('Trade Republic conectado', 'success')
    qc.invalidateQueries({ queryKey: ['tr-status'] })
    onVerified?.()
    onClose()
  }, [toast, qc, onVerified, onClose])

  async function handleRestart() {
    setRestarting(true)
    try {
      const r = await trApi.autoConnect()
      if (r.status === 'connected') handleConnected()
      else if (r.status === 'error') toast(`Trade Republic: ${r.message ?? 'error al conectar'}`, 'error')
      setAttempt(a => a + 1)
    } catch (e: any) {
      toast(e.message || 'Error al conectar', 'error')
    } finally {
      setRestarting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Inicio de sesión en Trade Republic</DialogTitle>
        </DialogHeader>
        <div className="pt-1">
          {restarting ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Conectando…
            </p>
          ) : open && (
            <TRLoginStep key={attempt} onConnected={handleConnected} onRestart={handleRestart} onCancel={onClose} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* Small reopening affordance — shown whenever a 2FA code is pending but the
   modal has been dismissed, so the user can get back to it without a resend. */
function PendingTwoFABanner() {
  const pending = useTR2FAStore(s => s.pending)
  const show = useTR2FAStore(s => s.show)
  const open = useTR2FAStore(s => s.open)

  if (!pending || show) return null
  return (
    <button
      onClick={open}
      className="fixed right-4 z-[150] flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/25 bottom-[calc(5rem_+_var(--safe-bottom))] md:bottom-6"
    >
      <Smartphone className="h-4 w-4" />
      Inicio de sesión de Trade Republic pendiente
    </button>
  )
}

let lastTokenAutoConnected: string | null = null

function TrAutoConnect() {
  const { toast } = useToast()
  const token = useAuthStore(s => s.token)
  const show = useTR2FAStore(s => s.show)
  const setPending = useTR2FAStore(s => s.setPending)
  const closeModal = useTR2FAStore(s => s.close)
  const clearPending = useTR2FAStore(s => s.clear)

  useEffect(() => {
    if (!token || lastTokenAutoConnected === token) return
    lastTokenAutoConnected = token

    trApi.autoConnect().then(r => {
      if (r.status === 'connected') toast('Trade Republic conectado', 'success')
      // 'needs_2fa' here never sends a new SMS — the backend only reports a code
      // that's already pending (either just sent, or from before a page reload).
      else if (r.status === 'needs_2fa') setPending()
      else if (r.status === 'error') toast(`Trade Republic: ${r.message ?? 'error al conectar'}`, 'error')
      // 'no_credentials' → silencioso
    }).catch(() => {})
  }, [token])

  return (
    <>
      <TwoFAModal open={show} onClose={closeModal} onVerified={clearPending} />
      <PendingTwoFABanner />
    </>
  )
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  if (token) return <Navigate to="/" replace />
  return <>{children}</>
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  if (!token) return <Navigate to="/login" replace />
  return (
    <>
      <TrAutoConnect />
      {children}
      <AiChat />
    </>
  )
}

function FeatureRoute({ feature, children }: { feature: FeatureId; children: React.ReactNode }) {
  const features = useFeaturesStore(s => s.features)
  if (!features[feature]) return <Navigate to="/" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user?.is_admin) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  useEffect(() => {
    const themeId  = localStorage.getItem(THEME_KEY)  || 'trade-republic'
    const accentId = localStorage.getItem(ACCENT_KEY) || 'lime'
    applyTheme(themeId, accentId)
    if (getCompact()) document.documentElement.classList.add('compact')
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <OfflineBanner />
          <CommandPalette />
          <OnboardingWizard />
          <Routes>
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/registro" element={<PublicRoute><Register /></PublicRoute>} />
            <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="transacciones" element={<Transactions />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="recurrentes" element={<FeatureRoute feature="recurring"><Recurring /></FeatureRoute>} />
              <Route path="deudas" element={<FeatureRoute feature="debts"><Debts /></FeatureRoute>} />
              <Route path="objetivos" element={<FeatureRoute feature="goals"><Goals /></FeatureRoute>} />
              <Route path="monthly" element={<Monthly />} />
              <Route path="logros" element={<FeatureRoute feature="achievements"><AchievementsPage /></FeatureRoute>} />
              <Route path="ajustes" element={<Settings />} />
              <Route path="admin" element={<AdminRoute><Admin /></AdminRoute>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
