import type { Database } from 'sql.js'
import path from 'node:path'
import {
  deleteCarStorage,
  deleteFileIfExists,
  fileExists,
  moveToCarStorage,
} from './storage'
import { deleteExpenseStorage } from './expense-storage'
import { SQL_NOW } from './local-date'
import { syncAllCarsLastVidange, syncCarLastVidange } from './vidange-db'
export type CarCategory = 'economique' | 'compacte' | 'suv' | '4x4' | 'monospace'
export type CarTransmission = 'manuelle' | 'automatique'
export type CarFuel = 'Essence' | 'Diesel' | 'Hybride' | 'Électrique'
export type CarComputedStatus = 'disponible' | 'louee' | 'hors_service'

export type CarImage = {
  id: number
  car_id: number
  path: string
  position: number
}

export type CarRecord = {
  id: number
  name: string
  brand: string
  model: string
  year: number | null
  color: string
  plate_number: string
  category: CarCategory
  price_per_day: number
  transmission: CarTransmission
  seats: number
  fuel: CarFuel
  bags: number
  badge: string
  status: CarComputedStatus
  is_available: number
  mileage: number
  fuel_level: string
  condition_notes: string
  vidange_interval_km: number
  vidange_interval_months: number
  vidange_last_date: string
  vidange_last_mileage: number
  doc_carte_grise_path: string
  doc_carte_grise_expiry: string
  doc_assurance_path: string
  doc_assurance_expiry: string
  doc_controle_technique_path: string
  doc_controle_technique_expiry: string
  doc_vignette_path: string
  doc_vignette_expiry: string
  doc_autorisation_path: string
  doc_autorisation_expiry: string
  created_at: string
  updated_at: string
}

export type CarListItem = CarRecord & {
  computed_status: CarComputedStatus
  thumbnail: string | null
  return_date: string | null
}

export type CarDetail = CarRecord & {
  computed_status: CarComputedStatus
  return_date: string | null
  images: CarImage[]
}

export type CarImageInput = {
  path: string
  position: number
}

export type CarInput = {
  name: string
  brand: string
  model: string
  year?: number | null
  color?: string
  plate_number: string
  category?: CarCategory
  price_per_day: number
  transmission?: CarTransmission
  seats?: number
  fuel?: CarFuel
  bags?: number
  badge?: string
  status?: CarComputedStatus
  is_available?: boolean
  mileage?: number
  fuel_level?: string
  condition_notes?: string
  vidange_interval_km?: number
  vidange_interval_months?: number
  vidange_last_date?: string
  vidange_last_mileage?: number
  doc_carte_grise_path?: string
  doc_carte_grise_expiry?: string
  doc_assurance_path?: string
  doc_assurance_expiry?: string
  doc_controle_technique_path?: string
  doc_controle_technique_expiry?: string
  doc_vignette_path?: string
  doc_vignette_expiry?: string
  doc_autorisation_path?: string
  doc_autorisation_expiry?: string
  images?: CarImageInput[]
}

export type CarFilters = {
  q?: string
  status?: CarComputedStatus | ''
  category?: CarCategory | ''
}

export type CarStats = {
  total: number
  disponible: number
  louee: number
  hors_service: number
}

type DbHelpers = {
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
  run: (sql: string, params?: unknown[]) => void
  runInsert: (sql: string, params?: unknown[]) => number
  now: () => string
}

const STATUS_SQL = `COALESCE(c.status, 'disponible')`

function parseCarStatus(data: CarInput): CarComputedStatus {
  if (data.status === 'disponible' || data.status === 'louee' || data.status === 'hors_service') {
    return data.status
  }
  if (data.is_available === false) return 'hors_service'
  return 'disponible'
}

function statusToAvailable(status: CarComputedStatus): number {
  return status === 'disponible' ? 1 : 0
}

/**
 * A reservation only holds the car once the pickup time has passed: before that the car
 * is still physically available, even though the dates are already booked.
 */
const RESERVATION_IN_PROGRESS = `
  r.status IN ('pending', 'confirmed')
  AND datetime(r.pickup_date) <= ${SQL_NOW}
  AND datetime(r.return_date) > ${SQL_NOW}
`

const RETURN_DATE_SQL = `
  (
    SELECT d FROM (
      SELECT COALESCE(NULLIF(ct.return_at, ''), ct.end_date) AS d
      FROM contracts ct
      WHERE ct.car_id = c.id
        AND ct.status = 'active'
        AND ct.deleted_at IS NULL
      UNION ALL
      SELECT r.return_date AS d
      FROM reservations r
      WHERE r.car_id = c.id
        AND ${RESERVATION_IN_PROGRESS}
        AND NOT EXISTS (
          SELECT 1 FROM contracts c2
          WHERE c2.reservation_id = r.id
            AND c2.deleted_at IS NULL
            AND c2.status = 'closed'
        )
    )
    WHERE d IS NOT NULL AND TRIM(d) != ''
    ORDER BY datetime(d) ASC
    LIMIT 1
  )
`

const THUMBNAIL_SQL = `
  (
    SELECT ci.path FROM car_images ci
    WHERE ci.car_id = c.id
    ORDER BY ci.position ASC, ci.id ASC
    LIMIT 1
  )
`

const DOC_COLUMNS = [
  'doc_carte_grise_path',
  'doc_carte_grise_expiry',
  'doc_assurance_path',
  'doc_assurance_expiry',
  'doc_controle_technique_path',
  'doc_controle_technique_expiry',
  'doc_vignette_path',
  'doc_vignette_expiry',
  'doc_autorisation_path',
  'doc_autorisation_expiry',
] as const

function mapFuel(value: string | null | undefined): CarFuel {
  const map: Record<string, CarFuel> = {
    petrol: 'Essence',
    diesel: 'Diesel',
    hybrid: 'Hybride',
    electric: 'Électrique',
    Essence: 'Essence',
    Diesel: 'Diesel',
    Hybride: 'Hybride',
    Électrique: 'Électrique',
  }
  return map[value ?? ''] ?? 'Essence'
}

export function createCarsSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS cars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER,
      color TEXT DEFAULT '',
      plate_number TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'compacte',
      price_per_day REAL NOT NULL DEFAULT 0,
      transmission TEXT NOT NULL DEFAULT 'manuelle',
      seats INTEGER NOT NULL DEFAULT 5,
      fuel TEXT NOT NULL DEFAULT 'Essence',
      bags INTEGER NOT NULL DEFAULT 2,
      badge TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'disponible',
      is_available INTEGER NOT NULL DEFAULT 1,
      mileage INTEGER DEFAULT 0,
      fuel_level TEXT DEFAULT '',
      condition_notes TEXT DEFAULT '',
      vidange_interval_km INTEGER DEFAULT 10000,
      vidange_interval_months INTEGER DEFAULT 6,
      vidange_last_date TEXT DEFAULT '',
      vidange_last_mileage INTEGER DEFAULT 0,
      doc_carte_grise_path TEXT DEFAULT '',
      doc_carte_grise_expiry TEXT DEFAULT '',
      doc_assurance_path TEXT DEFAULT '',
      doc_assurance_expiry TEXT DEFAULT '',
      doc_controle_technique_path TEXT DEFAULT '',
      doc_controle_technique_expiry TEXT DEFAULT '',
      doc_vignette_path TEXT DEFAULT '',
      doc_vignette_expiry TEXT DEFAULT '',
      doc_autorisation_path TEXT DEFAULT '',
      doc_autorisation_expiry TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS car_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      car_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE CASCADE
    );
  `)
}

export function migrateCarsTable(db: Database, helpers: DbHelpers) {
  const cols = helpers.queryAll<{ name: string }>('PRAGMA table_info(cars)')
  if (cols.some((c) => c.name === 'name')) return

  const hasOldTable = cols.some((c) => c.name === 'fuel_type')
  if (!hasOldTable) {
    createCarsSchema(db)
    return
  }

  const oldRows = helpers.queryAll<{
    id: number
    brand: string
    model: string
    plate_number: string
    year: number | null
    color: string
    fuel_type: string
    daily_price: number
    status: string
    mileage: number
    notes: string
    created_at: string
    updated_at: string
  }>('SELECT * FROM cars')

  db.run('ALTER TABLE cars RENAME TO cars_legacy')

  createCarsSchema(db)

  for (const row of oldRows) {
    const isAvailable = row.status === 'out_of_service' || row.status === 'maintenance' ? 0 : 1
    helpers.run(
      `INSERT INTO cars (
        id, name, brand, model, year, color, plate_number, category, price_per_day,
        transmission, seats, fuel, bags, badge, is_available, mileage, fuel_level,
        condition_notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        `${row.brand} ${row.model}`.trim(),
        row.brand,
        row.model,
        row.year,
        row.color ?? '',
        row.plate_number,
        'compacte',
        row.daily_price ?? 0,
        'manuelle',
        5,
        mapFuel(row.fuel_type),
        2,
        '',
        isAvailable,
        row.mileage ?? 0,
        '',
        row.notes ?? '',
        row.created_at,
        row.updated_at,
      ],
    )
  }

  db.run('DROP TABLE cars_legacy')
}

export function migrateCarStatusColumn(db: Database, helpers: DbHelpers) {
  const cols = helpers.queryAll<{ name: string }>('PRAGMA table_info(cars)')
  if (cols.some((c) => c.name === 'status')) return

  db.run("ALTER TABLE cars ADD COLUMN status TEXT NOT NULL DEFAULT 'disponible'")

  helpers.run("UPDATE cars SET status = 'hors_service' WHERE is_available = 0")

  helpers.run(`
    UPDATE cars SET status = 'louee'
    WHERE is_available = 1
      AND status = 'disponible'
      AND EXISTS (
        SELECT 1 FROM contracts ct
        WHERE ct.car_id = cars.id
          AND ct.status = 'active'
          AND date('now') BETWEEN ct.start_date AND ct.end_date
      )
  `)

  helpers.run(`
    UPDATE cars SET is_available = CASE WHEN status = 'disponible' THEN 1 ELSE 0 END
  `)
}

/** Keep a blank or malformed numeric field from reaching the database as NaN. */
function safeNumber(value: unknown, fallback: number, min = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, parsed)
}

function normalizeCarInput(data: CarInput) {
  const status = parseCarStatus(data)
  const name = data.name?.trim() ?? ''
  const plate = data.plate_number?.trim() ?? ''
  if (!name) throw new Error('NAME_REQUIRED')
  if (!plate) throw new Error('PLATE_REQUIRED')
  const year = Number(data.year)
  return {
    name,
    brand: data.brand?.trim() ?? '',
    model: data.model?.trim() ?? '',
    year: Number.isFinite(year) && year > 0 ? year : null,
    color: data.color ?? '',
    plate_number: plate,
    category: data.category ?? 'compacte',
    price_per_day: safeNumber(data.price_per_day, 0),
    transmission: data.transmission ?? 'manuelle',
    seats: safeNumber(data.seats, 5, 1),
    fuel: data.fuel ?? 'Essence',
    bags: safeNumber(data.bags, 2),
    badge: data.badge ?? '',
    status,
    is_available: statusToAvailable(status),
    mileage: safeNumber(data.mileage, 0),
    fuel_level: data.fuel_level ?? '',
    condition_notes: data.condition_notes ?? '',
    vidange_interval_km: safeNumber(data.vidange_interval_km, 10000),
    vidange_interval_months: safeNumber(data.vidange_interval_months, 6),
    vidange_last_date: data.vidange_last_date ?? '',
    vidange_last_mileage: safeNumber(data.vidange_last_mileage, 0),
    doc_carte_grise_path: data.doc_carte_grise_path ?? '',
    doc_carte_grise_expiry: data.doc_carte_grise_expiry ?? '',
    doc_assurance_path: data.doc_assurance_path ?? '',
    doc_assurance_expiry: data.doc_assurance_expiry ?? '',
    doc_controle_technique_path: data.doc_controle_technique_path ?? '',
    doc_controle_technique_expiry: data.doc_controle_technique_expiry ?? '',
    doc_vignette_path: data.doc_vignette_path ?? '',
    doc_vignette_expiry: data.doc_vignette_expiry ?? '',
    doc_autorisation_path: data.doc_autorisation_path ?? '',
    doc_autorisation_expiry: data.doc_autorisation_expiry ?? '',
  }
}

function assertUniquePlate(helpers: DbHelpers, plate: string, excludeId?: number) {
  const existing = helpers.queryOne<{ id: number }>(
    'SELECT id FROM cars WHERE plate_number = ? AND id != COALESCE(?, -1)',
    [plate, excludeId ?? null],
  )
  if (existing) throw new Error('PLATE_EXISTS')
}

function syncCarImages(helpers: DbHelpers, carId: number, images: CarImageInput[] | undefined) {
  if (!images) return

  const existing = helpers.queryAll<CarImage>(
    'SELECT id, path FROM car_images WHERE car_id = ? ORDER BY position ASC, id ASC',
    [carId],
  )

  const finalEntries: { path: string; position: number }[] = []

  images.forEach((img, index) => {
    if (!img.path || !fileExists(img.path)) return
    const finalPath = moveToCarStorage(img.path, carId, 'photos')
    if (!fileExists(finalPath)) return
    finalEntries.push({ path: finalPath, position: img.position ?? index })
  })

  const finalPathSet = new Set(finalEntries.map((entry) => entry.path))

  for (const img of existing) {
    if (!finalPathSet.has(img.path)) {
      deleteFileIfExists(img.path)
    }
  }

  helpers.run('DELETE FROM car_images WHERE car_id = ?', [carId])

  for (const entry of finalEntries) {
    helpers.run('INSERT INTO car_images (car_id, path, position) VALUES (?, ?, ?)', [
      carId,
      entry.path,
      entry.position,
    ])
  }
}

function finalizeDocumentPaths(carId: number, data: ReturnType<typeof normalizeCarInput>) {
  const result = { ...data }
  for (const col of DOC_COLUMNS) {
    if (!col.endsWith('_path')) continue
    const current = result[col as keyof typeof result] as string
    if (current) {
      ;(result as unknown as Record<string, string>)[col] = moveToCarStorage(current, carId, 'documents')
    }
  }
  return result
}

/** Keep existing document files when the form sends a display-only basename.
 *  An empty string is an intentional clear (user removed the document). */
function mergeDocumentPaths(
  existing: CarRecord,
  next: ReturnType<typeof normalizeCarInput>,
): ReturnType<typeof normalizeCarInput> {
  const merged = { ...next }
  for (const col of DOC_COLUMNS) {
    if (!col.endsWith('_path')) continue
    const key = col as keyof typeof merged
    const incoming = String(merged[key] ?? '')
    const previous = String(existing[col as keyof CarRecord] ?? '')
    if (!incoming) continue
    // Display basename only (no path separators) and already stored under previous path.
    if (
      previous &&
      !incoming.includes('/') &&
      !incoming.includes('\\') &&
      (previous.endsWith(incoming) || path.basename(previous) === incoming)
    ) {
      ;(merged as unknown as Record<string, string>)[col] = previous
    }
  }
  for (const col of DOC_COLUMNS) {
    if (!col.endsWith('_expiry')) continue
    const key = col as keyof typeof merged
    if (merged[key] === undefined || merged[key] === null) {
      ;(merged as unknown as Record<string, string>)[col] = String(
        existing[col as keyof CarRecord] ?? '',
      )
    }
  }
  return merged
}

function deleteRemovedDocuments(
  previous: CarRecord | null,
  next: ReturnType<typeof normalizeCarInput>,
) {
  if (!previous) return
  for (const col of DOC_COLUMNS) {
    if (!col.endsWith('_path')) continue
    const oldPath = previous[col as keyof CarRecord] as string
    const newPath = next[col as keyof typeof next] as string
    if (oldPath && oldPath !== newPath) deleteFileIfExists(oldPath)
  }
}

/** Keep the linked *live* contract in sync when car mileage/fuel is edited.
 *  Closed rentals are history — never overwrite their handover fields from a car form save. */
function syncContractHandoverFromCar(
  helpers: DbHelpers,
  carId: number,
  data: { mileage: number; fuel_level: string; condition_notes: string },
) {
  const latest = helpers.queryOne<{
    id: number
    status: string
    departure_mileage: number
    return_mileage: number
  }>(
    `SELECT id, status, departure_mileage, return_mileage FROM contracts
     WHERE car_id = ? AND deleted_at IS NULL AND status IN ('active', 'draft')
     ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, id DESC
     LIMIT 1`,
    [carId],
  )
  if (!latest) return

  const mileage = Math.max(0, Number(data.mileage) || 0)
  const fuel = data.fuel_level ?? ''
  const notes = data.condition_notes ?? ''
  const t = helpers.now()

  helpers.run(
    `UPDATE contracts SET
       departure_mileage = ?,
       departure_fuel_level = COALESCE(NULLIF(?, ''), departure_fuel_level),
       departure_notes = COALESCE(NULLIF(?, ''), departure_notes),
       updated_at = ?
     WHERE id = ?`,
    [mileage, fuel, notes, t, latest.id],
  )
}

export function syncCarAvailability(helpers: DbHelpers, carId: number) {
  const car = helpers.queryOne<{ status: string }>('SELECT status FROM cars WHERE id = ?', [carId])
  if (!car || car.status === 'hors_service') return

  const activeContract = helpers.queryOne(
    `SELECT id FROM contracts
     WHERE car_id = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1`,
    [carId],
  )
  // Ignore reservations already closed via a non-deleted closed/cancelled contract
  const runningReservation = helpers.queryOne<{ id: number }>(
    `SELECT r.id FROM reservations r
     WHERE r.car_id = ?
       AND ${RESERVATION_IN_PROGRESS}
       AND NOT EXISTS (
         SELECT 1 FROM contracts c
         WHERE c.reservation_id = r.id
           AND c.deleted_at IS NULL
           AND c.status = 'closed'
       )
     LIMIT 1`,
    [carId],
  )
  const nextStatus = activeContract || runningReservation ? 'louee' : 'disponible'
  if (car.status === nextStatus) return

  helpers.run('UPDATE cars SET status = ?, is_available = ?, updated_at = ? WHERE id = ?', [
    nextStatus,
    nextStatus === 'disponible' ? 1 : 0,
    helpers.now(),
    carId,
  ])
}

export function syncAllCarStatuses(helpers: DbHelpers) {
  const cars = helpers.queryAll<{ id: number }>(
    "SELECT id FROM cars WHERE status != 'hors_service'",
  )
  for (const car of cars) syncCarAvailability(helpers, car.id)
}

export function createCarsApi(helpers: DbHelpers) {
  return {
    getCarStats(): CarStats {
      const rows = helpers.queryAll<{ computed_status: CarComputedStatus; c: number }>(
        `SELECT ${STATUS_SQL} as computed_status, COUNT(*) as c FROM cars c GROUP BY computed_status`,
      )
      const stats: CarStats = { total: 0, disponible: 0, louee: 0, hors_service: 0 }
      for (const row of rows) {
        stats[row.computed_status] = row.c
        stats.total += row.c
      }
      return stats
    },

    listCars(filters?: CarFilters): CarListItem[] {
      // Align denormalized last_* so list vidange badges match history.
      syncAllCarsLastVidange(helpers)

      let sql = `
        SELECT c.*,
          ${STATUS_SQL} as computed_status,
          ${THUMBNAIL_SQL} as thumbnail,
          ${RETURN_DATE_SQL} as return_date
        FROM cars c
        WHERE 1=1`
      const params: unknown[] = []

      if (filters?.q) {
        sql += ` AND (
          c.name LIKE ? OR c.brand LIKE ? OR c.model LIKE ? OR c.plate_number LIKE ?
        )`
        const like = `%${filters.q}%`
        params.push(like, like, like, like)
      }

      if (filters?.category) {
        sql += ' AND c.category = ?'
        params.push(filters.category)
      }

      if (filters?.status) {
        sql += ` AND ${STATUS_SQL} = ?`
        params.push(filters.status)
      }

      sql += ' ORDER BY c.id DESC'
      return helpers.queryAll<CarListItem>(sql, params)
    },

    getCar(id: number): CarDetail | null {
      syncCarLastVidange(helpers, id)
      const car = helpers.queryOne<CarDetail>(
        `SELECT c.*,
          ${STATUS_SQL} as computed_status,
          ${RETURN_DATE_SQL} as return_date
         FROM cars c WHERE c.id = ?`,
        [id],
      )
      if (!car) return null
      const images = helpers
        .queryAll<CarImage>(
          'SELECT * FROM car_images WHERE car_id = ? ORDER BY position ASC, id ASC',
          [id],
        )
        .filter((img) => fileExists(img.path))
      return { ...car, images }
    },

    createCar(data: CarInput) {
      const normalized = normalizeCarInput(data)
      assertUniquePlate(helpers, normalized.plate_number)
      const t = helpers.now()

      const id = helpers.runInsert(
        `INSERT INTO cars (
          name, brand, model, year, color, plate_number, category, price_per_day,
          transmission, seats, fuel, bags, badge, status, is_available, mileage, fuel_level,
          condition_notes, vidange_interval_km, vidange_interval_months, vidange_last_date, vidange_last_mileage,
          doc_carte_grise_path, doc_carte_grise_expiry,
          doc_assurance_path, doc_assurance_expiry,
          doc_controle_technique_path, doc_controle_technique_expiry,
          doc_vignette_path, doc_vignette_expiry,
          doc_autorisation_path, doc_autorisation_expiry,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalized.name,
          normalized.brand,
          normalized.model,
          normalized.year,
          normalized.color,
          normalized.plate_number,
          normalized.category,
          normalized.price_per_day,
          normalized.transmission,
          normalized.seats,
          normalized.fuel,
          normalized.bags,
          normalized.badge,
          normalized.status,
          normalized.is_available,
          normalized.mileage,
          normalized.fuel_level,
          normalized.condition_notes,
          normalized.vidange_interval_km,
          normalized.vidange_interval_months,
          normalized.vidange_last_date,
          normalized.vidange_last_mileage,
          '',
          normalized.doc_carte_grise_expiry,
          '',
          normalized.doc_assurance_expiry,
          '',
          normalized.doc_controle_technique_expiry,
          '',
          normalized.doc_vignette_expiry,
          '',
          normalized.doc_autorisation_expiry,
          t,
          t,
        ],
      )
      const withDocs = finalizeDocumentPaths(id, normalized)
      helpers.run(
        `UPDATE cars SET
          doc_carte_grise_path = ?, doc_assurance_path = ?, doc_controle_technique_path = ?,
          doc_vignette_path = ?, doc_autorisation_path = ?, updated_at = ?
         WHERE id = ?`,
        [
          withDocs.doc_carte_grise_path,
          withDocs.doc_assurance_path,
          withDocs.doc_controle_technique_path,
          withDocs.doc_vignette_path,
          withDocs.doc_autorisation_path,
          t,
          id,
        ],
      )

      syncCarImages(helpers, id, data.images)
      return this.getCar(id)
    },

    updateCar(id: number, data: CarInput) {
      const existing = helpers.queryOne<CarRecord>('SELECT * FROM cars WHERE id = ?', [id])
      if (!existing) throw new Error('CAR_NOT_FOUND')

      const normalized = normalizeCarInput(data)
      assertUniquePlate(helpers, normalized.plate_number, id)
      const withExistingDocs = mergeDocumentPaths(existing, normalized)
      deleteRemovedDocuments(existing, withExistingDocs)

      const withDocs = finalizeDocumentPaths(id, withExistingDocs)
      const t = helpers.now()

      helpers.run(
        `UPDATE cars SET
          name = ?, brand = ?, model = ?, year = ?, color = ?, plate_number = ?,
          category = ?, price_per_day = ?, transmission = ?, seats = ?, fuel = ?,
          bags = ?, badge = ?, status = ?, is_available = ?, mileage = ?, fuel_level = ?,
          condition_notes = ?,
          vidange_interval_km = ?, vidange_interval_months = ?,
          doc_carte_grise_path = ?, doc_carte_grise_expiry = ?,
          doc_assurance_path = ?, doc_assurance_expiry = ?,
          doc_controle_technique_path = ?, doc_controle_technique_expiry = ?,
          doc_vignette_path = ?, doc_vignette_expiry = ?,
          doc_autorisation_path = ?, doc_autorisation_expiry = ?,
          updated_at = ?
         WHERE id = ?`,
        [
          withDocs.name,
          withDocs.brand,
          withDocs.model,
          withDocs.year,
          withDocs.color,
          withDocs.plate_number,
          withDocs.category,
          withDocs.price_per_day,
          withDocs.transmission,
          withDocs.seats,
          withDocs.fuel,
          withDocs.bags,
          withDocs.badge,
          withDocs.status,
          withDocs.is_available,
          // Never rewind odometer below current recorded mileage.
          Math.max(Number(existing.mileage ?? 0), Number(withDocs.mileage ?? 0)),
          withDocs.fuel_level,
          withDocs.condition_notes,
          withDocs.vidange_interval_km,
          withDocs.vidange_interval_months,
          withDocs.doc_carte_grise_path,
          withDocs.doc_carte_grise_expiry,
          withDocs.doc_assurance_path,
          withDocs.doc_assurance_expiry,
          withDocs.doc_controle_technique_path,
          withDocs.doc_controle_technique_expiry,
          withDocs.doc_vignette_path,
          withDocs.doc_vignette_expiry,
          withDocs.doc_autorisation_path,
          withDocs.doc_autorisation_expiry,
          t,
          id,
        ],
      )

      const nextMileage = Math.max(Number(existing.mileage ?? 0), Number(withDocs.mileage ?? 0))
      const stateChanged =
        nextMileage !== Number(existing.mileage ?? 0) ||
        String(withDocs.fuel_level ?? '') !== String(existing.fuel_level ?? '') ||
        String(withDocs.condition_notes ?? '') !== String(existing.condition_notes ?? '')

      if (stateChanged) {
        syncContractHandoverFromCar(helpers, id, {
          mileage: nextMileage,
          fuel_level: withDocs.fuel_level ?? '',
          condition_notes: withDocs.condition_notes ?? '',
        })
      }

      syncCarImages(helpers, id, data.images)
      if (withDocs.status !== 'hors_service') syncCarAvailability(helpers, id)
      return this.getCar(id)
    },

    updateCarStatus(id: number, status: CarComputedStatus) {
      if (status !== 'disponible' && status !== 'louee' && status !== 'hors_service') {
        throw new Error('INVALID_STATUS')
      }
      const existing = helpers.queryOne<CarRecord>('SELECT id FROM cars WHERE id = ?', [id])
      if (!existing) throw new Error('CAR_NOT_FOUND')

      helpers.run('UPDATE cars SET status = ?, is_available = ?, updated_at = ? WHERE id = ?', [
        status,
        statusToAvailable(status),
        helpers.now(),
        id,
      ])
      // Manual status is a hint; rentals still own disponible/louee unless the car is off the fleet.
      if (status !== 'hors_service') syncCarAvailability(helpers, id)
      return this.getCar(id)
    },

    deleteCar(id: number) {
      const used = helpers.queryOne(
        'SELECT id FROM contracts WHERE car_id = ? AND deleted_at IS NULL LIMIT 1',
        [id],
      )
      // Only bookings that are still ahead of us block deletion; past or cancelled ones do not.
      const reserved = helpers.queryOne(
        `SELECT id FROM reservations
         WHERE car_id = ? AND status IN ('pending', 'confirmed')
           AND datetime(return_date) > ${SQL_NOW}
         LIMIT 1`,
        [id],
      )
      if (used || reserved) throw new Error('CAR_HAS_CONTRACTS')

      const images = helpers.queryAll<CarImage>('SELECT path FROM car_images WHERE car_id = ?', [id])
      const car = helpers.queryOne<CarRecord>('SELECT * FROM cars WHERE id = ?', [id])
      if (!car) throw new Error('CAR_NOT_FOUND')

      for (const img of images) deleteFileIfExists(img.path)
      for (const col of DOC_COLUMNS) {
        if (!col.endsWith('_path')) continue
        deleteFileIfExists(car[col as keyof CarRecord] as string)
      }

      helpers.run('DELETE FROM car_images WHERE car_id = ?', [id])
      // sql.js FK CASCADE is off by default — delete vidange history explicitly.
      const linkedVidanges = helpers.queryAll<{ expense_id: number | null }>(
        'SELECT expense_id FROM car_vidanges WHERE car_id = ?',
        [id],
      )
      for (const row of linkedVidanges) {
        if (row.expense_id) {
          deleteExpenseStorage(row.expense_id)
          helpers.run('DELETE FROM expenses WHERE id = ?', [row.expense_id])
        }
      }
      helpers.run('DELETE FROM car_vidanges WHERE car_id = ?', [id])
      helpers.run('UPDATE expenses SET car_id = NULL WHERE car_id = ?', [id])
      helpers.run('DELETE FROM cars WHERE id = ?', [id])
      deleteCarStorage(id)
      return { ok: true }
    },

    deleteCarImage(imageId: number) {
      const image = helpers.queryOne<CarImage>('SELECT * FROM car_images WHERE id = ?', [imageId])
      if (!image) throw new Error('IMAGE_NOT_FOUND')
      deleteFileIfExists(image.path)
      helpers.run('DELETE FROM car_images WHERE id = ?', [imageId])
      return { ok: true }
    },

    isCarRentable(
      carId: number,
      startDate: string,
      endDate: string,
      excludeReservationId?: number | null,
    ) {
      const car = helpers.queryOne<CarRecord>('SELECT * FROM cars WHERE id = ?', [carId])
      if (!car) throw new Error('CAR_NOT_FOUND')
      if (car.status === 'hors_service') return false

      const contractOverlap = helpers.queryOne(
        `SELECT id FROM contracts
         WHERE car_id = ? AND status = 'active' AND deleted_at IS NULL
           AND (? IS NULL OR reservation_id IS NULL OR reservation_id != ?)
           AND NOT (end_date < ? OR start_date > ?)
         LIMIT 1`,
        [carId, excludeReservationId ?? null, excludeReservationId ?? 0, startDate, endDate],
      )
      if (contractOverlap) return false

      const reservationOverlap = helpers.queryOne(
        `SELECT id FROM reservations
         WHERE car_id = ? AND status IN ('pending', 'confirmed')
           AND id != COALESCE(?, -1)
           AND NOT (return_date <= ? OR pickup_date >= ?)
         LIMIT 1`,
        [carId, excludeReservationId ?? null, startDate, endDate],
      )
      return !reservationOverlap
    },

    getCarDailyPrice(carId: number) {
      const car = helpers.queryOne<{ price_per_day: number }>(
        'SELECT price_per_day FROM cars WHERE id = ?',
        [carId],
      )
      return car?.price_per_day ?? 0
    },
  }
}

export type CarsApi = ReturnType<typeof createCarsApi>

export function statusLabel(status: CarComputedStatus) {
  const map: Record<CarComputedStatus, string> = {
    disponible: 'Disponible',
    louee: 'Louée',
    hors_service: 'Hors service',
  }
  return map[status]
}

export function exportCarsRows(cars: CarListItem[]) {
  return cars.map((car) => ({
    Nom: car.name,
    Marque: car.brand,
    Modèle: car.model,
    Immatriculation: car.plate_number,
    Catégorie: car.category,
    'Prix / jour (DH)': car.price_per_day,
    Statut: statusLabel(car.computed_status),
    Transmission: car.transmission,
    Sièges: car.seats,
    Carburant: car.fuel,
    Kilométrage: car.mileage,
    Disponible: car.is_available ? 'Oui' : 'Non',
  }))
}
