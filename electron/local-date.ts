/** Calendar dates in the machine's local timezone (not UTC). */

export function localYmd(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function localYearMonth(d = new Date()) {
  return localYmd(d).slice(0, 7)
}

export function shiftYearMonth(yearMonth: string, deltaMonths: number) {
  const [year, month] = yearMonth.split('-').map(Number)
  const d = new Date(year, month - 1 + deltaMonths, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function trailingYearMonths(count: number, from = new Date()) {
  const keys: string[] = []
  const start = new Date(from.getFullYear(), from.getMonth() - (count - 1), 1)
  for (let i = 0; i < count; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

/** Match YYYY-MM-DD or ISO datetime stored as TEXT. */
export function datePrefixEquals(column: string, prefix: string) {
  return `substr(${column}, 1, ${prefix.length}) = ?`
}

export function roundMoney(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100
}
