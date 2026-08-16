import type { PaymentStatus, DepositStatus } from './reservations-db'
import { roundMoney } from './local-date'

/**
 * Money is stored in two ledgers:
 *  - `payments`             : cash collected on a contract
 *  - `reservation_payments` : cash collected on a reservation (rental / deposit / deposit_return)
 *
 * A contract linked to a reservation shares ONE rental balance, so both ledgers are
 * summed together. Every "paid" figure in the app must come from the helpers below —
 * never from an inline SUM — otherwise pages disagree with each other.
 */

export type QueryHelpers = {
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
}

export type SyncHelpers = QueryHelpers & {
  run: (sql: string, params?: unknown[]) => void
  now: () => string
}

/** Tolerance used for every money comparison (avoids float noise). */
export const MONEY_EPSILON = 0.001

/** Only completed rows count as cash received. */
const COMPLETED = `'completed'`

/** A contract still holding money: not deleted and not cancelled. */
const liveContract = (alias: string) => `${alias}.deleted_at IS NULL AND ${alias}.status != 'cancelled'`

/** Cash collected on one contract, including its reservation's rental payments. */
export function contractPaidExpr(contract = 'c') {
  return `(
    COALESCE((
      SELECT SUM(p.amount) FROM payments p
      WHERE p.contract_id = ${contract}.id AND p.status = ${COMPLETED}
    ), 0)
    + CASE WHEN ${contract}.reservation_id IS NOT NULL THEN COALESCE((
        SELECT SUM(rp.amount) FROM reservation_payments rp
        WHERE rp.reservation_id = ${contract}.reservation_id
          AND rp.type = 'rental' AND rp.status = ${COMPLETED}
      ), 0) ELSE 0 END
  )`
}

/** Cash collected on one reservation, including its live contracts' payments. */
export function reservationPaidExpr(reservation = 'r') {
  return `(
    COALESCE((
      SELECT SUM(rp.amount) FROM reservation_payments rp
      WHERE rp.reservation_id = ${reservation}.id
        AND rp.type = 'rental' AND rp.status = ${COMPLETED}
    ), 0)
    + COALESCE((
      SELECT SUM(p.amount) FROM payments p
      INNER JOIN contracts pc ON pc.id = p.contract_id AND ${liveContract('pc')}
      WHERE pc.reservation_id = ${reservation}.id AND p.status = ${COMPLETED}
    ), 0)
  )`
}

/** Highest total billed to a reservation: its own total or its live contract's. */
export function reservationTotalExpr(reservation = 'r') {
  return `MAX(COALESCE(${reservation}.total_amount, 0), COALESCE((
    SELECT MAX(tc.total_amount) FROM contracts tc
    WHERE tc.reservation_id = ${reservation}.id AND ${liveContract('tc')}
  ), 0))`
}

export function getContractPaidAmount(helpers: QueryHelpers, contractId: number) {
  return roundMoney(
    helpers.queryOne<{ paid: number }>(
      `SELECT ${contractPaidExpr()} as paid FROM contracts c WHERE c.id = ?`,
      [contractId],
    )?.paid ?? 0,
  )
}

export function getReservationRentalPaid(helpers: QueryHelpers, reservationId: number) {
  return roundMoney(
    helpers.queryOne<{ paid: number }>(
      `SELECT ${reservationPaidExpr()} as paid FROM reservations r WHERE r.id = ?`,
      [reservationId],
    )?.paid ?? 0,
  )
}

/** Amount a reservation must collect (its own total, or its contract's when higher). */
export function getReservationTotal(helpers: QueryHelpers, reservationId: number) {
  return roundMoney(
    helpers.queryOne<{ total: number }>(
      `SELECT ${reservationTotalExpr()} as total FROM reservations r WHERE r.id = ?`,
      [reservationId],
    )?.total ?? 0,
  )
}

export function getContractTotal(helpers: QueryHelpers, contractId: number) {
  return roundMoney(
    helpers.queryOne<{ total: number }>(
      'SELECT COALESCE(total_amount, 0) as total FROM contracts WHERE id = ?',
      [contractId],
    )?.total ?? 0,
  )
}

export function getContractReservationId(helpers: QueryHelpers, contractId: number) {
  return (
    helpers.queryOne<{ reservation_id: number | null }>(
      'SELECT reservation_id FROM contracts WHERE id = ? AND deleted_at IS NULL',
      [contractId],
    )?.reservation_id ?? null
  )
}

function getReservationDepositPaid(helpers: QueryHelpers, reservationId: number, type: string) {
  return roundMoney(
    helpers.queryOne<{ s: number }>(
      `SELECT COALESCE(SUM(amount), 0) as s FROM reservation_payments
       WHERE reservation_id = ? AND type = ? AND status = ${COMPLETED}`,
      [reservationId, type],
    )?.s ?? 0,
  )
}

/** Recompute reservation payment_status / deposit_status from both ledgers. */
export function syncReservationPaymentStatus(helpers: SyncHelpers, reservationId: number) {
  const reservation = helpers.queryOne<{
    deposit_amount: number
    deposit_status: DepositStatus
  }>('SELECT deposit_amount, deposit_status FROM reservations WHERE id = ?', [reservationId])

  if (!reservation) return

  const total = getReservationTotal(helpers, reservationId)
  const paid = getReservationRentalPaid(helpers, reservationId)

  let payment_status: PaymentStatus = 'unpaid'
  if (paid <= MONEY_EPSILON) payment_status = 'unpaid'
  else if (total > 0 && paid >= total - MONEY_EPSILON) payment_status = 'paid'
  else payment_status = 'partial'

  const depositPaid = getReservationDepositPaid(helpers, reservationId, 'deposit')
  const depositReturned = getReservationDepositPaid(helpers, reservationId, 'deposit_return')

  let deposit_status: DepositStatus = reservation.deposit_status
  if (depositPaid <= MONEY_EPSILON) {
    deposit_status = 'pending'
  } else if (depositReturned >= depositPaid - MONEY_EPSILON) {
    deposit_status = 'refunded'
  } else if (depositPaid >= Number(reservation.deposit_amount ?? 0) - MONEY_EPSILON) {
    deposit_status = 'received'
  }

  helpers.run(`UPDATE reservations SET payment_status = ?, deposit_status = ?, updated_at = ? WHERE id = ?`, [
    payment_status,
    deposit_status,
    helpers.now(),
    reservationId,
  ])
}

export function syncReservationPaymentStatusForContract(helpers: SyncHelpers, contractId: number) {
  const reservationId = getContractReservationId(helpers, contractId)
  if (reservationId) syncReservationPaymentStatus(helpers, reservationId)
}

export function syncAllReservationPaymentStatuses(helpers: SyncHelpers) {
  const rows = helpers.queryAll<{ id: number }>('SELECT id FROM reservations')
  for (const row of rows) syncReservationPaymentStatus(helpers, row.id)
}

/**
 * Remaining to collect across the business:
 * - reservations with no live contract (billed on the reservation)
 * - live contracts (walk-in and converted), billed on the contract
 */
export function queryUnpaidTotal(helpers: QueryHelpers) {
  return roundMoney(
    helpers.queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(remaining), 0) as total FROM (
         SELECT MAX(0, COALESCE(r.total_amount, 0) - ${reservationPaidExpr('r')}) as remaining
         FROM reservations r
         WHERE r.status != 'cancelled'
           AND NOT EXISTS (
             SELECT 1 FROM contracts c WHERE c.reservation_id = r.id AND ${liveContract('c')}
           )
         UNION ALL
         SELECT MAX(0, COALESCE(c.total_amount, 0) - ${contractPaidExpr('c')}) as remaining
         FROM contracts c
         WHERE ${liveContract('c')}
       ) unpaid_rows`,
    )?.total ?? 0,
  )
}
