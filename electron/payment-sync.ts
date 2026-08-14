import type { PaymentStatus, DepositStatus } from './reservations-db'

type QueryHelpers = {
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
}

type DbHelpers = QueryHelpers & {
  run: (sql: string, params?: unknown[]) => void
  now: () => string
}

/** Total rental paid for a reservation: reservation_payments + contract payments. */
export function getReservationRentalPaid(helpers: DbHelpers, reservationId: number) {
  const fromReservation =
    helpers.queryOne<{ s: number }>(
      `SELECT COALESCE(SUM(amount), 0) as s FROM reservation_payments
       WHERE reservation_id = ? AND type = 'rental' AND status = 'completed'`,
      [reservationId],
    )?.s ?? 0

  const fromContracts =
    helpers.queryOne<{ s: number }>(
      `SELECT COALESCE(SUM(p.amount), 0) as s FROM payments p
       INNER JOIN contracts c ON c.id = p.contract_id AND c.deleted_at IS NULL
       WHERE c.reservation_id = ?`,
      [reservationId],
    )?.s ?? 0

  return fromReservation + fromContracts
}

export const RESERVATION_PAID_AMOUNT_EXPR = `
  (
    COALESCE((
      SELECT SUM(amount) FROM reservation_payments rp
      WHERE rp.reservation_id = r.id AND rp.type = 'rental' AND rp.status = 'completed'
    ), 0)
    + COALESCE((
      SELECT SUM(p.amount) FROM payments p
      INNER JOIN contracts c ON c.id = p.contract_id AND c.deleted_at IS NULL
      WHERE c.reservation_id = r.id
    ), 0)
  )`

/** Recompute reservation payment_status / deposit_status from all payment sources. */
export function syncReservationPaymentStatus(helpers: DbHelpers, reservationId: number) {
  const reservation = helpers.queryOne<{
    total_amount: number
    deposit_amount: number
    deposit_status: DepositStatus
  }>('SELECT total_amount, deposit_amount, deposit_status FROM reservations WHERE id = ?', [reservationId])

  if (!reservation) return

  const contractTotal =
    helpers.queryOne<{ s: number }>(
      `SELECT COALESCE(MAX(total_amount), 0) as s FROM contracts
       WHERE reservation_id = ? AND deleted_at IS NULL AND status != 'cancelled'`,
      [reservationId],
    )?.s ?? 0

  const targetTotal = Math.max(Number(reservation.total_amount ?? 0), Number(contractTotal ?? 0))
  const rentalPaid = getReservationRentalPaid(helpers, reservationId)

  let payment_status: PaymentStatus = 'unpaid'
  if (rentalPaid <= 0) payment_status = 'unpaid'
  else if (targetTotal > 0 && rentalPaid >= targetTotal) payment_status = 'paid'
  else payment_status = 'partial'

  const depositPaid =
    helpers.queryOne<{ s: number }>(
      `SELECT COALESCE(SUM(amount), 0) as s FROM reservation_payments
       WHERE reservation_id = ? AND type = 'deposit' AND status = 'completed'`,
      [reservationId],
    )?.s ?? 0

  const depositReturned =
    helpers.queryOne<{ s: number }>(
      `SELECT COALESCE(SUM(amount), 0) as s FROM reservation_payments
       WHERE reservation_id = ? AND type = 'deposit_return' AND status = 'completed'`,
      [reservationId],
    )?.s ?? 0

  let deposit_status: DepositStatus = reservation.deposit_status
  if (depositReturned > 0 && depositReturned >= depositPaid && depositPaid > 0) {
    deposit_status = 'refunded'
  } else if (depositPaid >= reservation.deposit_amount && reservation.deposit_amount > 0) {
    deposit_status = 'received'
  }

  const t = helpers.now()
  helpers.run(
    `UPDATE reservations SET payment_status = ?, deposit_status = ?, updated_at = ? WHERE id = ?`,
    [payment_status, deposit_status, t, reservationId],
  )
}

export function syncReservationPaymentStatusForContract(helpers: DbHelpers, contractId: number) {
  const contract = helpers.queryOne<{ reservation_id: number | null }>(
    'SELECT reservation_id FROM contracts WHERE id = ? AND deleted_at IS NULL',
    [contractId],
  )
  if (contract?.reservation_id) {
    syncReservationPaymentStatus(helpers, contract.reservation_id)
  }
}

export function syncAllReservationPaymentStatuses(helpers: DbHelpers) {
  const rows = helpers.queryAll<{ id: number }>('SELECT id FROM reservations')
  for (const row of rows) syncReservationPaymentStatus(helpers, row.id)
}

export const UNPAID_RESERVATIONS_PAID_SUBQUERY = `
  SELECT reservation_id, SUM(amount) as paid FROM (
    SELECT reservation_id, amount
    FROM reservation_payments
    WHERE type = 'rental' AND status = 'completed'
    UNION ALL
    SELECT c.reservation_id, p.amount
    FROM payments p
    INNER JOIN contracts c ON c.id = p.contract_id AND c.deleted_at IS NULL
    WHERE c.reservation_id IS NOT NULL
  ) combined
  GROUP BY reservation_id
`

/** Same formula as contracts-db PAID_AMOUNT_EXPR: contract payments + linked reservation rentals. */
export const CONTRACT_PAID_AMOUNT_EXPR = `
  (
    (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.contract_id = c.id)
    + CASE WHEN c.reservation_id IS NOT NULL THEN COALESCE((
        SELECT SUM(amount) FROM reservation_payments rp
        WHERE rp.reservation_id = c.reservation_id AND rp.type = 'rental' AND rp.status = 'completed'
      ), 0) ELSE 0 END
  )`

/**
 * Remaining to collect:
 * - reservations with no live contract
 * - live contracts (walk-in and converted), using contract total vs paid
 */
export function queryUnpaidTotal(helpers: QueryHelpers) {
  return (
    helpers.queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(remaining), 0) as total FROM (
         SELECT MAX(0,
           COALESCE(r.total_amount, 0) - COALESCE((
             SELECT SUM(rp.amount) FROM reservation_payments rp
             WHERE rp.reservation_id = r.id AND rp.type = 'rental' AND rp.status = 'completed'
           ), 0)
         ) as remaining
         FROM reservations r
         WHERE r.status != 'cancelled'
           AND NOT EXISTS (
             SELECT 1 FROM contracts c
             WHERE c.reservation_id = r.id
               AND c.deleted_at IS NULL
               AND c.status != 'cancelled'
           )
         UNION ALL
         SELECT MAX(0, COALESCE(c.total_amount, 0) - ${CONTRACT_PAID_AMOUNT_EXPR}) as remaining
         FROM contracts c
         WHERE c.deleted_at IS NULL AND c.status != 'cancelled'
       ) unpaid_rows`,
    )?.total ?? 0
  )
}
