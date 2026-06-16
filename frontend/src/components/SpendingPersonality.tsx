import { useQuery } from '@tanstack/react-query'
import { dashApi } from '@/lib/api'
import { useMemo } from 'react'

interface Personality {
  emoji: string
  name: string
  desc: string
  color: string
}

const PERSONALITIES: Personality[] = [
  { emoji: '🍽️', name: 'El Sibarita',    color: '#f59e0b', desc: 'Vives para disfrutar. Restaurantes, delivery y bares son tu segundo hogar.' },
  { emoji: '💻', name: 'El Techie',       color: '#6366f1', desc: 'Suscripciones, gadgets y software. Si existe en digital, lo tienes.' },
  { emoji: '✈️', name: 'El Viajero',      color: '#0ea5e9', desc: 'Tu dinero tiene pasaporte. Transporte y alojamiento mandan en tus gastos.' },
  { emoji: '🐜', name: 'La Hormiga',      color: '#22c55e', desc: 'Ahorras más del 30%. El interés compuesto es tu mejor amigo.' },
  { emoji: '🎉', name: 'El Vividor',      color: '#ef4444', desc: 'Gastas más de lo que ingresas. Hora de hacer un balance real.' },
  { emoji: '📈', name: 'El Inversor',     color: '#a78bfa', desc: 'Tu dinero trabaja para ti. Portfolio y fondos indexados en el radar.' },
  { emoji: '⚖️', name: 'El Equilibrado', color: '#14b8a6', desc: 'Todo controlado. Ninguna categoría se desmanda. Finanzas zen.' },
  { emoji: '🕵️', name: 'El Misterioso',  color: '#94a3b8', desc: 'Muchas transacciones sin categoría. ¿Qué se esconde ahí?' },
]

function getPersonality(
  categories: { category_name: string; total: number }[],
  income: number,
  expenses: number,
  savingsRate: number,
): Personality & { pct: number; detail: string } {
  const total = expenses || 1

  const restaurantPct = categories
    .filter(c => /restaur|comida|delivery|bar|cafeter|food/i.test(c.category_name))
    .reduce((s, c) => s + c.total, 0) / total

  const techPct = categories
    .filter(c => /suscri|spotify|netflix|amazon|software|tech|electr|digital/i.test(c.category_name))
    .reduce((s, c) => s + c.total, 0) / total

  const travelPct = categories
    .filter(c => /viaje|transporte|vuelo|hotel|aloj|rental|uber|cabify/i.test(c.category_name))
    .reduce((s, c) => s + c.total, 0) / total

  const unknownPct = categories
    .filter(c => /sin categ|sin cat|unknown/i.test(c.category_name))
    .reduce((s, c) => s + c.total, 0) / total

  if (expenses > income * 1.05)
    return { ...PERSONALITIES[4], pct: Math.round((expenses / income - 1) * 100), detail: `${Math.round((expenses / income - 1) * 100)}% más gastos que ingresos` }
  if (savingsRate > 0.30)
    return { ...PERSONALITIES[3], pct: Math.round(savingsRate * 100), detail: `Tasa de ahorro del ${Math.round(savingsRate * 100)}%` }
  if (restaurantPct > 0.25)
    return { ...PERSONALITIES[0], pct: Math.round(restaurantPct * 100), detail: `${Math.round(restaurantPct * 100)}% del gasto en restauración` }
  if (techPct > 0.20)
    return { ...PERSONALITIES[1], pct: Math.round(techPct * 100), detail: `${Math.round(techPct * 100)}% del gasto en tech y suscripciones` }
  if (travelPct > 0.15)
    return { ...PERSONALITIES[2], pct: Math.round(travelPct * 100), detail: `${Math.round(travelPct * 100)}% del gasto en viajes y transporte` }
  if (unknownPct > 0.40)
    return { ...PERSONALITIES[7], pct: Math.round(unknownPct * 100), detail: `${Math.round(unknownPct * 100)}% de movimientos sin categorizar` }

  return { ...PERSONALITIES[6], pct: 0, detail: 'Distribución equilibrada entre categorías' }
}

export function SpendingPersonality() {
  const threeMonthsAgo = useMemo(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3)
    return d.toISOString().slice(0, 10)
  }, [])
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const { data: catData } = useQuery({
    queryKey: ['by-cat-personality', threeMonthsAgo],
    queryFn: () => dashApi.byCategory({ date_from: threeMonthsAgo, date_to: today, tx_type: 'expense' }),
  })
  const { data: overview } = useQuery({
    queryKey: ['overview'],
    queryFn: () => dashApi.overview(),
  })

  const personality = useMemo(() => {
    if (!catData || !overview) return null
    const income   = overview.income_month || 1
    const expenses = overview.expenses_month || 0
    const savingsRate = Math.max(0, (income - expenses) / income)
    return getPersonality(catData, income, expenses, savingsRate)
  }, [catData, overview])

  if (!personality) return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-card p-5 shadow-[0_4px_24px_rgba(0,0,0,0.4)] h-full min-h-[120px] flex items-center justify-center">
      <p className="text-xs text-muted-foreground">Calculando perfil…</p>
    </div>
  )

  return (
    <div
      className="relative overflow-hidden rounded-2xl bg-card p-5 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
      style={{ border: `1px solid ${personality.color}28` }}
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full blur-3xl opacity-20"
        style={{ background: personality.color }}
      />
      <div
        className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full blur-2xl opacity-10"
        style={{ background: personality.color }}
      />

      <div className="relative">
        {/* Label */}
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-3"
           style={{ color: personality.color + 'aa' }}>
          Tu perfil financiero
        </p>

        {/* Main content */}
        <div className="flex items-center gap-4">
          {/* Emoji badge */}
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-4xl shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${personality.color}25, ${personality.color}10)`,
              border: `1px solid ${personality.color}35`,
              boxShadow: `0 4px 20px ${personality.color}20`,
            }}
          >
            {personality.emoji}
          </div>

          {/* Text */}
          <div className="min-w-0">
            <p className="text-lg font-bold leading-tight tracking-tight"
               style={{ color: personality.color }}>
              {personality.name}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              {personality.desc}
            </p>
          </div>
        </div>

        {/* Detail stat pill */}
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1"
             style={{ background: personality.color + '15', border: `1px solid ${personality.color}25` }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: personality.color }} />
          <span className="text-[11px] font-medium" style={{ color: personality.color + 'dd' }}>
            {personality.detail}
          </span>
        </div>
      </div>
    </div>
  )
}
