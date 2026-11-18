import { create } from 'zustand'
import { authApi } from '@/lib/api'
import { applyTheme } from '@/lib/theme'
import { setCurrencySymbol } from '@/lib/format'
import {
  CURRENCIES, DEFAULT_PREFERENCES, applyPatch, legacyMigration, sanitize,
  type Preferences, type PreferencesPatch,
} from '@/lib/preferences'

// Copia local para arrancar al instante con la última configuración conocida
// mientras llega la del servidor.
const CACHE_KEY = 'fm-prefs'

function readCache(): Preferences {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return sanitize(JSON.parse(raw))
  } catch { /* sin caché */ }
  return DEFAULT_PREFERENCES
}

function writeCache(p: Preferences) {
  setCurrencySymbol(CURRENCIES[p.currency].symbol)
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(p)) } catch { /* sin almacenamiento */ }
}

interface PreferencesStore {
  prefs: Preferences
  loaded: boolean
  load: () => Promise<void>
  update: (patch: PreferencesPatch) => Promise<void>
}

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  prefs: (() => { const p = readCache(); setCurrencySymbol(CURRENCIES[p.currency].symbol); return p })(),
  loaded: false,

  load: async () => {
    try {
      let p = sanitize(await authApi.getPreferences())
      if (!p.initialized) {
        // Usuario de antes del rediseño: subir lo que tenía en este navegador.
        let patch: PreferencesPatch = { modules: {} }
        try { patch = legacyMigration(localStorage) } catch { /* sin almacenamiento */ }
        p = sanitize(await authApi.updatePreferences(patch))
      }
      writeCache(p)
      applyTheme(p.theme)
      set({ prefs: p, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  update: async (patch) => {
    const before = get().prefs
    const optimistic = applyPatch(before, patch)
    writeCache(optimistic)
    set({ prefs: optimistic })
    if (patch.theme) applyTheme(patch.theme)
    try {
      const saved = sanitize(await authApi.updatePreferences(patch))
      writeCache(saved)
      set({ prefs: saved })
    } catch (e) {
      writeCache(before)
      set({ prefs: before })
      if (patch.theme) applyTheme(before.theme)
      throw e
    }
  },
}))
