// Compatibilidad: los antiguos "features" ahora son módulos de las preferencias
// del usuario (ver lib/preferences.ts), guardados en el servidor.
import { MODULES, type ModuleId } from './preferences'

export const FEATURES = MODULES
export type FeatureId = ModuleId
