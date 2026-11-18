// Compatibilidad con las pantallas que usan useFeaturesStore: lee y escribe
// los módulos de las preferencias del usuario.
import { usePreferencesStore } from './preferences'
import { isModuleOn, MODULE_IDS, type ModuleId, type Preferences } from '@/lib/preferences'

interface FeaturesView {
  features: Record<ModuleId, boolean>
  toggle: (id: ModuleId, on: boolean) => void
}

function featuresOf(p: Preferences): Record<ModuleId, boolean> {
  return Object.fromEntries(MODULE_IDS.map(id => [id, isModuleOn(p, id)])) as Record<ModuleId, boolean>
}

const toggle = (id: ModuleId, on: boolean) => {
  usePreferencesStore.getState().update({ modules: { [id]: on } }).catch(() => {})
}

export function useFeaturesStore(): FeaturesView
export function useFeaturesStore<T>(selector: (s: FeaturesView) => T): T
export function useFeaturesStore<T>(selector?: (s: FeaturesView) => T) {
  const prefs = usePreferencesStore(s => s.prefs)
  const view: FeaturesView = { features: featuresOf(prefs), toggle }
  return selector ? selector(view) : view
}
