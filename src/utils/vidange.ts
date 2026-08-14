import type { Car, VidangeSeverity, VidangeStatus } from '../types'

const DEFAULT_INTERVAL_KM = 10000
const DEFAULT_INTERVAL_MONTHS = 6
/** Soon when this many km or fewer remain before next oil change. */
export const VIDANGE_SOON_KM = 2000
/** Soon when this many days or fewer remain before the date interval. */
export const VIDANGE_SOON_DAYS = 14

function dateOnly(value: string) {
  return value?.trim().slice(0, 10) ?? ''
}

function addMonths(isoDate: string, months: number) {
  const d = dateOnly(isoDate)
  if (!d || months <= 0) return ''
  const date = new Date(`${d}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  date.setMonth(date.getMonth() + months)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function daysFromToday(dateStr: string) {
  const d = dateOnly(dateStr)
  if (!d) return NaN
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${d}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function emptyStatus(
  partial: Pick<
    VidangeStatus,
    'enabled' | 'never_done' | 'last_date' | 'last_mileage' | 'interval_km' | 'interval_months' | 'current_mileage'
  >,
): VidangeStatus {
  return {
    ...partial,
    next_due_km: null,
    next_due_date: null,
    km_remaining: null,
    days_remaining: null,
    overdue: false,
    due_soon: false,
    due_by_km: false,
    due_by_date: false,
    severity: 'unknown',
  }
}

export function computeVidangeStatus(
  car: Pick<
    Car,
    | 'mileage'
    | 'vidange_interval_km'
    | 'vidange_interval_months'
    | 'vidange_last_date'
    | 'vidange_last_mileage'
  >,
): VidangeStatus {
  const interval_km = Math.max(0, Number(car.vidange_interval_km ?? DEFAULT_INTERVAL_KM) || 0)
  const interval_months = Math.max(0, Number(car.vidange_interval_months ?? DEFAULT_INTERVAL_MONTHS) || 0)
  const current_mileage = Math.max(0, Number(car.mileage ?? 0) || 0)
  const last_date = dateOnly(String(car.vidange_last_date ?? ''))
  const last_mileage = Math.max(0, Number(car.vidange_last_mileage ?? 0) || 0)
  const enabled = interval_km > 0 || interval_months > 0
  const never_done = !last_date && last_mileage <= 0

  if (!enabled) {
    return emptyStatus({
      enabled: false,
      never_done,
      last_date,
      last_mileage,
      interval_km,
      interval_months,
      current_mileage,
    })
  }

  if (never_done) {
    return emptyStatus({
      enabled: true,
      never_done: true,
      last_date,
      last_mileage,
      interval_km,
      interval_months,
      current_mileage,
    })
  }

  const next_due_km = interval_km > 0 ? last_mileage + interval_km : null
  const next_due_date = interval_months > 0 && last_date ? addMonths(last_date, interval_months) : null
  const km_remaining = next_due_km != null ? next_due_km - current_mileage : null
  const days_remaining = next_due_date ? daysFromToday(next_due_date) : null

  const due_by_km = next_due_km != null && current_mileage >= next_due_km
  const due_by_date =
    days_remaining != null && !Number.isNaN(days_remaining) && days_remaining <= 0
  const overdue = due_by_km || due_by_date
  const soon_by_km = km_remaining != null && km_remaining > 0 && km_remaining <= VIDANGE_SOON_KM
  const soon_by_date =
    days_remaining != null &&
    !Number.isNaN(days_remaining) &&
    days_remaining > 0 &&
    days_remaining <= VIDANGE_SOON_DAYS
  const due_soon = !overdue && (soon_by_km || soon_by_date)

  let severity: VidangeSeverity = 'ok'
  if (overdue) severity = 'critical'
  else if (due_soon) severity = 'medium'

  return {
    enabled: true,
    never_done: false,
    last_date,
    last_mileage,
    interval_km,
    interval_months,
    current_mileage,
    next_due_km,
    next_due_date: next_due_date || null,
    km_remaining,
    days_remaining: days_remaining != null && !Number.isNaN(days_remaining) ? days_remaining : null,
    overdue,
    due_soon,
    due_by_km,
    due_by_date,
    severity,
  }
}

export type VidangeTrafficLevel = 'ok' | 'soon' | 'due' | 'never'

export function getVidangeTrafficLevel(status: VidangeStatus): VidangeTrafficLevel {
  if (!status.enabled) return 'ok'
  if (status.never_done) return 'never'
  if (status.overdue) return 'due'
  if (status.due_soon) return 'soon'
  return 'ok'
}

export function formatKm(value: number, unit = 'km') {
  return `${Math.round(value).toLocaleString('fr-FR')} ${unit}`
}

export function formatVidangeBadgeLabel(
  status: VidangeStatus,
  labels: {
    neverDone: string
    overdue: string
    dueSoon: string
    ok: string
    kmOverdue: string
    kmRemaining: string
    dueByDate?: string
  },
) {
  if (!status.enabled) return ''
  const level = getVidangeTrafficLevel(status)
  if (status.never_done) return labels.neverDone
  if (level === 'due') {
    if (status.due_by_km && status.km_remaining != null && status.km_remaining <= 0) {
      return labels.kmOverdue.replace('{n}', String(Math.abs(Math.round(status.km_remaining))))
    }
    if (status.due_by_date) return labels.dueByDate || labels.overdue
    return labels.overdue
  }
  if (level === 'soon' && status.km_remaining != null) {
    return labels.kmRemaining.replace('{n}', String(Math.round(status.km_remaining)))
  }
  if (status.km_remaining != null) {
    return labels.kmRemaining.replace('{n}', String(Math.round(status.km_remaining)))
  }
  return labels.ok
}
