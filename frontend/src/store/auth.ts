import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { authApi, type User } from '@/lib/api'
import { forgetQueries } from '@/lib/queryPersist'

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('fm_token', token)
        set({ user, token })
      },
      logout: () => {
        // Cierra la sesión también en el servidor (sale de "Sesiones abiertas").
        if (localStorage.getItem('fm_token')) authApi.logout().catch(() => {})
        localStorage.removeItem('fm_token')
        forgetQueries()
        set({ user: null, token: null })
        // Lazily clear query cache to avoid stale data on next login
        import('@/lib/queryClient').then(m => m.queryClient.clear()).catch(() => {})
      },
    }),
    { name: 'fm-auth', partialize: (s) => ({ user: s.user, token: s.token }) }
  )
)
