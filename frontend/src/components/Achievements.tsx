import { useQuery } from '@tanstack/react-query'
import { dashApi, txApi, goalApi, portfolioApi, recurringApi } from '@/lib/api'
import { useMemo, useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

const LS_KEY = 'fm_achievements_unlocked'
function loadPersisted(): Map<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
    // backward compat: old format was string[]
    if (Array.isArray(raw)) return new Map(raw.map((id: string) => [id, '']))
    return new Map(Object.entries(raw))
  } catch { return new Map() }
}
function savePersisted(map: Map<string, string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(map))) } catch {}
}

interface Achievement {
  id: string
  emoji: string
  name: string
  desc: string
  unlocked: boolean
  color: string
  category: string
  progress?: number
  progressMax?: number
  progressUnit?: string
  unlockedAt?: string
}

function AchievementsCompact({ achievements, unlocked, total }: {
  achievements: Achievement[]
  unlocked: number
  total: number
}) {
  const [hovered,  setHovered]  = useState<Achievement | null>(null)
  const [selected, setSelected] = useState<Achievement | null>(null)
  const displayed = selected ?? hovered ?? null
  const pct = Math.round((unlocked / total) * 100)

  return (
    <div className="space-y-3">
      {/* Header + progress */}
      <div className="flex items-center gap-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold shrink-0">Logros</p>
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{unlocked}/{total}</span>
      </div>

      {/* Badge circles */}
      <div className="flex flex-wrap gap-2">
        {achievements.map(a => {
          const isSelected = selected?.id === a.id
          return (
            <div
              key={a.id}
              onMouseEnter={() => setHovered(a)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => setSelected(prev => prev?.id === a.id ? null : a)}
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl cursor-pointer select-none transition-all duration-200',
                a.unlocked ? 'opacity-100 hover:scale-110' : 'opacity-15 grayscale',
                isSelected && 'scale-110',
              )}
              style={a.unlocked
                ? {
                    background: a.color + '20',
                    border: `2px solid ${a.color}${isSelected ? 'ff' : '55'}`,
                    boxShadow: isSelected ? `0 0 0 3px ${a.color}40, 0 0 16px ${a.color}50` : `0 0 10px ${a.color}30`,
                  }
                : { background: 'hsl(var(--muted)/0.25)', border: '1.5px solid hsl(var(--border))' }}
            >
              {a.emoji}
            </div>
          )
        })}
      </div>

      {/* Fixed-height info area — never changes the card's height */}
      <div
        className="h-[3.25rem] rounded-xl px-3 py-2 transition-all duration-150 flex items-center"
        style={displayed
          ? { background: displayed.color + '12', border: `1px solid ${displayed.color}30` }
          : { border: '1px solid transparent' }}
      >
        {displayed ? (
          <div className="flex items-center gap-2.5 w-full">
            <span className="text-lg leading-none shrink-0">{displayed.emoji}</span>
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <span className="text-xs font-semibold shrink-0" style={{ color: displayed.color }}>{displayed.name}</span>
              {!displayed.unlocked && <span className="text-[10px] text-muted-foreground/50 shrink-0">🔒</span>}
              {selected && <span className="text-[9px] text-muted-foreground/30 shrink-0">· fijado</span>}
              <span className="text-[10px] text-muted-foreground/40 truncate shrink">· {displayed.desc}</span>
              {displayed.unlocked && displayed.unlockedAt && (
                <span className="text-[10px] shrink-0 ml-auto pl-1" style={{ color: displayed.color + '99' }}>
                  ✓ {new Date(displayed.unlockedAt + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>
            {displayed.progressMax !== undefined && displayed.progress !== undefined && (
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-28 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.round((displayed.progress / displayed.progressMax) * 100)}%`,
                      background: displayed.color,
                    }}
                  />
                </div>
                <span className="text-[10px] shrink-0" style={{ color: displayed.color }}>
                  {displayed.progress.toLocaleString('es')}/{displayed.progressMax.toLocaleString('es')}{displayed.progressUnit === '%' ? '%' : ` ${displayed.progressUnit}`}
                </span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground/25 select-none">Pasa el cursor sobre un logro</p>
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
    const trendData       = trend ?? []
    // Use the best savings rate from any of the last 12 complete calendar months
    // (avoids current incomplete payroll-cycle giving a distorted rate)
    const bestSavingsRate = (() => {
      const currentRate = income > 0 ? savings / income : 0
      const trendRates  = trendData.filter(m => m.income > 0).map(m => m.savings / m.income)
      return trendRates.length ? Math.max(currentRate, ...trendRates) : currentRate
    })()
    const savingsRate     = bestSavingsRate
    const portfolioVal    = portfolio?.total_market_value ?? portfolio?.total_invested ?? 0
    const portfolioProfit = portfolio?.total_unrealized_pnl ?? 0
    const dividends       = portfolio?.total_dividends ?? 0
    const openPositions   = (portfolio?.positions ?? []).filter(p => p.shares > 0.0001).length
    const totalInvested   = portfolio?.total_invested ?? 0
    const completedGoals  = (goals ?? []).filter(g => g.target_amount && g.current_amount >= g.target_amount)
    const activeGoals     = (goals ?? []).filter(g => g.is_active)
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
        progress: Math.min(txCount, 1), progressMax: 1, progressUnit: 'tx',
      },
      {
        id: 'importer-10',
        emoji: '📥',
        name: 'Primeros datos',
        desc: '+10 transacciones registradas',
        unlocked: txCount >= 10,
        color: '#6366f1',
        category: 'Inicio',
        progress: Math.min(txCount, 10), progressMax: 10, progressUnit: 'tx',
      },
      {
        id: 'importer-50',
        emoji: '📦',
        name: 'Importador',
        desc: '+50 transacciones registradas',
        unlocked: txCount >= 50,
        color: '#6366f1',
        category: 'Inicio',
        progress: Math.min(txCount, 50), progressMax: 50, progressUnit: 'tx',
      },
      {
        id: 'analyst',
        emoji: '🏭',
        name: 'Analista',
        desc: '+200 transacciones registradas',
        unlocked: txCount >= 200,
        color: '#8b5cf6',
        category: 'Inicio',
        progress: Math.min(txCount, 200), progressMax: 200, progressUnit: 'tx',
      },
      {
        id: 'historian',
        emoji: '📚',
        name: 'Historiador',
        desc: '+500 transacciones registradas',
        unlocked: txCount >= 500,
        color: '#a78bfa',
        category: 'Inicio',
        progress: Math.min(txCount, 500), progressMax: 500, progressUnit: 'tx',
      },
      {
        id: 'data-hoarder',
        emoji: '🗄️',
        name: 'Archivista',
        desc: '+1.000 transacciones registradas',
        unlocked: txCount >= 1000,
        color: '#7c3aed',
        category: 'Inicio',
        progress: Math.min(txCount, 1000), progressMax: 1000, progressUnit: 'tx',
      },
      // ── Ahorro ──────────────────────────────────────────────────────
      {
        id: 'saver',
        emoji: '💰',
        name: 'Ahorrador',
        desc: 'Ahorro positivo este mes',
        unlocked: savings > 0 || positiveMonths > 0,
        color: '#f59e0b',
        category: 'Ahorro',
        progress: Math.max(0, Math.min(savings, 1)), progressMax: 1, progressUnit: '€',
      },
      {
        id: 'savings-rate-10',
        emoji: '🐜',
        name: 'La Hormiga',
        desc: 'Tasa de ahorro superior al 10%',
        unlocked: savingsRate >= 0.10,
        color: '#10b981',
        category: 'Ahorro',
        progress: Math.max(0, Math.round(Math.min(savingsRate, 0.10) * 100)), progressMax: 10, progressUnit: '%',
      },
      {
        id: 'savings-rate-20',
        emoji: '🦫',
        name: 'El Castor',
        desc: 'Tasa de ahorro superior al 20%',
        unlocked: savingsRate >= 0.20,
        color: '#059669',
        category: 'Ahorro',
        progress: Math.max(0, Math.round(Math.min(savingsRate, 0.20) * 100)), progressMax: 20, progressUnit: '%',
      },
      {
        id: 'savings-rate-35',
        emoji: '🦉',
        name: 'El Búho sabio',
        desc: 'Tasa de ahorro superior al 35%',
        unlocked: savingsRate >= 0.35,
        color: '#047857',
        category: 'Ahorro',
        progress: Math.max(0, Math.round(Math.min(savingsRate, 0.35) * 100)), progressMax: 35, progressUnit: '%',
      },
      {
        id: 'savings-rate-50',
        emoji: '🧙',
        name: 'Maestro del ahorro',
        desc: '¡Tasa de ahorro superior al 50%!',
        unlocked: savingsRate >= 0.50,
        color: '#065f46',
        category: 'Ahorro',
        progress: Math.max(0, Math.round(Math.min(savingsRate, 0.50) * 100)), progressMax: 50, progressUnit: '%',
      },
      {
        id: 'streak-3',
        emoji: '🔥',
        name: 'En racha',
        desc: '3 meses consecutivos en positivo',
        unlocked: consecutivePositive >= 3,
        color: '#ef4444',
        category: 'Ahorro',
        progress: Math.min(consecutivePositive, 3), progressMax: 3, progressUnit: 'meses',
      },
      {
        id: 'streak-6',
        emoji: '🌋',
        name: 'Racha de fuego',
        desc: '6 meses consecutivos en positivo',
        unlocked: consecutivePositive >= 6,
        color: '#dc2626',
        category: 'Ahorro',
        progress: Math.min(consecutivePositive, 6), progressMax: 6, progressUnit: 'meses',
      },
      {
        id: 'positive-months-6',
        emoji: '📆',
        name: 'Constante',
        desc: '6 meses con ahorro positivo (no consecutivos)',
        unlocked: positiveMonths >= 6,
        color: '#f97316',
        category: 'Ahorro',
        progress: Math.min(positiveMonths, 6), progressMax: 6, progressUnit: 'meses',
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
        progress: Math.round(Math.min(balance, 1_000)), progressMax: 1_000, progressUnit: '€',
      },
      {
        id: 'balance-5k',
        emoji: '💳',
        name: 'Colchón',
        desc: 'Balance superior a 5.000€',
        unlocked: balance >= 5_000,
        color: '#0d9488',
        category: 'Patrimonio',
        progress: Math.round(Math.min(balance, 5_000)), progressMax: 5_000, progressUnit: '€',
      },
      {
        id: 'wealth-10k',
        emoji: '🏦',
        name: 'Patrimonio',
        desc: 'Balance superior a 10.000€',
        unlocked: balance >= 10_000,
        color: '#0f766e',
        category: 'Patrimonio',
        progress: Math.round(Math.min(balance, 10_000)), progressMax: 10_000, progressUnit: '€',
      },
      {
        id: 'wealth-50k',
        emoji: '🏰',
        name: 'Fortaleza',
        desc: 'Balance superior a 50.000€',
        unlocked: balance >= 50_000,
        color: '#134e4a',
        category: 'Patrimonio',
        progress: Math.round(Math.min(balance, 50_000)), progressMax: 50_000, progressUnit: '€',
      },
      {
        id: 'interest-earner',
        emoji: '💹',
        name: 'Intereses',
        desc: 'Primeros intereses cobrados',
        unlocked: interestTotal > 0,
        color: '#06b6d4',
        category: 'Patrimonio',
        progress: Math.min(interestTotal, 1), progressMax: 1, progressUnit: '€',
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
        progress: Math.min(openPositions, 1), progressMax: 1, progressUnit: 'posiciones',
      },
      {
        id: 'diversified',
        emoji: '🌍',
        name: 'Diversificado',
        desc: '3 o más posiciones abiertas',
        unlocked: openPositions >= 3,
        color: '#8b5cf6',
        category: 'Inversiones',
        progress: Math.min(openPositions, 3), progressMax: 3, progressUnit: 'posiciones',
      },
      {
        id: 'portfolio-5k',
        emoji: '🌱',
        name: 'Cartera pequeña',
        desc: 'Portfolio con valor superior a 5.000€',
        unlocked: portfolioVal >= 5_000,
        color: '#7c3aed',
        category: 'Inversiones',
        progress: Math.round(Math.min(portfolioVal, 5_000)), progressMax: 5_000, progressUnit: '€',
      },
      {
        id: 'portfolio-10k',
        emoji: '🐉',
        name: 'Gran Inversor',
        desc: 'Portfolio con valor superior a 10.000€',
        unlocked: portfolioVal >= 10_000,
        color: '#f97316',
        category: 'Inversiones',
        progress: Math.round(Math.min(portfolioVal, 10_000)), progressMax: 10_000, progressUnit: '€',
      },
      {
        id: 'portfolio-50k',
        emoji: '🦅',
        name: 'Águila bursátil',
        desc: 'Portfolio con valor superior a 50.000€',
        unlocked: portfolioVal >= 50_000,
        color: '#ea580c',
        category: 'Inversiones',
        progress: Math.round(Math.min(portfolioVal, 50_000)), progressMax: 50_000, progressUnit: '€',
      },
      {
        id: 'portfolio-profit',
        emoji: '🟢',
        name: 'En verde',
        desc: 'Portfolio con beneficio no realizado positivo',
        unlocked: portfolioProfit > 0,
        color: '#22c55e',
        category: 'Inversiones',
        progress: portfolioProfit > 0 ? 1 : 0, progressMax: 1, progressUnit: '€',
      },
      {
        id: 'heavy-investor',
        emoji: '💎',
        name: 'Diamante',
        desc: 'Más de 10.000€ invertidos en total',
        unlocked: totalInvested >= 10_000,
        color: '#38bdf8',
        category: 'Inversiones',
        progress: Math.round(Math.min(totalInvested, 10_000)), progressMax: 10_000, progressUnit: '€',
      },
      {
        id: 'dividend-earner',
        emoji: '🍀',
        name: 'Dividendista',
        desc: 'Primeros dividendos cobrados',
        unlocked: dividends > 0,
        color: '#4ade80',
        category: 'Inversiones',
        progress: Math.min(dividends, 1), progressMax: 1, progressUnit: '€',
      },
      {
        id: 'dividend-100',
        emoji: '🌳',
        name: 'Árbol de dinero',
        desc: 'Más de 100€ en dividendos cobrados',
        unlocked: dividends >= 100,
        color: '#16a34a',
        category: 'Inversiones',
        progress: Math.round(Math.min(dividends, 100)), progressMax: 100, progressUnit: '€',
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
        progress: Math.min(activeGoals.length, 1), progressMax: 1, progressUnit: 'objetivos',
      },
      {
        id: 'multi-goal',
        emoji: '🗺️',
        name: 'Planificador',
        desc: '3 o más objetivos activos',
        unlocked: activeGoals.length >= 3,
        color: '#0284c7',
        category: 'Objetivos',
        progress: Math.min(activeGoals.length, 3), progressMax: 3, progressUnit: 'objetivos',
      },
      {
        id: 'goal-done',
        emoji: '🏆',
        name: 'Conseguidor',
        desc: 'Primer objetivo completado al 100%',
        unlocked: completedGoals.length >= 1,
        color: '#fbbf24',
        category: 'Objetivos',
        progress: Math.min(completedGoals.length, 1), progressMax: 1, progressUnit: 'completados',
      },
      {
        id: 'goal-done-3',
        emoji: '🥇',
        name: 'Campeón',
        desc: '3 objetivos completados',
        unlocked: completedGoals.length >= 3,
        color: '#eab308',
        category: 'Objetivos',
        progress: Math.min(completedGoals.length, 3), progressMax: 3, progressUnit: 'completados',
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
        progress: Math.min(activeRecurring, 1), progressMax: 1, progressUnit: 'recurrentes',
      },
      {
        id: 'recurring-5',
        emoji: '📡',
        name: 'Controlador',
        desc: '5 o más gastos recurrentes monitorizados',
        unlocked: activeRecurring >= 5,
        color: '#ec4899',
        category: 'Control',
        progress: Math.min(activeRecurring, 5), progressMax: 5, progressUnit: 'recurrentes',
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

  // Persist unlocked achievements — useState so date updates trigger re-render
  const [persisted, setPersisted] = useState<Map<string, string>>(() => loadPersisted())

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    let changed = false
    const next = new Map(persisted)
    withMaster.forEach(a => {
      if (a.unlocked && (!next.has(a.id) || next.get(a.id) === '')) {
        next.set(a.id, today)
        changed = true
      }
    })
    if (changed) { savePersisted(next); setPersisted(next) }
  }, [withMaster])  // eslint-disable-line react-hooks/exhaustive-deps

  const withPersisted = useMemo(() => withMaster.map(a => ({
    ...a,
    unlocked:   a.unlocked || persisted.has(a.id),
    unlockedAt: persisted.get(a.id) || undefined,
  })), [withMaster, persisted])

  const unlocked = withPersisted.filter(a => a.unlocked).length
  const total    = withPersisted.length

  if (compact) {
    return <AchievementsCompact achievements={withPersisted} unlocked={unlocked} total={total} />
  }

  const categories = [...new Set(withPersisted.map(a => a.category))]

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
        const catAchievements = withPersisted.filter(a => a.category === cat)
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
