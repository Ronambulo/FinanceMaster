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
  tier?: number
  tierCount?: number
}

const CATEGORY_ORDER = ['Inicio', 'Ahorro', 'Patrimonio', 'Inversiones', 'Objetivos', 'Control', 'Especial']

/* ── Tiered achievements ──────────────────────────────────────────────
 * Each "family" (e.g. transaction count) used to be N separate near-duplicate
 * achievements, one per threshold. That inflated the total count and made it
 * feel arbitrary. Now each family is ONE achievement that levels up through
 * named tiers — same underlying thresholds, one meaningful card. */
interface Tier { threshold: number; name: string; emoji: string; color: string }

function tieredAchievement(
  id: string, category: string, familyName: string, unit: string,
  tiers: Tier[], value: number,
): Achievement {
  let idx = -1
  for (let i = 0; i < tiers.length; i++) if (value >= tiers[i].threshold) idx = i
  const unlocked = idx >= 0
  const current  = tiers[Math.max(idx, 0)]
  const next     = tiers[idx + 1]
  const progressMax = next ? next.threshold : tiers[tiers.length - 1].threshold
  const progress     = Math.min(value, progressMax)
  const fmt = (n: number) => unit === '%' ? `${n}%` : unit === '€' ? `${n.toLocaleString('es-ES')}€` : `${n.toLocaleString('es-ES')} ${unit}`
  const desc = unlocked
    ? (next
        ? `${current.name} · nivel ${idx + 1}/${tiers.length} — próximo: ${next.name} (${fmt(next.threshold)})`
        : `${current.name} · nivel máximo (${tiers.length}/${tiers.length})`)
    : `${tiers[0].name} · objetivo: ${fmt(tiers[0].threshold)}`
  return {
    id, category, emoji: current.emoji, name: familyName, desc,
    unlocked, color: current.color,
    progress, progressMax, progressUnit: unit,
    tier: idx + 1, tierCount: tiers.length,
  }
}

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
        <div className="flex items-center gap-1.5">
          <span
            className={cn('text-3xl leading-none select-none transition-all duration-200', !a.unlocked && 'grayscale')}
          >
            {a.emoji}
          </span>
          {a.tierCount !== undefined && a.tierCount > 1 && (
            <span
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
              style={a.unlocked
                ? { color: a.color, background: a.color + '18', border: `1px solid ${a.color}40` }
                : { color: 'hsl(var(--muted-foreground)/0.5)', background: 'hsl(var(--muted)/0.2)', border: '1px solid hsl(var(--border))' }}
            >
              {a.tier}/{a.tierCount}
            </span>
          )}
        </div>
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
      tieredAchievement('tx-history', 'Inicio', 'Historial de transacciones', 'tx', [
        { threshold: 1,    name: 'Primer paso',    emoji: '🌱', color: '#22c55e' },
        { threshold: 10,   name: 'Primeros datos', emoji: '📥', color: '#6366f1' },
        { threshold: 50,   name: 'Importador',     emoji: '📦', color: '#6366f1' },
        { threshold: 200,  name: 'Analista',       emoji: '🏭', color: '#8b5cf6' },
        { threshold: 500,  name: 'Historiador',    emoji: '📚', color: '#a78bfa' },
        { threshold: 1000, name: 'Archivista',     emoji: '🗄️', color: '#7c3aed' },
      ], txCount),
      /* ── Ahorro ─────────────────────────────────────────────────── */
      tieredAchievement('positive-months', 'Ahorro', 'Meses en positivo', 'meses', [
        { threshold: 1,  name: 'Ahorrador',    emoji: '💰', color: '#f59e0b' },
        { threshold: 6,  name: 'Constante',    emoji: '📆', color: '#f97316' },
        { threshold: 12, name: 'Disciplinado', emoji: '🗓️', color: '#ea580c' },
      ], positiveMonths),
      tieredAchievement('savings-rate', 'Ahorro', 'Tasa de ahorro', '%', [
        { threshold: 10, name: 'La Hormiga',         emoji: '🐜', color: '#10b981' },
        { threshold: 20, name: 'El Castor',          emoji: '🦫', color: '#059669' },
        { threshold: 35, name: 'El Búho Sabio',      emoji: '🦉', color: '#047857' },
        { threshold: 50, name: 'Maestro del Ahorro', emoji: '🧙', color: '#065f46' },
      ], Math.round(bestSavingsRate * 100)),
      tieredAchievement('savings-streak', 'Ahorro', 'Racha de ahorro', 'meses', [
        { threshold: 3,  name: 'En Racha',        emoji: '🔥', color: '#ef4444' },
        { threshold: 6,  name: 'Racha de Fuego',  emoji: '🌋', color: '#dc2626' },
        { threshold: 12, name: 'Imbatible',       emoji: '🏅', color: '#b91c1c' },
      ], consecutivePositive),
      /* ── Patrimonio ─────────────────────────────────────────────── */
      tieredAchievement('balance', 'Patrimonio', 'Balance en cuenta', '€', [
        { threshold: 1_000,  name: 'Primer Millar',       emoji: '💵', color: '#14b8a6' },
        { threshold: 5_000,  name: 'Colchón',              emoji: '💳', color: '#0d9488' },
        { threshold: 10_000, name: 'Patrimonio Sólido',    emoji: '🏦', color: '#0f766e' },
        { threshold: 50_000, name: 'Fortaleza',            emoji: '🏰', color: '#134e4a' },
      ], Math.round(balance)),
      tieredAchievement('networth', 'Patrimonio', 'Patrimonio neto', '€', [
        { threshold: 25_000,  name: 'Riqueza Neta',       emoji: '🌟', color: '#0891b2' },
        { threshold: 100_000, name: 'El Club del 100K',   emoji: '👑', color: '#c2410c' },
      ], Math.round(netWorth)),
      tieredAchievement('interest', 'Patrimonio', 'Intereses cobrados', '€', [
        { threshold: 1,   name: 'Primeros intereses', emoji: '💹', color: '#06b6d4' },
        { threshold: 50,  name: 'Interés compuesto',  emoji: '🌊', color: '#0e7490' },
        { threshold: 200, name: 'Rentista pasivo',    emoji: '🏔️', color: '#155e75' },
      ], Math.round(interestTotal)),
      /* ── Inversiones ────────────────────────────────────────────── */
      tieredAchievement('positions', 'Inversiones', 'Posiciones abiertas', 'posiciones', [
        { threshold: 1, name: 'Inversor',            emoji: '📈', color: '#a78bfa' },
        { threshold: 3, name: 'Diversificado',       emoji: '🌍', color: '#8b5cf6' },
        { threshold: 5, name: 'Gestor de Cartera',   emoji: '🧩', color: '#7c3aed' },
      ], openPositions),
      tieredAchievement('portfolio-value', 'Inversiones', 'Valor del portfolio', '€', [
        { threshold: 5_000,   name: 'Cartera Creciente',      emoji: '🪴', color: '#7c3aed' },
        { threshold: 10_000,  name: 'Gran Inversor',          emoji: '🐉', color: '#f97316' },
        { threshold: 50_000,  name: 'Águila Bursátil',        emoji: '🦅', color: '#ea580c' },
        { threshold: 100_000, name: 'Astronauta Financiero',  emoji: '🚀', color: '#c2410c' },
      ], Math.round(portfolioVal)),
      tieredAchievement('invested-capital', 'Inversiones', 'Capital invertido', '€', [
        { threshold: 1_000,  name: 'Primeras aportaciones', emoji: '🌰', color: '#0ea5e9' },
        { threshold: 10_000, name: 'Diamante',              emoji: '💎', color: '#38bdf8' },
        { threshold: 50_000, name: 'Ballena',               emoji: '🐋', color: '#0284c7' },
      ], Math.round(totalInvested)),
      {
        id: 'portfolio-profit', emoji: '🟢', name: 'En Verde',
        desc: 'Portfolio con ganancia no realizada positiva',
        unlocked: portfolioProfit > 0, color: '#22c55e', category: 'Inversiones',
        progress: portfolioProfit > 0 ? 1 : 0, progressMax: 1, progressUnit: '€',
      },
      tieredAchievement('dividends', 'Inversiones', 'Dividendos cobrados', '€', [
        { threshold: 1,    name: 'Dividendista',      emoji: '🍀', color: '#4ade80' },
        { threshold: 100,  name: 'Árbol de Dinero',   emoji: '🌳', color: '#16a34a' },
        { threshold: 1000, name: 'Rentista',           emoji: '🏡', color: '#15803d' },
      ], Math.round(dividends)),
      /* ── Objetivos ──────────────────────────────────────────────── */
      tieredAchievement('active-goals', 'Objetivos', 'Objetivos activos', 'objetivos', [
        { threshold: 1, name: 'Estratega',     emoji: '🎯', color: '#0ea5e9' },
        { threshold: 3, name: 'Planificador',  emoji: '🗺️', color: '#0284c7' },
      ], activeGoals.length),
      tieredAchievement('completed-goals', 'Objetivos', 'Objetivos completados', 'completados', [
        { threshold: 1,  name: 'Conseguidor', emoji: '🏆', color: '#fbbf24' },
        { threshold: 3,  name: 'Campeón',      emoji: '🥇', color: '#eab308' },
        { threshold: 10, name: 'Leyenda',      emoji: '🎖️', color: '#d97706' },
      ], completedGoals.length),
      /* ── Control ────────────────────────────────────────────────── */
      tieredAchievement('recurring-control', 'Control', 'Gastos recurrentes controlados', 'recurrentes', [
        { threshold: 1,  name: 'Radar de Gastos', emoji: '🔁', color: '#f472b6' },
        { threshold: 5,  name: 'Controlador',      emoji: '📡', color: '#ec4899' },
        { threshold: 10, name: 'Control Total',    emoji: '🛰️', color: '#db2777' },
      ], activeRecurring),
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
