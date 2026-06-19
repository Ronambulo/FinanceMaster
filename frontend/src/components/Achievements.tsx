import { useQuery } from '@tanstack/react-query'
import { dashApi, txApi, goalApi, portfolioApi, recurringApi } from '@/lib/api'
import { useMemo, useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import { Lock, Trophy, Sparkles } from 'lucide-react'

/* ── Persistence ───────────────────────────────────────────────────── */
const LS_KEY = 'fm_achievements_unlocked'

function loadPersisted(): Map<string, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')
    if (Array.isArray(raw)) return new Map(raw.map((id: string) => [id, '']))
    return new Map(Object.entries(raw))
  } catch { return new Map() }
}
function savePersisted(map: Map<string, string>) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(map))) } catch {}
}

/* ── Types ─────────────────────────────────────────────────────────── */
export interface Achievement {
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

const CATEGORY_ORDER = ['Inicio', 'Ahorro', 'Patrimonio', 'Inversiones', 'Objetivos', 'Control', 'Especial']

/* ── Compact sidebar/dashboard card ───────────────────────────────── */
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
      <div className="flex items-center gap-3">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold shrink-0">Logros</p>
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground shrink-0">{unlocked}/{total}</span>
      </div>

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
          <p className="text-[10px] text-muted-foreground/25 select-none">Pasa el cursor sobre un logro para ver detalles</p>
        )}
      </div>
    </div>
  )
}

/* ── Full achievement card ─────────────────────────────────────────── */
function AchievementCard({ a }: { a: Achievement }) {
  const pct = a.progressMax ? Math.min(100, Math.round(((a.progress ?? 0) / a.progressMax) * 100)) : (a.unlocked ? 100 : 0)

  const progressLabel = (() => {
    if (a.progressMax === undefined || a.progress === undefined) return null
    // When unlocked, cap the displayed value at the target so we don't show "58% / 10%"
    const display = a.unlocked ? Math.min(a.progress, a.progressMax) : a.progress
    const cur = display.toLocaleString('es-ES')
    const max = a.progressMax.toLocaleString('es-ES')
    return a.progressUnit === '%' ? `${cur}% / ${max}%` : `${cur} / ${max} ${a.progressUnit ?? ''}`
  })()

  return (
    <div
      className={cn(
        'relative flex flex-col gap-2.5 rounded-2xl p-4 transition-all duration-200',
        !a.unlocked && 'opacity-60',
      )}
      style={a.unlocked
        ? {
            background: a.color + '14',
            border: `1px solid ${a.color}45`,
            boxShadow: `0 2px 20px ${a.color}18`,
          }
        : {
            background: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
          }}
    >
      {/* Emoji + lock */}
      <div className="flex items-start justify-between">
        <span
          className={cn('text-3xl leading-none select-none transition-all duration-200', !a.unlocked && 'grayscale')}
        >
          {a.emoji}
        </span>
        {!a.unlocked && (
          <Lock className="h-3.5 w-3.5 text-muted-foreground/30 mt-0.5" />
        )}
        {a.unlocked && a.unlockedAt && (
          <span
            className="text-[9px] font-medium leading-none opacity-60"
            style={{ color: a.color }}
          >
            ✓ {new Date(a.unlockedAt + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: '2-digit' })}
          </span>
        )}
      </div>

      {/* Name + desc */}
      <div className="space-y-0.5">
        <p
          className={cn('text-xs font-semibold leading-tight', a.unlocked ? '' : 'text-muted-foreground')}
          style={a.unlocked ? { color: a.color } : {}}
        >
          {a.name}
        </p>
        <p className="text-[10px] text-muted-foreground/60 leading-snug">{a.desc}</p>
      </div>

      {/* Progress bar */}
      {a.progressMax !== undefined && (
        <div className="space-y-1 mt-auto">
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${pct}%`, background: a.unlocked ? a.color : (a.color + '80') }}
            />
          </div>
          {progressLabel && (
            <p className="text-[9px] text-right" style={{ color: a.unlocked ? a.color + 'aa' : 'hsl(var(--muted-foreground)/0.4)' }}>
              {progressLabel}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Data hook ─────────────────────────────────────────────────────── */
function useAchievementsData() {
  const { data: overview  } = useQuery({ queryKey: ['overview'],              queryFn: () => dashApi.overview() })
  // All transactions (no category filter) — fixes bug where only CASH was counted
  const { data: txList    } = useQuery({ queryKey: ['tx-count-all'],          queryFn: () => txApi.list({ page: 1, page_size: 1 }) })
  const { data: goals     } = useQuery({ queryKey: ['goals'],                 queryFn: goalApi.list })
  const { data: portfolio } = useQuery({ queryKey: ['portfolio-performance'], queryFn: portfolioApi.performance })
  const { data: trend     } = useQuery({ queryKey: ['monthly-trend-ach'],     queryFn: () => dashApi.monthlyTrend(12) })
  const { data: recurring } = useQuery({ queryKey: ['recurring'],             queryFn: recurringApi.list })

  const achievements: Achievement[] = useMemo(() => {
    const txCount         = txList?.total ?? 0
    const balance         = overview?.balance ?? 0
    const trendData       = trend ?? []

    // ── Savings rate (robust calculation) ──────────────────────────
    // Only count months where income is at least 25% of the peak monthly income
    // AND at least 200€ absolute. This prevents months with tiny income (interest
    // payments, partial months, etc.) from creating artificially high rates.
    const allIncomes = trendData.map(m => m.income).filter(x => x > 0)
    const peakIncome = allIncomes.length ? Math.max(...allIncomes) : 0
    const minValidIncome = Math.max(200, peakIncome * 0.25)

    const validMonths = trendData.filter(m => m.income >= minValidIncome)

    const bestSavingsRate = (() => {
      if (!validMonths.length) return 0
      const rates = validMonths.map(m => m.savings / m.income).filter(r => isFinite(r) && r <= 1)
      return rates.length ? Math.max(0, ...rates) : 0
    })()

    const positiveMonths = validMonths.filter(m => m.savings > 0).length

    const consecutivePositive = (() => {
      // Walk backwards through VALID months only
      let count = 0
      for (let i = trendData.length - 1; i >= 0; i--) {
        const m = trendData[i]
        if (m.income < minValidIncome) continue   // skip low-income months
        if (m.savings > 0) count++
        else break
      }
      return count
    })()

    const portfolioVal    = portfolio?.total_market_value ?? portfolio?.total_invested ?? 0
    const portfolioProfit = portfolio?.total_unrealized_pnl ?? 0
    const dividends       = portfolio?.total_dividends ?? 0
    const openPositions   = (portfolio?.positions ?? []).filter(p => p.shares > 0.0001).length
    const totalInvested   = portfolio?.total_invested ?? 0
    const netWorth        = balance + portfolioVal

    const completedGoals  = (goals ?? []).filter(g => g.target_amount && g.current_amount >= g.target_amount)
    const activeGoals     = (goals ?? []).filter(g => g.is_active)

    const activeRecurring = (recurring ?? []).filter(r => r.is_active).length
    const interestTotal   = overview?.interest_total ?? 0

    return [
      /* ── Inicio ────────────────────────────────────────────────── */
      {
        id: 'first-tx', emoji: '🌱', name: 'Primer paso',
        desc: 'Primera transacción importada',
        unlocked: txCount >= 1, color: '#22c55e', category: 'Inicio',
        progress: Math.min(txCount, 1), progressMax: 1, progressUnit: 'tx',
      },
      {
        id: 'importer-10', emoji: '📥', name: 'Primeros datos',
        desc: 'Más de 10 transacciones registradas',
        unlocked: txCount >= 10, color: '#6366f1', category: 'Inicio',
        progress: Math.min(txCount, 10), progressMax: 10, progressUnit: 'tx',
      },
      {
        id: 'importer-50', emoji: '📦', name: 'Importador',
        desc: 'Más de 50 transacciones registradas',
        unlocked: txCount >= 50, color: '#6366f1', category: 'Inicio',
        progress: Math.min(txCount, 50), progressMax: 50, progressUnit: 'tx',
      },
      {
        id: 'analyst', emoji: '🏭', name: 'Analista',
        desc: 'Más de 200 transacciones registradas',
        unlocked: txCount >= 200, color: '#8b5cf6', category: 'Inicio',
        progress: Math.min(txCount, 200), progressMax: 200, progressUnit: 'tx',
      },
      {
        id: 'historian', emoji: '📚', name: 'Historiador',
        desc: 'Más de 500 transacciones registradas',
        unlocked: txCount >= 500, color: '#a78bfa', category: 'Inicio',
        progress: Math.min(txCount, 500), progressMax: 500, progressUnit: 'tx',
      },
      {
        id: 'data-hoarder', emoji: '🗄️', name: 'Archivista',
        desc: 'Más de 1.000 transacciones registradas',
        unlocked: txCount >= 1000, color: '#7c3aed', category: 'Inicio',
        progress: Math.min(txCount, 1000), progressMax: 1000, progressUnit: 'tx',
      },
      /* ── Ahorro ─────────────────────────────────────────────────── */
      {
        id: 'saver', emoji: '💰', name: 'Ahorrador',
        desc: 'Al menos un mes con ahorro positivo (con ingresos reales)',
        unlocked: positiveMonths >= 1, color: '#f59e0b', category: 'Ahorro',
        progress: Math.min(positiveMonths, 1), progressMax: 1, progressUnit: 'mes',
      },
      {
        id: 'savings-rate-10', emoji: '🐜', name: 'La Hormiga',
        // Progress shows actual best rate (may exceed target, bar caps at 100%)
        desc: `Tasa de ahorro ≥ 10% en algún mes (mejor: ${Math.round(bestSavingsRate * 100)}%)`,
        unlocked: bestSavingsRate >= 0.10, color: '#10b981', category: 'Ahorro',
        progress: Math.round(bestSavingsRate * 100), progressMax: 10, progressUnit: '%',
      },
      {
        id: 'savings-rate-20', emoji: '🦫', name: 'El Castor',
        desc: `Tasa de ahorro ≥ 20% en algún mes (mejor: ${Math.round(bestSavingsRate * 100)}%)`,
        unlocked: bestSavingsRate >= 0.20, color: '#059669', category: 'Ahorro',
        progress: Math.round(bestSavingsRate * 100), progressMax: 20, progressUnit: '%',
      },
      {
        id: 'savings-rate-35', emoji: '🦉', name: 'El Búho Sabio',
        desc: `Tasa de ahorro ≥ 35% en algún mes (mejor: ${Math.round(bestSavingsRate * 100)}%)`,
        unlocked: bestSavingsRate >= 0.35, color: '#047857', category: 'Ahorro',
        progress: Math.round(bestSavingsRate * 100), progressMax: 35, progressUnit: '%',
      },
      {
        id: 'savings-rate-50', emoji: '🧙', name: 'Maestro del Ahorro',
        desc: `Tasa de ahorro ≥ 50% en algún mes (mejor: ${Math.round(bestSavingsRate * 100)}%)`,
        unlocked: bestSavingsRate >= 0.50, color: '#065f46', category: 'Ahorro',
        progress: Math.round(bestSavingsRate * 100), progressMax: 50, progressUnit: '%',
      },
      {
        id: 'streak-3', emoji: '🔥', name: 'En Racha',
        desc: '3 meses consecutivos con ahorro positivo',
        unlocked: consecutivePositive >= 3, color: '#ef4444', category: 'Ahorro',
        progress: Math.min(consecutivePositive, 3), progressMax: 3, progressUnit: 'meses',
      },
      {
        id: 'streak-6', emoji: '🌋', name: 'Racha de Fuego',
        desc: '6 meses consecutivos con ahorro positivo',
        unlocked: consecutivePositive >= 6, color: '#dc2626', category: 'Ahorro',
        progress: Math.min(consecutivePositive, 6), progressMax: 6, progressUnit: 'meses',
      },
      {
        id: 'streak-12', emoji: '🏅', name: 'Imbatible',
        desc: '12 meses consecutivos con ahorro positivo',
        unlocked: consecutivePositive >= 12, color: '#b91c1c', category: 'Ahorro',
        progress: Math.min(consecutivePositive, 12), progressMax: 12, progressUnit: 'meses',
      },
      {
        id: 'positive-months-6', emoji: '📆', name: 'Constante',
        desc: '6 meses con ahorro positivo (no necesariamente seguidos)',
        unlocked: positiveMonths >= 6, color: '#f97316', category: 'Ahorro',
        progress: Math.min(positiveMonths, 6), progressMax: 6, progressUnit: 'meses',
      },
      /* ── Patrimonio ─────────────────────────────────────────────── */
      {
        id: 'balance-1k', emoji: '💵', name: 'Primer Millar',
        desc: 'Balance superior a 1.000€',
        unlocked: balance >= 1_000, color: '#14b8a6', category: 'Patrimonio',
        progress: Math.round(Math.min(balance, 1_000)), progressMax: 1_000, progressUnit: '€',
      },
      {
        id: 'balance-5k', emoji: '💳', name: 'Colchón',
        desc: 'Balance superior a 5.000€',
        unlocked: balance >= 5_000, color: '#0d9488', category: 'Patrimonio',
        progress: Math.round(Math.min(balance, 5_000)), progressMax: 5_000, progressUnit: '€',
      },
      {
        id: 'wealth-10k', emoji: '🏦', name: 'Patrimonio Sólido',
        desc: 'Balance superior a 10.000€',
        unlocked: balance >= 10_000, color: '#0f766e', category: 'Patrimonio',
        progress: Math.round(Math.min(balance, 10_000)), progressMax: 10_000, progressUnit: '€',
      },
      {
        id: 'wealth-50k', emoji: '🏰', name: 'Fortaleza',
        desc: 'Balance superior a 50.000€',
        unlocked: balance >= 50_000, color: '#134e4a', category: 'Patrimonio',
        progress: Math.round(Math.min(balance, 50_000)), progressMax: 50_000, progressUnit: '€',
      },
      {
        id: 'networth-25k', emoji: '🌟', name: 'Riqueza Neta',
        desc: 'Patrimonio neto (balance + portfolio) superior a 25.000€',
        unlocked: netWorth >= 25_000, color: '#0891b2', category: 'Patrimonio',
        progress: Math.round(Math.min(netWorth, 25_000)), progressMax: 25_000, progressUnit: '€',
      },
      {
        id: 'networth-100k', emoji: '👑', name: 'El Club del 100K',
        desc: 'Patrimonio neto superior a 100.000€',
        unlocked: netWorth >= 100_000, color: '#c2410c', category: 'Patrimonio',
        progress: Math.round(Math.min(netWorth, 100_000)), progressMax: 100_000, progressUnit: '€',
      },
      {
        id: 'interest-earner', emoji: '💹', name: 'Intereses',
        desc: 'Primeros intereses cobrados',
        unlocked: interestTotal > 0, color: '#06b6d4', category: 'Patrimonio',
        progress: Math.min(Math.round(interestTotal), 1), progressMax: 1, progressUnit: '€',
      },
      /* ── Inversiones ────────────────────────────────────────────── */
      {
        id: 'investor', emoji: '📈', name: 'Inversor',
        desc: 'Primera posición abierta en el portfolio',
        unlocked: openPositions >= 1, color: '#a78bfa', category: 'Inversiones',
        progress: Math.min(openPositions, 1), progressMax: 1, progressUnit: 'posiciones',
      },
      {
        id: 'diversified', emoji: '🌍', name: 'Diversificado',
        desc: '3 o más posiciones abiertas simultáneamente',
        unlocked: openPositions >= 3, color: '#8b5cf6', category: 'Inversiones',
        progress: Math.min(openPositions, 3), progressMax: 3, progressUnit: 'posiciones',
      },
      {
        id: 'portfolio-5k', emoji: '🪴', name: 'Cartera Creciente',
        desc: 'Portfolio con valor de mercado superior a 5.000€',
        unlocked: portfolioVal >= 5_000, color: '#7c3aed', category: 'Inversiones',
        progress: Math.round(Math.min(portfolioVal, 5_000)), progressMax: 5_000, progressUnit: '€',
      },
      {
        id: 'portfolio-10k', emoji: '🐉', name: 'Gran Inversor',
        desc: 'Portfolio con valor superior a 10.000€',
        unlocked: portfolioVal >= 10_000, color: '#f97316', category: 'Inversiones',
        progress: Math.round(Math.min(portfolioVal, 10_000)), progressMax: 10_000, progressUnit: '€',
      },
      {
        id: 'portfolio-50k', emoji: '🦅', name: 'Águila Bursátil',
        desc: 'Portfolio con valor superior a 50.000€',
        unlocked: portfolioVal >= 50_000, color: '#ea580c', category: 'Inversiones',
        progress: Math.round(Math.min(portfolioVal, 50_000)), progressMax: 50_000, progressUnit: '€',
      },
      {
        id: 'portfolio-100k', emoji: '🚀', name: 'Astronauta Financiero',
        desc: 'Portfolio con valor superior a 100.000€',
        unlocked: portfolioVal >= 100_000, color: '#c2410c', category: 'Inversiones',
        progress: Math.round(Math.min(portfolioVal, 100_000)), progressMax: 100_000, progressUnit: '€',
      },
      {
        id: 'portfolio-profit', emoji: '🟢', name: 'En Verde',
        desc: 'Portfolio con ganancia no realizada positiva',
        unlocked: portfolioProfit > 0, color: '#22c55e', category: 'Inversiones',
        progress: portfolioProfit > 0 ? 1 : 0, progressMax: 1, progressUnit: '€',
      },
      {
        id: 'heavy-investor', emoji: '💎', name: 'Diamante',
        desc: 'Más de 10.000€ invertidos en total',
        unlocked: totalInvested >= 10_000, color: '#38bdf8', category: 'Inversiones',
        progress: Math.round(Math.min(totalInvested, 10_000)), progressMax: 10_000, progressUnit: '€',
      },
      {
        id: 'dividend-earner', emoji: '🍀', name: 'Dividendista',
        desc: 'Primeros dividendos cobrados',
        unlocked: dividends > 0, color: '#4ade80', category: 'Inversiones',
        progress: Math.min(Math.round(dividends), 1), progressMax: 1, progressUnit: '€',
      },
      {
        id: 'dividend-100', emoji: '🌳', name: 'Árbol de Dinero',
        desc: 'Más de 100€ en dividendos cobrados',
        unlocked: dividends >= 100, color: '#16a34a', category: 'Inversiones',
        progress: Math.round(Math.min(dividends, 100)), progressMax: 100, progressUnit: '€',
      },
      {
        id: 'dividend-1k', emoji: '🏡', name: 'Rentista',
        desc: 'Más de 1.000€ en dividendos cobrados',
        unlocked: dividends >= 1_000, color: '#15803d', category: 'Inversiones',
        progress: Math.round(Math.min(dividends, 1_000)), progressMax: 1_000, progressUnit: '€',
      },
      /* ── Objetivos ──────────────────────────────────────────────── */
      {
        id: 'first-goal', emoji: '🎯', name: 'Estratega',
        desc: 'Primer objetivo financiero creado',
        unlocked: activeGoals.length >= 1, color: '#0ea5e9', category: 'Objetivos',
        progress: Math.min(activeGoals.length, 1), progressMax: 1, progressUnit: 'objetivos',
      },
      {
        id: 'multi-goal', emoji: '🗺️', name: 'Planificador',
        desc: '3 o más objetivos activos a la vez',
        unlocked: activeGoals.length >= 3, color: '#0284c7', category: 'Objetivos',
        progress: Math.min(activeGoals.length, 3), progressMax: 3, progressUnit: 'objetivos',
      },
      {
        id: 'goal-done', emoji: '🏆', name: 'Conseguidor',
        desc: 'Primer objetivo completado al 100%',
        unlocked: completedGoals.length >= 1, color: '#fbbf24', category: 'Objetivos',
        progress: Math.min(completedGoals.length, 1), progressMax: 1, progressUnit: 'completados',
      },
      {
        id: 'goal-done-3', emoji: '🥇', name: 'Campeón',
        desc: '3 objetivos completados',
        unlocked: completedGoals.length >= 3, color: '#eab308', category: 'Objetivos',
        progress: Math.min(completedGoals.length, 3), progressMax: 3, progressUnit: 'completados',
      },
      {
        id: 'goal-done-10', emoji: '🎖️', name: 'Leyenda',
        desc: '10 objetivos completados',
        unlocked: completedGoals.length >= 10, color: '#d97706', category: 'Objetivos',
        progress: Math.min(completedGoals.length, 10), progressMax: 10, progressUnit: 'completados',
      },
      /* ── Control ────────────────────────────────────────────────── */
      {
        id: 'recurring-detected', emoji: '🔁', name: 'Radar de Gastos',
        desc: 'Primer gasto recurrente detectado',
        unlocked: activeRecurring >= 1, color: '#f472b6', category: 'Control',
        progress: Math.min(activeRecurring, 1), progressMax: 1, progressUnit: 'recurrentes',
      },
      {
        id: 'recurring-5', emoji: '📡', name: 'Controlador',
        desc: '5 o más gastos recurrentes monitorizados',
        unlocked: activeRecurring >= 5, color: '#ec4899', category: 'Control',
        progress: Math.min(activeRecurring, 5), progressMax: 5, progressUnit: 'recurrentes',
      },
      {
        id: 'recurring-10', emoji: '🛰️', name: 'Control Total',
        desc: '10 o más gastos recurrentes monitorizados',
        unlocked: activeRecurring >= 10, color: '#db2777', category: 'Control',
        progress: Math.min(activeRecurring, 10), progressMax: 10, progressUnit: 'recurrentes',
      },
      /* ── Especial ───────────────────────────────────────────────── */
      {
        id: 'all', emoji: '⭐', name: 'Maestro',
        desc: 'Todos los demás logros desbloqueados',
        unlocked: false, color: '#eab308', category: 'Especial',
      },
    ]
  }, [overview, txList, goals, portfolio, trend, recurring])

  const withMaster = useMemo(() => {
    const nonMaster = achievements.filter(a => a.id !== 'all')
    const allDone = nonMaster.every(a => a.unlocked)
    return achievements.map(a => a.id === 'all' ? { ...a, unlocked: allDone } : a)
  }, [achievements])

  return { withMaster }
}

/* ── Main export ────────────────────────────────────────────────────── */
export function Achievements({ compact = false }: { compact?: boolean }) {
  const { withMaster } = useAchievementsData()
  const { toast }      = useToast()
  const [persisted, setPersisted]   = useState<Map<string, string>>(() => loadPersisted())
  const isFirstLoad                  = useRef(true)
  const [activeCategory, setActiveCategory] = useState<string>('Todos')

  // Persist newly unlocked achievements and fire toast notifications
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    let changed = false
    const next = new Map(persisted)
    const newlyUnlocked: Achievement[] = []

    withMaster.forEach(a => {
      if (a.unlocked && (!next.has(a.id) || next.get(a.id) === '')) {
        next.set(a.id, today)
        changed = true
        newlyUnlocked.push(a)
      }
    })

    if (changed) {
      savePersisted(next)
      setPersisted(next)
      if (!isFirstLoad.current && newlyUnlocked.length > 0) {
        newlyUnlocked.forEach(a => {
          toast(`${a.emoji} ¡Logro desbloqueado! ${a.name}`, 'success')
        })
      }
    }

    isFirstLoad.current = false
  }, [withMaster]) // eslint-disable-line react-hooks/exhaustive-deps

  const withPersisted = useMemo(() => withMaster.map(a => ({
    ...a,
    unlocked:   a.unlocked || persisted.has(a.id),
    unlockedAt: persisted.get(a.id) || undefined,
  })), [withMaster, persisted])

  const unlocked = withPersisted.filter(a => a.unlocked).length
  const total    = withPersisted.length

  const recentlyUnlocked = useMemo(() => {
    return withPersisted
      .filter(a => a.unlocked && a.unlockedAt)
      .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
      .slice(0, 4)
  }, [withPersisted])

  /* ── Compact mode (Dashboard widget) ── */
  if (compact) {
    return <AchievementsCompact achievements={withPersisted} unlocked={unlocked} total={total} />
  }

  /* ── Full page mode ── */
  const categories = ['Todos', ...CATEGORY_ORDER.filter(c => withPersisted.some(a => a.category === c))]
  const filtered   = activeCategory === 'Todos'
    ? withPersisted
    : withPersisted.filter(a => a.category === activeCategory)

  const groups: Record<string, Achievement[]> = {}
  for (const a of filtered) {
    if (!groups[a.category]) groups[a.category] = []
    groups[a.category].push(a)
  }

  const pct = Math.round((unlocked / total) * 100)

  // Circular ring geometry
  const R = 54
  const circumference = 2 * Math.PI * R
  const dashOffset = circumference * (1 - pct / 100)

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Circular ring */}
          <div className="relative shrink-0">
            <svg width="140" height="140" viewBox="0 0 140 140" className="rotate-[-90deg]">
              <circle
                cx="70" cy="70" r={R}
                fill="none"
                stroke="hsl(var(--border))"
                strokeWidth="10"
              />
              <circle
                cx="70" cy="70" r={R}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
              <span className="text-3xl font-bold tracking-tight text-primary">{pct}%</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">completado</span>
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 space-y-4 text-center sm:text-left">
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 justify-center sm:justify-start">
                <Trophy className="h-6 w-6 text-primary" />
                Logros
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {unlocked} de {total} logros desbloqueados
              </p>
            </div>

            {/* Category mini-stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CATEGORY_ORDER.filter(c => withPersisted.some(a => a.category === c)).map(cat => {
                const catItems  = withPersisted.filter(a => a.category === cat)
                const catDone   = catItems.filter(a => a.unlocked).length
                const catPct    = Math.round((catDone / catItems.length) * 100)
                return (
                  <div key={cat} className="rounded-lg bg-white/[0.03] border border-white/[0.06] px-2.5 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground font-medium">{cat}</span>
                      <span className="text-[10px] font-semibold text-primary">{catPct}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${catPct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Recently unlocked ── */}
      {recentlyUnlocked.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Recién desbloqueados</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {recentlyUnlocked.map(a => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl p-3 border"
                style={{ background: a.color + '10', borderColor: a.color + '30' }}
              >
                <span className="text-2xl leading-none shrink-0">{a.emoji}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: a.color }}>{a.name}</p>
                  {a.unlockedAt && (
                    <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                      {new Date(a.unlockedAt + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Category tabs ── */}
      <div className="flex gap-1 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
              activeCategory === cat
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]',
            )}
          >
            {cat}
            {cat !== 'Todos' && (
              <span className={cn('ml-1.5 text-[10px]', activeCategory === cat ? 'opacity-70' : 'opacity-40')}>
                {withPersisted.filter(a => a.category === cat && a.unlocked).length}/{withPersisted.filter(a => a.category === cat).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Achievement groups ── */}
      <div className="space-y-6">
        {CATEGORY_ORDER.filter(c => groups[c]).map(cat => (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground/60 font-semibold">{cat}</p>
              <div className="flex-1 h-px bg-border/40" />
              <span className="text-[10px] text-muted-foreground/40">
                {groups[cat].filter(a => a.unlocked).length}/{groups[cat].length}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {groups[cat].map(a => <AchievementCard key={a.id} a={a} />)}
            </div>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <div className="pt-2 border-t border-border/30 flex justify-end">
        <button
          onClick={() => {
            savePersisted(new Map())
            setPersisted(new Map())
            toast('Logros restablecidos — se recalcularán con tus datos actuales', 'info')
          }}
          className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
        >
          Restablecer logros
        </button>
      </div>
    </div>
  )
}
