import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { PortfolioPosition } from '@/lib/api'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Distinct palette – ensures visually separated colors even with many positions
export const CHART_PALETTE = [
  '#818cf8', // indigo
  '#34d399', // emerald
  '#fbbf24', // amber
  '#f472b6', // pink
  '#38bdf8', // sky
  '#fb923c', // orange
  '#a78bfa', // violet
  '#4ade80', // green
  '#f87171', // red
  '#22d3ee', // cyan
  '#e879f9', // fuchsia
  '#facc15', // yellow
]

export function symbolColor(sym: string): string {
  let hash = 0
  for (let i = 0; i < sym.length; i++) hash = sym.charCodeAt(i) + ((hash << 5) - hash)
  return CHART_PALETTE[Math.abs(hash) % CHART_PALETTE.length]
}

const PRICE_OVERRIDES_KEY = 'fm_price_overrides'

export function getPriceOverrides(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(PRICE_OVERRIDES_KEY) || '{}') } catch { return {} }
}

export function round2(v: number) { return Math.round(v * 100) / 100 }

export function applyOverrides(positions: PortfolioPosition[]): PortfolioPosition[] {
  const overrides = getPriceOverrides()
  return positions.map(p => {
    const override = overrides[p.symbol]
    if (override != null && p.shares > 0.0001) {
      const market_value = round2(p.shares * override)
      const unrealized_pnl = round2(market_value - p.total_invested)
      const unrealized_pnl_pct = p.total_invested > 0 ? round2((unrealized_pnl / p.total_invested) * 100) : 0
      return { ...p, current_price: override, market_value, unrealized_pnl, unrealized_pnl_pct }
    }
    return p
  })
}

export function formatCurrency(amount: number, currency = 'EUR'): string {
  const formatted = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
  // Safety fallback: some environments render the ISO code instead of the symbol
  if (currency === 'EUR') return formatted.replace(/\bEUR\b/, '€')
  if (currency === 'USD') return formatted.replace(/\bUSD\b/, '$')
  return formatted
}

export function formatDate(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d + (d.includes('T') ? '' : 'T00:00:00')) : d
  return format(date, 'dd MMM yyyy', { locale: es })
}

export function formatMonth(m: string): string {
  const [year, month] = m.split('-')
  return format(new Date(Number(year), Number(month) - 1, 1), 'MMM yyyy', { locale: es })
}

export function currentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
