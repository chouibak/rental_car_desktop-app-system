import type { Database } from 'sql.js'
import { syncCarAvailability } from './cars-db'
import { syncReservationPaymentStatus } from './payment-sync'
import { agentLog } from './debug-log'

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type DepositStatus = 'pending' | 'received' | 'refunded'

export type ReservationRecord = {
  id: number
  reference: string
  car_id: number
  customer_id: number
  chauffeur_id: number | null
  pickup_date: string
  return_date: string
  delivery_location: string
  message: string
  days: number
  daily_rate: number
  total_amount: number
  deposit_amount: number
  deposit_status: DepositStatus
  status: ReservationStatus
  payment_status: PaymentStatus
  created_at: string
  updated_at: string
}

export type ReservationListItem = ReservationRecord & {
  customer_name: string
  car_name: string
  car_plate: string
  paid_amount?: number
  contract_count?: number
}

export type ReservationInput = {
  car_id: number
  customer_id: number
  chauffeur_id?: number | null
  pickup_date: string
  return_date: string
  delivery_location?: string
  message?: string
  daily_rate?: number
  deposit_amount?: number
  deposit_status?: DepositStatus
  status?: ReservationStatus
  payment_status?: PaymentStatus
}

export type ReservationFilters = {
  q?: string
  status?: ReservationStatus | ''
  car_id?: number | ''
  customer_id?: number | ''
  date_from?: string
  date_to?: string
}

type DbHelpers = {
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
  run: (sql: string, params?: unknown[]) => void
  runInsert: (sql: string, params?: unknown[]) => number
  lastId: () => number
  now: () => string
}

type CarsApi = {
  updateCarStatus: (id: number, status: 'disponible' | 'louee' | 'hors_service') => unknown
  getCar: (id: number) => { price_per_day: number; status?: string } | null
}

const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = ['pending', 'confirmed']

export function createReservationsSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference TEXT NOT NULL UNIQUE,
      car_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL,
      chauffeur_id INTEGER,
      pickup_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      delivery_location TEXT DEFAULT '',
      message TEXT DEFAULT '',
      days INTEGER NOT NULL DEFAULT 1,
      daily_rate REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      deposit_amount REAL DEFAULT 0,
      deposit_status TEXT NOT NULL DEFAULT 'pending',
      status TEXT NOT NULL DEFAULT 'confirmed',
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY(car_id) REFERENCES cars(id),
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    );
  `)
}

function calcDays(pickup: string, returnDate: string) {
  const start = new Date(pickup)
  const end = new Date(returnDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    throw new Error('INVALID_DATES')
  }
  const diffMs = end.getTime() - start.getTime()
  return Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
}

function sameInstant(a?: string | null, b?: string | null) {
  if (!a && !b) return true
  if (!a || !b) return false
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  if (Number.isNaN(da) || Number.isNaN(db)) return a.slice(0, 16) === b.slice(0, 16)
  return Math.abs(da - db) < 60_000
}

function datePart(value: string) {
  return value?.slice(0, 10) ?? ''
}

function syncLinkedContractFromReservation(
  helpers: DbHelpers,
  reservationId: number,
  pickup: string,
  returnDate: string,
  days: number,
  dailyRate: number,
  totalAmount: number,
) {
  const contract = helpers.queryOne<{
    id: number
    extension_days: number
    original_return_at: string
    original_total_amount: number
    extra_charges: number
    discount: number
    daily_rate: number
    daily_price: number
  }>(
    `SELECT id, extension_days, original_return_at, original_total_amount,
            extra_charges, discount, daily_rate, daily_price
     FROM contracts
     WHERE reservation_id = ? AND deleted_at IS NULL AND status != 'cancelled'
     ORDER BY id DESC LIMIT 1`,
    [reservationId],
  )
  if (!contract) return { days, total_amount: totalAmount }

  const daily = Number(contract.daily_rate ?? contract.daily_price ?? dailyRate ?? 0)
  const discount = Number(contract.discount ?? 0)
  const extra = Number(contract.extra_charges ?? 0)
  const billed = calcDays(pickup, returnDate)
  let original_return_at = contract.original_return_at?.trim() || returnDate
  let original_total_amount = Number(contract.original_total_amount ?? 0)
  let extension_days = Math.max(0, Math.floor(Number(contract.extension_days ?? 0)))
  let extension_until = ''
  let total = Math.max(0, billed * daily - discount + extra)

  if (extension_days > 0 && original_return_at) {
    const origReturn = new Date(original_return_at)
    const newReturn = new Date(returnDate)
    if (Number.isNaN(origReturn.getTime()) || newReturn.getTime() <= origReturn.getTime()) {
      extension_days = 0
      original_return_at = returnDate
      original_total_amount = total
    } else {
      extension_days = Math.max(0, Math.round((newReturn.getTime() - origReturn.getTime()) / 86_400_000))
      extension_until = datePart(returnDate)
      const originalBilled = calcDays(pickup, original_return_at)
      original_total_amount = Math.max(0, originalBilled * daily - discount + extra)
      total = original_total_amount + extension_days * daily
    }
  } else {
    original_return_at = returnDate
    original_total_amount = total
    extension_days = 0
  }

  helpers.run(
    `UPDATE contracts SET
      departure_at = ?, return_at = ?, start_date = ?, end_date = ?,
      billed_days = ?, total_days = ?, total_amount = ?,
      original_return_at = ?, original_total_amount = ?,
      extension_days = ?, extension_until = ?, updated_at = ?
     WHERE id = ?`,
    [
      pickup,
      returnDate,
      datePart(pickup),
      datePart(returnDate),
      billed,
      billed,
      total,
      original_return_at,
      original_total_amount,
      extension_days,
      extension_until,
      helpers.now(),
      contract.id,
    ],
  )

  return { days: billed, total_amount: total }
}

function nextReference(helpers: DbHelpers) {
  const year = new Date().getFullYear()
  const row = helpers.queryOne<{ c: number }>(
    `SELECT COUNT(*) as c FROM reservations WHERE reference LIKE ?`,
    [`RES-${year}-%`],
  )
  const num = String((row?.c ?? 0) + 1).padStart(3, '0')
  return `RES-${year}-${num}`
}

function normalizeInput(data: ReservationInput, carsApi: CarsApi) {
  const car = carsApi.getCar(data.car_id)
  if (!car) throw new Error('CAR_NOT_FOUND')

  const days = calcDays(data.pickup_date, data.return_date)
  const daily_rate = data.daily_rate ?? car.price_per_day ?? 0
  const total_amount = days * daily_rate

  return {
    car_id: data.car_id,
    customer_id: data.customer_id,
    chauffeur_id: data.chauffeur_id ?? null,
    pickup_date: data.pickup_date,
    return_date: data.return_date,
    delivery_location: data.delivery_location?.trim() ?? '',
    message: data.message?.trim() ?? '',
    days,
    daily_rate,
    total_amount,
    deposit_amount: data.deposit_amount ?? 0,
    deposit_status: (data.deposit_status ?? 'pending') as DepositStatus,
    status: (data.status ?? 'confirmed') as ReservationStatus,
    payment_status: (data.payment_status ?? 'unpaid') as PaymentStatus,
  }
}

function assertNoOverlap(
  helpers: DbHelpers,
  carId: number,
  pickup: string,
  returnDate: string,
  excludeId?: number,
) {
  const pickupDay = pickup.slice(0, 10)
  const returnDay = returnDate.slice(0, 10)
  const excludeReservationId = excludeId ?? null

  // When editing, ignore this reservation itself.
  const reservationOverlap = helpers.queryOne(
    `SELECT id FROM reservations
     WHERE car_id = ? AND id != COALESCE(?, -1)
       AND status IN ('pending', 'confirmed')
       AND NOT (datetime(return_date) <= datetime(?) OR datetime(pickup_date) >= datetime(?))
     LIMIT 1`,
    [carId, excludeReservationId, pickup, returnDate],
  )
  if (reservationOverlap) throw new Error('CAR_NOT_AVAILABLE')

  // When editing, also ignore the contract created from this same reservation
  // (otherwise save always fails with "Voiture non disponible").
  const contractOverlap = helpers.queryOne(
    `SELECT id FROM contracts
     WHERE car_id = ? AND status = 'active' AND deleted_at IS NULL
       AND (? IS NULL OR reservation_id IS NULL OR reservation_id != ?)
       AND NOT (
         date(COALESCE(NULLIF(return_at, ''), end_date)) < date(?)
         OR date(COALESCE(NULLIF(departure_at, ''), start_date)) > date(?)
       )
     LIMIT 1`,
    [carId, excludeReservationId, excludeReservationId ?? 0, pickupDay, returnDay],
  )
  if (contractOverlap) throw new Error('CAR_NOT_AVAILABLE')
}

function syncCarStatus(helpers: DbHelpers, carId: number) {
  syncCarAvailability(helpers, carId)
}

export function createReservationsApi(helpers: DbHelpers, carsApi: CarsApi) {
  const listSql = `
    SELECT r.*,
      cu.name as customer_name,
      ch.name as chauffeur_name,
      ca.name as car_name,
      ca.plate_number as car_plate,
      COALESCE((
        SELECT SUM(amount) FROM reservation_payments rp
        WHERE rp.reservation_id = r.id AND rp.type = 'rental' AND rp.status = 'completed'
      ), 0)
      + COALESCE((
        SELECT SUM(p.amount) FROM payments p
        INNER JOIN contracts c ON c.id = p.contract_id AND c.deleted_at IS NULL
        WHERE c.reservation_id = r.id
      ), 0) as paid_amount,
      (
        SELECT COUNT(*) FROM contracts c
        WHERE c.reservation_id = r.id AND c.deleted_at IS NULL
      ) as contract_count,
      COALESCE((
        SELECT MAX(c.total_amount) FROM contracts c
        WHERE c.reservation_id = r.id AND c.deleted_at IS NULL AND c.status != 'cancelled'
      ), 0) as linked_contract_total,
      COALESCE((
        SELECT MAX(c.billed_days) FROM contracts c
        WHERE c.reservation_id = r.id AND c.deleted_at IS NULL AND c.status != 'cancelled'
      ), 0) as linked_contract_days,
      (
        SELECT COALESCE(NULLIF(c.return_at, ''), c.end_date)
        FROM contracts c
        WHERE c.reservation_id = r.id AND c.deleted_at IS NULL AND c.status != 'cancelled'
        ORDER BY datetime(COALESCE(NULLIF(c.return_at, ''), c.end_date)) DESC
        LIMIT 1
      ) as linked_contract_return,
      (
        SELECT COALESCE(NULLIF(c.departure_at, ''), c.start_date)
        FROM contracts c
        WHERE c.reservation_id = r.id AND c.deleted_at IS NULL AND c.status != 'cancelled'
        ORDER BY datetime(COALESCE(NULLIF(c.return_at, ''), c.end_date)) DESC
        LIMIT 1
      ) as linked_contract_departure
    FROM reservations r
    JOIN customers cu ON cu.id = r.customer_id
    LEFT JOIN chauffeurs ch ON ch.id = r.chauffeur_id
    JOIN cars ca ON ca.id = r.car_id
  `

  function mapReservationRow(row: ReservationListItem & {
    linked_contract_total?: number
    linked_contract_days?: number
    linked_contract_return?: string | null
    linked_contract_departure?: string | null
  }): ReservationListItem {
    const linkedTotal = Number(row.linked_contract_total ?? 0)
    const linkedDays = Number(row.linked_contract_days ?? 0)
    const linkedReturn = row.linked_contract_return?.trim() || ''
    const linkedDeparture = row.linked_contract_departure?.trim() || ''
    const total_amount = Math.max(Number(row.total_amount ?? 0), linkedTotal)
    const days = Math.max(Number(row.days ?? 0), linkedDays)
    const pickup_date = linkedDeparture || row.pickup_date
    const return_date = linkedReturn || row.return_date
    const {
      linked_contract_total: _t,
      linked_contract_days: _d,
      linked_contract_return: _r,
      linked_contract_departure: _p,
      ...rest
    } = row as ReservationListItem & {
      linked_contract_total?: number
      linked_contract_days?: number
      linked_contract_return?: string | null
      linked_contract_departure?: string | null
    }
    return { ...rest, total_amount, days, pickup_date, return_date }
  }

  return {
    listReservations(filters?: ReservationFilters): ReservationListItem[] {
      let sql = `${listSql} WHERE 1=1`
      const params: unknown[] = []

      if (filters?.q) {
        sql += ` AND (r.reference LIKE ? OR cu.name LIKE ? OR ca.name LIKE ? OR ca.plate_number LIKE ?)`
        const like = `%${filters.q}%`
        params.push(like, like, like, like)
      }
      if (filters?.status) {
        sql += ' AND r.status = ?'
        params.push(filters.status)
      }
      if (filters?.car_id) {
        sql += ' AND r.car_id = ?'
        params.push(filters.car_id)
      }
      if (filters?.customer_id) {
        sql += ' AND r.customer_id = ?'
        params.push(filters.customer_id)
      }
      if (filters?.date_from) {
        sql += ' AND r.return_date >= ?'
        params.push(filters.date_from)
      }
      if (filters?.date_to) {
        sql += ' AND r.pickup_date <= ?'
        params.push(filters.date_to)
      }

      sql += ' ORDER BY r.id DESC'
      return helpers.queryAll<ReservationListItem>(sql, params).map(mapReservationRow)
    },

    getReservation(id: number) {
      const row = helpers.queryOne<ReservationListItem>(`${listSql} WHERE r.id = ?`, [id])
      return row ? mapReservationRow(row) : null
    },

    createReservation(data: ReservationInput) {
      const normalized = normalizeInput(data, carsApi)
      if (ACTIVE_RESERVATION_STATUSES.includes(normalized.status)) {
        assertNoOverlap(helpers, normalized.car_id, normalized.pickup_date, normalized.return_date)
      }

      const t = helpers.now()
      const reference = nextReference(helpers)

      const id = helpers.runInsert(
        `INSERT INTO reservations (
          reference, car_id, customer_id, chauffeur_id,
          pickup_date, return_date, delivery_location, message,
          days, daily_rate, total_amount, deposit_amount, deposit_status,
          status, payment_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reference,
          normalized.car_id,
          normalized.customer_id,
          normalized.chauffeur_id,
          normalized.pickup_date,
          normalized.return_date,
          normalized.delivery_location,
          normalized.message,
          normalized.days,
          normalized.daily_rate,
          normalized.total_amount,
          normalized.deposit_amount,
          normalized.deposit_status,
          normalized.status,
          normalized.payment_status,
          t,
          t,
        ],
      )

      syncCarStatus(helpers, normalized.car_id)
      const row = this.getReservation(id)
      if (!row) throw new Error('RESERVATION_CREATE_FAILED')
      return row
    },

    updateReservation(id: number, data: ReservationInput) {
      const existing = helpers.queryOne<ReservationRecord>('SELECT * FROM reservations WHERE id = ?', [id])
      if (!existing) throw new Error('RESERVATION_NOT_FOUND')

      const normalized = normalizeInput(data, carsApi)

      const linkedContract = helpers.queryOne<{
        total_amount: number
        billed_days: number
        return_at: string | null
        end_date: string | null
        departure_at: string | null
        start_date: string | null
      }>(
        `SELECT total_amount, billed_days, return_at, end_date, departure_at, start_date FROM contracts
         WHERE reservation_id = ? AND deleted_at IS NULL AND status != 'cancelled'
         ORDER BY id DESC LIMIT 1`,
        [id],
      )

      const currentPickup = linkedContract?.departure_at || linkedContract?.start_date || existing.pickup_date
      const currentReturn = linkedContract?.return_at || linkedContract?.end_date || existing.return_date
      const datesChanged =
        !sameInstant(normalized.pickup_date, currentPickup) ||
        !sameInstant(normalized.return_date, currentReturn)

      if (linkedContract && !datesChanged) {
        // Never let a non-date reservation edit wipe prolongation / contract extras from the total.
        const contractTotal = Number(linkedContract.total_amount ?? 0)
        const contractDays = Number(linkedContract.billed_days ?? 0)
        if (contractTotal > normalized.total_amount) {
          normalized.total_amount = contractTotal
        }
        if (contractDays > normalized.days) {
          normalized.days = contractDays
        }
      }

      if (ACTIVE_RESERVATION_STATUSES.includes(normalized.status)) {
        assertNoOverlap(helpers, normalized.car_id, normalized.pickup_date, normalized.return_date, id)
      }

      const t = helpers.now()
      helpers.run(
        `UPDATE reservations SET
          car_id = ?, customer_id = ?, chauffeur_id = ?,
          pickup_date = ?, return_date = ?, delivery_location = ?, message = ?,
          days = ?, daily_rate = ?, total_amount = ?, deposit_amount = ?, deposit_status = ?,
          status = ?, updated_at = ?
         WHERE id = ?`,
        [
          normalized.car_id,
          normalized.customer_id,
          normalized.chauffeur_id,
          normalized.pickup_date,
          normalized.return_date,
          normalized.delivery_location,
          normalized.message,
          normalized.days,
          normalized.daily_rate,
          normalized.total_amount,
          normalized.deposit_amount,
          normalized.deposit_status,
          normalized.status,
          t,
          id,
        ],
      )

      if (linkedContract && datesChanged) {
        const synced = syncLinkedContractFromReservation(
          helpers,
          id,
          normalized.pickup_date,
          normalized.return_date,
          normalized.days,
          normalized.daily_rate,
          normalized.total_amount,
        )
        if (synced.days !== normalized.days || synced.total_amount !== normalized.total_amount) {
          helpers.run(`UPDATE reservations SET days = ?, total_amount = ?, updated_at = ? WHERE id = ?`, [
            synced.days,
            synced.total_amount,
            helpers.now(),
            id,
          ])
        }
      }

      syncReservationPaymentStatus(helpers, id)

      if (existing.car_id !== normalized.car_id) {
        syncCarStatus(helpers, existing.car_id)
      }
      syncCarStatus(helpers, normalized.car_id)
      const row = this.getReservation(id)
      if (!row) throw new Error('RESERVATION_UPDATE_FAILED')
      return row
    },

    deleteReservation(id: number) {
      const existing = helpers.queryOne<ReservationRecord>('SELECT * FROM reservations WHERE id = ?', [id])
      if (!existing) throw new Error('RESERVATION_NOT_FOUND')
      // #region agent log
      {
        const linked = helpers.queryOne<{ c: number }>(
          `SELECT COUNT(*) as c FROM contracts WHERE reservation_id = ? AND deleted_at IS NULL`,
          [id],
        )
        agentLog('D', 'reservations-db.ts:deleteReservation', 'Deleting reservation', {
          reservationId: id,
          carId: existing.car_id,
          linkedLiveContracts: linked?.c ?? 0,
          willOrphan: (linked?.c ?? 0) > 0,
        })
      }
      // #endregion
      helpers.run('DELETE FROM reservations WHERE id = ?', [id])
      syncCarStatus(helpers, existing.car_id)
      return { ok: true }
    },
  }
}
