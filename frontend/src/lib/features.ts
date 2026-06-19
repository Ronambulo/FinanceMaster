export const FEATURES = {
  fire:         { key: 'fm-feat-fire',          label: 'Calculadora FIRE',  desc: '¿Cuándo puedes retirarte?',            default: true  },
  achievements: { key: 'fm-feat-achievements',  label: 'Logros',            desc: 'Gamificación y retos financieros',     default: true  },
  babySteps:    { key: 'fm-baby-steps-enabled', label: '7 Baby Steps',      desc: 'Plan de finanzas de Dave Ramsey',      default: false },
  debts:        { key: 'fm-feat-debts',         label: 'Deudas',            desc: 'Seguimiento de préstamos y créditos',  default: true  },
  goals:        { key: 'fm-feat-goals',         label: 'Objetivos',         desc: 'Metas de ahorro e inversión',          default: true  },
  recurring:    { key: 'fm-feat-recurring',     label: 'Recurrentes',       desc: 'Suscripciones y pagos fijos',          default: true  },
} as const

export type FeatureId = keyof typeof FEATURES

export function isEnabled(id: FeatureId): boolean {
  const val = localStorage.getItem(FEATURES[id].key)
  return val === null ? FEATURES[id].default : val === 'true'
}

export function setEnabled(id: FeatureId, on: boolean): void {
  localStorage.setItem(FEATURES[id].key, on ? 'true' : 'false')
}

export function getAllEnabled(): Record<FeatureId, boolean> {
  return Object.fromEntries(
    (Object.keys(FEATURES) as FeatureId[]).map(id => [id, isEnabled(id)])
  ) as Record<FeatureId, boolean>
}
