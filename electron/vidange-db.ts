import type { Database } from 'sql.js'

type DbHelpers = {
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
  run: (sql: string, params?: unknown[]) => void
  runInsert: (sql: string, params?: unknown[]) => number
  now: () => string
}

export type VidangeSeverity = 'critical' | 'high' | 'medium' | 'ok' | 'unknown'

export type VidangeStatus = {
  enabled: boolean
  never_done: boolean
  last_date: string
  last_mileage: number
  interval_km: number
  interval_months: number
  current_mileage: number
  next_due_km: number | null
  next_due_date: string | null
  km_remaining: number | null
  days_remaining: number | null
  overdue: boolean
  due_soon: boolean
  due_by_km: boolean
  due_by_date: boolean
  severity: VidangeSeverity
}

export type CarVidangeRecord = {
  id: number
  car_id: number
  performed_at: string
  mileage: number
  cost: number
  notes: string
  expense_id: number | null
  created_at: string
}

export type CarVidangeInput = {
  car_id: number
  performed_at: string
  mileage: number
  cost?: number
  notes?: string
  create_expense?: boolean
}

const DEFAULT_INTERVAL_KM = 10000
const DEFAULT_INTERVAL_MONTHS = 6
const SOON_KM = 2000
const SOON_DAYS = 14

function dateOnly(value: string) {
  return value?.trim().slice(0, 10) ?? ''
}

function addMonths(isoDate: string, months: number) {
  const d = dateOnly(isoDate)
  if (!d || months <= 0) return ''
  const date = new Date(`${d}T00:00:00`)
  if (Number.isNaN(date.getTime())) return ''
  date.setMonth(date.getMonth() + months)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function daysFromToday(dateStr: string) {
  const d = dateOnly(dateStr)
  if (!d) return NaN
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${d}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function emptyStatus(partial: Partial<VidangeStatus> & Pick<VidangeStatus, 'never_done' | 'last_date' | 'last_mileage' | 'interval_km' | 'interval_months' | 'current_mileage' | 'enabled'>): VidangeStatus {
  return {
    next_due_km: null,
    next_due_date: null,
    km_remaining: null,
    days_remaining: null,
    overdue: false,
    due_soon: false,
    due_by_km: false,
    due_by_date: false,
    severity: 'unknown',
    ...partial,
  }
}

export function computeVidangeStatus(input: {
  mileage: number
  vidange_interval_km?: number | null
  vidange_interval_months?: number | null
  vidange_last_date?: string | null
  vidange_last_mileage?: number | null
}): VidangeStatus {
  const interval_km = Math.max(0, Number(input.vidange_interval_km ?? DEFAULT_INTERVAL_KM) || 0)
  const interval_months = Math.max(0, Number(input.vidange_interval_months ?? DEFAULT_INTERVAL_MONTHS) || 0)
  const current_mileage = Math.max(0, Number(input.mileage ?? 0) || 0)
  const last_date = dateOnly(String(input.vidange_last_date ?? ''))
  const last_mileage = Math.max(0, Number(input.vidange_last_mileage ?? 0) || 0)
  const enabled = interval_km > 0 || interval_months > 0
  const never_done = !last_date && last_mileage <= 0

  if (!enabled) {
    return emptyStatus({
      enabled: false,
      never_done,
      last_date,
      last_mileage,
      interval_km,
      interval_months,
      current_mileage,
    })
  }

  // No previous oil change: show "Never performed" and skip remaining KM
  // unless a starting KM (last_mileage) was provided.
  if (never_done) {
    return emptyStatus({
      enabled: true,
      never_done: true,
      last_date,
      last_mileage,
      interval_km,
      interval_months,
      current_mileage,
    })
  }

  const next_due_km = interval_km > 0 ? last_mileage + interval_km : null
  const next_due_date = interval_months > 0 && last_date ? addMonths(last_date, interval_months) : null
  const km_remaining = next_due_km != null ? next_due_km - current_mileage : null
  const days_remaining = next_due_date ? daysFromToday(next_due_date) : null

  const due_by_km = next_due_km != null && current_mileage >= next_due_km
  const due_by_date =
    days_remaining != null && !Number.isNaN(days_remaining) && days_remaining <= 0
  const overdue = due_by_km || due_by_date

  const soon_by_km = km_remaining != null && km_remaining > 0 && km_remaining <= SOON_KM
  const soon_by_date =
    days_remaining != null &&
    !Number.isNaN(days_remaining) &&
    days_remaining > 0 &&
    days_remaining <= SOON_DAYS
  const due_soon = !overdue && (soon_by_km || soon_by_date)

  let severity: VidangeSeverity = 'ok'
  if (overdue) severity = 'critical'
  else if (due_soon) severity = 'medium'

  return {
    enabled: true,
    never_done: false,
    last_date,
    last_mileage,
    interval_km,
    interval_months,
    current_mileage,
    next_due_km,
    next_due_date: next_due_date || null,
    km_remaining,
    days_remaining: days_remaining != null && !Number.isNaN(days_remaining) ? days_remaining : null,
    overdue,
    due_soon,
    due_by_km,
    due_by_date,
    severity,
  }
}

export function createVidangeSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS car_vidanges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      car_id INTEGER NOT NULL,
      performed_at TEXT NOT NULL,
      mileage INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      expense_id INTEGER,
      created_at TEXT,
      FOREIGN KEY(car_id) REFERENCES cars(id) ON DELETE CASCADE
    );
  `)
}

export function migrateCarVidangeColumns(db: Database, helpers: DbHelpers) {
  const cols = helpers.queryAll<{ name: string }>('PRAGMA table_info(cars)')
  const names = new Set(cols.map((c) => c.name))
  const adds: Array<[string, string]> = [
    ['vidange_interval_km', `INTEGER DEFAULT ${DEFAULT_INTERVAL_KM}`],
    ['vidange_interval_months', `INTEGER DEFAULT ${DEFAULT_INTERVAL_MONTHS}`],
    ['vidange_last_date', "TEXT DEFAULT ''"],
    ['vidange_last_mileage', 'INTEGER DEFAULT 0'],
  ]
  for (const [name, def] of adds) {
    if (!names.has(name)) {
      db.run(`ALTER TABLE cars ADD COLUMN ${name} ${def}`)
    }
  }
}

function syncCarLastVidange(helpers: DbHelpers, carId: number, options?: { clearIfEmpty?: boolean }) {
  const latest = helpers.queryOne<CarVidangeRecord>(
    `SELECT * FROM car_vidanges WHERE car_id = ? ORDER BY datetime(performed_at) DESC, id DESC LIMIT 1`,
    [carId],
  )
  const car = helpers.queryOne<{ vidange_last_date: string; vidange_last_mileage: number }>(
    'SELECT vidange_last_date, vidange_last_mileage FROM cars WHERE id = ?',
    [carId],
  )
  if (!car) return

  // No history: never invent a last vidange from current KM (e.g. after a vehicle return).
  if (!latest) {
    if (!options?.clearIfEmpty) return
    if (!String(car.vidange_last_date ?? '').trim() && Number(car.vidange_last_mileage ?? 0) === 0) return
    helpers.run(
      `UPDATE cars SET vidange_last_date = ?, vidange_last_mileage = ?, updated_at = ? WHERE id = ?`,
      ['', 0, helpers.now(), carId],
    )
    return
  }

  const nextDate = dateOnly(latest.performed_at)
  const nextMileage = Number(latest.mileage ?? 0)
  if (
    String(car.vidange_last_date ?? '') === nextDate &&
    Number(car.vidange_last_mileage ?? 0) === nextMileage
  ) {
    return
  }

  helpers.run(
    `UPDATE cars SET vidange_last_date = ?, vidange_last_mileage = ?, updated_at = ? WHERE id = ?`,
    [nextDate, nextMileage, helpers.now(), carId],
  )
}

/** Keep cars.vidange_last_* aligned with history (list/detail badges). */
export function syncAllCarsLastVidange(helpers: DbHelpers) {
  const cars = helpers.queryAll<{ id: number }>('SELECT id FROM cars')
  for (const car of cars) {
    syncCarLastVidange(helpers, car.id)
  }
}

export { syncCarLastVidange }

export function createVidangeApi(
  helpers: DbHelpers,
  createLinkedExpense?: (data: {
    title: string
    amount: number
    expense_date: string
    car_id: number
    notes?: string
  }) => { id: number } | null,
  deleteLinkedExpense?: (expenseId: number) => void,
  updateLinkedExpense?: (
    expenseId: number,
    data: { amount: number; expense_date: string; notes?: string },
  ) => void,
) {
  return {
    listVidanges(carId: number): CarVidangeRecord[] {
      // Keep cars.vidange_last_* in sync so "Prochaine" can be calculated.
      syncCarLastVidange(helpers, carId)
      return helpers.queryAll<CarVidangeRecord>(
        `SELECT * FROM car_vidanges WHERE car_id = ? ORDER BY datetime(performed_at) DESC, id DESC`,
        [carId],
      )
    },

    updateVidangeIntervals(carId: number, intervalKm: number, intervalMonths: number) {
      const car = helpers.queryOne('SELECT id FROM cars WHERE id = ?', [carId])
      if (!car) throw new Error('CAR_NOT_FOUND')
      const km = Math.max(0, Math.floor(Number(intervalKm) || 0))
      const months = Math.max(0, Math.floor(Number(intervalMonths) || 0))
      helpers.run(
        `UPDATE cars SET vidange_interval_km = ?, vidange_interval_months = ?, updated_at = ? WHERE id = ?`,
        [km, months, helpers.now(), carId],
      )
      syncCarLastVidange(helpers, carId)
      return this.getVidangeStatus(carId)
    },

    getVidange(id: number) {
      return helpers.queryOne<CarVidangeRecord>('SELECT * FROM car_vidanges WHERE id = ?', [id])
    },

    getVidangeStatus(carId: number): VidangeStatus | null {
      const car = helpers.queryOne<{
        mileage: number
        vidange_interval_km: number
        vidange_interval_months: number
        vidange_last_date: string
        vidange_last_mileage: number
      }>(
        `SELECT mileage, vidange_interval_km, vidange_interval_months, vidange_last_date, vidange_last_mileage
         FROM cars WHERE id = ?`,
        [carId],
      )
      if (!car) return null
      return computeVidangeStatus(car)
    },

    createVidange(data: CarVidangeInput) {
      const car = helpers.queryOne<{ id: number; mileage: number; name: string; plate_number: string }>(
        'SELECT id, mileage, name, plate_number FROM cars WHERE id = ?',
        [data.car_id],
      )
      if (!car) throw new Error('CAR_NOT_FOUND')

      const performed_at = dateOnly(data.performed_at)
      if (!performed_at) throw new Error('INVALID_VIDANGE_DATE')
      const mileage = Math.floor(Number(data.mileage))
      if (!Number.isFinite(mileage) || mileage < 0) throw new Error('INVALID_VIDANGE_MILEAGE')
      const cost = Math.max(0, Number(data.cost ?? 0) || 0)
      if (cost <= 0) throw new Error('INVALID_VIDANGE_COST')
      const notes = data.notes?.trim() ?? ''
      const t = helpers.now()

      // Always create the matching car maintenance expense (vidange ↔ dépenses).
      let expense_id: number | null = null
      if (!createLinkedExpense) throw new Error('EXPENSE_API_UNAVAILABLE')
      const expense = createLinkedExpense({
        title: `Vidange — ${car.name || car.plate_number}`,
        amount: cost,
        expense_date: performed_at,
        car_id: car.id,
        notes: notes || undefined,
      })
      expense_id = expense?.id ?? null
      if (!expense_id) throw new Error('EXPENSE_CREATE_FAILED')

      const id = helpers.runInsert(
        `INSERT INTO car_vidanges (car_id, performed_at, mileage, cost, notes, expense_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [car.id, performed_at, mileage, cost, notes, expense_id, t],
      )

      // Only raise odometer here; last_* must come from the true latest history row.
      helpers.run(
        `UPDATE cars SET
          mileage = CASE WHEN ? > mileage THEN ? ELSE mileage END,
          updated_at = ?
         WHERE id = ?`,
        [mileage, mileage, t, car.id],
      )
      syncCarLastVidange(helpers, car.id)

      return this.getVidange(id)
    },

    updateVidange(id: number, data: Partial<Omit<CarVidangeInput, 'car_id' | 'create_expense'>>) {
      const existing = this.getVidange(id)
      if (!existing) throw new Error('VIDANGE_NOT_FOUND')

      const performed_at = dateOnly(data.performed_at ?? existing.performed_at)
      if (!performed_at) throw new Error('INVALID_VIDANGE_DATE')
      const mileage = Math.floor(Number(data.mileage ?? existing.mileage))
      if (!Number.isFinite(mileage) || mileage < 0) throw new Error('INVALID_VIDANGE_MILEAGE')
      const cost = Math.max(0, Number(data.cost ?? existing.cost ?? 0) || 0)
      if (cost <= 0) throw new Error('INVALID_VIDANGE_COST')
      const notes = (data.notes ?? existing.notes ?? '').trim()
      let expense_id = existing.expense_id

      if (expense_id) {
        const linkedExists = helpers.queryOne('SELECT id FROM expenses WHERE id = ?', [expense_id])
        if (!linkedExists) {
          expense_id = null
        }
      }

      if (expense_id) {
        try {
          updateLinkedExpense?.(expense_id, {
            amount: cost,
            expense_date: performed_at,
            notes: notes || undefined,
          })
        } catch {
          // keep link even if expense update fails
        }
      } else {
        if (!createLinkedExpense) throw new Error('EXPENSE_API_UNAVAILABLE')
        const car = helpers.queryOne<{ name: string; plate_number: string }>(
          'SELECT name, plate_number FROM cars WHERE id = ?',
          [existing.car_id],
        )
        const expense = createLinkedExpense({
          title: `Vidange — ${car?.name || car?.plate_number || existing.car_id}`,
          amount: cost,
          expense_date: performed_at,
          car_id: existing.car_id,
          notes: notes || undefined,
        })
        expense_id = expense?.id ?? null
        if (!expense_id) throw new Error('EXPENSE_CREATE_FAILED')
      }

      helpers.run(
        `UPDATE car_vidanges SET performed_at = ?, mileage = ?, cost = ?, notes = ?, expense_id = ? WHERE id = ?`,
        [performed_at, mileage, cost, notes, expense_id, id],
      )
      helpers.run(
        `UPDATE cars SET
          mileage = CASE WHEN ? > mileage THEN ? ELSE mileage END,
          updated_at = ?
         WHERE id = ?`,
        [mileage, mileage, helpers.now(), existing.car_id],
      )
      syncCarLastVidange(helpers, existing.car_id)
      return this.getVidange(id)
    },

    deleteVidange(id: number) {
      const existing = this.getVidange(id)
      if (!existing) throw new Error('VIDANGE_NOT_FOUND')

      if (existing.expense_id) {
        try {
          deleteLinkedExpense?.(existing.expense_id)
        } catch {
          // expense may already be gone — still remove vidange
        }
      } else if (existing.cost > 0 && deleteLinkedExpense) {
        // Legacy rows may have a linked expense without expense_id stored.
        const orphan = helpers.queryOne<{ id: number }>(
          `SELECT id FROM expenses
           WHERE car_id = ?
             AND category = 'maintenance'
             AND amount = ?
             AND expense_date = ?
             AND title LIKE 'Vidange — %'
           ORDER BY id DESC LIMIT 1`,
          [existing.car_id, existing.cost, dateOnly(existing.performed_at)],
        )
        if (orphan) {
          try {
            deleteLinkedExpense(orphan.id)
          } catch {
            // ignore
          }
        }
      }

      helpers.run('DELETE FROM car_vidanges WHERE id = ?', [id])
      syncCarLastVidange(helpers, existing.car_id, { clearIfEmpty: true })
      return { ok: true }
    },
  }
}
