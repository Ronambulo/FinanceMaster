// Cuadrado de color con el ticker de una posición.
import type { PortfolioPosition } from '@/lib/api'

export const ticker = (p: PortfolioPosition) => (p.symbol || p.name || '?').replace(/\..*$/, '').slice(0, 5).toUpperCase()

const TICKER_BG = ['var(--c-a8323e)', 'var(--c-1b1b1b)', 'var(--c-5b6070)', 'var(--c-c77700)', 'var(--c-13294b)', 'var(--c-36a18b)', 'var(--c-0b7fab)']
function tickerBg(s: string) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TICKER_BG[h % TICKER_BG.length]
}
export function TickerTile({ p, size = 40 }: { p: PortfolioPosition; size?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size, borderRadius: size * 0.3, background: tickerBg(p.symbol || p.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.275, fontWeight: 800, flex: 'none' }}>{ticker(p)}</span>
}
