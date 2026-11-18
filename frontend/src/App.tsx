// Raíz de la app: autenticación, preferencias, tema y rutas del rediseño.
import { useEffect, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { dashApi, portfolioApi } from '@/lib/api'
import { persistQueries, restoreQueries } from '@/lib/queryPersist'
import { applyTheme } from '@/lib/theme'
import { applyAppearance } from '@/lib/appearance'
import { useAuthStore } from '@/store/auth'
import { usePreferencesStore } from '@/store/preferences'
import { AppLayout } from '@/app/Shell'
import { Login, Registro, enforceRemember } from '@/screens/Auth'
import Inicio from '@/screens/Inicio'
import Onboarding from '@/screens/Onboarding'
import Movimientos from '@/screens/Movimientos'
import Comercio from '@/screens/Comercio'
import Detalle from '@/screens/Detalle'
import EditarGasto from '@/screens/EditarGasto'
import Dividir from '@/screens/Dividir'
import Importar from '@/screens/Importar'
import Ajustes from '@/screens/Ajustes'
import Admin, { Usuario, Usuarios } from '@/screens/Admin'
import { Actividad, Avisos, Copias } from '@/screens/AdminServidor'
import Chat from '@/screens/Chat'
import ConectarTR from '@/screens/ConectarTR'
import SyncError from '@/screens/SyncError'
import Plan, { Deudas, Logros, MesAMes, Objetivos, Presupuestos, Recurrentes } from '@/screens/Plan'
import Cuentas, { Banco, Broker, openAddAccount } from '@/screens/Cuentas'
import Inversiones from '@/screens/Inversiones'
import Cierre from '@/screens/Cierre'
import Compartidos from '@/screens/Compartidos'
import { PwaFixes } from '@/app/pwa'
import { CategoryEmojiSync } from '@/store/catEmoji'
import { ConfirmHost } from '@/ui/Confirm'
import { ToastHost } from '@/ui/Toast'
import { AddSheet } from '@/ui/AddSheet'
import { openAdd } from '@/store/add'
import { useNavigate } from 'react-router-dom'
import { useIsPC } from '@/app/Shell'
import { Empty, SubHeader, Spinner } from '@/ui/kit'

enforceRemember()

/** Pantalla aún sin construir en esta rama. */
function Pending({ title, back = '/' }: { title: string; back?: string }) {
  return (
    <>
      <SubHeader title={title} back={back} />
      <Empty title={title} text="Esta pantalla llega en el siguiente paso." />
    </>
  )
}

function Loading() {
  return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>
}

/** Enlaces antiguos: /?import=1 y /settings?tab=… */
function Home() {
  const [sp] = useSearchParams()
  if (sp.get('import') === '1') return <Navigate to="/importar" replace />
  return <Inicio />
}
function LegacySettings() {
  const [sp] = useSearchParams()
  const tab = sp.get('tab')
  const map: Record<string, string> = { categories: 'categorias', appearance: 'apariencia', integrations: 'integraciones', export: 'datos', backup: 'datos', diagnostics: 'diagnostico', features: 'modo' }
  return <Navigate to={tab && map[tab] ? `/ajustes/${map[tab]}` : '/ajustes'} replace />
}

/** /anadir y /traspaso: abren la hoja y vuelven atrás. */
function AddRoute({ kind }: { kind: 'expense' | 'transfer' }) {
  const nav = useNavigate()
  useEffect(() => {
    openAdd(kind)
    if (window.history.length > 1) nav(-1)
    else nav('/', { replace: true })
  }, [kind, nav])
  return null
}

/** Al tocar un aviso con la app ya abierta, el service worker pide ir a su pantalla. */
function PushNavigate() {
  const nav = useNavigate()
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { type?: string; url?: string } | null
      if (d?.type === 'navigate' && typeof d.url === 'string' && d.url.startsWith('/')) nav(d.url)
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [nav])
  return null
}

/** /cuentas/nueva: abre la hoja Añadir cuenta sobre Cuentas. */
function NewAccount() {
  useEffect(() => { openAddAccount() }, [])
  return <Navigate to="/cuentas" replace />
}

function L({ children, bare }: { children: ReactNode; bare?: boolean }) {
  return <AppLayout bare={bare}>{children}</AppLayout>
}

function AuthedRoutes() {
  const { prefs, loaded, load } = usePreferencesStore()
  const loc = useLocation()
  useEffect(() => { load() }, [load])
  // La gráfica de patrimonio es la petición más lenta (precios históricos):
  // se pide ya, en paralelo con las preferencias, para que Inicio y Cuentas
  // la encuentren lista.
  useEffect(() => { queryClient.prefetchQuery({ queryKey: ['net-worth', 12], queryFn: () => dashApi.netWorthHistory(12), staleTime: 5 * 60_000 }) }, [])
  if (!loaded) return <Loading />
  if (!prefs.initialized && loc.pathname !== '/bienvenida') return <Navigate to="/bienvenida" replace />

  const P = (title: string, back?: string, bare = true) => <L bare={bare}><Pending title={title} back={back} /></L>
  return (
    <Routes>
      <Route path="/" element={<L><Home /></L>} />
      <Route path="/bienvenida" element={<Onboarding />} />

      <Route path="/transacciones" element={<L><Movimientos /></L>} />
      <Route path="/transacciones/:id" element={<L bare><Detalle /></L>} />
      <Route path="/transacciones/:id/editar" element={<L bare><EditarGasto /></L>} />
      <Route path="/transacciones/:id/dividir" element={<L bare><Dividir /></L>} />
      <Route path="/comercio/:name" element={<L><Comercio /></L>} />
      <Route path="/anadir" element={<AddRoute kind="expense" />} />
      <Route path="/traspaso" element={<AddRoute kind="transfer" />} />
      <Route path="/importar" element={<L bare><Importar /></L>} />

      <Route path="/cuentas" element={<L><Cuentas /></L>} />
      <Route path="/cuentas/nueva" element={<NewAccount />} />
      <Route path="/cuentas/trade-republic" element={<L bare><ConectarTR /></L>} />
      <Route path="/cuentas/sync-error" element={<L bare><SyncError /></L>} />
      <Route path="/cuentas/broker/:broker" element={<L><Broker /></L>} />
      <Route path="/cuentas/:source" element={<L><Banco /></L>} />
      <Route path="/portfolio" element={<L><Inversiones /></L>} />

      <Route path="/plan" element={<L><Plan /></L>} />
      <Route path="/cierre" element={<L bare><Cierre /></L>} />
      <Route path="/presupuestos" element={<L><Presupuestos /></L>} />
      <Route path="/recurrentes" element={<L><Recurrentes /></L>} />
      <Route path="/compartidos" element={<L><Compartidos /></L>} />
      <Route path="/objetivos" element={<L><Objetivos /></L>} />
      <Route path="/deudas" element={<L><Deudas /></L>} />
      <Route path="/monthly" element={<L><MesAMes /></L>} />
      <Route path="/logros" element={<L><Logros /></L>} />
      <Route path="/chat" element={<L><Chat /></L>} />

      <Route path="/ajustes" element={<L><Ajustes /></L>} />
      <Route path="/ajustes/:sec" element={<L bare><Ajustes /></L>} />
      <Route path="/settings" element={<LegacySettings />} />

      <Route path="/admin" element={<L bare><Admin /></L>} />
      <Route path="/admin/usuarios" element={<L bare><Usuarios /></L>} />
      <Route path="/admin/copias" element={<L bare><Copias /></L>} />
      <Route path="/admin/avisos" element={<L bare><Avisos /></L>} />
      <Route path="/admin/actividad" element={<L bare><Actividad /></L>} />
      <Route path="/admin/usuarios/:id" element={<L bare><Usuario /></L>} />

      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/registro" element={<Navigate to="/" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// Últimos datos guardados en el dispositivo: las pestañas se pintan al instante.
restoreQueries(queryClient, useAuthStore.getState().user?.id)
persistQueries(queryClient, () => (useAuthStore.getState().token ? useAuthStore.getState().user?.id : null))

/** Pide por adelantado lo de Cuentas para que al entrar ya esté. */
function Prefetch() {
  useEffect(() => {
    const t = window.setTimeout(() => {
      queryClient.prefetchQuery({ queryKey: ['accounts'], queryFn: dashApi.accounts })
      queryClient.prefetchQuery({ queryKey: ['net-worth', 12], queryFn: () => dashApi.netWorthHistory(12), staleTime: 5 * 60_000 })
      queryClient.prefetchQuery({ queryKey: ['portfolio-performance'], queryFn: portfolioApi.performance })
    }, 300)
    return () => clearTimeout(t)
  }, [])
  return null
}

function Gate() {
  const token = useAuthStore(s => s.token)
  useEffect(() => { applyTheme(); applyAppearance() }, [])
  if (!token) {
    return (
      <>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Registro />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <PwaFixes />
      </>
    )
  }
  return <><AuthedRoutes /><AddSheet /><ConfirmHost /><Toasts /><PwaFixes /><CategoryEmojiSync /><Prefetch /><PushNavigate /></>
}

function Toasts() {
  const pc = useIsPC()
  return <ToastHost pc={pc} />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Gate />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
