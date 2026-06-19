import { create } from 'zustand'
import { getAllEnabled, setEnabled } from '@/lib/features'
import type { FeatureId } from '@/lib/features'

interface FeaturesStore {
  features: Record<FeatureId, boolean>
  toggle: (id: FeatureId, on: boolean) => void
  reload: () => void
}

export const useFeaturesStore = create<FeaturesStore>(set => ({
  features: getAllEnabled(),
  toggle: (id, on) => {
    setEnabled(id, on)
    set(s => ({ features: { ...s.features, [id]: on } }))
  },
  reload: () => set({ features: getAllEnabled() }),
}))
