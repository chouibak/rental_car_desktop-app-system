/** Local calendar date: `toISOString()` would return yesterday late in the evening. */
export function todayYmd(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1)
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

export function toDateOnly(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function isWeekend(date: Date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

/** Visible day span (inclusive) for a reservation within a month grid. */
export function getReservationBarInMonth(
  pickupIso: string,
  returnIso: string,
  year: number,
  month: number,
): { startDay: number; endDay: number } | null {
  const pickup = new Date(pickupIso)
  const returnDt = new Date(returnIso)
  if (Number.isNaN(pickup.getTime()) || Number.isNaN(returnDt.getTime())) return null

  const pickupDate = toDateOnly(pickup)
  const returnDate = toDateOnly(returnDt)
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month, daysInMonth(year, month))

  if (returnDate < monthStart || pickupDate > monthEnd) return null

  const visibleStart = pickupDate < monthStart ? monthStart : pickupDate
  const visibleEnd = returnDate > monthEnd ? monthEnd : returnDate

  return {
    startDay: visibleStart.getDate(),
    endDay: visibleEnd.getDate(),
  }
}

export function monthBoundaryIsoRange(date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const start = new Date(year, month, 1, 0, 0, 0, 0)
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
  return { date_from: start.toISOString(), date_to: end.toISOString() }
}
