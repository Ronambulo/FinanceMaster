import { create } from 'zustand'

interface TR2FAState {
  pending: boolean
  show: boolean
  setPending: () => void
  open: () => void
  close: () => void
  clear: () => void
}

export const useTR2FAStore = create<TR2FAState>()((set) => ({
  pending: false,
  show: false,
  setPending: () => set({ pending: true, show: true }),
  open:  () => set({ show: true }),
  close: () => set({ show: false }),
  clear: () => set({ pending: false, show: false }),
}))
