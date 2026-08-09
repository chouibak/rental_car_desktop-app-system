import type { Database } from 'sql.js'
import { syncReservationPaymentStatus } from './payment-sync'

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
      status TEXT NOT NULL DEFAULT 'pending',
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
    status: (data.status ?? 'pending') as ReservationStatus,
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

  const reservationOverlap = helpers.queryOne(
    `SELECT id FROM reservations
     WHERE car_id = ? AND id != COALESCE(?, -1)
       AND status IN ('pending', 'confirmed')
       AND NOT (return_date <= ? OR pickup_date >= ?)
     LIMIT 1`,
    [carId, excludeId ?? null, pickup, returnDate],
  )
  if (reservationOverlap) throw new Error('CAR_NOT_AVAILABLE')

  const contractOverlap = helpers.queryOne(
    `SELECT id FROM contracts
     WHERE car_id = ? AND status = 'active' AND deleted_at IS NULL
       AND NOT (end_date < ? OR start_date > ?)
     LIMIT 1`,
    [carId, pickupDay, returnDay],
  )
  if (contractOverlap) throw new Error('CAR_NOT_AVAILABLE')
}

function syncCarStatus(helpers: DbHelpers, carsApi: CarsApi, carId: number) {
  const car = helpers.queryOne<{ status: string }>('SELECT status FROM cars WHERE id = ?', [carId])
  if (!car || car.status === 'hors_service') return

  const active = helpers.queryOne(
    `SELECT id FROM reservations
     WHERE car_id = ? AND status IN ('pending', 'confirmed')
       AND return_date > datetime('now')
     LIMIT 1`,
    [carId],
  )

  carsApi.updateCarStatus(carId, active ? 'louee' : 'disponible')
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
      ) as contract_count
    FROM reservations r
    JOIN customers cu ON cu.id = r.customer_id
    LEFT JOIN chauffeurs ch ON ch.id = r.chauffeur_id
    JOIN cars ca ON ca.id = r.car_id
  `

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
      return helpers.queryAll<ReservationListItem>(sql, params)
    },

    getReservation(id: number) {
      return helpers.queryOne<ReservationListItem>(`${listSql} WHERE r.id = ?`, [id])
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

      syncCarStatus(helpers, carsApi, normalized.car_id)
      const row = this.getReservation(id)
      if (!row) throw new Error('RESERVATION_CREATE_FAILED')
      return row
    },

    updateReservation(id: number, data: ReservationInput) {
      const existing = helpers.queryOne<ReservationRecord>('SELECT * FROM reservations WHERE id = ?', [id])
      if (!existing) throw new Error('RESERVATION_NOT_FOUND')

      const normalized = normalizeInput(data, carsApi)
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

      syncReservationPaymentStatus(helpers, id)

      if (existing.car_id !== normalized.car_id) {
        syncCarStatus(helpers, carsApi, existing.car_id)
      }
      syncCarStatus(helpers, carsApi, normalized.car_id)
      const row = this.getReservation(id)
      if (!row) throw new Error('RESERVATION_UPDATE_FAILED')
      return row
    },

    deleteReservation(id: number) {
      const existing = helpers.queryOne<ReservationRecord>('SELECT * FROM reservations WHERE id = ?', [id])
      if (!existing) throw new Error('RESERVATION_NOT_FOUND')
      helpers.run('DELETE FROM reservations WHERE id = ?', [id])
      syncCarStatus(helpers, carsApi, existing.car_id)
      return { ok: true }
    },
  }
}
