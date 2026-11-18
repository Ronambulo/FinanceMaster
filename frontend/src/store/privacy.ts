import { create } from 'zustand'

// Ocultar importes en pantalla. Es una comodidad de este dispositivo,
// por eso vive en el navegador y no en las preferencias del servidor.
const KEY = 'fm-hide-amounts'

function read(): boolean {
  try { return localStorage.getItem('fm-hide-on-open') === '1' || localStorage.getItem(KEY) === '1' } catch { return false }
}

interface PrivacyStore {
  hidden: boolean
  toggle: () => void
}

export const usePrivacyStore = create<PrivacyStore>((set, get) => ({
  hidden: read(),
  toggle: () => {
    const hidden = !get().hidden
    try { localStorage.setItem(KEY, hidden ? '1' : '0') } catch { /* sin almacenamiento */ }
    set({ hidden })
  },
}))

export const MASK = '•••'
