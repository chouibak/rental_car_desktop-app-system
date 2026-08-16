import { computeVidangeStatus } from './vidange-db'

type DbHelpers = {
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
}

export type NotificationSeverity = 'critical' | 'high' | 'medium' | 'low'

export type NotificationKind =
  | 'contract_return_overdue'
  | 'contract_return_today'
  | 'contract_return_soon'
  | 'reservation_return_overdue'
  | 'reservation_return_today'
  | 'reservation_return_soon'
  | 'car_doc_expired'
  | 'car_doc_expiring'
  | 'customer_doc_expired'
  | 'customer_doc_expiring'
  | 'chauffeur_doc_expired'
  | 'chauffeur_doc_expiring'
  | 'car_vidange_overdue'
  | 'car_vidange_soon'

export type Notification = {
  id: string
  kind: NotificationKind
  severity: NotificationSeverity
  link: string
  due_date: string
  days_until: number
  title_label: string
  subtitle: string
  doc_type?: string
  entity_id: number
  km_remaining?: number | null
}

export type NotificationCounts = {
  total: number
  critical: number
  high: number
  medium: number
  low: number
}

const CAR_DOC_FIELDS = [
  { field: 'doc_assurance_expiry', type: 'assurance' },
  { field: 'doc_controle_technique_expiry', type: 'controle_technique' },
  { field: 'doc_vignette_expiry', type: 'vignette' },
  { field: 'doc_autorisation_expiry', type: 'autorisation' },
] as const

const PERSON_DOC_FIELDS = [
  { field: 'cin_expiry_date', type: 'cin' },
  { field: 'passport_expiry_date', type: 'passport' },
  { field: 'license_expiry_date', type: 'license' },
] as const

const SEVERITY_RANK: Record<NotificationSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function dateOnly(value: string) {
  if (!value?.trim()) return ''
  return value.slice(0, 10)
}

function daysFromToday(dateStr: string) {
  const d = dateOnly(dateStr)
  if (!d) return NaN
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${d}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function isReturnOverdue(returnAt: string) {
  if (!returnAt?.trim()) return false
  if (returnAt.length > 10) {
    return new Date(returnAt).getTime() < Date.now()
  }
  return daysFromToday(returnAt) < 0
}

function parseThreshold(value: string | undefined, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

function returnSeverity(kind: 'overdue' | 'today' | 'soon'): NotificationSeverity {
  if (kind === 'overdue') return 'critical'
  if (kind === 'today') return 'high'
  return 'medium'
}

function docSeverity(daysUntil: number): NotificationSeverity {
  if (daysUntil < 0) return 'critical'
  if (daysUntil <= 7) return 'high'
  if (daysUntil <= 30) return 'medium'
  return 'low'
}

function classifyReturn(returnAt: string, returnSoonDays: number): 'overdue' | 'today' | 'soon' | null {
  if (!returnAt?.trim()) return null
  if (isReturnOverdue(returnAt)) return 'overdue'
  const daysUntil = daysFromToday(returnAt)
  if (Number.isNaN(daysUntil)) return null
  if (daysUntil === 0) return 'today'
  if (daysUntil > 0 && daysUntil <= returnSoonDays) return 'soon'
  return null
}

function sortNotifications(items: Notification[]) {
  return [...items].sort((a, b) => {
    const severityDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    if (severityDiff !== 0) return severityDiff
    if (a.days_until !== b.days_until) return a.days_until - b.days_until
    return a.subtitle.localeCompare(b.subtitle)
  })
}

function carLabel(row: { brand?: string; model?: string; plate_number?: string }) {
  const name = [row.brand, row.model].filter(Boolean).join(' ').trim()
  const plate = row.plate_number?.trim()
  if (name && plate) return `${name} · ${plate}`
  return name || plate || '—'
}

export function createNotificationsApi(helpers: DbHelpers, getSettings: () => Record<string, string>) {
  const { queryAll } = helpers

  function getThresholds() {
    const settings = getSettings()
    return {
      returnSoonDays: parseThreshold(settings.notification_return_days, 1),
      docSoonDays: parseThreshold(settings.notification_doc_days, 30),
    }
  }

  function buildContractReturnNotifications(returnSoonDays: number): Notification[] {
    const rows = queryAll<{
      id: number
      contract_number: string
      client_name: string
      brand: string
      model: string
      plate_number: string
      return_at: string
    }>(
      `SELECT c.id, c.contract_number, cu.name as client_name,
              ca.brand, ca.model, ca.plate_number,
              COALESCE(NULLIF(c.return_at, ''), c.end_date) as return_at
       FROM contracts c
       JOIN customers cu ON cu.id = c.client_id
       JOIN cars ca ON ca.id = c.car_id
       WHERE c.status IN ('active', 'draft') AND c.deleted_at IS NULL`,
    )

    const items: Notification[] = []
    for (const row of rows) {
      const bucket = classifyReturn(row.return_at, returnSoonDays)
      if (!bucket) continue
      const daysUntil = daysFromToday(row.return_at)
      const kind: NotificationKind =
        bucket === 'overdue'
          ? 'contract_return_overdue'
          : bucket === 'today'
            ? 'contract_return_today'
            : 'contract_return_soon'
      items.push({
        id: `contract-return-${row.id}`,
        kind,
        severity: returnSeverity(bucket),
        link: `/contracts/${row.id}`,
        due_date: dateOnly(row.return_at),
        days_until: Number.isNaN(daysUntil) ? (bucket === 'overdue' ? -1 : 0) : daysUntil,
        title_label: row.contract_number,
        subtitle: `${row.client_name} · ${carLabel(row)}`,
        entity_id: row.id,
      })
    }
    return items
  }

  function buildReservationReturnNotifications(returnSoonDays: number): Notification[] {
    const rows = queryAll<{
      id: number
      reference: string
      customer_name: string
      brand: string
      model: string
      plate_number: string
      return_date: string
    }>(
      `SELECT r.id, r.reference, cu.name as customer_name,
              ca.brand, ca.model, ca.plate_number, r.return_date
       FROM reservations r
       JOIN customers cu ON cu.id = r.customer_id
       JOIN cars ca ON ca.id = r.car_id
       WHERE r.status IN ('pending', 'confirmed')
         AND COALESCE(r.return_date, '') != ''
         AND NOT EXISTS (
           SELECT 1 FROM contracts c
           WHERE c.reservation_id = r.id
             AND c.deleted_at IS NULL
             AND c.status IN ('active', 'draft')
         )`,
    )

    const items: Notification[] = []
    for (const row of rows) {
      const bucket = classifyReturn(row.return_date, returnSoonDays)
      if (!bucket) continue
      const daysUntil = daysFromToday(row.return_date)
      const kind: NotificationKind =
        bucket === 'overdue'
          ? 'reservation_return_overdue'
          : bucket === 'today'
            ? 'reservation_return_today'
            : 'reservation_return_soon'
      items.push({
        id: `reservation-return-${row.id}`,
        kind,
        severity: returnSeverity(bucket),
        link: `/reservations/${row.id}`,
        due_date: dateOnly(row.return_date),
        days_until: Number.isNaN(daysUntil) ? (bucket === 'overdue' ? -1 : 0) : daysUntil,
        title_label: row.reference || `#${row.id}`,
        subtitle: `${row.customer_name} · ${carLabel(row)}`,
        entity_id: row.id,
      })
    }
    return items
  }

  function buildCarDocNotifications(docSoonDays: number): Notification[] {
    const cars = queryAll<Record<string, string | number>>(
      `SELECT id, brand, model, plate_number,
              doc_carte_grise_expiry, doc_assurance_expiry, doc_controle_technique_expiry,
              doc_vignette_expiry, doc_autorisation_expiry
       FROM cars`,
    )

    const items: Notification[] = []
    for (const car of cars) {
      const label = carLabel({
        brand: String(car.brand ?? ''),
        model: String(car.model ?? ''),
        plate_number: String(car.plate_number ?? ''),
      })
      for (const doc of CAR_DOC_FIELDS) {
        const expiry = String(car[doc.field] ?? '').trim()
        if (!expiry) continue
        const daysUntil = daysFromToday(expiry)
        if (Number.isNaN(daysUntil)) continue
        const expired = daysUntil < 0
        const expiringSoon = daysUntil >= 0 && daysUntil <= docSoonDays
        if (!expired && !expiringSoon) continue
        items.push({
          id: `car-doc-${car.id}-${doc.type}`,
          kind: expired ? 'car_doc_expired' : 'car_doc_expiring',
          severity: docSeverity(daysUntil),
          link: `/cars/${car.id}/edit`,
          due_date: dateOnly(expiry),
          days_until: daysUntil,
          title_label: label,
          subtitle: doc.type,
          doc_type: doc.type,
          entity_id: Number(car.id),
        })
      }
    }
    return items
  }

  function buildCarVidangeNotifications(): Notification[] {
    const cars = queryAll<{
      id: number
      brand: string
      model: string
      plate_number: string
      mileage: number
      vidange_interval_km: number
      vidange_interval_months: number
      vidange_last_date: string
      vidange_last_mileage: number
    }>(
      `SELECT id, brand, model, plate_number, mileage,
              vidange_interval_km, vidange_interval_months, vidange_last_date, vidange_last_mileage
       FROM cars`,
    )

    const items: Notification[] = []
    for (const car of cars) {
      const status = computeVidangeStatus(car)
      if (!status.enabled || status.never_done || (!status.overdue && !status.due_soon)) continue

      const label = carLabel({
        brand: car.brand,
        model: car.model,
        plate_number: car.plate_number,
      })

      const daysUntil =
        status.days_remaining != null && !Number.isNaN(status.days_remaining)
          ? status.days_remaining
          : status.overdue
            ? -1
            : 1

      items.push({
        id: `car-vidange-${car.id}`,
        kind: status.overdue ? 'car_vidange_overdue' : 'car_vidange_soon',
        severity:
          status.severity === 'critical'
            ? 'critical'
            : status.severity === 'high'
              ? 'high'
              : status.severity === 'medium'
                ? 'medium'
                : 'low',
        link: `/cars/${car.id}?tab=vidange`,
        due_date: status.next_due_date || '',
        days_until: daysUntil,
        title_label: label,
        subtitle: 'vidange',
        entity_id: car.id,
        km_remaining: status.km_remaining,
      })
    }
    return items
  }

  function buildCustomerDocNotifications(docSoonDays: number): Notification[] {
    const customers = queryAll<Record<string, string | number>>(
      `SELECT id, name, cin_expiry_date, passport_expiry_date, license_expiry_date FROM customers`,
    )
    return buildPersonDocNotifications(customers, 'customer', docSoonDays)
  }

  function buildChauffeurDocNotifications(docSoonDays: number): Notification[] {
    const chauffeurs = queryAll<Record<string, string | number>>(
      `SELECT id, name, cin_expiry_date, passport_expiry_date, license_expiry_date
       FROM chauffeurs WHERE is_active = 1`,
    )
    return buildPersonDocNotifications(chauffeurs, 'chauffeur', docSoonDays)
  }

  function buildPersonDocNotifications(
    rows: Record<string, string | number>[],
    entity: 'customer' | 'chauffeur',
    docSoonDays: number,
  ): Notification[] {
    const items: Notification[] = []
    for (const row of rows) {
      const name = String(row.name ?? '—')
      for (const doc of PERSON_DOC_FIELDS) {
        const expiry = String(row[doc.field] ?? '').trim()
        if (!expiry) continue
        const daysUntil = daysFromToday(expiry)
        if (Number.isNaN(daysUntil)) continue
        const expired = daysUntil < 0
        const expiringSoon = daysUntil >= 0 && daysUntil <= docSoonDays
        if (!expired && !expiringSoon) continue
        const prefix = entity === 'customer' ? 'customer' : 'chauffeur'
        items.push({
          id: `${prefix}-doc-${row.id}-${doc.type}`,
          kind: expired
            ? entity === 'customer'
              ? 'customer_doc_expired'
              : 'chauffeur_doc_expired'
            : entity === 'customer'
              ? 'customer_doc_expiring'
              : 'chauffeur_doc_expiring',
          severity: docSeverity(daysUntil),
          link: entity === 'customer' ? `/customers/${row.id}/edit` : `/chauffeurs/${row.id}`,
          due_date: dateOnly(expiry),
          days_until: daysUntil,
          title_label: name,
          subtitle: doc.type,
          doc_type: doc.type,
          entity_id: Number(row.id),
        })
      }
    }
    return items
  }

  return {
    getNotifications(): Notification[] {
      const { returnSoonDays, docSoonDays } = getThresholds()
      const items = [
        ...buildContractReturnNotifications(returnSoonDays),
        ...buildReservationReturnNotifications(returnSoonDays),
        ...buildCarDocNotifications(docSoonDays),
        ...buildCarVidangeNotifications(),
        ...buildCustomerDocNotifications(docSoonDays),
        ...buildChauffeurDocNotifications(docSoonDays),
      ]
      return sortNotifications(items)
    },

    getNotificationCounts(): NotificationCounts {
      const items = this.getNotifications()
      return {
        total: items.length,
        critical: items.filter((n) => n.severity === 'critical').length,
        high: items.filter((n) => n.severity === 'high').length,
        medium: items.filter((n) => n.severity === 'medium').length,
        low: items.filter((n) => n.severity === 'low').length,
      }
    },
  }
}
