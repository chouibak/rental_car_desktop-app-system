import type { Notification, NotificationKind } from '../types'
import type { Lang } from '../types'

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
  }
  return titles[kind]
}

export function notificationEntityTag(t: Dict, kind: NotificationKind) {
  if (kind.startsWith('contract_')) return t.notificationEntityContract
  if (kind.startsWith('reservation_')) return t.notificationEntityReservation
  if (kind.startsWith('car_doc_')) return t.notificationEntityCar
  if (kind.startsWith('customer_doc_')) return t.notificationEntityCustomer
  return t.notificationEntityChauffeur
}

export function notificationDetail(t: Dict, item: Notification) {
  if (item.doc_type) {
    return `${item.title_label} · ${docTypeLabel(t, item.doc_type)}`
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
  }

  return replaceParams(templates[item.kind], { ref, doc, days })
}

export function notificationTimingLabel(t: Dict, item: Notification) {
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
  if (kind.startsWith('car_doc_')) return t.notificationActionCar
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
