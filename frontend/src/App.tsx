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
import { Settings } from '@/pages/Settings'
import { useEffect } from 'react'
import { applyTheme, THEME_KEY, ACCENT_KEY } from '@/lib/theme'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  useEffect(() => {
    const themeId = localStorage.getItem(THEME_KEY) || 'dark-blue'
    const accentId = localStorage.getItem(ACCENT_KEY) || 'blue'
    applyTheme(themeId, accentId)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/registro" element={<Register />} />
            <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="transacciones" element={<Transactions />} />
              <Route path="portfolio" element={<Portfolio />} />
              <Route path="recurrentes" element={<Recurring />} />
              <Route path="deudas" element={<Debts />} />
              <Route path="objetivos" element={<Goals />} />
              <Route path="ajustes" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}
