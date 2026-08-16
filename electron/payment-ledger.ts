import type { Database } from 'sql.js'
import { localYmd, roundMoney } from './local-date'
import {
  MONEY_EPSILON,
  getContractPaidAmount,
  getContractReservationId,
  getContractTotal,
  getReservationRentalPaid,
  getReservationTotal,
  syncReservationPaymentStatus,
  syncReservationPaymentStatusForContract,
  type QueryHelpers,
} from './payment-sync'

/**
 * Single write path for every payment in the app.
 *
 * Nothing else may INSERT / UPDATE / DELETE `payments` or `reservation_payments`:
 * each mutation here validates the amount, then re-syncs the reservation status so
 * contracts, reservations, Paiements and Recettes always agree.
 */

export type LedgerHelpers = QueryHelpers & {
  run: (sql: string, params?: unknown[]) => void
  runInsert: (sql: string, params?: unknown[]) => number
  now: () => string
}

export type PaymentRecordStatus = 'completed' | 'pending' | 'cancelled'
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer'
export type ReservationPaymentType = 'rental' | 'deposit' | 'deposit_return'

export type ContractPaymentInput = {
  contract_id: number
  amount: number
  method?: string
  status?: PaymentRecordStatus
  paid_at?: string
  note?: string
}

export type ReservationPaymentRowInput = {
  reservation_id: number
  type?: ReservationPaymentType
  amount: number
  method?: string
  status?: PaymentRecordStatus
  reference?: string
  notes?: string
  paid_at?: string
}

/** Note marker written on payments collected for a prolongation. */
export const EXTENSION_PAYMENT_NOTE = 'Prolongation'

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'card', 'bank_transfer']
export const PAYMENT_RECORD_STATUSES: PaymentRecordStatus[] = ['completed', 'pending', 'cancelled']
export const RESERVATION_PAYMENT_TYPES: ReservationPaymentType[] = ['rental', 'deposit', 'deposit_return']

/** Payment scope: a walk-in contract, or a reservation (with or without contract). */
type PaymentScope = { contractId?: number | null; reservationId?: number | null }

export class PaymentError extends Error {}

/** Legacy rows stored free text ('Espèces', 'virement', …); map everything to one set. */
export function normalizePaymentMethod(value: string | null | undefined): PaymentMethod | string {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!raw || raw === 'cash' || raw === 'especes' || raw === 'espece') return 'cash'
  if (raw === 'card' || raw === 'carte') return 'card'
  if (raw === 'transfer' || raw === 'bank_transfer' || raw === 'virement' || raw === 'virement bancaire') {
    return 'bank_transfer'
  }
  return raw
}

function normalizeStatus(value: string | null | undefined): PaymentRecordStatus {
  const raw = String(value ?? '').trim().toLowerCase()
  return PAYMENT_RECORD_STATUSES.includes(raw as PaymentRecordStatus)
    ? (raw as PaymentRecordStatus)
    : 'completed'
}

function normalizeType(value: string | null | undefined): ReservationPaymentType {
  const raw = String(value ?? '').trim().toLowerCase()
  return RESERVATION_PAYMENT_TYPES.includes(raw as ReservationPaymentType)
    ? (raw as ReservationPaymentType)
    : 'rental'
}

function normalizeAmount(value: unknown) {
  const amount = roundMoney(Number(value))
  if (!Number.isFinite(amount) || amount <= 0) throw new PaymentError('INVALID_AMOUNT')
  return amount
}

/** Payments are dated on the local calendar day, not the UTC one. */
function normalizeDate(value: string | null | undefined) {
  return String(value ?? '').trim().slice(0, 10) || localYmd()
}

/** `payments` predates reservation payments: give it the same status/updated_at columns. */
export function migratePaymentsTable(db: Database, helpers: QueryHelpers) {
  const columns = helpers.queryAll<{ name: string }>('PRAGMA table_info(payments)')
  const names = new Set(columns.map((column) => column.name))
  if (names.size === 0) return

  if (!names.has('status')) {
    db.run(`ALTER TABLE payments ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'`)
  }
  if (!names.has('updated_at')) {
    db.run('ALTER TABLE payments ADD COLUMN updated_at TEXT')
  }
  db.run(`UPDATE payments SET status = 'completed' WHERE status IS NULL OR TRIM(status) = ''`)
  db.run('UPDATE payments SET updated_at = COALESCE(NULLIF(updated_at, \'\'), created_at, paid_at)')
}

export function nextReservationPaymentReference(helpers: QueryHelpers) {
  const prefix = `PAY-${new Date().getFullYear()}-`
  const row = helpers.queryOne<{ reference: string }>(
    `SELECT reference FROM reservation_payments WHERE reference LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`],
  )
  const last = row?.reference ? Number(row.reference.split('-').pop()) : 0
  return `${prefix}${String((last || 0) + 1).padStart(3, '0')}`
}

/** Reservation of a contract, so both ledgers of one balance stay in sync. */
function resolveScope(helpers: QueryHelpers, scope: PaymentScope): PaymentScope {
  if (scope.contractId) {
    return { contractId: scope.contractId, reservationId: getContractReservationId(helpers, scope.contractId) }
  }
  return { contractId: null, reservationId: scope.reservationId ?? null }
}

function syncScope(helpers: LedgerHelpers, scope: PaymentScope) {
  if (scope.reservationId) syncReservationPaymentStatus(helpers, scope.reservationId)
  else if (scope.contractId) syncReservationPaymentStatusForContract(helpers, scope.contractId)
}

/** Total billed and cash already collected for the balance a payment belongs to. */
function readBalance(helpers: QueryHelpers, scope: PaymentScope) {
  const resolved = resolveScope(helpers, scope)
  if (resolved.reservationId) {
    return {
      total: getReservationTotal(helpers, resolved.reservationId),
      paid: getReservationRentalPaid(helpers, resolved.reservationId),
    }
  }
  if (resolved.contractId) {
    return {
      total: getContractTotal(helpers, resolved.contractId),
      paid: getContractPaidAmount(helpers, resolved.contractId),
    }
  }
  return { total: 0, paid: 0 }
}

/**
 * Block rental payments that would push the balance above the amount billed.
 * `delta` is the extra cash being registered (new amount minus the previous one).
 */
function assertRentalWithinTotal(helpers: QueryHelpers, scope: PaymentScope, delta: number) {
  if (delta <= MONEY_EPSILON) return
  const { total, paid } = readBalance(helpers, scope)
  if (total <= 0) return
  if (roundMoney(paid + delta) > total + MONEY_EPSILON) throw new PaymentError('PAYMENT_EXCEEDS_TOTAL')
}

// ---------------------------------------------------------------------------
// Contract payments
// ---------------------------------------------------------------------------

export function createContractPayment(helpers: LedgerHelpers, data: ContractPaymentInput) {
  const contractId = Number(data.contract_id)
  const contract = helpers.queryOne<{ id: number; status: string }>(
    'SELECT id, status FROM contracts WHERE id = ? AND deleted_at IS NULL',
    [contractId],
  )
  if (!contract) throw new PaymentError('CONTRACT_NOT_FOUND')
  if (contract.status === 'cancelled') throw new PaymentError('CONTRACT_CANCELLED')

  const amount = normalizeAmount(data.amount)
  const status = normalizeStatus(data.status)
  const now = helpers.now()

  if (status === 'completed') assertRentalWithinTotal(helpers, { contractId }, amount)

  const id = helpers.runInsert(
    `INSERT INTO payments (contract_id, amount, method, status, paid_at, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      contractId,
      amount,
      normalizePaymentMethod(data.method),
      status,
      normalizeDate(data.paid_at),
      data.note?.trim() ?? '',
      now,
      now,
    ],
  )

  syncScope(helpers, resolveScope(helpers, { contractId }))
  return id
}

export function updateContractPayment(
  helpers: LedgerHelpers,
  id: number,
  data: Partial<Omit<ContractPaymentInput, 'contract_id'>>,
) {
  const existing = helpers.queryOne<{
    contract_id: number
    amount: number
    method: string
    status: string
    paid_at: string
    note: string
  }>('SELECT contract_id, amount, method, status, paid_at, note FROM payments WHERE id = ?', [id])
  if (!existing) throw new PaymentError('PAYMENT_NOT_FOUND')

  const amount = normalizeAmount(data.amount ?? existing.amount)
  const status = normalizeStatus(data.status ?? existing.status)
  const previous = normalizeStatus(existing.status) === 'completed' ? roundMoney(existing.amount) : 0
  const next = status === 'completed' ? amount : 0

  assertRentalWithinTotal(helpers, { contractId: existing.contract_id }, roundMoney(next - previous))

  helpers.run(
    `UPDATE payments SET amount = ?, method = ?, status = ?, paid_at = ?, note = ?, updated_at = ? WHERE id = ?`,
    [
      amount,
      normalizePaymentMethod(data.method ?? existing.method),
      status,
      normalizeDate(data.paid_at ?? existing.paid_at),
      data.note?.trim() ?? existing.note ?? '',
      helpers.now(),
      id,
    ],
  )

  syncScope(helpers, resolveScope(helpers, { contractId: existing.contract_id }))
  return id
}

export function deleteContractPayment(helpers: LedgerHelpers, id: number) {
  const existing = helpers.queryOne<{ contract_id: number }>(
    'SELECT contract_id FROM payments WHERE id = ?',
    [id],
  )
  if (!existing) throw new PaymentError('PAYMENT_NOT_FOUND')

  helpers.run('DELETE FROM payments WHERE id = ?', [id])
  syncScope(helpers, resolveScope(helpers, { contractId: existing.contract_id }))
}

// ---------------------------------------------------------------------------
// Reservation payments
// ---------------------------------------------------------------------------

export function createReservationPaymentRow(helpers: LedgerHelpers, data: ReservationPaymentRowInput) {
  const reservationId = Number(data.reservation_id)
  const reservation = helpers.queryOne<{ id: number }>('SELECT id FROM reservations WHERE id = ?', [
    reservationId,
  ])
  if (!reservation) throw new PaymentError('RESERVATION_NOT_FOUND')

  const amount = normalizeAmount(data.amount)
  const type = normalizeType(data.type)
  const status = normalizeStatus(data.status)
  const now = helpers.now()

  if (type === 'rental' && status === 'completed') {
    assertRentalWithinTotal(helpers, { reservationId }, amount)
  }

  const id = helpers.runInsert(
    `INSERT INTO reservation_payments (
      reservation_id, type, amount, method, status, reference, notes, paid_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reservationId,
      type,
      amount,
      normalizePaymentMethod(data.method),
      status,
      data.reference?.trim() || nextReservationPaymentReference(helpers),
      data.notes?.trim() ?? '',
      normalizeDate(data.paid_at),
      now,
      now,
    ],
  )

  syncReservationPaymentStatus(helpers, reservationId)
  return id
}

export function updateReservationPaymentRow(
  helpers: LedgerHelpers,
  id: number,
  data: Partial<ReservationPaymentRowInput>,
) {
  const existing = helpers.queryOne<{
    reservation_id: number
    type: string
    amount: number
    method: string
    status: string
    reference: string
    notes: string
    paid_at: string
  }>('SELECT * FROM reservation_payments WHERE id = ?', [id])
  if (!existing) throw new PaymentError('PAYMENT_NOT_FOUND')

  const amount = normalizeAmount(data.amount ?? existing.amount)
  const type = normalizeType(data.type ?? existing.type)
  const status = normalizeStatus(data.status ?? existing.status)
  const wasRentalCash = normalizeType(existing.type) === 'rental' && normalizeStatus(existing.status) === 'completed'
  const isRentalCash = type === 'rental' && status === 'completed'

  assertRentalWithinTotal(
    helpers,
    { reservationId: existing.reservation_id },
    roundMoney((isRentalCash ? amount : 0) - (wasRentalCash ? roundMoney(existing.amount) : 0)),
  )

  helpers.run(
    `UPDATE reservation_payments
     SET type = ?, amount = ?, method = ?, status = ?, reference = ?, notes = ?, paid_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      type,
      amount,
      normalizePaymentMethod(data.method ?? existing.method),
      status,
      data.reference?.trim() || existing.reference,
      data.notes?.trim() ?? existing.notes ?? '',
      normalizeDate(data.paid_at ?? existing.paid_at),
      helpers.now(),
      id,
    ],
  )

  syncReservationPaymentStatus(helpers, existing.reservation_id)
  return id
}

export function deleteReservationPaymentRow(helpers: LedgerHelpers, id: number) {
  const existing = helpers.queryOne<{ reservation_id: number }>(
    'SELECT reservation_id FROM reservation_payments WHERE id = ?',
    [id],
  )
  if (!existing) throw new PaymentError('PAYMENT_NOT_FOUND')

  helpers.run('DELETE FROM reservation_payments WHERE id = ?', [id])
  syncReservationPaymentStatus(helpers, existing.reservation_id)
}

export function deleteReservationPaymentRows(helpers: LedgerHelpers, reservationId: number) {
  helpers.run('DELETE FROM reservation_payments WHERE reservation_id = ?', [reservationId])
  syncReservationPaymentStatus(helpers, reservationId)
}

// ---------------------------------------------------------------------------
// Balancing: reduce collected cash when the billed amount goes down
// ---------------------------------------------------------------------------

type LedgerRow = { source: 'contract' | 'reservation'; id: number; amount: number }

function contractPaymentRows(helpers: QueryHelpers, contractId: number, taggedNoteOnly = false) {
  const rows = helpers.queryAll<{ id: number; amount: number; note: string }>(
    `SELECT id, amount, COALESCE(note, '') as note
     FROM payments
     WHERE contract_id = ? AND status = 'completed'
     ORDER BY id DESC`,
    [contractId],
  )
  const selected = taggedNoteOnly ? rows.filter((row) => isExtensionNote(row.note)) : rows
  return selected.map<LedgerRow>((row) => ({ source: 'contract', id: row.id, amount: Number(row.amount) }))
}

function reservationRentalRows(helpers: QueryHelpers, reservationId: number) {
  return helpers
    .queryAll<{ id: number; amount: number }>(
      `SELECT id, amount FROM reservation_payments
       WHERE reservation_id = ? AND type = 'rental' AND status = 'completed'
       ORDER BY id DESC`,
      [reservationId],
    )
    .map<LedgerRow>((row) => ({ source: 'reservation', id: row.id, amount: Number(row.amount) }))
}

function isExtensionNote(note: string | null | undefined) {
  const text = String(note ?? '').toLowerCase()
  return text.includes('prolongation') || text.includes('تمديد')
}

/** Remove `amount` of collected cash, oldest-preserving: newest rows go first. */
function reduceLedger(helpers: LedgerHelpers, rows: LedgerRow[], amount: number) {
  let left = roundMoney(Math.max(0, amount))
  const now = helpers.now()

  for (const row of rows) {
    if (left <= MONEY_EPSILON) break
    const rowAmount = roundMoney(row.amount)
    if (rowAmount <= 0) continue

    const consumesRow = rowAmount <= left + MONEY_EPSILON
    if (row.source === 'contract') {
      if (consumesRow) helpers.run('DELETE FROM payments WHERE id = ?', [row.id])
      else helpers.run('UPDATE payments SET amount = ?, updated_at = ? WHERE id = ?', [roundMoney(rowAmount - left), now, row.id])
    } else if (consumesRow) {
      helpers.run(`UPDATE reservation_payments SET status = 'cancelled', updated_at = ? WHERE id = ?`, [now, row.id])
    } else {
      helpers.run('UPDATE reservation_payments SET amount = ?, updated_at = ? WHERE id = ?', [
        roundMoney(rowAmount - left),
        now,
        row.id,
      ])
    }

    left = consumesRow ? roundMoney(left - rowAmount) : 0
  }

  return roundMoney(Math.max(0, amount) - left)
}

/**
 * Give back `amountToRemove` of a contract's collected cash.
 * Prolongation payments are undone first, then the newest contract payments,
 * then the linked reservation's rental payments.
 */
export function clawBackContractPayments(helpers: LedgerHelpers, contractId: number, amountToRemove: number) {
  if (roundMoney(amountToRemove) <= MONEY_EPSILON) return 0
  const scope = resolveScope(helpers, { contractId })

  const extensionRows = contractPaymentRows(helpers, contractId, true)
  const extensionIds = new Set(extensionRows.map((row) => row.id))
  const rows: LedgerRow[] = [
    ...extensionRows,
    ...contractPaymentRows(helpers, contractId).filter((row) => !extensionIds.has(row.id)),
    ...(scope.reservationId ? reservationRentalRows(helpers, scope.reservationId) : []),
  ]

  const removed = reduceLedger(helpers, rows, amountToRemove)
  syncScope(helpers, scope)
  return removed
}

/** Drop collected cash back to the contract total (used when a total shrinks). */
export function reconcileContractOverpayment(helpers: LedgerHelpers, contractId: number) {
  const total = getContractTotal(helpers, contractId)
  const excess = roundMoney(getContractPaidAmount(helpers, contractId) - total)
  if (excess <= MONEY_EPSILON) return 0
  return clawBackContractPayments(helpers, contractId, excess)
}

/** Drop collected cash back to the reservation total (used when a total shrinks). */
export function reconcileReservationOverpayment(helpers: LedgerHelpers, reservationId: number) {
  const total = getReservationTotal(helpers, reservationId)
  const excess = roundMoney(getReservationRentalPaid(helpers, reservationId) - total)
  if (excess <= MONEY_EPSILON) return 0

  const contracts = helpers.queryAll<{ id: number }>(
    `SELECT id FROM contracts WHERE reservation_id = ? AND deleted_at IS NULL AND status != 'cancelled' ORDER BY id DESC`,
    [reservationId],
  )
  const rows: LedgerRow[] = [
    ...reservationRentalRows(helpers, reservationId),
    ...contracts.flatMap((contract) => contractPaymentRows(helpers, contract.id)),
  ]

  const removed = reduceLedger(helpers, rows, excess)
  syncReservationPaymentStatus(helpers, reservationId)
  return removed
}

/** Startup heal for balances left overpaid by older builds. */
export function reconcileAllOverpayments(helpers: LedgerHelpers) {
  const contracts = helpers.queryAll<{ id: number }>(
    `SELECT id FROM contracts WHERE deleted_at IS NULL AND status != 'cancelled'`,
  )
  for (const contract of contracts) reconcileContractOverpayment(helpers, contract.id)

  const reservations = helpers.queryAll<{ id: number }>(
    `SELECT id FROM reservations WHERE status != 'cancelled'`,
  )
  for (const reservation of reservations) reconcileReservationOverpayment(helpers, reservation.id)
}

/** Force the rental cash of a reservation to an exact amount (payment status wizard). */
export function setReservationRentalPaid(helpers: LedgerHelpers, reservationId: number, targetPaid: number) {
  const total = getReservationTotal(helpers, reservationId)
  const target = roundMoney(Math.max(0, Math.min(targetPaid, total)))
  const current = getReservationRentalPaid(helpers, reservationId)

  if (current > target + MONEY_EPSILON) {
    const contracts = helpers.queryAll<{ id: number }>(
      `SELECT id FROM contracts WHERE reservation_id = ? AND deleted_at IS NULL AND status != 'cancelled' ORDER BY id DESC`,
      [reservationId],
    )
    reduceLedger(
      helpers,
      [
        ...reservationRentalRows(helpers, reservationId),
        ...contracts.flatMap((contract) => contractPaymentRows(helpers, contract.id)),
      ],
      roundMoney(current - target),
    )
  } else if (target - current > MONEY_EPSILON) {
    const now = helpers.now()
    helpers.runInsert(
      `INSERT INTO reservation_payments (
        reservation_id, type, amount, method, status, reference, notes, paid_at, created_at, updated_at
      ) VALUES (?, 'rental', ?, 'cash', 'completed', ?, '', ?, ?, ?)`,
      [reservationId, roundMoney(target - current), nextReservationPaymentReference(helpers), now.slice(0, 10), now, now],
    )
  }

  syncReservationPaymentStatus(helpers, reservationId)
}
