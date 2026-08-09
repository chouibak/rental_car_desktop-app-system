import type { Database } from 'sql.js'
import type { PaymentStatus, DepositStatus } from './reservations-db'
import {
  getReservationRentalPaid,
  syncAllReservationPaymentStatuses,
  syncReservationPaymentStatus,
  UNPAID_RESERVATIONS_PAID_SUBQUERY,
} from './payment-sync'

export { syncAllReservationPaymentStatuses, syncReservationPaymentStatus }

export type ReservationPaymentType = 'rental' | 'deposit' | 'deposit_return'
export type ReservationPaymentMethod = 'cash' | 'card' | 'bank_transfer'
export type ReservationPaymentRecordStatus = 'completed' | 'pending' | 'cancelled'

export type ReservationPaymentRecord = {
  id: number
  reservation_id: number
  type: ReservationPaymentType
  amount: number
  method: ReservationPaymentMethod
  status: ReservationPaymentRecordStatus
  reference: string
  notes: string
  paid_at: string
  created_at: string
  updated_at: string
}

export type ReservationPaymentListItem = ReservationPaymentRecord & {
  reservation_reference: string
  customer_name: string
  car_name: string
  reservation_payment_status?: string
}

export type ReservationPaymentInput = {
  reservation_id: number
  type: ReservationPaymentType
  amount: number
  method?: ReservationPaymentMethod
  status?: ReservationPaymentRecordStatus
  reference?: string
  notes?: string
  paid_at?: string
}

export type ReservationPaymentFilters = {
  q?: string
  reservation_id?: number | ''
  type?: ReservationPaymentType | ''
  status?: ReservationPaymentRecordStatus | ''
}

export type PaymentStats = {
  today_revenue: number
  today_payments_count: number
  month_revenue: number
  unpaid_total: number
}

type DbHelpers = {
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
  run: (sql: string, params?: unknown[]) => void
  runInsert: (sql: string, params?: unknown[]) => number
  lastId: () => number
  now: () => string
}

const PAYMENT_TYPES: ReservationPaymentType[] = ['rental', 'deposit', 'deposit_return']
const PAYMENT_METHODS: ReservationPaymentMethod[] = ['cash', 'card', 'bank_transfer']
const PAYMENT_STATUSES: ReservationPaymentRecordStatus[] = ['completed', 'pending', 'cancelled']

export function createReservationPaymentsSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS reservation_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reservation_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'completed',
      reference TEXT NOT NULL UNIQUE,
      notes TEXT,
      paid_at TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY(reservation_id) REFERENCES reservations(id)
    )
  `)
}

function nextReference(helpers: DbHelpers) {
  const year = new Date().getFullYear()
  const prefix = `PAY-${year}-`
  const row = helpers.queryOne<{ reference: string }>(
    `SELECT reference FROM reservation_payments WHERE reference LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`],
  )
  const last = row?.reference ? Number(row.reference.split('-').pop()) : 0
  return `${prefix}${String((last || 0) + 1).padStart(3, '0')}`
}

function normalizeInput(data: ReservationPaymentInput) {
  const type = PAYMENT_TYPES.includes(data.type) ? data.type : 'rental'
  const method = PAYMENT_METHODS.includes(data.method as ReservationPaymentMethod)
    ? (data.method as ReservationPaymentMethod)
    : 'cash'
  const status = PAYMENT_STATUSES.includes(data.status as ReservationPaymentRecordStatus)
    ? (data.status as ReservationPaymentRecordStatus)
    : 'completed'
  const amount = Number(data.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('INVALID_AMOUNT')

  return {
    reservation_id: Number(data.reservation_id),
    type,
    amount,
    method,
    status,
    reference: data.reference?.trim() || '',
    notes: data.notes?.trim() || '',
    paid_at: data.paid_at?.trim() || new Date().toISOString().slice(0, 10),
  }
}

function syncReservationStatuses(helpers: DbHelpers, reservationId: number) {
  syncReservationPaymentStatus(helpers, reservationId)
}

/** Set total rental paid to an exact target by cancelling/removing or adding payments. */
function adjustReservationRentalPaid(helpers: DbHelpers, reservationId: number, targetPaid: number) {
  const reservation = helpers.queryOne<{ total_amount: number }>(
    'SELECT total_amount FROM reservations WHERE id = ?',
    [reservationId],
  )
  if (!reservation) throw new Error('RESERVATION_NOT_FOUND')

  const target = Math.max(0, Math.min(targetPaid, reservation.total_amount))
  const t = helpers.now()

  let current = getReservationRentalPaid(helpers, reservationId)
  while (current > target + 0.001) {
    const reservationPayment = helpers.queryOne<{ id: number }>(
      `SELECT id FROM reservation_payments
       WHERE reservation_id = ? AND type = 'rental' AND status = 'completed'
       ORDER BY id DESC LIMIT 1`,
      [reservationId],
    )
    if (reservationPayment) {
      helpers.run(
        `UPDATE reservation_payments SET status = 'cancelled', updated_at = ? WHERE id = ?`,
        [t, reservationPayment.id],
      )
      current = getReservationRentalPaid(helpers, reservationId)
      continue
    }

    const contractPayment = helpers.queryOne<{ id: number }>(
      `SELECT p.id FROM payments p
       INNER JOIN contracts c ON c.id = p.contract_id AND c.deleted_at IS NULL
       WHERE c.reservation_id = ?
       ORDER BY p.id DESC LIMIT 1`,
      [reservationId],
    )
    if (contractPayment) {
      helpers.run('DELETE FROM payments WHERE id = ?', [contractPayment.id])
      current = getReservationRentalPaid(helpers, reservationId)
      continue
    }

    break
  }

  current = getReservationRentalPaid(helpers, reservationId)
  const toAdd = target - current
  if (toAdd > 0.001) {
    const reference = nextReference(helpers)
    helpers.runInsert(
      `INSERT INTO reservation_payments (
        reservation_id, type, amount, method, status, reference, notes, paid_at, created_at, updated_at
      ) VALUES (?, 'rental', ?, 'cash', 'completed', ?, '', ?, ?, ?)`,
      [reservationId, toAdd, reference, t.slice(0, 10), t, t],
    )
  }

  syncReservationPaymentStatus(helpers, reservationId)
}

export function createReservationPaymentsApi(helpers: DbHelpers) {
  const listSql = `
    SELECT p.*,
      r.reference as reservation_reference,
      r.payment_status as reservation_payment_status,
      cu.name as customer_name,
      ca.name as car_name
    FROM reservation_payments p
    JOIN reservations r ON r.id = p.reservation_id
    JOIN customers cu ON cu.id = r.customer_id
    JOIN cars ca ON ca.id = r.car_id
  `

  return {
    listReservationPayments(filters?: ReservationPaymentFilters) {
      let sql = `${listSql} WHERE 1=1`
      const params: unknown[] = []

      if (filters?.q) {
        sql += ` AND (p.reference LIKE ? OR r.reference LIKE ? OR cu.name LIKE ? OR ca.name LIKE ?)`
        const like = `%${filters.q}%`
        params.push(like, like, like, like)
      }
      if (filters?.reservation_id) {
        sql += ' AND p.reservation_id = ?'
        params.push(filters.reservation_id)
      }
      if (filters?.type) {
        sql += ' AND p.type = ?'
        params.push(filters.type)
      }
      if (filters?.status) {
        sql += ' AND p.status = ?'
        params.push(filters.status)
      }

      sql += ' ORDER BY p.paid_at DESC, p.id DESC'
      return helpers.queryAll<ReservationPaymentListItem>(sql, params)
    },

    getReservationPayment(id: number) {
      return helpers.queryOne<ReservationPaymentListItem>(`${listSql} WHERE p.id = ?`, [id])
    },

    createReservationPayment(data: ReservationPaymentInput) {
      const reservation = helpers.queryOne('SELECT id FROM reservations WHERE id = ?', [data.reservation_id])
      if (!reservation) throw new Error('RESERVATION_NOT_FOUND')

      const normalized = normalizeInput(data)
      const t = helpers.now()
      const reference = normalized.reference || nextReference(helpers)

      const id = helpers.runInsert(
        `INSERT INTO reservation_payments (
          reservation_id, type, amount, method, status, reference, notes, paid_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalized.reservation_id,
          normalized.type,
          normalized.amount,
          normalized.method,
          normalized.status,
          reference,
          normalized.notes,
          normalized.paid_at,
          t,
          t,
        ],
      )

      syncReservationStatuses(helpers, normalized.reservation_id)
      const row = this.getReservationPayment(id)
      if (!row) throw new Error('PAYMENT_CREATE_FAILED')
      return row
    },

    updateReservationPayment(id: number, data: Partial<ReservationPaymentInput>) {
      const existing = helpers.queryOne<ReservationPaymentRecord>(
        'SELECT * FROM reservation_payments WHERE id = ?',
        [id],
      )
      if (!existing) throw new Error('PAYMENT_NOT_FOUND')

      const normalized = normalizeInput({
        reservation_id: existing.reservation_id,
        type: data.type ?? existing.type,
        amount: data.amount ?? existing.amount,
        method: data.method ?? existing.method,
        status: data.status ?? existing.status,
        reference: data.reference ?? existing.reference,
        notes: data.notes ?? existing.notes,
        paid_at: data.paid_at ?? existing.paid_at,
      })

      const t = helpers.now()
      helpers.run(
        `UPDATE reservation_payments
         SET type = ?, amount = ?, method = ?, status = ?, reference = ?, notes = ?, paid_at = ?, updated_at = ?
         WHERE id = ?`,
        [
          normalized.type,
          normalized.amount,
          normalized.method,
          normalized.status,
          normalized.reference,
          normalized.notes,
          normalized.paid_at,
          t,
          id,
        ],
      )

      syncReservationStatuses(helpers, existing.reservation_id)
      return this.getReservationPayment(id)
    },

    deleteReservationPayment(id: number) {
      const existing = helpers.queryOne<ReservationPaymentRecord>(
        'SELECT * FROM reservation_payments WHERE id = ?',
        [id],
      )
      if (!existing) throw new Error('PAYMENT_NOT_FOUND')

      helpers.run('DELETE FROM reservation_payments WHERE id = ?', [id])
      syncReservationStatuses(helpers, existing.reservation_id)
      return { ok: true }
    },

    deleteReservationPaymentsByReservation(reservationId: number) {
      helpers.run('DELETE FROM reservation_payments WHERE reservation_id = ?', [reservationId])
      syncReservationStatuses(helpers, reservationId)
      return { ok: true }
    },

    applyReservationPaymentStatus(
      reservationId: number,
      payment_status: PaymentStatus,
      partialAmount?: number,
    ) {
      const reservation = helpers.queryOne<{ total_amount: number }>(
        'SELECT total_amount FROM reservations WHERE id = ?',
        [reservationId],
      )
      if (!reservation) throw new Error('RESERVATION_NOT_FOUND')

      let targetPaid = 0
      if (payment_status === 'paid') {
        targetPaid = reservation.total_amount
      } else if (payment_status === 'partial') {
        const amount = Number(partialAmount)
        if (!Number.isFinite(amount) || amount <= 0 || amount >= reservation.total_amount) {
          throw new Error('INVALID_PARTIAL_AMOUNT')
        }
        targetPaid = amount
      }

      adjustReservationRentalPaid(helpers, reservationId, targetPaid)
      return { ok: true }
    },

    getPaymentStats(): PaymentStats {
      const today = new Date().toISOString().slice(0, 10)
      const monthPrefix = today.slice(0, 7)

      const todayReservation = helpers.queryOne<{ total: number; count: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
         FROM reservation_payments
         WHERE type = 'rental' AND status = 'completed' AND paid_at = ?`,
        [today],
      )

      const todayContract = helpers.queryOne<{ total: number; count: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
         FROM payments WHERE paid_at = ?`,
        [today],
      )

      const monthReservation = helpers.queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM reservation_payments
         WHERE type = 'rental' AND status = 'completed' AND paid_at LIKE ?`,
        [`${monthPrefix}%`],
      )

      const monthContract = helpers.queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE paid_at LIKE ?`,
        [`${monthPrefix}%`],
      )

      const unpaidRow = helpers.queryOne<{ total: number }>(
        `SELECT COALESCE(SUM(
          CASE
            WHEN r.total_amount > COALESCE(p.paid, 0) THEN r.total_amount - COALESCE(p.paid, 0)
            ELSE 0
          END
        ), 0) as total
         FROM reservations r
         LEFT JOIN (${UNPAID_RESERVATIONS_PAID_SUBQUERY}) p ON p.reservation_id = r.id
         WHERE r.status != 'cancelled'`,
      )

      return {
        today_revenue: (todayReservation?.total ?? 0) + (todayContract?.total ?? 0),
        today_payments_count: (todayReservation?.count ?? 0) + (todayContract?.count ?? 0),
        month_revenue: (monthReservation?.total ?? 0) + (monthContract?.total ?? 0),
        unpaid_total: unpaidRow?.total ?? 0,
      }
    },
  }
}
