import { useQuery } from '@tanstack/react-query'
import { dashApi, txApi, goalApi, portfolioApi, recurringApi } from '@/lib/api'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

interface Achievement {
  id: string
  emoji: string
  name: string
  desc: string
  unlocked: boolean
  color: string
  category: string
}

function AchievementsCompact({ achievements, unlocked, total }: {
  achievements: Achievement[]
  unlocked: number
  total: number
}) {
  const [hovered, setHovered] = useState<Achievement | null>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Logros</p>
        <span className="text-[10px] text-muted-foreground">{unlocked}/{total}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {achievements.map(a => (
          <div
            key={a.id}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2 py-1 transition-all cursor-default',
              a.unlocked ? 'opacity-100' : 'opacity-25 grayscale',
            )}
            style={a.unlocked
              ? { background: a.color + '18', border: `1px solid ${a.color}35` }
              : { background: 'hsl(var(--muted)/0.4)', border: '1px solid hsl(var(--border))' }}
            onMouseEnter={() => setHovered(a)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="text-sm leading-none">{a.emoji}</span>
            <span
              className="text-[10px] font-medium leading-none"
              style={a.unlocked ? { color: a.color } : { color: 'hsl(var(--muted-foreground))' }}
            >
              {a.name}
            </span>
          </div>
        ))}
      </div>
      <div className={cn(
        'rounded-lg px-3 py-2 text-xs transition-all duration-150 min-h-[2rem]',
        hovered ? 'opacity-100' : 'opacity-0',
      )}
        style={hovered ? { background: hovered.color + '12', border: `1px solid ${hovered.color}25` } : {}}
      >
        {hovered && (
          <div className="flex items-center gap-2">
            <span className="text-base">{hovered.emoji}</span>
            <div>
              <span className="font-semibold" style={{ color: hovered.color }}>{hovered.name}</span>
              {' — '}
              <span className="text-muted-foreground">{hovered.desc}</span>
              {!hovered.unlocked && <span className="ml-1 text-muted-foreground/50">🔒 Bloqueado</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function Achievements({ compact = false }: { compact?: boolean }) {
  const { data: overview  } = useQuery({ queryKey: ['overview'],              queryFn: () => dashApi.overview() })
  const { data: txList    } = useQuery({ queryKey: ['tx-count'],              queryFn: () => txApi.list({ page: 1, page_size: 1, account_category: 'CASH' }) })
  const { data: goals     } = useQuery({ queryKey: ['goals'],                 queryFn: goalApi.list })
  const { data: portfolio } = useQuery({ queryKey: ['portfolio-performance'], queryFn: portfolioApi.performance })
  const { data: trend     } = useQuery({ queryKey: ['monthly-trend-ach'],     queryFn: () => dashApi.monthlyTrend(12) })
  const { data: recurring } = useQuery({ queryKey: ['recurring'],             queryFn: recurringApi.list })

  const achievements: Achievement[] = useMemo(() => {
    const txCount         = txList?.total ?? 0
    const balance         = overview?.balance ?? 0
    const income          = overview?.income_month ?? 0
    const expenses        = overview?.expenses_month ?? 0
    const savings         = income - expenses
    const savingsRate     = income > 0 ? savings / income : 0
    const portfolioVal    = portfolio?.total_market_value ?? portfolio?.total_invested ?? 0
    const portfolioProfit = portfolio?.total_unrealized_pnl ?? 0
    const dividends       = portfolio?.total_dividends ?? 0
    const openPositions   = (portfolio?.positions ?? []).filter(p => p.shares > 0.0001).length
    const totalInvested   = portfolio?.total_invested ?? 0
    const completedGoals  = (goals ?? []).filter(g => g.target_amount && g.current_amount >= g.target_amount)
    const activeGoals     = (goals ?? []).filter(g => g.is_active)
    const trendData       = trend ?? []
    const positiveMonths  = trendData.filter(m => m.savings > 0).length
    const consecutivePositive = (() => {
      let count = 0
      for (let i = trendData.length - 1; i >= 0; i--) {
        if (trendData[i].savings > 0) count++
        else break
      }
      return count
    })()
    const activeRecurring  = (recurring ?? []).filter(r => r.is_active).length
    const interestTotal    = overview?.interest_total ?? 0

    return [
      // ── Primeros pasos ──────────────────────────────────────────────
      {
        id: 'first-tx',
        emoji: '🌱',
        name: 'Primer paso',
        desc: 'Primera transacción importada',
        unlocked: txCount >= 1,
        color: '#22c55e',
        category: 'Inicio',
      },
      {
        id: 'importer-10',
        emoji: '📥',
        name: 'Primeros datos',
        desc: '+10 transacciones registradas',
        unlocked: txCount >= 10,
        color: '#6366f1',
        category: 'Inicio',
      },
      {
        id: 'importer-50',
        emoji: '📦',
        name: 'Importador',
        desc: '+50 transacciones registradas',
        unlocked: txCount >= 50,
        color: '#6366f1',
        category: 'Inicio',
      },
      {
        id: 'analyst',
        emoji: '🏭',
        name: 'Analista',
        desc: '+200 transacciones registradas',
        unlocked: txCount >= 200,
        color: '#8b5cf6',
        category: 'Inicio',
      },
      {
        id: 'historian',
        emoji: '📚',
        name: 'Historiador',
        desc: '+500 transacciones registradas',
        unlocked: txCount >= 500,
        color: '#a78bfa',
        category: 'Inicio',
      },
      {
        id: 'data-hoarder',
        emoji: '🗄️',
        name: 'Archivista',
        desc: '+1.000 transacciones registradas',
        unlocked: txCount >= 1000,
        color: '#7c3aed',
        category: 'Inicio',
      },
      // ── Ahorro ──────────────────────────────────────────────────────
      {
        id: 'saver',
        emoji: '💰',
        name: 'Ahorrador',
        desc: 'Ahorro positivo este mes',
        unlocked: savings > 0,
        color: '#f59e0b',
        category: 'Ahorro',
      },
      {
        id: 'savings-rate-10',
        emoji: '🐜',
        name: 'La Hormiga',
        desc: 'Tasa de ahorro superior al 10%',
        unlocked: savingsRate >= 0.10,
        color: '#10b981',
        category: 'Ahorro',
      },
      {
        id: 'savings-rate-20',
        emoji: '🦫',
        name: 'El Castor',
        desc: 'Tasa de ahorro superior al 20%',
        unlocked: savingsRate >= 0.20,
        color: '#059669',
        category: 'Ahorro',
      },
      {
        id: 'savings-rate-35',
        emoji: '🦉',
        name: 'El Búho sabio',
        desc: 'Tasa de ahorro superior al 35%',
        unlocked: savingsRate >= 0.35,
        color: '#047857',
        category: 'Ahorro',
      },
      {
        id: 'savings-rate-50',
        emoji: '🧙',
        name: 'Maestro del ahorro',
        desc: '¡Tasa de ahorro superior al 50%!',
        unlocked: savingsRate >= 0.50,
        color: '#065f46',
        category: 'Ahorro',
      },
      {
        id: 'streak-3',
        emoji: '🔥',
        name: 'En racha',
        desc: '3 meses consecutivos en positivo',
        unlocked: consecutivePositive >= 3,
        color: '#ef4444',
        category: 'Ahorro',
      },
      {
        id: 'streak-6',
        emoji: '🔥🔥',
        name: 'Racha de fuego',
        desc: '6 meses consecutivos en positivo',
        unlocked: consecutivePositive >= 6,
        color: '#dc2626',
        category: 'Ahorro',
      },
      {
        id: 'positive-months-6',
        emoji: '📆',
        name: 'Constante',
        desc: '6 meses con ahorro positivo (no consecutivos)',
        unlocked: positiveMonths >= 6,
        color: '#f97316',
        category: 'Ahorro',
      },
      // ── Patrimonio ──────────────────────────────────────────────────
      {
        id: 'balance-1k',
        emoji: '💵',
        name: 'Primer millar',
        desc: 'Balance superior a 1.000€',
        unlocked: balance >= 1_000,
        color: '#14b8a6',
        category: 'Patrimonio',
      },
      {
        id: 'balance-5k',
        emoji: '💳',
        name: 'Colchón',
        desc: 'Balance superior a 5.000€',
        unlocked: balance >= 5_000,
        color: '#0d9488',
        category: 'Patrimonio',
      },
      {
        id: 'wealth-10k',
        emoji: '🏦',
        name: 'Patrimonio',
        desc: 'Balance superior a 10.000€',
        unlocked: balance >= 10_000,
        color: '#0f766e',
        category: 'Patrimonio',
      },
      {
        id: 'wealth-50k',
        emoji: '🏰',
        name: 'Fortaleza',
        desc: 'Balance superior a 50.000€',
        unlocked: balance >= 50_000,
        color: '#134e4a',
        category: 'Patrimonio',
      },
      {
        id: 'interest-earner',
        emoji: '💹',
        name: 'Intereses',
        desc: 'Primeros intereses cobrados',
        unlocked: interestTotal > 0,
        color: '#06b6d4',
        category: 'Patrimonio',
      },
      // ── Inversiones ─────────────────────────────────────────────────
      {
        id: 'investor',
        emoji: '📈',
        name: 'Inversor',
        desc: 'Primera posición en portfolio',
        unlocked: openPositions >= 1,
        color: '#a78bfa',
        category: 'Inversiones',
      },
      {
        id: 'diversified',
        emoji: '🌍',
        name: 'Diversificado',
        desc: '3 o más posiciones abiertas',
        unlocked: openPositions >= 3,
        color: '#8b5cf6',
        category: 'Inversiones',
      },
      {
        id: 'portfolio-5k',
        emoji: '🌱',
        name: 'Cartera pequeña',
        desc: 'Portfolio con valor superior a 5.000€',
        unlocked: portfolioVal >= 5_000,
        color: '#7c3aed',
        category: 'Inversiones',
      },
      {
        id: 'portfolio-10k',
        emoji: '🐉',
        name: 'Gran Inversor',
        desc: 'Portfolio con valor superior a 10.000€',
        unlocked: portfolioVal >= 10_000,
        color: '#f97316',
        category: 'Inversiones',
      },
      {
        id: 'portfolio-50k',
        emoji: '🦅',
        name: 'Águila bursátil',
        desc: 'Portfolio con valor superior a 50.000€',
        unlocked: portfolioVal >= 50_000,
        color: '#ea580c',
        category: 'Inversiones',
      },
      {
        id: 'portfolio-profit',
        emoji: '🟢',
        name: 'En verde',
        desc: 'Portfolio con beneficio no realizado positivo',
        unlocked: portfolioProfit > 0,
        color: '#22c55e',
        category: 'Inversiones',
      },
      {
        id: 'heavy-investor',
        emoji: '💎',
        name: 'Diamante',
        desc: 'Más de 10.000€ invertidos en total',
        unlocked: totalInvested >= 10_000,
        color: '#38bdf8',
        category: 'Inversiones',
      },
      {
        id: 'dividend-earner',
        emoji: '🍀',
        name: 'Dividendista',
        desc: 'Primeros dividendos cobrados',
        unlocked: dividends > 0,
        color: '#4ade80',
        category: 'Inversiones',
      },
      {
        id: 'dividend-100',
        emoji: '🌳',
        name: 'Árbol de dinero',
        desc: 'Más de 100€ en dividendos cobrados',
        unlocked: dividends >= 100,
        color: '#16a34a',
        category: 'Inversiones',
      },
      // ── Objetivos ───────────────────────────────────────────────────
      {
        id: 'first-goal',
        emoji: '🎯',
        name: 'Estratega',
        desc: 'Primer objetivo financiero creado',
        unlocked: activeGoals.length >= 1,
        color: '#0ea5e9',
        category: 'Objetivos',
      },
      {
        id: 'multi-goal',
        emoji: '🗺️',
        name: 'Planificador',
        desc: '3 o más objetivos activos',
        unlocked: activeGoals.length >= 3,
        color: '#0284c7',
        category: 'Objetivos',
      },
      {
        id: 'goal-done',
        emoji: '🏆',
        name: 'Conseguidor',
        desc: 'Primer objetivo completado al 100%',
        unlocked: completedGoals.length >= 1,
        color: '#fbbf24',
        category: 'Objetivos',
      },
      {
        id: 'goal-done-3',
        emoji: '🥇',
        name: 'Campeón',
        desc: '3 objetivos completados',
        unlocked: completedGoals.length >= 3,
        color: '#eab308',
        category: 'Objetivos',
      },
      // ── Control de gastos ────────────────────────────────────────────
      {
        id: 'recurring-detected',
        emoji: '🔁',
        name: 'Radar de gastos',
        desc: 'Primer gasto recurrente detectado',
        unlocked: activeRecurring >= 1,
        color: '#f472b6',
        category: 'Control',
      },
      {
        id: 'recurring-5',
        emoji: '📡',
        name: 'Controlador',
        desc: '5 o más gastos recurrentes monitorizados',
        unlocked: activeRecurring >= 5,
        color: '#ec4899',
        category: 'Control',
      },
      // ── Maestro ─────────────────────────────────────────────────────
      {
        id: 'all',
        emoji: '⭐',
        name: 'Maestro',
        desc: 'Todos los logros desbloqueados',
        unlocked: false,
        color: '#eab308',
        category: 'Especial',
      },
    ]
  }, [overview, txList, goals, portfolio, trend, recurring])

  const withMaster = useMemo(() => {
    const nonMaster = achievements.filter(a => a.id !== 'all')
    const allDone = nonMaster.every(a => a.unlocked)
    return achievements.map(a => a.id === 'all' ? { ...a, unlocked: allDone } : a)
  }, [achievements])

  const unlocked = withMaster.filter(a => a.unlocked).length
  const total    = withMaster.length

  if (compact) {
    return <AchievementsCompact achievements={withMaster} unlocked={unlocked} total={total} />
  }

  const categories = [...new Set(withMaster.map(a => a.category))]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Logros</h2>
          <p className="text-xs text-muted-foreground">{unlocked} / {total} desbloqueados</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-24 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${(unlocked / total) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{Math.round((unlocked / total) * 100)}%</span>
        </div>
      </div>

      {categories.map(cat => {
        const catAchievements = withMaster.filter(a => a.category === cat)
        return (
          <div key={cat} className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">{cat}</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {catAchievements.map(a => (
                <div
                  key={a.id}
                  className={cn(
                    'relative flex flex-col items-center gap-1.5 rounded-xl p-2.5 text-center transition-all',
                    a.unlocked ? 'opacity-100' : 'opacity-30 grayscale',
                  )}
                  style={a.unlocked ? { background: a.color + '15', border: `1px solid ${a.color}30` } : { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  title={`${a.name} — ${a.desc}`}
                >
                  <span className="text-2xl leading-none">{a.emoji}</span>
                  <span className="text-[10px] font-medium leading-tight text-center" style={a.unlocked ? { color: a.color } : {}}>
                    {a.name}
                  </span>
                  <span className="text-[9px] text-muted-foreground/50 leading-tight text-center hidden sm:block">
                    {a.desc}
                  </span>
                  {!a.unlocked && (
                    <span className="absolute top-1.5 right-1.5 text-[8px] text-muted-foreground/40">🔒</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
