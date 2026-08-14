import type { Notification, NotificationKind } from '../types'
import type { Lang } from '../types'
import { VIDANGE_SOON_KM } from './vidange'

type Dict = Record<string, string>

function replaceParams(template: string, params: Record<string, string | number>) {
  return Object.entries(params).reduce(
    (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value)),
    template,
  )
}

export function docTypeLabel(t: Dict, docType?: string) {
  const map: Record<string, string> = {
    carte_grise: t.docCarteGrise,
    assurance: t.docAssurance,
    controle_technique: t.docControleTechnique,
    vignette: t.docVignette,
    autorisation: t.docAutorisation,
    cin: t.docCin,
    passport: t.docPassport,
    license: t.docLicense,
  }
  return docType ? map[docType] ?? docType : ''
}

export function notificationTitle(t: Dict, kind: NotificationKind) {
  const titles: Record<NotificationKind, string> = {
    contract_return_overdue: t.notificationTitleContractReturnOverdue,
    contract_return_today: t.notificationTitleContractReturnToday,
    contract_return_soon: t.notificationTitleContractReturnSoon,
    reservation_return_overdue: t.notificationTitleReservationReturnOverdue,
    reservation_return_today: t.notificationTitleReservationReturnToday,
    reservation_return_soon: t.notificationTitleReservationReturnSoon,
    car_doc_expired: t.notificationTitleCarDocExpired,
    car_doc_expiring: t.notificationTitleCarDocExpiring,
    customer_doc_expired: t.notificationTitleCustomerDocExpired,
    customer_doc_expiring: t.notificationTitleCustomerDocExpiring,
    chauffeur_doc_expired: t.notificationTitleChauffeurDocExpired,
    chauffeur_doc_expiring: t.notificationTitleChauffeurDocExpiring,
    car_vidange_overdue: t.notificationTitleCarVidangeOverdue,
    car_vidange_soon: t.notificationTitleCarVidangeSoon,
  }
  return titles[kind]
}

export function isVidangeNotification(kind: NotificationKind) {
  return kind.startsWith('car_vidange_')
}

export function isDocNotification(kind: NotificationKind) {
  return kind.includes('_doc_')
}

function vidangeKmLabel(t: Dict, km: number) {
  const n = Math.abs(Math.round(km)).toLocaleString('fr-FR')
  return km <= 0 ? t.vidangeKmOverdue.replace('{n}', n) : t.vidangeKmRemaining.replace('{n}', n)
}

export function notificationEntityTag(t: Dict, kind: NotificationKind) {
  if (kind.startsWith('contract_')) return t.notificationEntityContract
  if (kind.startsWith('reservation_')) return t.notificationEntityReservation
  if (isVidangeNotification(kind)) return t.notificationEntityVidange
  if (kind.startsWith('car_')) return t.notificationEntityCar
  if (kind.startsWith('customer_doc_')) return t.notificationEntityCustomer
  return t.notificationEntityChauffeur
}

export function notificationDetail(t: Dict, item: Notification) {
  if (item.doc_type) {
    return `${item.title_label} · ${docTypeLabel(t, item.doc_type)}`
  }
  if (isVidangeNotification(item.kind) && item.km_remaining != null) {
    return `${item.title_label} · ${vidangeKmLabel(t, item.km_remaining)}`
  }
  if (isVidangeNotification(item.kind)) {
    return item.title_label
  }
  return `${item.title_label} · ${item.subtitle}`
}

export function notificationMessage(t: Dict, item: Notification) {
  const ref = item.title_label
  const doc = docTypeLabel(t, item.doc_type)
  const days = Math.abs(item.days_until)

  const templates: Record<NotificationKind, string> = {
    contract_return_overdue: t.notificationContractReturnOverdue,
    contract_return_today: t.notificationContractReturnToday,
    contract_return_soon: t.notificationContractReturnSoon,
    reservation_return_overdue: t.notificationReservationReturnOverdue,
    reservation_return_today: t.notificationReservationReturnToday,
    reservation_return_soon: t.notificationReservationReturnSoon,
    car_doc_expired: t.notificationCarDocExpired,
    car_doc_expiring: t.notificationCarDocExpiring,
    customer_doc_expired: t.notificationCustomerDocExpired,
    customer_doc_expiring: t.notificationCustomerDocExpiring,
    chauffeur_doc_expired: t.notificationChauffeurDocExpired,
    chauffeur_doc_expiring: t.notificationChauffeurDocExpiring,
    car_vidange_overdue: t.notificationCarVidangeOverdue,
    car_vidange_soon: t.notificationCarVidangeSoon,
  }

  return replaceParams(templates[item.kind], { ref, doc, days, detail: item.subtitle })
}

export function notificationTimingLabel(t: Dict, item: Notification) {
  if (isVidangeNotification(item.kind)) {
    const km = item.km_remaining
    const showKm =
      km != null &&
      (km <= 0 || (item.kind === 'car_vidange_soon' && km > 0 && km <= VIDANGE_SOON_KM))
    if (showKm && km != null) return vidangeKmLabel(t, km)
    if (item.days_until < 0) return replaceParams(t.notificationDaysOverdue, { days: Math.abs(item.days_until) })
    if (item.days_until === 0) return t.notificationVidangeDueToday
    return replaceParams(t.notificationDaysLeft, { days: item.days_until })
  }
  if (item.kind.includes('_doc_')) {
    if (item.days_until < 0) return replaceParams(t.notificationDaysOverdue, { days: Math.abs(item.days_until) })
    if (item.days_until === 0) return t.notificationDocDueToday
    return replaceParams(t.notificationDaysLeft, { days: item.days_until })
  }
  if (item.days_until < 0) return replaceParams(t.notificationDaysOverdue, { days: Math.abs(item.days_until) })
  if (item.days_until === 0) return t.notificationDueToday
  return replaceParams(t.notificationDaysLeft, { days: item.days_until })
}

export function notificationSeverityLabel(t: Dict, severity: Notification['severity']) {
  if (severity === 'critical') return t.notificationCritical
  if (severity === 'high') return t.notificationHigh
  if (severity === 'medium') return t.notificationMedium
  return t.notificationLow
}

export function isReturnNotification(kind: NotificationKind) {
  return kind.includes('_return_')
}

export function notificationActionLabel(t: Dict, kind: NotificationKind) {
  if (kind.startsWith('contract_')) return t.notificationActionContract
  if (kind.startsWith('reservation_')) return t.notificationActionReservation
  if (isVidangeNotification(kind)) return t.notificationActionVidange
  if (kind.startsWith('car_')) return t.notificationActionCar
  if (kind.startsWith('customer_doc_')) return t.notificationActionCustomer
  return t.notificationActionChauffeur
}

export function formatNotificationDate(value: string, lang: Lang) {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return date.toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
