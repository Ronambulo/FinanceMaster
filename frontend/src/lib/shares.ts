// Gastos compartidos: reparto y validación, sin red (se prueban aparte).

/** Partes iguales de `total` entre `others` personas y tú: lo que le toca a cada una de ellas.
 *  Los céntimos que sobran los pones tú, así nunca te deben más de lo que pagaste. */
export function equalSplit(total: number, others: number): number[] {
  if (others <= 0) return []
  const cents = Math.round(Math.abs(total) * 100)
  const each = Math.floor(cents / (others + 1))
  return Array.from({ length: others }, () => each / 100)
}

/** Lista guardable: cada fila con nombre e importe, sin nombres repetidos y sin pasarse del gasto.
 *  Vacía también vale: deja de compartirse. */
export function sharesValid(rows: { person: string; amount: number }[], total: number): boolean {
  const names = new Set<string>()
  let sum = 0
  for (const r of rows) {
    const key = r.person.trim().toLowerCase()
    if (!key || !(r.amount > 0) || names.has(key)) return false
    names.add(key)
    sum += r.amount
  }
  return Math.round(sum * 100) <= Math.round(Math.abs(total) * 100)
}

/** Importe para un campo editable: sin decimales si es entero, con coma si no. */
export function amountInput(n: number): string {
  const r = Math.round(n * 100) / 100
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace('.', ',')
}
