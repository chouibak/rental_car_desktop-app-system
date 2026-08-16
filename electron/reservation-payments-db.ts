import type { Database } from 'sql.js'
import type { PaymentStatus } from './reservations-db'
import { datePrefixEquals, localYmd, localYearMonth, roundMoney } from './local-date'
import {
  contractPaidExpr,
  getReservationTotal,
  queryUnpaidTotal,
  syncAllReservationPaymentStatuses,
  syncReservationPaymentStatus,
} from './payment-sync'
import {
  createReservationPaymentRow,
  deleteReservationPaymentRow,
  deleteReservationPaymentRows,
  setReservationRentalPaid,
  updateReservationPaymentRow,
  type LedgerHelpers,
} from './payment-ledger'

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
  source: 'reservation' | 'contract'
  contract_id?: number | null
  contract_number?: string | null
  reservation_reference: string | null
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

type DbHelpers = LedgerHelpers & {
  lastId: () => number
}

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

/** Newest first, on payment date then registration order. */
const LEDGER_ORDER = `
  ORDER BY datetime(replace(substr(COALESCE(paid_at, created_at, ''), 1, 19), 'T', ' ')) DESC,
           datetime(replace(substr(COALESCE(created_at, paid_at, ''), 1, 19), 'T', ' ')) DESC,
           id DESC
`

export function createReservationPaymentsApi(helpers: DbHelpers) {
  /** One row shape for both ledgers, so the Paiements page can list them together. */
  const reservationSelect = (where: string) => `
    SELECT
      p.id,
      p.reservation_id,
      p.type,
      p.amount,
      p.method,
      p.status,
      p.reference,
      COALESCE(p.notes, '') as notes,
      p.paid_at,
      p.created_at,
      p.updated_at,
      'reservation' as source,
      NULL as contract_id,
      NULL as contract_number,
      r.reference as reservation_reference,
      r.payment_status as reservation_payment_status,
      cu.name as customer_name,
      ca.name as car_name
    FROM reservation_payments p
    JOIN reservations r ON r.id = p.reservation_id
    JOIN customers cu ON cu.id = r.customer_id
    JOIN cars ca ON ca.id = r.car_id
    WHERE ${where}
  `

  const contractSelect = (where: string) => `
    SELECT
      p.id,
      c.reservation_id,
      'rental' as type,
      p.amount,
      p.method,
      p.status,
      c.contract_number as reference,
      COALESCE(p.note, '') as notes,
      p.paid_at,
      p.created_at,
      COALESCE(p.updated_at, p.created_at) as updated_at,
      'contract' as source,
      p.contract_id,
      c.contract_number,
      r.reference as reservation_reference,
      CASE
        WHEN COALESCE(c.total_amount, 0) <= 0 THEN 'paid'
        WHEN ${contractPaidExpr()} >= c.total_amount THEN 'paid'
        WHEN ${contractPaidExpr()} > 0 THEN 'partial'
        ELSE 'unpaid'
      END as reservation_payment_status,
      cu.name as customer_name,
      ca.name as car_name
    FROM payments p
    JOIN contracts c ON c.id = p.contract_id
    JOIN customers cu ON cu.id = c.client_id
    JOIN cars ca ON ca.id = c.car_id
    LEFT JOIN reservations r ON r.id = c.reservation_id
    WHERE ${where}
  `

  return {
    listReservationPayments(filters?: ReservationPaymentFilters) {
      const reservationWhere = [`r.status != 'cancelled'`]
      const contractWhere = [`c.deleted_at IS NULL`, `c.status != 'cancelled'`]
      const reservationParams: unknown[] = []
      const contractParams: unknown[] = []
      // Contract payments are always rental money, so a deposit filter excludes them.
      const includeContracts = !filters?.type || filters.type === 'rental'

      if (filters?.q) {
        const like = `%${filters.q}%`
        reservationWhere.push('(p.reference LIKE ? OR r.reference LIKE ? OR cu.name LIKE ? OR ca.name LIKE ?)')
        reservationParams.push(like, like, like, like)
        contractWhere.push(
          `(c.contract_number LIKE ? OR cu.name LIKE ? OR ca.name LIKE ? OR COALESCE(p.note, '') LIKE ? OR COALESCE(r.reference, '') LIKE ?)`,
        )
        contractParams.push(like, like, like, like, like)
      }
      if (filters?.reservation_id) {
        reservationWhere.push('p.reservation_id = ?')
        reservationParams.push(filters.reservation_id)
        contractWhere.push('c.reservation_id = ?')
        contractParams.push(filters.reservation_id)
      }
      if (filters?.type) {
        reservationWhere.push('p.type = ?')
        reservationParams.push(filters.type)
      }
      if (filters?.status) {
        reservationWhere.push('p.status = ?')
        reservationParams.push(filters.status)
        contractWhere.push('p.status = ?')
        contractParams.push(filters.status)
      }

      const reservationSql = reservationSelect(reservationWhere.join(' AND '))
      const sql = includeContracts
        ? `SELECT * FROM (${reservationSql} UNION ALL ${contractSelect(contractWhere.join(' AND '))}) combined ${LEDGER_ORDER}`
        : `${reservationSql} ${LEDGER_ORDER}`

      return helpers.queryAll<ReservationPaymentListItem>(
        sql,
        includeContracts ? [...reservationParams, ...contractParams] : reservationParams,
      )
    },

    getReservationPayment(id: number) {
      return helpers.queryOne<ReservationPaymentListItem>(reservationSelect('p.id = ?'), [id])
    },

    createReservationPayment(data: ReservationPaymentInput) {
      const id = createReservationPaymentRow(helpers, data)
      const row = this.getReservationPayment(id)
      if (!row) throw new Error('PAYMENT_CREATE_FAILED')
      return row
    },

    updateReservationPayment(id: number, data: Partial<ReservationPaymentInput>) {
      updateReservationPaymentRow(helpers, id, data)
      return this.getReservationPayment(id)
    },

    deleteReservationPayment(id: number) {
      deleteReservationPaymentRow(helpers, id)
      return { ok: true }
    },

    deleteReservationPaymentsByReservation(reservationId: number) {
      deleteReservationPaymentRows(helpers, reservationId)
      return { ok: true }
    },

    /** Payment status wizard on the reservation form: force paid cash to match the choice. */
    applyReservationPaymentStatus(
      reservationId: number,
      payment_status: PaymentStatus,
      partialAmount?: number,
    ) {
      const total = getReservationTotal(helpers, reservationId)

      let targetPaid = 0
      if (payment_status === 'paid') {
        targetPaid = total
      } else if (payment_status === 'partial') {
        const amount = Number(partialAmount)
        if (!Number.isFinite(amount) || amount <= 0 || amount >= total) {
          throw new Error('INVALID_PARTIAL_AMOUNT')
        }
        targetPaid = amount
      }

      setReservationRentalPaid(helpers, reservationId, targetPaid)
      return { ok: true }
    },

    getPaymentStats(): PaymentStats {
      const today = localYmd()
      const monthPrefix = localYearMonth()

      const cashIn = (prefix: string) => {
        const reservation = helpers.queryOne<{ total: number; count: number }>(
          `SELECT COALESCE(SUM(p.amount), 0) as total, COUNT(*) as count
           FROM reservation_payments p
           INNER JOIN reservations r ON r.id = p.reservation_id AND r.status != 'cancelled'
           WHERE p.type = 'rental' AND p.status = 'completed' AND ${datePrefixEquals('p.paid_at', prefix)}`,
          [prefix],
        )
        const contract = helpers.queryOne<{ total: number; count: number }>(
          `SELECT COALESCE(SUM(p.amount), 0) as total, COUNT(*) as count
           FROM payments p
           INNER JOIN contracts c ON c.id = p.contract_id AND c.deleted_at IS NULL AND c.status != 'cancelled'
           WHERE p.status = 'completed' AND ${datePrefixEquals('p.paid_at', prefix)}`,
          [prefix],
        )
        return {
          total: roundMoney((reservation?.total ?? 0) + (contract?.total ?? 0)),
          count: (reservation?.count ?? 0) + (contract?.count ?? 0),
        }
      }

      const todayCash = cashIn(today)
      const monthCash = cashIn(monthPrefix)

      return {
        today_revenue: todayCash.total,
        today_payments_count: todayCash.count,
        month_revenue: monthCash.total,
        unpaid_total: queryUnpaidTotal(helpers),
      }
    },
  }
}
