export type DocExpirySeverity = 'critical' | 'high' | 'medium' | 'low' | 'ok'

export type DocExpiryInfo = {
  daysUntil: number
  severity: DocExpirySeverity
  date: string
}

export function daysFromToday(dateStr: string): number {
  const d = dateStr?.trim().slice(0, 10)
  if (!d) return NaN
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${d}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export function getDocExpirySeverity(daysUntil: number): DocExpirySeverity {
  if (daysUntil < 0) return 'critical'
  if (daysUntil <= 7) return 'high'
  if (daysUntil <= 30) return 'medium'
  if (daysUntil <= 90) return 'low'
  return 'ok'
}

export function getDocExpiryInfo(expiry: string): DocExpiryInfo | null {
  if (!expiry?.trim()) return null
  const daysUntil = daysFromToday(expiry)
  if (Number.isNaN(daysUntil)) return null
  return {
    daysUntil,
    severity: getDocExpirySeverity(daysUntil),
    date: expiry.slice(0, 10),
  }
}

type DocExpiryLabels = {
  expiresToday: string
  dayRemaining: string
  daysRemaining: string
  expiredYesterday: string
  expiredDaysAgo: string
}

export function formatDocExpiryLabel(info: DocExpiryInfo, labels: DocExpiryLabels): string {
  const { daysUntil } = info
  if (daysUntil === 0) return labels.expiresToday
  if (daysUntil === 1) return labels.dayRemaining
  if (daysUntil > 1) return labels.daysRemaining.replace('{n}', String(daysUntil))
  if (daysUntil === -1) return labels.expiredYesterday
  return labels.expiredDaysAgo.replace('{n}', String(Math.abs(daysUntil)))
}
