import type { Database } from 'sql.js'
import {
  deleteCarStorage,
  deleteFileIfExists,
  fileExists,
  moveToCarStorage,
} from './storage'

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

const RETURN_DATE_SQL = `
  (
    SELECT COALESCE(NULLIF(ct.return_at, ''), ct.end_date) FROM contracts ct
    WHERE ct.car_id = c.id
      AND ct.status = 'active'
      AND ct.deleted_at IS NULL
      AND date('now') BETWEEN ct.start_date AND ct.end_date
    ORDER BY COALESCE(NULLIF(ct.return_at, ''), ct.end_date) ASC
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

function normalizeCarInput(data: CarInput) {
  const status = parseCarStatus(data)
  return {
    name: data.name.trim(),
    brand: data.brand.trim(),
    model: data.model.trim(),
    year: data.year ?? null,
    color: data.color ?? '',
    plate_number: data.plate_number.trim(),
    category: data.category ?? 'compacte',
    price_per_day: Number(data.price_per_day) || 0,
    transmission: data.transmission ?? 'manuelle',
    seats: data.seats ?? 5,
    fuel: data.fuel ?? 'Essence',
    bags: data.bags ?? 2,
    badge: data.badge ?? '',
    status,
    is_available: statusToAvailable(status),
    mileage: data.mileage ?? 0,
    fuel_level: data.fuel_level ?? '',
    condition_notes: data.condition_notes ?? '',
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

export function syncAllCarStatuses(helpers: DbHelpers) {
  const cars = helpers.queryAll<{ id: number; status: string }>(
    "SELECT id, status FROM cars WHERE status != 'hors_service'",
  )
  const t = helpers.now()

  for (const car of cars) {
    const activeContract = helpers.queryOne(
      `SELECT id FROM contracts
       WHERE car_id = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1`,
      [car.id],
    )
    const activeReservation = helpers.queryOne(
      `SELECT id FROM reservations
       WHERE car_id = ? AND status IN ('pending', 'confirmed')
         AND datetime(return_date) > datetime('now')
       LIMIT 1`,
      [car.id],
    )
    const nextStatus = activeContract || activeReservation ? 'louee' : 'disponible'
    if (car.status !== nextStatus) {
      helpers.run('UPDATE cars SET status = ?, is_available = ?, updated_at = ? WHERE id = ?', [
        nextStatus,
        nextStatus === 'disponible' ? 1 : 0,
        t,
        car.id,
      ])
    }
  }
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
          condition_notes,
          doc_carte_grise_path, doc_carte_grise_expiry,
          doc_assurance_path, doc_assurance_expiry,
          doc_controle_technique_path, doc_controle_technique_expiry,
          doc_vignette_path, doc_vignette_expiry,
          doc_autorisation_path, doc_autorisation_expiry,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      deleteRemovedDocuments(existing, normalized)

      const withDocs = finalizeDocumentPaths(id, normalized)
      const t = helpers.now()

      helpers.run(
        `UPDATE cars SET
          name = ?, brand = ?, model = ?, year = ?, color = ?, plate_number = ?,
          category = ?, price_per_day = ?, transmission = ?, seats = ?, fuel = ?,
          bags = ?, badge = ?, status = ?, is_available = ?, mileage = ?, fuel_level = ?,
          condition_notes = ?,
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
          withDocs.mileage,
          withDocs.fuel_level,
          withDocs.condition_notes,
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

      syncCarImages(helpers, id, data.images)
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
      return this.getCar(id)
    },

    deleteCar(id: number) {
      const used = helpers.queryOne(
        'SELECT id FROM contracts WHERE car_id = ? AND deleted_at IS NULL LIMIT 1',
        [id],
      )
      const reserved = helpers.queryOne(
        "SELECT id FROM reservations WHERE car_id = ? AND status IN ('pending', 'confirmed') LIMIT 1",
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

    isCarRentable(carId: number, startDate: string, endDate: string) {
      const car = helpers.queryOne<CarRecord>('SELECT * FROM cars WHERE id = ?', [carId])
      if (!car) throw new Error('CAR_NOT_FOUND')
      if (car.status !== 'disponible') return false

      const contractOverlap = helpers.queryOne(
        `SELECT id FROM contracts
         WHERE car_id = ? AND status = 'active' AND deleted_at IS NULL
           AND NOT (end_date < ? OR start_date > ?)
         LIMIT 1`,
        [carId, startDate, endDate],
      )
      if (contractOverlap) return false

      const reservationOverlap = helpers.queryOne(
        `SELECT id FROM reservations
         WHERE car_id = ? AND status IN ('pending', 'confirmed')
           AND NOT (return_date <= ? OR pickup_date >= ?)
         LIMIT 1`,
        [carId, startDate, endDate],
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
