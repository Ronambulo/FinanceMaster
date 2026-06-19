import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/lib/api'

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
        localStorage.removeItem('fm_token')
        set({ user: null, token: null })
        // Lazily clear query cache to avoid stale data on next login
        import('@/App').then(m => m.queryClient.clear()).catch(() => {})
      },
    }),
    { name: 'fm-auth', partialize: (s) => ({ user: s.user, token: s.token }) }
  )
)
