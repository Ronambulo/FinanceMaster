import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/components/ui/toast'
import { useAuthStore } from '@/store/auth'
import { AppLayout } from '@/components/layout/AppLayout'
import { Login } from '@/pages/Login'
import { Register } from '@/pages/Register'
import { Dashboard } from '@/pages/Dashboard'
import { Transactions } from '@/pages/Transactions'
import { Portfolio } from '@/pages/Portfolio'
import { Recurring } from '@/pages/Recurring'
import { Debts } from '@/pages/Debts'
import { Goals } from '@/pages/Goals'
import { Monthly } from '@/pages/Monthly'
import { Settings } from '@/pages/Settings'
import { FireCalculator } from '@/pages/FireCalculator'
import { BabySteps } from '@/pages/BabySteps'
import { AchievementsPage } from '@/pages/Achievements'
import { CommandPalette } from '@/components/CommandPalette'
import { OnboardingWizard } from '@/components/OnboardingWizard'
import { AiChat } from '@/components/AiChat'
import { useEffect, useState, useRef } from 'react'
import { applyTheme, THEME_KEY, ACCENT_KEY, getCompact } from '@/lib/theme'
import { useFeaturesStore } from '@/store/features'
import type { FeatureId } from '@/lib/features'
import { WifiOff, Loader2 } from 'lucide-react'
import { trApi } from '@/lib/api'
import { useToast } from '@/components/ui/toast'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

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
    <div className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-2 bg-amber-500/90 backdrop-blur-sm py-1.5 text-xs font-medium text-amber-950">
      <WifiOff className="h-3.5 w-3.5" />
      Sin conexión — mostrando datos en caché
    </div>
  )
}

/* ── 2FA modal — shown when auto-connect finds a pending SMS code ── */
function TwoFAModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setCode('')
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [open])

  async function handleVerify() {
    if (code.length < 4 || loading) return
    setLoading(true)
    try {
      await trApi.verify(code)
      toast('Trade Republic conectado', 'success')
      onClose()
    } catch (e: any) {
      toast(e.message || 'Código incorrecto o expirado', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">📱</span> Verificación Trade Republic
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Se ha enviado un código de 4 dígitos a tu teléfono. Introdúcelo para reconectar.
          </p>
          <Input
            ref={inputRef}
            placeholder="0000"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={e => e.key === 'Enter' && handleVerify()}
            inputMode="numeric"
            className="text-center text-2xl tracking-[0.5em] font-mono"
            maxLength={4}
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button className="flex-1" onClick={handleVerify} disabled={code.length < 4 || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verificar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

let lastTokenAutoConnected: string | null = null

function TrAutoConnect() {
  const { toast } = useToast()
  const token = useAuthStore(s => s.token)
  const [show2FA, setShow2FA] = useState(false)

  useEffect(() => {
    if (!token || lastTokenAutoConnected === token) return
    lastTokenAutoConnected = token

    trApi.autoConnect().then(r => {
      if (r.status === 'connected') toast('Trade Republic conectado', 'success')
      else if (r.status === 'needs_2fa') setShow2FA(true)
      else if (r.status === 'error') toast(`Trade Republic: ${r.message ?? 'error al conectar'}`, 'error')
      // 'no_credentials' → silencioso
    }).catch(() => {})
  }, [token])

  return <TwoFAModal open={show2FA} onClose={() => setShow2FA(false)} />
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
              <Route path="fire" element={<FeatureRoute feature="fire"><FireCalculator /></FeatureRoute>} />
              <Route path="baby-steps" element={<FeatureRoute feature="babySteps"><BabySteps /></FeatureRoute>} />
              <Route path="logros" element={<FeatureRoute feature="achievements"><AchievementsPage /></FeatureRoute>} />
              <Route path="ajustes" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
