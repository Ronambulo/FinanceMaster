// Formato de importes del rediseño: siempre con separador de miles
// ("2.904,12"), también en números de cuatro cifras, donde es-ES no lo pone.

export function formatAmount(n: number, opts: { sign?: boolean; decimals?: number } = {}): string {
  const decimals = opts.decimals ?? 2
  const abs = Math.abs(n)
  const fixed = abs.toFixed(decimals)
  const [int, dec] = fixed.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const body = dec ? `${grouped},${dec}` : grouped
  const isZero = Number(fixed) === 0
  if (n < 0 && !isZero) return `−${body}`
  if (opts.sign && n > 0 && !isZero) return `+${body}`
  return body
}

// Símbolo de la moneda elegida en Perfil (solo cambia cómo se ve; no convierte importes).
let SYMBOL = '€'
export function setCurrencySymbol(s: string) { SYMBOL = s }
export function cur(): string { return SYMBOL }

export function formatEuro(n: number, opts: { sign?: boolean; decimals?: number } = {}): string {
  return `${formatAmount(n, opts)} ${SYMBOL}`
}

export function formatPct(n: number): string {
  return `${Math.round(n)} %`
}
