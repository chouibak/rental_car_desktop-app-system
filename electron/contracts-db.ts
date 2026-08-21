import type { Database } from 'sql.js'
import { driverSnapshotFromChauffeur } from './chauffeurs-db'
import { contractPaidExpr, syncReservationPaymentStatusForContract } from './payment-sync'
import { reconcileContractOverpayment } from './payment-ledger'
import { roundMoney, SQL_NOW } from './local-date'

export type ContractStatus = 'draft' | 'active' | 'closed' | 'cancelled'

export type ContractDamage = {
  id?: string
  part: string
  type: string
  note: string
  x?: number
  y?: number
  photo?: string
  video?: string
}

export type ContractRecord = {
  id: number
  contract_number: string
  reservation_id: number | null
  client_id: number | null
  car_id: number | null
  status: ContractStatus
  deleted_at: string | null
  contract_date: string
  contract_city: string
  driver1_name: string
  driver1_birth_date: string
  driver1_birth_place: string
  driver1_nationality: string
  driver1_address: string
  driver1_phone: string
  driver1_passport_number: string
  driver1_passport_issued_at: string
  driver1_passport_expires_at: string
  driver1_cin_number: string
  driver1_cin_issued_at: string
  driver1_cin_expires_at: string
  driver1_license_number: string
  driver1_license_issued_at: string
  driver1_license_expires_at: string
  driver2_name: string
  driver2_birth_date: string
  driver2_birth_place: string
  driver2_nationality: string
  driver2_address: string
  driver2_phone: string
  driver2_passport_number: string
  driver2_passport_issued_at: string
  driver2_passport_expires_at: string
  driver2_cin_number: string
  driver2_cin_issued_at: string
  driver2_cin_expires_at: string
  driver2_license_number: string
  driver2_license_issued_at: string
  driver2_license_expires_at: string
  vehicle_brand: string
  vehicle_model: string
  vehicle_plate: string
  departure_at: string
  departure_place: string
  departure_mileage: number
  departure_fuel_level: string
  return_at: string
  return_place: string
  return_mileage: number
  return_fuel_level: string
  billed_days: number
  extension_until: string
  extension_days: number
  /** Return datetime before any prolongation; stable base for edit/remove. */
  original_return_at: string
  /** Rental total before any prolongation (fees/discount included). */
  original_total_amount: number
  departure_notes: string
  return_notes: string
  equipment: string
  equipment_other: string
  departure_damages: string
  return_damages: string
  departure_sketch: string
  return_sketch: string
  include_damage_photos_in_pdf: number
  daily_rate: number
  total_amount: number
  deposit_amount: number
  franchise_applies: number
  franchise_amount: number
  extra_charges: number
  extra_charges_note: string
  vat_applies: number
  vat_rate: number
  discount: number
  delivered_at: string
  closed_at: string
  customer_signed_at: string
  agency_signed_at: string
  notes: string
  created_at: string
  updated_at: string
  start_date: string
  end_date: string
  daily_price: number
  total_days: number
  deposit: number
}

export type ContractListItem = ContractRecord & {
  client_name: string
  client_phone: string
  brand: string
  model: string
  plate_number: string
  reservation_reference?: string
  paid_amount?: number
  is_overdue?: boolean
}

export type ContractInput = Partial<Omit<ContractRecord, 'id' | 'created_at' | 'updated_at' | 'contract_number'>>

export type ContractFilters = {
  q?: string
  status?: ContractStatus | ''
  car_id?: number | ''
  client_id?: number | ''
  overdue?: boolean
  archived?: boolean
}

export type CloseContractInput = {
  return_at?: string
  return_place?: string
  return_mileage?: number
  return_fuel_level?: string
  return_notes?: string
  return_damages?: ContractDamage[]
  extra_charges?: number
  return_extra_fees?: number
  extra_charges_note?: string
  return_sketch?: string
}

export type DeliveryHandoverInput = {
  departure_at?: string
  departure_place?: string
  departure_mileage?: number
  departure_fuel_level?: string
  departure_notes?: string
  departure_damages?: ContractDamage[]
  departure_sketch?: string
}

export type ExtendContractInput = {
  extra_days?: number
  new_return_at?: string
  note?: string
}

/** Absolute prolongation total. `0` removes all prolongation. */
export type SetContractExtensionInput = {
  extension_days: number
  note?: string
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
  isCarRentable: (
    id: number,
    start: string,
    end: string,
    excludeReservationId?: number | null,
  ) => boolean
  getCar: (id: number) => {
    brand: string
    model: string
    plate_number: string
    mileage: number
    fuel_level: string
    condition_notes: string
    price_per_day: number
  } | null
}

export const DEFAULT_EQUIPMENT = [
  'radio',
  'spare_wheel',
  'jack',
  'documents',
  'vest',
  'extinguisher',
  'warning_triangle',
] as const

export const CONTRACT_STATUSES: ContractStatus[] = ['active', 'draft', 'closed', 'cancelled']

const MIGRATION_COLUMNS: Array<[string, string]> = [
  ['reservation_id', 'INTEGER'],
  ['contract_date', 'TEXT'],
  ['contract_city', 'TEXT'],
  ['driver1_name', 'TEXT'],
  ['driver1_birth_date', 'TEXT'],
  ['driver1_birth_place', 'TEXT'],
  ['driver1_nationality', 'TEXT'],
  ['driver1_address', 'TEXT'],
  ['driver1_phone', 'TEXT'],
  ['driver1_passport_number', 'TEXT'],
  ['driver1_passport_issued_at', 'TEXT'],
  ['driver1_passport_expires_at', 'TEXT'],
  ['driver1_cin_number', 'TEXT'],
  ['driver1_cin_issued_at', 'TEXT'],
  ['driver1_cin_expires_at', 'TEXT'],
  ['driver1_license_number', 'TEXT'],
  ['driver1_license_issued_at', 'TEXT'],
  ['driver1_license_expires_at', 'TEXT'],
  ['driver2_name', 'TEXT'],
  ['driver2_birth_date', 'TEXT'],
  ['driver2_birth_place', 'TEXT'],
  ['driver2_nationality', 'TEXT'],
  ['driver2_address', 'TEXT'],
  ['driver2_phone', 'TEXT'],
  ['driver2_passport_number', 'TEXT'],
  ['driver2_passport_issued_at', 'TEXT'],
  ['driver2_passport_expires_at', 'TEXT'],
  ['driver2_cin_number', 'TEXT'],
  ['driver2_cin_issued_at', 'TEXT'],
  ['driver2_cin_expires_at', 'TEXT'],
  ['driver2_license_number', 'TEXT'],
  ['driver2_license_issued_at', 'TEXT'],
  ['driver2_license_expires_at', 'TEXT'],
  ['vehicle_brand', 'TEXT'],
  ['vehicle_model', 'TEXT'],
  ['vehicle_plate', 'TEXT'],
  ['departure_at', 'TEXT'],
  ['departure_place', 'TEXT'],
  ['departure_mileage', 'INTEGER DEFAULT 0'],
  ['departure_fuel_level', 'TEXT'],
  ['return_at', 'TEXT'],
  ['return_place', 'TEXT'],
  ['return_mileage', 'INTEGER DEFAULT 0'],
  ['return_fuel_level', 'TEXT'],
  ['billed_days', 'INTEGER DEFAULT 0'],
  ['extension_until', 'TEXT'],
  ['extension_days', 'INTEGER DEFAULT 0'],
  ['original_return_at', 'TEXT'],
  ['original_total_amount', 'REAL DEFAULT 0'],
  ['departure_notes', 'TEXT'],
  ['return_notes', 'TEXT'],
  ['equipment', 'TEXT'],
  ['equipment_other', 'TEXT'],
  ['departure_damages', 'TEXT'],
  ['return_damages', 'TEXT'],
  ['departure_sketch', 'TEXT'],
  ['return_sketch', 'TEXT'],
  ['include_damage_photos_in_pdf', 'INTEGER DEFAULT 0'],
  ['daily_rate', 'REAL DEFAULT 0'],
  ['deposit_amount', 'REAL DEFAULT 0'],
  ['franchise_applies', 'INTEGER DEFAULT 0'],
  ['franchise_amount', 'REAL DEFAULT 0'],
  ['extra_charges', 'REAL DEFAULT 0'],
  ['extra_charges_note', 'TEXT'],
  ['vat_applies', 'INTEGER DEFAULT 1'],
  ['vat_rate', 'REAL DEFAULT 20'],
  ['delivered_at', 'TEXT'],
  ['closed_at', 'TEXT'],
  ['customer_signed_at', 'TEXT'],
  ['agency_signed_at', 'TEXT'],
  ['deleted_at', 'TEXT'],
]

export function createContractsSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_number TEXT NOT NULL UNIQUE,
      reservation_id INTEGER,
      client_id INTEGER,
      car_id INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      deleted_at TEXT,
      contract_date TEXT,
      contract_city TEXT,
      driver1_name TEXT DEFAULT '',
      driver1_birth_date TEXT DEFAULT '',
      driver1_birth_place TEXT DEFAULT '',
      driver1_nationality TEXT DEFAULT '',
      driver1_address TEXT DEFAULT '',
      driver1_phone TEXT DEFAULT '',
      driver1_passport_number TEXT DEFAULT '',
      driver1_passport_issued_at TEXT DEFAULT '',
      driver1_passport_expires_at TEXT DEFAULT '',
      driver1_cin_number TEXT DEFAULT '',
      driver1_cin_issued_at TEXT DEFAULT '',
      driver1_cin_expires_at TEXT DEFAULT '',
      driver1_license_number TEXT DEFAULT '',
      driver1_license_issued_at TEXT DEFAULT '',
      driver1_license_expires_at TEXT DEFAULT '',
      driver2_name TEXT DEFAULT '',
      driver2_birth_date TEXT DEFAULT '',
      driver2_birth_place TEXT DEFAULT '',
      driver2_nationality TEXT DEFAULT '',
      driver2_address TEXT DEFAULT '',
      driver2_phone TEXT DEFAULT '',
      driver2_passport_number TEXT DEFAULT '',
      driver2_passport_issued_at TEXT DEFAULT '',
      driver2_passport_expires_at TEXT DEFAULT '',
      driver2_cin_number TEXT DEFAULT '',
      driver2_cin_issued_at TEXT DEFAULT '',
      driver2_cin_expires_at TEXT DEFAULT '',
      driver2_license_number TEXT DEFAULT '',
      driver2_license_issued_at TEXT DEFAULT '',
      driver2_license_expires_at TEXT DEFAULT '',
      vehicle_brand TEXT DEFAULT '',
      vehicle_model TEXT DEFAULT '',
      vehicle_plate TEXT DEFAULT '',
      departure_at TEXT DEFAULT '',
      departure_place TEXT DEFAULT '',
      departure_mileage INTEGER DEFAULT 0,
      departure_fuel_level TEXT DEFAULT '',
      return_at TEXT DEFAULT '',
      return_place TEXT DEFAULT '',
      return_mileage INTEGER DEFAULT 0,
      return_fuel_level TEXT DEFAULT '',
      billed_days INTEGER DEFAULT 0,
      extension_until TEXT DEFAULT '',
      extension_days INTEGER DEFAULT 0,
      original_return_at TEXT DEFAULT '',
      original_total_amount REAL DEFAULT 0,
      departure_notes TEXT DEFAULT '',
      return_notes TEXT DEFAULT '',
      equipment TEXT DEFAULT '',
      equipment_other TEXT DEFAULT '',
      departure_damages TEXT DEFAULT '[]',
      return_damages TEXT DEFAULT '[]',
      include_damage_photos_in_pdf INTEGER DEFAULT 0,
      daily_rate REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      deposit_amount REAL DEFAULT 0,
      franchise_applies INTEGER DEFAULT 0,
      franchise_amount REAL DEFAULT 0,
      extra_charges REAL DEFAULT 0,
      extra_charges_note TEXT DEFAULT '',
      vat_applies INTEGER DEFAULT 1,
      vat_rate REAL DEFAULT 20,
      discount REAL DEFAULT 0,
      delivered_at TEXT DEFAULT '',
      closed_at TEXT DEFAULT '',
      customer_signed_at TEXT DEFAULT '',
      agency_signed_at TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT,
      start_date TEXT DEFAULT '',
      end_date TEXT DEFAULT '',
      daily_price REAL DEFAULT 0,
      total_days INTEGER DEFAULT 0,
      deposit REAL DEFAULT 0
    )
  `)
}

export function migrateContractsTable(db: Database, helpers: DbHelpers) {
  createContractsSchema(db)
  const columns = helpers.queryAll<{ name: string }>('PRAGMA table_info(contracts)')
  const names = new Set(columns.map((c) => c.name))
  if (names.size === 0) return

  for (const [col, type] of MIGRATION_COLUMNS) {
    if (!names.has(col)) {
      db.run(`ALTER TABLE contracts ADD COLUMN ${col} ${type}`)
    }
  }

  if (names.has('start_date')) {
    helpers.run(`
      UPDATE contracts SET
        departure_at = COALESCE(NULLIF(departure_at, ''), start_date),
        return_at = COALESCE(NULLIF(return_at, ''), end_date),
        billed_days = CASE WHEN billed_days IS NULL OR billed_days = 0 THEN total_days ELSE billed_days END,
        daily_rate = CASE WHEN daily_rate IS NULL OR daily_rate = 0 THEN daily_price ELSE daily_rate END,
        deposit_amount = CASE WHEN deposit_amount IS NULL OR deposit_amount = 0 THEN deposit ELSE deposit_amount END,
        contract_date = COALESCE(NULLIF(contract_date, ''), date(start_date)),
        driver1_name = COALESCE(NULLIF(driver1_name, ''), '')
    `)
  }

  helpers.run(`UPDATE contracts SET status = 'closed' WHERE status = 'completed'`)

  // Backfill stable base return for existing prolongations / contracts.
  const rows = helpers.queryAll<{
    id: number
    return_at: string
    end_date: string
    extension_days: number
    original_return_at: string
  }>(
    `SELECT id, return_at, end_date, extension_days, original_return_at FROM contracts
     WHERE deleted_at IS NULL`,
  )
  for (const row of rows) {
    if (row.original_return_at?.trim()) continue
    const current = row.return_at || row.end_date
    if (!current) continue
    const ext = Math.max(0, Math.floor(Number(row.extension_days ?? 0)))
    let base = current
    if (ext > 0) {
      const d = new Date(current)
      if (!Number.isNaN(d.getTime())) {
        d.setDate(d.getDate() - ext)
        base = d.toISOString()
      }
    }
    helpers.run(`UPDATE contracts SET original_return_at = ? WHERE id = ?`, [base, row.id])
  }

  const totals = helpers.queryAll<{
    id: number
    total_amount: number
    extension_days: number
    daily_rate: number
    daily_price: number
    original_total_amount: number
  }>(
    `SELECT id, total_amount, extension_days, daily_rate, daily_price, original_total_amount
     FROM contracts WHERE deleted_at IS NULL`,
  )
  for (const row of totals) {
    if (Number(row.original_total_amount ?? 0) > 0) continue
    const ext = Math.max(0, Math.floor(Number(row.extension_days ?? 0)))
    const daily = Number(row.daily_rate ?? row.daily_price ?? 0)
    const total = Number(row.total_amount ?? 0)
    const original = ext > 0 ? Math.max(0, total - ext * daily) : total
    helpers.run(`UPDATE contracts SET original_total_amount = ? WHERE id = ?`, [original, row.id])
  }
}

function parseJsonArray<T>(value: unknown, fallback: T[] = []): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string' || !value.trim()) return fallback
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function datePart(value: string) {
  return value?.slice(0, 10) ?? ''
}

function calcDays(start: string, end: string) {
  const a = new Date(start)
  const b = new Date(end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b <= a) return 1
  return Math.max(1, Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)))
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) throw new Error('INVALID_RETURN_DATE')
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

/** Return date before any prolongation. Prefers stored original_return_at. */
function getBaseReturnAt(
  contract: Pick<ContractRecord, 'return_at' | 'end_date' | 'extension_days' | 'original_return_at'>,
) {
  if (contract.original_return_at?.trim()) {
    return contract.original_return_at
  }
  const currentReturn = contract.return_at || contract.end_date
  if (!currentReturn) throw new Error('INVALID_RETURN_DATE')
  const extensionDays = Math.max(0, Math.floor(Number(contract.extension_days ?? 0)))
  if (extensionDays <= 0) return currentReturn
  return addDaysIso(currentReturn, -extensionDays)
}

/**
 * Rental total before any prolongation.
 * Derived from the live total so contract edits (extra charges, discount, rate) stay
 * authoritative; the stored value is only a fallback when there is no rate to subtract.
 */
function getOriginalRentalTotal(
  contract: Pick<
    ContractRecord,
    'total_amount' | 'extension_days' | 'daily_rate' | 'daily_price' | 'original_total_amount'
  >,
) {
  const ext = Math.max(0, Math.floor(Number(contract.extension_days ?? 0)))
  const daily = Number(contract.daily_rate ?? contract.daily_price ?? 0)
  const total = Number(contract.total_amount ?? 0)
  if (ext <= 0) return total
  if (daily <= 0) return Number(contract.original_total_amount ?? 0) || total
  return Math.max(0, roundMoney(total - ext * daily))
}

function computeExtensionState(
  contract: ContractRecord,
  extension_days: number,
) {
  const daily_rate = Number(contract.daily_rate ?? contract.daily_price ?? 0)
  const original_return_at = contract.original_return_at?.trim() || getBaseReturnAt(contract)
  const original_total_amount = getOriginalRentalTotal(contract)
  const newReturnAt =
    extension_days === 0 ? original_return_at : addDaysIso(original_return_at, extension_days)
  const departure = contract.departure_at || contract.start_date
  if (!departure) throw new Error('INVALID_RETURN_DATE')
  const billed_days = calcDays(departure, newReturnAt)
  const extensionCost = Math.max(0, extension_days * daily_rate)
  const total_amount = Math.max(0, original_total_amount + extensionCost)
  const extension_until = extension_days > 0 ? datePart(newReturnAt) : ''
  return {
    original_return_at,
    original_total_amount,
    newReturnAt,
    billed_days,
    total_amount,
    extension_until,
    extensionCost,
  }
}

function syncLinkedReservationDates(
  helpers: DbHelpers,
  reservationId: number | null | undefined,
  input: {
    pickup_date?: string
    return_date: string
    billed_days: number
    daily_rate: number
    total_amount: number
  },
) {
  if (!reservationId) return
  if (input.pickup_date) {
    helpers.run(
      `UPDATE reservations SET
        pickup_date = ?,
        return_date = ?,
        days = ?,
        daily_rate = ?,
        total_amount = ?,
        updated_at = ?
       WHERE id = ?`,
      [
        input.pickup_date,
        input.return_date,
        input.billed_days,
        input.daily_rate,
        input.total_amount,
        helpers.now(),
        reservationId,
      ],
    )
    return
  }
  helpers.run(
    `UPDATE reservations SET
      return_date = ?,
      days = ?,
      daily_rate = ?,
      total_amount = ?,
      updated_at = ?
     WHERE id = ?`,
    [input.return_date, input.billed_days, input.daily_rate, input.total_amount, helpers.now(), reservationId],
  )
}

/** The car must be free for this contract's window, ignoring the contract's own reservation. */
function assertCarFreeForContract(
  helpers: DbHelpers,
  contract: ContractRecord,
  newReturnAt: string,
) {
  if (!contract.car_id) return
  const start = datePart(contract.departure_at || contract.start_date)
  const end = datePart(newReturnAt)
  const overlapContract = helpers.queryOne(
    `SELECT id FROM contracts
     WHERE car_id = ? AND deleted_at IS NULL AND status IN ('active', 'draft') AND id != ?
       AND NOT (date(COALESCE(NULLIF(return_at,''), end_date)) < date(?)
            OR date(COALESCE(NULLIF(departure_at,''), start_date)) > date(?))
     LIMIT 1`,
    [contract.car_id, contract.id, start, end],
  )
  if (overlapContract) throw new Error('CAR_NOT_AVAILABLE')

  const overlapReservation = helpers.queryOne(
    `SELECT id FROM reservations
     WHERE car_id = ? AND status IN ('pending', 'confirmed')
       AND (? IS NULL OR id != ?)
       AND NOT (date(return_date) <= date(?) OR date(pickup_date) >= date(?))
     LIMIT 1`,
    [contract.car_id, contract.reservation_id, contract.reservation_id ?? 0, start, end],
  )
  if (overlapReservation) throw new Error('CAR_NOT_AVAILABLE')
}

function normalizeStatus(status?: string): ContractStatus {
  if (status === 'completed') return 'closed'
  if (CONTRACT_STATUSES.includes(status as ContractStatus)) return status as ContractStatus
  return 'active'
}

/** Map reservation delivery_location → contract departure_place text (French, PDF-safe). */
function departurePlaceFromDeliveryLocation(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const folded = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, "'")
  const labels: Record<string, string> = {
    agency: "À l'agence",
    airport: 'Aéroport',
    hotel: 'Hôtel',
    "a l'agence": "À l'agence",
    agence: "À l'agence",
    aeroport: 'Aéroport',
    'في الوكالة': "À l'agence",
    الوكالة: "À l'agence",
    المطار: 'Aéroport',
    الفندق: 'Hôtel',
  }
  return labels[raw] ?? labels[folded] ?? raw
}

function nextNumber(helpers: DbHelpers) {
  const year = new Date().getFullYear()
  const prefix = `CTR-${year}-`
  const row = helpers.queryOne<{ n: string }>(
    `SELECT contract_number as n FROM contracts
     WHERE contract_number LIKE ?
     ORDER BY CAST(SUBSTR(contract_number, ?) AS INTEGER) DESC
     LIMIT 1`,
    [`${prefix}%`, String(prefix.length + 1)],
  )
  const last = row?.n ? Number(row.n.slice(prefix.length)) : 0
  const next = (Number.isFinite(last) ? last : 0) + 1
  return `${prefix}${String(next).padStart(4, '0')}`
}

/** A cancelled contract no longer holds the reservation, so a new one may be issued. */
function hasLiveContract(helpers: DbHelpers, reservationId: number) {
  return Boolean(
    helpers.queryOne(
      `SELECT id FROM contracts
       WHERE reservation_id = ? AND deleted_at IS NULL AND status != 'cancelled'`,
      [reservationId],
    ),
  )
}

function driverSnapshotFromCustomer(customer: Record<string, string>) {
  return {
    driver1_name: customer.name ?? '',
    driver1_birth_date: customer.birth_date ?? '',
    driver1_birth_place: customer.birth_place ?? '',
    driver1_nationality: customer.nationality ?? '',
    driver1_address: customer.address ?? '',
    driver1_phone: customer.phone ?? '',
    driver1_passport_number: customer.passport_number ?? '',
    driver1_passport_issued_at: customer.passport_issue_date ?? '',
    driver1_passport_expires_at: customer.passport_expiry_date ?? '',
    driver1_cin_number: customer.cin_number ?? '',
    driver1_cin_issued_at: customer.cin_issue_date ?? '',
    driver1_cin_expires_at: customer.cin_expiry_date ?? '',
    driver1_license_number: customer.license_number ?? '',
    driver1_license_issued_at: customer.license_issue_date ?? '',
    driver1_license_expires_at: customer.license_expiry_date ?? '',
  }
}

function normalizeInput(data: ContractInput, existing?: ContractRecord) {
  const departure_at = data.departure_at ?? existing?.departure_at ?? existing?.start_date ?? ''
  const return_at = data.return_at ?? existing?.return_at ?? existing?.end_date ?? ''
  const daily_rate = Number(data.daily_rate ?? data.daily_price ?? existing?.daily_rate ?? existing?.daily_price ?? 0)
  const billed_days = Number(
    data.billed_days ?? data.total_days ?? (departure_at && return_at ? calcDays(departure_at, return_at) : existing?.billed_days ?? 1),
  )
  const discount = Number(data.discount ?? existing?.discount ?? 0)
  const extra_charges = Number(data.extra_charges ?? existing?.extra_charges ?? 0)
  const total_amount = Number(
    data.total_amount ?? Math.max(0, billed_days * daily_rate - discount + extra_charges),
  )

  const equipment = data.equipment
    ? JSON.stringify(parseJsonArray<string>(data.equipment))
    : existing?.equipment ?? JSON.stringify([...DEFAULT_EQUIPMENT])

  const departure_damages =
    data.departure_damages !== undefined
      ? JSON.stringify(parseJsonArray<ContractDamage>(data.departure_damages))
      : existing?.departure_damages ?? '[]'

  const return_damages =
    data.return_damages !== undefined
      ? JSON.stringify(parseJsonArray<ContractDamage>(data.return_damages))
      : existing?.return_damages ?? '[]'

  const driver1_name = (data.driver1_name ?? existing?.driver1_name ?? '').trim()
  if (!driver1_name) throw new Error('DRIVER1_REQUIRED')

  const franchise_amount = Number(data.franchise_amount ?? existing?.franchise_amount ?? 0)
  const franchise_applies =
    data.franchise_applies !== undefined
      ? Number(data.franchise_applies) ? 1 : 0
      : franchise_amount > 0
        ? 1
        : Number(existing?.franchise_applies ?? 0)

  return {
    reservation_id: data.reservation_id ?? existing?.reservation_id ?? null,
    client_id: Number(data.client_id ?? existing?.client_id ?? 0) || null,
    car_id: Number(data.car_id ?? existing?.car_id ?? 0) || null,
    status: normalizeStatus(data.status ?? existing?.status),
    contract_date: data.contract_date ?? existing?.contract_date ?? new Date().toISOString().slice(0, 10),
    contract_city: data.contract_city ?? existing?.contract_city ?? '',
    driver1_name,
    driver1_birth_date: data.driver1_birth_date ?? existing?.driver1_birth_date ?? '',
    driver1_birth_place: data.driver1_birth_place ?? existing?.driver1_birth_place ?? '',
    driver1_nationality: data.driver1_nationality ?? existing?.driver1_nationality ?? '',
    driver1_address: data.driver1_address ?? existing?.driver1_address ?? '',
    driver1_phone: data.driver1_phone ?? existing?.driver1_phone ?? '',
    driver1_passport_number: data.driver1_passport_number ?? existing?.driver1_passport_number ?? '',
    driver1_passport_issued_at: data.driver1_passport_issued_at ?? existing?.driver1_passport_issued_at ?? '',
    driver1_passport_expires_at: data.driver1_passport_expires_at ?? existing?.driver1_passport_expires_at ?? '',
    driver1_cin_number: data.driver1_cin_number ?? existing?.driver1_cin_number ?? '',
    driver1_cin_issued_at: data.driver1_cin_issued_at ?? existing?.driver1_cin_issued_at ?? '',
    driver1_cin_expires_at: data.driver1_cin_expires_at ?? existing?.driver1_cin_expires_at ?? '',
    driver1_license_number: data.driver1_license_number ?? existing?.driver1_license_number ?? '',
    driver1_license_issued_at: data.driver1_license_issued_at ?? existing?.driver1_license_issued_at ?? '',
    driver1_license_expires_at: data.driver1_license_expires_at ?? existing?.driver1_license_expires_at ?? '',
    driver2_name: data.driver2_name ?? existing?.driver2_name ?? '',
    driver2_birth_date: data.driver2_birth_date ?? existing?.driver2_birth_date ?? '',
    driver2_birth_place: data.driver2_birth_place ?? existing?.driver2_birth_place ?? '',
    driver2_nationality: data.driver2_nationality ?? existing?.driver2_nationality ?? '',
    driver2_address: data.driver2_address ?? existing?.driver2_address ?? '',
    driver2_phone: data.driver2_phone ?? existing?.driver2_phone ?? '',
    driver2_passport_number: data.driver2_passport_number ?? existing?.driver2_passport_number ?? '',
    driver2_passport_issued_at: data.driver2_passport_issued_at ?? existing?.driver2_passport_issued_at ?? '',
    driver2_passport_expires_at: data.driver2_passport_expires_at ?? existing?.driver2_passport_expires_at ?? '',
    driver2_cin_number: data.driver2_cin_number ?? existing?.driver2_cin_number ?? '',
    driver2_cin_issued_at: data.driver2_cin_issued_at ?? existing?.driver2_cin_issued_at ?? '',
    driver2_cin_expires_at: data.driver2_cin_expires_at ?? existing?.driver2_cin_expires_at ?? '',
    driver2_license_number: data.driver2_license_number ?? existing?.driver2_license_number ?? '',
    driver2_license_issued_at: data.driver2_license_issued_at ?? existing?.driver2_license_issued_at ?? '',
    driver2_license_expires_at: data.driver2_license_expires_at ?? existing?.driver2_license_expires_at ?? '',
    vehicle_brand: data.vehicle_brand ?? existing?.vehicle_brand ?? '',
    vehicle_model: data.vehicle_model ?? existing?.vehicle_model ?? '',
    vehicle_plate: data.vehicle_plate ?? existing?.vehicle_plate ?? '',
    departure_at,
    departure_place: departurePlaceFromDeliveryLocation(data.departure_place ?? existing?.departure_place ?? ''),
    departure_mileage: Number(data.departure_mileage ?? existing?.departure_mileage ?? 0),
    departure_fuel_level: data.departure_fuel_level ?? existing?.departure_fuel_level ?? '',
    return_at,
    return_place: departurePlaceFromDeliveryLocation(data.return_place ?? existing?.return_place ?? ''),
    return_mileage: Number(data.return_mileage ?? existing?.return_mileage ?? 0),
    return_fuel_level: data.return_fuel_level ?? existing?.return_fuel_level ?? '',
    billed_days,
    extension_until: data.extension_until ?? existing?.extension_until ?? '',
    extension_days: Number(data.extension_days ?? existing?.extension_days ?? 0),
    departure_notes: data.departure_notes ?? existing?.departure_notes ?? '',
    return_notes: data.return_notes ?? existing?.return_notes ?? '',
    equipment,
    equipment_other: data.equipment_other ?? existing?.equipment_other ?? '',
    departure_damages,
    return_damages,
    include_damage_photos_in_pdf:
      data.include_damage_photos_in_pdf !== undefined && data.include_damage_photos_in_pdf !== null
        ? Number(data.include_damage_photos_in_pdf) === 1
          ? 1
          : 0
        : existing?.include_damage_photos_in_pdf !== undefined && existing?.include_damage_photos_in_pdf !== null
          ? Number(existing.include_damage_photos_in_pdf) === 1
            ? 1
            : 0
          : 0,
    daily_rate,
    total_amount,
    deposit_amount: Number(data.deposit_amount ?? data.deposit ?? existing?.deposit_amount ?? existing?.deposit ?? 0),
    franchise_applies,
    franchise_amount,
    extra_charges,
    extra_charges_note: data.extra_charges_note ?? existing?.extra_charges_note ?? '',
    vat_applies:
      data.vat_applies !== undefined && data.vat_applies !== null
        ? Number(data.vat_applies) === 1
          ? 1
          : 0
        : existing?.vat_applies !== undefined && existing?.vat_applies !== null
          ? Number(existing.vat_applies) === 1
            ? 1
            : 0
          : 1,
    vat_rate: Number(data.vat_rate ?? existing?.vat_rate ?? 20),
    discount,
    delivered_at: data.delivered_at ?? existing?.delivered_at ?? '',
    closed_at: data.closed_at ?? existing?.closed_at ?? '',
    customer_signed_at: data.customer_signed_at ?? existing?.customer_signed_at ?? '',
    agency_signed_at: data.agency_signed_at ?? existing?.agency_signed_at ?? '',
    notes: data.notes ?? existing?.notes ?? '',
    start_date: datePart(departure_at),
    end_date: datePart(return_at),
    daily_price: daily_rate,
    total_days: billed_days,
    deposit: Number(data.deposit_amount ?? data.deposit ?? existing?.deposit_amount ?? existing?.deposit ?? 0),
  }
}

function mapListRow(row: ContractListItem): ContractListItem {
  const now = new Date()
  const returnAt = new Date(row.return_at || row.end_date)
  return {
    ...row,
    status: normalizeStatus(row.status),
    is_overdue: row.status === 'active' && !Number.isNaN(returnAt.getTime()) && returnAt < now,
  }
}

function finalizeLinkedReservation(
  helpers: DbHelpers,
  reservationId: number | null | undefined,
  status: 'completed' | 'cancelled',
) {
  if (!reservationId) return
  helpers.run(
    `UPDATE reservations SET status = ?, updated_at = ?
     WHERE id = ? AND status IN ('pending', 'confirmed')`,
    [status, helpers.now(), reservationId],
  )
}

/** Which contract is allowed to update the car's live mileage/fuel/notes. */
function resolveCarHandoverOwnerId(helpers: DbHelpers, carId: number): number | null {
  const active = helpers.queryOne<{ id: number }>(
    `SELECT id FROM contracts
     WHERE car_id = ? AND deleted_at IS NULL AND status = 'active'
     ORDER BY id DESC
     LIMIT 1`,
    [carId],
  )
  if (active) return active.id

  const closed = helpers.queryOne<{ id: number }>(
    `SELECT id FROM contracts
     WHERE car_id = ? AND deleted_at IS NULL AND status = 'closed'
     ORDER BY datetime(COALESCE(NULLIF(closed_at, ''), updated_at)) DESC, id DESC
     LIMIT 1`,
    [carId],
  )
  if (closed) return closed.id

  const draft = helpers.queryOne<{ id: number }>(
    `SELECT id FROM contracts
     WHERE car_id = ? AND deleted_at IS NULL AND status = 'draft'
     ORDER BY datetime(updated_at) DESC, id DESC
     LIMIT 1`,
    [carId],
  )
  return draft?.id ?? null
}

/** Push contract handover km/fuel/notes onto the car (odometer never goes backwards).
 *  Vehicle return must NOT create/update a vidange — only current KM / fuel / remarks. */
function applyCarHandoverState(
  helpers: DbHelpers,
  carId: number | null,
  contractId: number,
  data: { mileage?: number; fuel_level?: string; notes?: string },
) {
  if (!carId) return

  const ownerId = resolveCarHandoverOwnerId(helpers, carId)
  if (ownerId != null && ownerId !== contractId) return

  const mileage = Number(data.mileage ?? 0)
  if (!Number.isFinite(mileage) || mileage < 0) return

  helpers.run(
    `UPDATE cars SET
      mileage = CASE WHEN ? > COALESCE(mileage, 0) THEN ? ELSE mileage END,
      fuel_level = COALESCE(NULLIF(?, ''), fuel_level),
      condition_notes = COALESCE(NULLIF(?, ''), condition_notes),
      updated_at = ?
     WHERE id = ?`,
    [mileage, mileage, data.fuel_level ?? '', data.notes ?? '', helpers.now(), carId],
  )
}

function upsertReturnRecord(
  helpers: DbHelpers,
  contractId: number,
  data: {
    returned_at: string
    mileage?: number | null
    fuel_level?: string
    damages?: string
    extra_fees?: number
    notes?: string
  },
) {
  const existingReturn = helpers.queryOne<{ id: number }>('SELECT id FROM returns WHERE contract_id = ?', [contractId])
  if (existingReturn) {
    helpers.run(
      `UPDATE returns SET returned_at = ?, mileage = ?, fuel_level = ?, damages = ?, extra_fees = ?, notes = ?
       WHERE contract_id = ?`,
      [
        data.returned_at,
        data.mileage ?? null,
        data.fuel_level ?? '',
        data.damages ?? '',
        data.extra_fees ?? 0,
        data.notes ?? '',
        contractId,
      ],
    )
    return
  }
  helpers.run(
    `INSERT INTO returns (contract_id, returned_at, mileage, fuel_level, damages, extra_fees, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      contractId,
      data.returned_at,
      data.mileage ?? null,
      data.fuel_level ?? '',
      data.damages ?? '',
      data.extra_fees ?? 0,
      data.notes ?? '',
    ],
  )
}

function assertClientAndCarExist(helpers: DbHelpers, clientId: number | null, carId: number | null) {
  if (!clientId) throw new Error('CLIENT_AND_CAR_REQUIRED')
  if (!carId) throw new Error('CLIENT_AND_CAR_REQUIRED')

  const customer = helpers.queryOne('SELECT id FROM customers WHERE id = ?', [clientId])
  if (!customer) throw new Error('CLIENT_NOT_FOUND')

  const car = helpers.queryOne('SELECT id FROM cars WHERE id = ?', [carId])
  if (!car) throw new Error('CAR_NOT_FOUND')
}

/** When linked to a reservation, client and car must match that reservation. */
function assertLinkedReservationConsistency(
  helpers: DbHelpers,
  reservationId: number | null,
  clientId: number | null,
  carId: number | null,
) {
  if (!reservationId) return

  const reservation = helpers.queryOne<{ customer_id: number; car_id: number }>(
    'SELECT customer_id, car_id FROM reservations WHERE id = ?',
    [reservationId],
  )
  if (!reservation) throw new Error('RESERVATION_NOT_FOUND')

  if (clientId && Number(reservation.customer_id) !== Number(clientId)) {
    throw new Error('CONTRACT_RESERVATION_CLIENT_MISMATCH')
  }
  if (carId && Number(reservation.car_id) !== Number(carId)) {
    throw new Error('CONTRACT_RESERVATION_CAR_MISMATCH')
  }
}

export function createContractsApi(helpers: DbHelpers, carsApi: CarsApi, getSettings: () => Record<string, string>) {
  const listSql = `
    SELECT c.*,
      cu.name as client_name,
      cu.phone as client_phone,
      ca.brand, ca.model, ca.plate_number,
      r.reference as reservation_reference,
      ${contractPaidExpr()} as paid_amount
    FROM contracts c
    LEFT JOIN customers cu ON cu.id = c.client_id
    LEFT JOIN cars ca ON ca.id = c.car_id
    LEFT JOIN reservations r ON r.id = c.reservation_id
  `

  return {
    listContracts(filters?: ContractFilters) {
      let sql = `${listSql} WHERE 1=1`
      const params: unknown[] = []

      if (filters?.archived) {
        sql += ' AND c.deleted_at IS NOT NULL'
      } else {
        sql += ' AND c.deleted_at IS NULL'
      }

      if (filters?.status) {
        sql += ' AND c.status = ?'
        params.push(filters.status)
      }
      if (filters?.car_id) {
        sql += ' AND c.car_id = ?'
        params.push(filters.car_id)
      }
      if (filters?.client_id) {
        sql += ' AND c.client_id = ?'
        params.push(filters.client_id)
      }
      if (filters?.q) {
        sql += ' AND (c.contract_number LIKE ? OR cu.name LIKE ? OR ca.plate_number LIKE ? OR c.vehicle_plate LIKE ?)'
        const like = `%${filters.q}%`
        params.push(like, like, like, like)
      }
      if (filters?.overdue) {
        sql += ` AND c.status = 'active' AND datetime(COALESCE(NULLIF(c.return_at,''), c.end_date)) < ${SQL_NOW}`
      }

      sql += ' ORDER BY c.id DESC'
      return helpers.queryAll<ContractListItem>(sql, params).map(mapListRow)
    },

    getContract(id: number) {
      const contract = helpers.queryOne<ContractListItem>(
        `${listSql} WHERE c.id = ? AND c.deleted_at IS NULL`,
        [id],
      )
      if (!contract) return null

      const contractPayments = helpers.queryAll<{
        id: number
        contract_id: number
        amount: number
        method: string
        status: string
        paid_at: string
        note: string
      }>(
        `SELECT * FROM payments WHERE contract_id = ?
         ORDER BY datetime(replace(substr(COALESCE(paid_at, created_at, ''), 1, 19), 'T', ' ')) DESC, id DESC`,
        [id],
      )

      const reservationPayments = contract.reservation_id
        ? helpers.queryAll<{
            id: number
            reservation_id: number
            amount: number
            method: string
            status: string
            paid_at: string
            notes: string
            reference: string
            created_at?: string
          }>(
            `SELECT id, reservation_id, amount, method, status, paid_at, notes, reference, created_at
             FROM reservation_payments
             WHERE reservation_id = ? AND type = 'rental' AND status = 'completed'
             ORDER BY datetime(replace(substr(COALESCE(paid_at, created_at, ''), 1, 19), 'T', ' ')) DESC, id DESC`,
            [contract.reservation_id],
          )
        : []

      // Real row ids on both sides: the detail page edits/deletes them through their own ledger.
      const payments = [
        ...contractPayments.map((payment) => ({ ...payment, source: 'contract' as const })),
        ...reservationPayments.map((payment) => ({
          id: payment.id,
          contract_id: id,
          reservation_id: payment.reservation_id,
          amount: payment.amount,
          method: payment.method,
          status: payment.status,
          paid_at: payment.paid_at,
          note: payment.notes || payment.reference || '',
          reference: payment.reference,
          source: 'reservation' as const,
        })),
      ].sort((a, b) => {
        const paidDiff = new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
        if (Number.isFinite(paidDiff) && paidDiff !== 0) return paidDiff
        return (b.id || 0) - (a.id || 0)
      })

      const reservationContractCount = contract.reservation_id
        ? helpers.queryOne<{ c: number }>(
            `SELECT COUNT(*) as c FROM contracts WHERE reservation_id = ? AND deleted_at IS NULL`,
            [contract.reservation_id],
          )?.c ?? 0
        : 0

      const returnInfo = helpers.queryOne('SELECT * FROM returns WHERE contract_id = ?', [id])
      return {
        ...mapListRow(contract),
        payments,
        returnInfo,
        reservation_contract_count: reservationContractCount,
      }
    },

    createContract(data: ContractInput) {
      const normalized = normalizeInput(data)
      if (!normalized.client_id || !normalized.car_id) throw new Error('CLIENT_AND_CAR_REQUIRED')

      assertClientAndCarExist(helpers, normalized.client_id, normalized.car_id)
      assertLinkedReservationConsistency(
        helpers,
        normalized.reservation_id,
        normalized.client_id,
        normalized.car_id,
      )

      if (
        normalized.status !== 'draft' &&
        !carsApi.isCarRentable(
          normalized.car_id,
          normalized.start_date,
          normalized.end_date,
          normalized.reservation_id,
        )
      ) {
        throw new Error('CAR_NOT_AVAILABLE')
      }

      if (normalized.reservation_id && hasLiveContract(helpers, normalized.reservation_id)) {
        throw new Error('CONTRACT_ALREADY_EXISTS')
      }

      const t = helpers.now()
      const contractNumber = nextNumber(helpers)

      const id = helpers.runInsert(
        `INSERT INTO contracts (
          contract_number, reservation_id, client_id, car_id, status,
          contract_date, contract_city,
          driver1_name, driver1_birth_date, driver1_birth_place, driver1_nationality, driver1_address, driver1_phone,
          driver1_passport_number, driver1_passport_issued_at, driver1_passport_expires_at,
          driver1_cin_number, driver1_cin_issued_at, driver1_cin_expires_at,
          driver1_license_number, driver1_license_issued_at, driver1_license_expires_at,
          driver2_name, driver2_birth_date, driver2_birth_place, driver2_nationality, driver2_address, driver2_phone,
          driver2_passport_number, driver2_passport_issued_at, driver2_passport_expires_at,
          driver2_cin_number, driver2_cin_issued_at, driver2_cin_expires_at,
          driver2_license_number, driver2_license_issued_at, driver2_license_expires_at,
          vehicle_brand, vehicle_model, vehicle_plate,
          departure_at, departure_place, departure_mileage, departure_fuel_level,
          return_at, return_place, return_mileage, return_fuel_level,
          billed_days, extension_until, extension_days, departure_notes, return_notes,
          equipment, equipment_other, departure_damages, return_damages, include_damage_photos_in_pdf,
          daily_rate, total_amount, deposit_amount, franchise_applies, franchise_amount,
          extra_charges, extra_charges_note, vat_applies, vat_rate, discount,
          delivered_at, closed_at, customer_signed_at, agency_signed_at, notes,
          start_date, end_date, daily_price, total_days, deposit,
          created_at, updated_at
        ) VALUES (${Array(80).fill('?').join(', ')})`,
        [
          contractNumber,
          normalized.reservation_id,
          normalized.client_id,
          normalized.car_id,
          normalized.status,
          normalized.contract_date,
          normalized.contract_city,
          normalized.driver1_name,
          normalized.driver1_birth_date,
          normalized.driver1_birth_place,
          normalized.driver1_nationality,
          normalized.driver1_address,
          normalized.driver1_phone,
          normalized.driver1_passport_number,
          normalized.driver1_passport_issued_at,
          normalized.driver1_passport_expires_at,
          normalized.driver1_cin_number,
          normalized.driver1_cin_issued_at,
          normalized.driver1_cin_expires_at,
          normalized.driver1_license_number,
          normalized.driver1_license_issued_at,
          normalized.driver1_license_expires_at,
          normalized.driver2_name,
          normalized.driver2_birth_date,
          normalized.driver2_birth_place,
          normalized.driver2_nationality,
          normalized.driver2_address,
          normalized.driver2_phone,
          normalized.driver2_passport_number,
          normalized.driver2_passport_issued_at,
          normalized.driver2_passport_expires_at,
          normalized.driver2_cin_number,
          normalized.driver2_cin_issued_at,
          normalized.driver2_cin_expires_at,
          normalized.driver2_license_number,
          normalized.driver2_license_issued_at,
          normalized.driver2_license_expires_at,
          normalized.vehicle_brand,
          normalized.vehicle_model,
          normalized.vehicle_plate,
          normalized.departure_at,
          normalized.departure_place,
          normalized.departure_mileage,
          normalized.departure_fuel_level,
          normalized.return_at,
          normalized.return_place,
          normalized.return_mileage,
          normalized.return_fuel_level,
          normalized.billed_days,
          normalized.extension_until,
          normalized.extension_days,
          normalized.departure_notes,
          normalized.return_notes,
          normalized.equipment,
          normalized.equipment_other,
          normalized.departure_damages,
          normalized.return_damages,
          normalized.include_damage_photos_in_pdf,
          normalized.daily_rate,
          normalized.total_amount,
          normalized.deposit_amount,
          normalized.franchise_applies,
          normalized.franchise_amount,
          normalized.extra_charges,
          normalized.extra_charges_note,
          normalized.vat_applies,
          normalized.vat_rate,
          normalized.discount,
          normalized.delivered_at,
          normalized.closed_at,
          normalized.customer_signed_at,
          normalized.agency_signed_at,
          normalized.notes,
          normalized.start_date,
          normalized.end_date,
          normalized.daily_price,
          normalized.total_days,
          normalized.deposit,
          t,
          t,
        ],
      )

      const row = this.getContract(id)
      if (!row) throw new Error('CONTRACT_CREATE_FAILED')

      helpers.run(
        `UPDATE contracts SET
          original_return_at = ?,
          original_total_amount = ?,
          updated_at = ?
         WHERE id = ?`,
        [
          normalized.return_at || normalized.end_date,
          normalized.total_amount,
          helpers.now(),
          id,
        ],
      )

      applyCarHandoverState(helpers, normalized.car_id, id, {
        mileage: Number(normalized.departure_mileage ?? 0),
        fuel_level: normalized.departure_fuel_level ?? '',
        notes: normalized.departure_notes ?? '',
      })

      syncLinkedReservationDates(helpers, normalized.reservation_id, {
        pickup_date: normalized.departure_at || normalized.start_date,
        return_date: normalized.return_at || normalized.end_date,
        billed_days: normalized.billed_days,
        daily_rate: normalized.daily_rate,
        total_amount: normalized.total_amount,
      })

      return this.getContract(id)
    },

    createFromReservation(reservationId: number) {
      const reservation = helpers.queryOne<Record<string, unknown>>(
        'SELECT * FROM reservations WHERE id = ?',
        [reservationId],
      )
      if (!reservation) throw new Error('RESERVATION_NOT_FOUND')

      if (hasLiveContract(helpers, reservationId)) throw new Error('CONTRACT_ALREADY_EXISTS')

      const customer = helpers.queryOne<Record<string, string>>(
        'SELECT * FROM customers WHERE id = ?',
        [reservation.customer_id],
      )
      const car = carsApi.getCar(Number(reservation.car_id))
      if (!customer || !car) throw new Error('RESERVATION_DATA_INCOMPLETE')

      const settings = getSettings()
      let driver = driverSnapshotFromCustomer(customer)
      if (reservation.chauffeur_id) {
        const chauffeur = helpers.queryOne<Record<string, string>>(
          'SELECT * FROM chauffeurs WHERE id = ?',
          [reservation.chauffeur_id],
        )
        if (chauffeur) driver = driverSnapshotFromChauffeur(chauffeur)
      }

      return this.createContract({
        reservation_id: reservationId,
        client_id: Number(reservation.customer_id),
        car_id: Number(reservation.car_id),
        status: 'active',
        contract_date: new Date().toISOString().slice(0, 10),
        contract_city: settings.company_city ?? settings.company_address ?? '',
        departure_at: String(reservation.pickup_date),
        return_at: String(reservation.return_date),
        departure_place: departurePlaceFromDeliveryLocation(reservation.delivery_location),
        billed_days: Number(reservation.days ?? calcDays(String(reservation.pickup_date), String(reservation.return_date))),
        daily_rate: Number(reservation.daily_rate ?? car.price_per_day),
        total_amount: Number(reservation.total_amount),
        deposit_amount: Number(reservation.deposit_amount ?? 0),
        vehicle_brand: car.brand,
        vehicle_model: car.model,
        vehicle_plate: car.plate_number,
        departure_mileage: car.mileage,
        departure_fuel_level: car.fuel_level,
        departure_notes: car.condition_notes,
        vat_applies: 1,
        vat_rate: 20,
        franchise_amount: Number(settings.default_franchise_amount ?? 0),
        franchise_applies: Number(settings.default_franchise_amount ?? 0) > 0 ? 1 : 0,
        equipment: JSON.stringify([...DEFAULT_EQUIPMENT]),
        include_damage_photos_in_pdf: 0,
        ...driver,
      })
    },

    updateContract(id: number, data: ContractInput) {
      const existing = helpers.queryOne<ContractRecord>('SELECT * FROM contracts WHERE id = ? AND deleted_at IS NULL', [id])
      if (!existing) throw new Error('CONTRACT_NOT_FOUND')

      const normalized = normalizeInput(data, existing)

      // Prolongation is managed via setContractExtension — never wipe return date from the edit form.
      if (Number(existing.extension_days ?? 0) > 0) {
        normalized.return_at = existing.return_at
        normalized.return_place = existing.return_place ?? normalized.return_place
        normalized.end_date = existing.end_date
        normalized.extension_until = existing.extension_until
        normalized.extension_days = existing.extension_days
        const billed = calcDays(
          normalized.departure_at || existing.departure_at || existing.start_date,
          existing.return_at || existing.end_date,
        )
        normalized.billed_days = billed
        normalized.total_days = billed
        normalized.total_amount = Math.max(
          0,
          billed * Number(normalized.daily_rate) - Number(normalized.discount ?? 0) + Number(normalized.extra_charges ?? 0),
        )
      }

      const hasExtension = Number(existing.extension_days ?? 0) > 0
      const original_return_at = hasExtension
        ? existing.original_return_at || getBaseReturnAt(existing)
        : normalized.return_at || normalized.end_date
      const original_total_amount = hasExtension
        ? Number(existing.original_total_amount ?? getOriginalRentalTotal(existing))
        : Number(normalized.total_amount)

      assertClientAndCarExist(helpers, normalized.client_id, normalized.car_id)
      assertLinkedReservationConsistency(
        helpers,
        normalized.reservation_id,
        normalized.client_id,
        normalized.car_id,
      )

      if (normalized.reservation_id) {
        const duplicate = helpers.queryOne(
          `SELECT id FROM contracts WHERE reservation_id = ? AND deleted_at IS NULL AND status != 'cancelled' AND id != ?`,
          [normalized.reservation_id, id],
        )
        if (duplicate) throw new Error('CONTRACT_ALREADY_EXISTS')
      }

      const t = helpers.now()

      helpers.run(
        `UPDATE contracts SET
          reservation_id = ?, client_id = ?, car_id = ?, status = ?,
          contract_date = ?, contract_city = ?,
          driver1_name = ?, driver1_birth_date = ?, driver1_birth_place = ?, driver1_nationality = ?, driver1_address = ?, driver1_phone = ?,
          driver1_passport_number = ?, driver1_passport_issued_at = ?, driver1_passport_expires_at = ?,
          driver1_cin_number = ?, driver1_cin_issued_at = ?, driver1_cin_expires_at = ?,
          driver1_license_number = ?, driver1_license_issued_at = ?, driver1_license_expires_at = ?,
          driver2_name = ?, driver2_birth_date = ?, driver2_birth_place = ?, driver2_nationality = ?, driver2_address = ?, driver2_phone = ?,
          driver2_passport_number = ?, driver2_passport_issued_at = ?, driver2_passport_expires_at = ?,
          driver2_cin_number = ?, driver2_cin_issued_at = ?, driver2_cin_expires_at = ?,
          driver2_license_number = ?, driver2_license_issued_at = ?, driver2_license_expires_at = ?,
          vehicle_brand = ?, vehicle_model = ?, vehicle_plate = ?,
          departure_at = ?, departure_place = ?, departure_mileage = ?, departure_fuel_level = ?,
          return_at = ?, return_place = ?, return_mileage = ?, return_fuel_level = ?,
          billed_days = ?, extension_until = ?, extension_days = ?, departure_notes = ?, return_notes = ?,
          equipment = ?, equipment_other = ?, departure_damages = ?, return_damages = ?, include_damage_photos_in_pdf = ?,
          daily_rate = ?, total_amount = ?, deposit_amount = ?, franchise_applies = ?, franchise_amount = ?,
          extra_charges = ?, extra_charges_note = ?, vat_applies = ?, vat_rate = ?, discount = ?,
          delivered_at = ?, closed_at = ?, customer_signed_at = ?, agency_signed_at = ?, notes = ?,
          start_date = ?, end_date = ?, daily_price = ?, total_days = ?, deposit = ?,
          original_return_at = ?, original_total_amount = ?,
          updated_at = ?
         WHERE id = ?`,
        [
          normalized.reservation_id,
          normalized.client_id,
          normalized.car_id,
          normalized.status,
          normalized.contract_date,
          normalized.contract_city,
          normalized.driver1_name,
          normalized.driver1_birth_date,
          normalized.driver1_birth_place,
          normalized.driver1_nationality,
          normalized.driver1_address,
          normalized.driver1_phone,
          normalized.driver1_passport_number,
          normalized.driver1_passport_issued_at,
          normalized.driver1_passport_expires_at,
          normalized.driver1_cin_number,
          normalized.driver1_cin_issued_at,
          normalized.driver1_cin_expires_at,
          normalized.driver1_license_number,
          normalized.driver1_license_issued_at,
          normalized.driver1_license_expires_at,
          normalized.driver2_name,
          normalized.driver2_birth_date,
          normalized.driver2_birth_place,
          normalized.driver2_nationality,
          normalized.driver2_address,
          normalized.driver2_phone,
          normalized.driver2_passport_number,
          normalized.driver2_passport_issued_at,
          normalized.driver2_passport_expires_at,
          normalized.driver2_cin_number,
          normalized.driver2_cin_issued_at,
          normalized.driver2_cin_expires_at,
          normalized.driver2_license_number,
          normalized.driver2_license_issued_at,
          normalized.driver2_license_expires_at,
          normalized.vehicle_brand,
          normalized.vehicle_model,
          normalized.vehicle_plate,
          normalized.departure_at,
          normalized.departure_place,
          normalized.departure_mileage,
          normalized.departure_fuel_level,
          normalized.return_at,
          normalized.return_place,
          normalized.return_mileage,
          normalized.return_fuel_level,
          normalized.billed_days,
          normalized.extension_until,
          normalized.extension_days,
          normalized.departure_notes,
          normalized.return_notes,
          normalized.equipment,
          normalized.equipment_other,
          normalized.departure_damages,
          normalized.return_damages,
          normalized.include_damage_photos_in_pdf,
          normalized.daily_rate,
          normalized.total_amount,
          normalized.deposit_amount,
          normalized.franchise_applies,
          normalized.franchise_amount,
          normalized.extra_charges,
          normalized.extra_charges_note,
          normalized.vat_applies,
          normalized.vat_rate,
          normalized.discount,
          normalized.delivered_at,
          normalized.closed_at,
          normalized.customer_signed_at,
          normalized.agency_signed_at,
          normalized.notes,
          normalized.start_date,
          normalized.end_date,
          normalized.daily_price,
          normalized.total_days,
          normalized.deposit,
          original_return_at,
          original_total_amount,
          t,
          id,
        ],
      )

      syncLinkedReservationDates(helpers, normalized.reservation_id, {
        pickup_date: normalized.departure_at || normalized.start_date,
        return_date: normalized.return_at || normalized.end_date,
        billed_days: normalized.billed_days,
        daily_rate: normalized.daily_rate,
        total_amount: normalized.total_amount,
      })

      const hasReturnState =
        normalized.status === 'closed' || Number(normalized.return_mileage ?? 0) > 0

      // Always re-sync car from this contract's handover (fixes missed earlier syncs).
      if (hasReturnState) {
        applyCarHandoverState(helpers, normalized.car_id, id, {
          mileage: Number(normalized.return_mileage ?? normalized.departure_mileage ?? 0),
          fuel_level: normalized.return_fuel_level || normalized.departure_fuel_level || '',
          notes: normalized.return_notes || normalized.departure_notes || '',
        })
      } else {
        applyCarHandoverState(helpers, normalized.car_id, id, {
          mileage: Number(normalized.departure_mileage ?? 0),
          fuel_level: normalized.departure_fuel_level ?? '',
          notes: normalized.departure_notes ?? '',
        })
      }

      return this.getContract(id)
    },

    deleteContract(id: number) {
      const existing = helpers.queryOne('SELECT id FROM contracts WHERE id = ?', [id])
      if (!existing) throw new Error('CONTRACT_NOT_FOUND')
      helpers.run('UPDATE contracts SET deleted_at = ?, updated_at = ? WHERE id = ?', [helpers.now(), helpers.now(), id])
      return { ok: true }
    },

    restoreContract(id: number) {
      const existing = helpers.queryOne<ContractRecord>('SELECT * FROM contracts WHERE id = ?', [id])
      if (!existing) throw new Error('CONTRACT_NOT_FOUND')
      if (existing.reservation_id) {
        const other = helpers.queryOne(
          `SELECT id FROM contracts
           WHERE reservation_id = ? AND deleted_at IS NULL AND status != 'cancelled' AND id != ?`,
          [existing.reservation_id, id],
        )
        if (other) throw new Error('CONTRACT_ALREADY_EXISTS')
      }
      helpers.run('UPDATE contracts SET deleted_at = NULL, updated_at = ? WHERE id = ?', [helpers.now(), id])
      return this.getContract(id)
    },

    markDelivered(id: number, data?: DeliveryHandoverInput) {
      const existing = helpers.queryOne<ContractRecord>('SELECT * FROM contracts WHERE id = ?', [id])
      if (!existing) throw new Error('CONTRACT_NOT_FOUND')
      if (existing.status !== 'draft') throw new Error('INVALID_CONTRACT_STATUS')
      // Activating the draft puts the car on the road: refuse if it is already booked out.
      assertCarFreeForContract(helpers, existing, existing.return_at || existing.end_date)

      const t = helpers.now()
      const departureDamagesJson =
        data?.departure_damages !== undefined
          ? JSON.stringify(data.departure_damages)
          : existing.departure_damages

      if (data) {
        const departureMileage =
          data.departure_mileage !== undefined && data.departure_mileage !== null
            ? Number(data.departure_mileage)
            : Number(existing.departure_mileage ?? 0)

        helpers.run(
          `UPDATE contracts SET
            status = 'active',
            delivered_at = ?,
            departure_at = COALESCE(?, departure_at),
            departure_place = COALESCE(?, departure_place),
            departure_mileage = ?,
            departure_fuel_level = COALESCE(NULLIF(?, ''), departure_fuel_level),
            departure_notes = COALESCE(?, departure_notes),
            departure_damages = ?,
            departure_sketch = COALESCE(?, departure_sketch),
            updated_at = ?
           WHERE id = ?`,
          [
            t,
            data.departure_at ?? null,
            data.departure_place ?? null,
            departureMileage,
            data.departure_fuel_level ?? '',
            data.departure_notes ?? null,
            departureDamagesJson,
            data.departure_sketch ?? null,
            t,
            id,
          ],
        )

        applyCarHandoverState(helpers, existing.car_id, id, {
          mileage: departureMileage,
          fuel_level: data.departure_fuel_level ?? '',
          notes: data.departure_notes ?? '',
        })

        if (data.departure_at && existing.reservation_id) {
          const departureAt = data.departure_at
          const returnAt = existing.return_at || existing.end_date
          helpers.run(
            `UPDATE reservations SET pickup_date = ?, days = ?, updated_at = ? WHERE id = ?`,
            [
              departureAt,
              returnAt ? calcDays(departureAt, returnAt) : existing.billed_days,
              t,
              existing.reservation_id,
            ],
          )
          helpers.run(`UPDATE contracts SET start_date = ? WHERE id = ?`, [datePart(departureAt), id])
        }
      } else {
        helpers.run(`UPDATE contracts SET status = 'active', delivered_at = ?, updated_at = ? WHERE id = ?`, [t, t, id])
      }

      return this.getContract(id)
    },

    closeContract(id: number, data: CloseContractInput) {
      const existing = helpers.queryOne<ContractRecord>('SELECT * FROM contracts WHERE id = ?', [id])
      if (!existing) throw new Error('CONTRACT_NOT_FOUND')
      if (existing.status !== 'active') throw new Error('INVALID_CONTRACT_STATUS')

      const t = helpers.now()
      const return_at = data.return_at ?? t
      const existingExtra = Number(existing.extra_charges ?? 0)
      let extra_charges = existingExtra
      let total_amount = Number(existing.total_amount ?? 0)

      if (data.return_extra_fees !== undefined) {
        const add = Number(data.return_extra_fees ?? 0)
        extra_charges = existingExtra + add
        total_amount += add
      } else if (data.extra_charges !== undefined) {
        extra_charges = Number(data.extra_charges)
        total_amount += extra_charges - existingExtra
      }

      const return_damages =
        data.return_damages !== undefined ? JSON.stringify(data.return_damages) : existing.return_damages
      const return_mileage =
        data.return_mileage !== undefined && data.return_mileage !== null
          ? Number(data.return_mileage)
          : Number(existing.return_mileage ?? existing.departure_mileage ?? 0)
      const departureMileage = Number(existing.departure_mileage ?? 0)
      if (data.return_mileage !== undefined && data.return_mileage !== null && return_mileage < departureMileage) {
        throw new Error('RETURN_MILEAGE_INVALID')
      }

      helpers.run(
        `UPDATE contracts SET
          status = 'closed', closed_at = ?, return_at = ?, return_place = COALESCE(?, return_place),
          return_mileage = ?, return_fuel_level = ?,
          return_notes = ?, return_damages = ?, return_sketch = COALESCE(?, return_sketch),
          extra_charges = ?, extra_charges_note = ?, total_amount = ?,
          end_date = ?, updated_at = ?
         WHERE id = ?`,
        [
          t,
          return_at,
          data.return_place ?? existing.return_place,
          return_mileage,
          data.return_fuel_level ?? existing.return_fuel_level,
          data.return_notes ?? existing.return_notes,
          return_damages,
          data.return_sketch ?? null,
          extra_charges,
          data.extra_charges_note ?? existing.extra_charges_note,
          total_amount,
          datePart(return_at),
          t,
          id,
        ],
      )

      applyCarHandoverState(helpers, existing.car_id, id, {
        mileage: return_mileage,
        fuel_level: data.return_fuel_level ?? '',
        notes: data.return_notes ?? '',
      })

      upsertReturnRecord(helpers, id, {
        returned_at: return_at,
        mileage: return_mileage,
        fuel_level: data.return_fuel_level ?? existing.return_fuel_level,
        damages: data.return_damages !== undefined ? JSON.stringify(data.return_damages) : '',
        extra_fees: data.return_extra_fees ?? 0,
        notes: data.return_notes ?? existing.return_notes,
      })

      finalizeLinkedReservation(helpers, existing.reservation_id, 'completed')

      syncLinkedReservationDates(helpers, existing.reservation_id, {
        pickup_date: existing.departure_at || existing.start_date,
        return_date: return_at,
        billed_days: calcDays(existing.departure_at || existing.start_date, return_at),
        daily_rate: Number(existing.daily_rate ?? existing.daily_price ?? 0),
        total_amount,
      })

      return this.getContract(id)
    },

    updateReturnHandover(id: number, data: CloseContractInput) {
      const existing = helpers.queryOne<ContractRecord>('SELECT * FROM contracts WHERE id = ?', [id])
      if (!existing) throw new Error('CONTRACT_NOT_FOUND')
      if (existing.status !== 'closed' && existing.status !== 'active') {
        throw new Error('INVALID_CONTRACT_STATUS')
      }

      const t = helpers.now()
      const return_at = data.return_at ?? existing.return_at ?? t
      const return_damages =
        data.return_damages !== undefined ? JSON.stringify(data.return_damages) : existing.return_damages
      const return_mileage =
        data.return_mileage !== undefined && data.return_mileage !== null
          ? Number(data.return_mileage)
          : Number(existing.return_mileage ?? existing.departure_mileage ?? 0)
      const departureMileage = Number(existing.departure_mileage ?? 0)
      if (data.return_mileage !== undefined && data.return_mileage !== null && return_mileage < departureMileage) {
        throw new Error('RETURN_MILEAGE_INVALID')
      }

      helpers.run(
        `UPDATE contracts SET
          return_at = ?, return_place = COALESCE(?, return_place),
          return_mileage = ?, return_fuel_level = ?,
          return_notes = ?, return_damages = ?, return_sketch = COALESCE(?, return_sketch),
          end_date = ?, updated_at = ?
         WHERE id = ?`,
        [
          return_at,
          data.return_place ?? existing.return_place,
          return_mileage,
          data.return_fuel_level ?? existing.return_fuel_level,
          data.return_notes ?? existing.return_notes,
          return_damages,
          data.return_sketch ?? null,
          datePart(return_at),
          t,
          id,
        ],
      )

      applyCarHandoverState(helpers, existing.car_id, id, {
        mileage: return_mileage,
        fuel_level: data.return_fuel_level ?? '',
        notes: data.return_notes ?? '',
      })

      upsertReturnRecord(helpers, id, {
        returned_at: return_at,
        mileage: return_mileage,
        fuel_level: data.return_fuel_level ?? existing.return_fuel_level,
        damages: data.return_damages !== undefined ? JSON.stringify(data.return_damages) : '',
        extra_fees:
          data.return_extra_fees ??
          helpers.queryOne<{ extra_fees: number }>('SELECT extra_fees FROM returns WHERE contract_id = ?', [id])
            ?.extra_fees ??
          0,
        notes: data.return_notes ?? existing.return_notes,
      })

      if (existing.reservation_id) {
        helpers.run(
          `UPDATE reservations SET pickup_date = ?, return_date = ?, updated_at = ? WHERE id = ?`,
          [existing.departure_at || existing.start_date, return_at, t, existing.reservation_id],
        )
      }

      return this.getContract(id)
    },

    cancelContract(id: number) {
      const existing = helpers.queryOne<ContractRecord>('SELECT * FROM contracts WHERE id = ?', [id])
      if (!existing) throw new Error('CONTRACT_NOT_FOUND')
      if (existing.status === 'closed') throw new Error('INVALID_CONTRACT_STATUS')
      helpers.run(`UPDATE contracts SET status = 'cancelled', updated_at = ? WHERE id = ?`, [helpers.now(), id])
      // A draft was never delivered: the reservation stays open so another contract can be issued.
      if (existing.status === 'active') {
        finalizeLinkedReservation(helpers, existing.reservation_id, 'cancelled')
      }
      return this.getContract(id)
    },

    extendContract(id: number, data: ExtendContractInput) {
      const existing = helpers.queryOne<ContractRecord>('SELECT * FROM contracts WHERE id = ? AND deleted_at IS NULL', [id])
      if (!existing) throw new Error('CONTRACT_NOT_FOUND')
      if (existing.status !== 'active' && existing.status !== 'draft') {
        throw new Error('INVALID_CONTRACT_STATUS')
      }

      const currentReturn = existing.return_at || existing.end_date
      if (!currentReturn) throw new Error('INVALID_RETURN_DATE')

      let addedDays = 0
      if (data.new_return_at?.trim()) {
        const newReturnAt = new Date(data.new_return_at).toISOString()
        if (Number.isNaN(new Date(newReturnAt).getTime())) throw new Error('INVALID_RETURN_DATE')
        if (new Date(newReturnAt) <= new Date(currentReturn)) throw new Error('EXTENSION_MUST_BE_LATER')
        addedDays = calcDays(currentReturn, newReturnAt)
      } else {
        addedDays = Math.floor(Number(data.extra_days ?? 0))
        if (!Number.isFinite(addedDays) || addedDays < 1) throw new Error('INVALID_EXTENSION_DAYS')
      }

      const currentExtension = Math.max(0, Math.floor(Number(existing.extension_days ?? 0)))
      return this.setContractExtension(id, {
        extension_days: currentExtension + addedDays,
        note: data.note,
      })
    },

    /**
     * Set absolute prolongation days from the original (pre-extension) return date.
     * Pass 0 to remove prolongation entirely. Recalculates return, billed days, total, reservation.
     */
    setContractExtension(id: number, data: SetContractExtensionInput) {
      const existing = helpers.queryOne<ContractRecord>('SELECT * FROM contracts WHERE id = ? AND deleted_at IS NULL', [id])
      if (!existing) throw new Error('CONTRACT_NOT_FOUND')
      if (existing.status !== 'active' && existing.status !== 'draft') {
        throw new Error('INVALID_CONTRACT_STATUS')
      }

      const extension_days = Math.floor(Number(data.extension_days ?? 0))
      if (!Number.isFinite(extension_days) || extension_days < 0) {
        throw new Error('INVALID_EXTENSION_DAYS')
      }

      const previousDays = Math.max(0, Math.floor(Number(existing.extension_days ?? 0)))
      const computed = computeExtensionState(existing, extension_days)
      const { original_return_at, original_total_amount, newReturnAt, billed_days, total_amount, extension_until } = computed

      if (
        new Date(newReturnAt).getTime() === new Date(existing.return_at || existing.end_date || '').getTime() &&
        extension_days === previousDays &&
        !data.note?.trim()
      ) {
        // Extension unchanged, but still claw overpay left behind by older builds / untagged payments.
        reconcileContractOverpayment(helpers, id)
        return this.getContract(id)
      }

      // Lengthening must stay free of overlaps; shortening is always checked against the new window.
      assertCarFreeForContract(helpers, existing, newReturnAt)

      const userNote = data.note?.trim()
      const cleanedNotes = String(existing.notes ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !/^Prolongation\b/i.test(line))
        .join('\n')
        .trim()
      const notes = userNote
        ? [cleanedNotes, userNote].filter(Boolean).join('\n')
        : cleanedNotes

      helpers.run(
        `UPDATE contracts SET
          return_at = ?, end_date = ?, billed_days = ?, total_days = ?, total_amount = ?,
          extension_until = ?, extension_days = ?, original_return_at = ?, original_total_amount = ?,
          notes = ?, updated_at = ?
         WHERE id = ?`,
        [
          newReturnAt,
          datePart(newReturnAt),
          billed_days,
          billed_days,
          total_amount,
          extension_until,
          extension_days,
          original_return_at,
          original_total_amount,
          notes,
          helpers.now(),
          id,
        ],
      )

      // When removing/reducing prolongation, only give back cash that is now in excess of the new
      // total. Blindly removing `costReduction` would wrongly eat into money owed for the base rental
      // (or an already-underpaid extension) whenever the contract wasn't fully paid to begin with.
      // Extension-tagged payments are still clawed back first (see clawBackContractPayments row order).
      reconcileContractOverpayment(helpers, id)

      syncLinkedReservationDates(helpers, existing.reservation_id, {
        pickup_date: existing.departure_at || existing.start_date,
        return_date: newReturnAt,
        billed_days,
        daily_rate: Number(existing.daily_rate ?? existing.daily_price ?? 0),
        total_amount,
      })
      syncReservationPaymentStatusForContract(helpers, id)

      const updated = this.getContract(id)
      if (!updated) throw new Error('CONTRACT_UPDATE_FAILED')
      if (Number(updated.total_amount) !== total_amount || Number(updated.extension_days) !== extension_days) {
        throw new Error('CONTRACT_EXTENSION_PERSIST_FAILED')
      }
      return updated
    },

    removeContractExtension(id: number) {
      const updated = this.setContractExtension(id, { extension_days: 0 })
      // If extension was already 0 (stuck overpay), setContractExtension still reconciles via early path.
      reconcileContractOverpayment(helpers, id)
      return this.getContract(id) ?? updated
    },

    getContractStats() {
      const active = helpers.queryOne<{ c: number }>(
        `SELECT COUNT(*) as c FROM contracts WHERE status = 'active' AND deleted_at IS NULL`,
      )
      const draft = helpers.queryOne<{ c: number }>(
        `SELECT COUNT(*) as c FROM contracts WHERE status = 'draft' AND deleted_at IS NULL`,
      )
      const total = helpers.queryOne<{ c: number }>(
        `SELECT COUNT(*) as c FROM contracts WHERE deleted_at IS NULL`,
      )
      const unpaid = helpers.queryOne<{ amount: number; count: number }>(
        `SELECT
           COALESCE(SUM(CASE WHEN remaining > 0 THEN remaining ELSE 0 END), 0) as amount,
           COALESCE(SUM(CASE WHEN remaining > 0 THEN 1 ELSE 0 END), 0) as count
         FROM (
           SELECT
             MAX(0, COALESCE(c.total_amount, 0) - ${contractPaidExpr()}) as remaining
           FROM contracts c
           WHERE c.deleted_at IS NULL AND c.status != 'cancelled'
         )`,
      )
      const paid = helpers.queryOne<{ amount: number }>(
        `SELECT COALESCE(SUM(${contractPaidExpr()}), 0) as amount
         FROM contracts c
         WHERE c.deleted_at IS NULL AND c.status != 'cancelled'`,
      )
      const overdue = helpers.queryOne<{ c: number }>(
        `SELECT COUNT(*) as c FROM contracts
         WHERE status = 'active' AND deleted_at IS NULL
           AND datetime(COALESCE(NULLIF(return_at,''), end_date)) < datetime('now')`,
      )
      return {
        active: active?.c ?? 0,
        draft: draft?.c ?? 0,
        total: total?.c ?? 0,
        unpaid_amount: Number(unpaid?.amount ?? 0),
        unpaid_count: Number(unpaid?.count ?? 0),
        paid_amount: Number(paid?.amount ?? 0),
        overdue: overdue?.c ?? 0,
      }
    },

    invoiceBreakdown(id: number) {
      const contract = helpers.queryOne<ContractRecord>('SELECT * FROM contracts WHERE id = ?', [id])
      if (!contract) throw new Error('CONTRACT_NOT_FOUND')
      const rate = Number(contract.daily_rate ?? 0)
      const discount = Number(contract.discount ?? 0)
      const extras = Number(contract.extra_charges ?? 0)
      const extensionDays = Math.max(0, Math.floor(Number(contract.extension_days ?? 0)))
      const originalTotal = getOriginalRentalTotal(contract)
      const extensionCost = extensionDays * rate
      const baseDays = Math.max(0, Number(contract.billed_days ?? 0) - extensionDays)
      const baseLocation = baseDays * rate
      const ttc = Number(contract.total_amount ?? Math.max(0, originalTotal + extensionCost))
      const vatApplies = Number(contract.vat_applies) === 1
      const vatRate = vatApplies ? Number(contract.vat_rate ?? 0) : 0
      const ht = vatRate > 0 ? ttc / (1 + vatRate / 100) : ttc
      const vat = ttc - ht
      // `days` drives the Qté / P.U. columns of the invoice: keep it with the amount it bills.
      const lines: Array<{ label: string; amount: number; days?: number }> = [
        { label: 'Location', amount: baseLocation, days: baseDays },
      ]
      if (extensionDays > 0) {
        lines.push({ label: 'Prolongation', amount: extensionCost, days: extensionDays })
      }
      if (discount > 0) lines.push({ label: 'Remise', amount: -discount })
      if (extras > 0) lines.push({ label: 'Frais supplémentaires', amount: extras })
      return {
        total_ht: ht,
        total_vat: vat,
        total_ttc: ttc,
        lines,
      }
    },
  }
}
