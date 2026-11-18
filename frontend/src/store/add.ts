import { create } from 'zustand'
import type { TxKind } from '@/lib/movements'

// Hoja global de "Nuevo movimiento": se abre desde el botón +, el atajo N/T o /anadir.
interface AddStore {
  kind: TxKind | null
  open: (kind?: TxKind) => void
  close: () => void
}

export const useAddStore = create<AddStore>(set => ({
  kind: null,
  open: (kind = 'expense') => set({ kind }),
  close: () => set({ kind: null }),
}))

export const openAdd = (kind?: TxKind) => useAddStore.getState().open(kind)
