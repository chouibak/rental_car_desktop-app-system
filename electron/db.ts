import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { app } from 'electron'
import initSqlJs, { Database } from 'sql.js'
import { initAuth } from './auth'
import {
  createCarsApi,
  createCarsSchema,
  migrateCarsTable,
  migrateCarStatusColumn,
  migrateCarCarteGrisePath2Column,
  migrateCarDocumentHistoryTable,
  syncAllCarStatuses,
  type CarDocType,
  type CarDocumentRenewInput,
  type CarInput,
  type CarFilters,
} from './cars-db'
import {
  createCustomersApi,
  createCustomersSchema,
  migrateClientsToCustomers,
  migrateCustomersTable,
  type CustomerInput,
} from './customers-db'
import {
  createReservationsApi,
  createReservationsSchema,
  migrateReservationsTable,
  type ReservationFilters,
  type ReservationInput,
  type PaymentStatus,
} from './reservations-db'
import {
  createReservationPaymentsApi,
  createReservationPaymentsSchema,
  syncAllReservationPaymentStatuses,
  type ReservationPaymentFilters,
  type ReservationPaymentInput,
} from './reservation-payments-db'
import {
  syncReservationPaymentStatus,
  syncReservationPaymentStatusForContract,
} from './payment-sync'
import {
  createContractPayment,
  deleteContractPayment,
  migratePaymentsTable,
  reconcileAllOverpayments,
  reconcileContractOverpayment,
  updateContractPayment,
  type PaymentRecordStatus,
} from './payment-ledger'
import {
  CARS_IN_USE_SQL,
  OVERDUE_RENTALS_COUNT_SQL,
  UPCOMING_RETURNS_SQL,
} from './dashboard-queries'
import {
  createContractsApi,
  migrateContractsTable,
  type ContractFilters,
  type ContractInput,
  type CloseContractInput,
  type DeliveryHandoverInput,
  type ExtendContractInput,
  type SetContractExtensionInput,
} from './contracts-db'
import {
  createExpensesApi,
  createExpensesSchema,
  migrateExpensesTable,
  type ExpenseFilters,
  type ExpenseInput,
} from './expenses-db'
import {
  createVidangeApi,
  createVidangeSchema,
  migrateCarVidangeColumns,
  type CarVidangeInput,
} from './vidange-db'
import {
  createChauffeursApi,
  createChauffeursSchema,
  type ChauffeurFilters,
  type ChauffeurInput,
} from './chauffeurs-db'
import {
  createRevenueApi,
} from './revenue-db'
import {
  createNotificationsApi,
} from './notifications-db'
import { initCustomerStorage } from './customer-storage'
import { initChauffeurStorage } from './chauffeur-storage'
import { initContractStorage } from './contract-storage'
import { initExpenseStorage } from './expense-storage'
import { initSettingsStorage } from './settings-files'
import { fileExists, initStorage } from './storage'

const require = createRequire(__filename)

function resolveSqlWasmPath(fileName = 'sql-wasm.wasm') {
  const candidates: string[] = []

  if (app.isPackaged) {
    candidates.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', fileName),
      path.join(process.resourcesPath, 'app', 'node_modules', 'sql.js', 'dist', fileName),
    )
  }

  try {
    candidates.push(path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.js')), fileName))
  } catch {
    /* dev fallback */
  }

  try {
    const pkgDir = path.dirname(require.resolve('sql.js/package.json'))
    candidates.push(path.join(pkgDir, 'dist', fileName), path.join(pkgDir, fileName))
  } catch {
    /* ignore */
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  throw new Error(`sql.js WASM introuvable (${fileName})`)
}

let db: Database
let dbPath = ''
let carsApi: ReturnType<typeof createCarsApi>
let customersApi: ReturnType<typeof createCustomersApi>
let reservationsApi: ReturnType<typeof createReservationsApi>
let reservationPaymentsApi: ReturnType<typeof createReservationPaymentsApi>
let contractsApi: ReturnType<typeof createContractsApi>
let expensesApi: ReturnType<typeof createExpensesApi>
let vidangeApi: ReturnType<typeof createVidangeApi>
let chauffeursApi: ReturnType<typeof createChauffeursApi>
let revenueApi: ReturnType<typeof createRevenueApi>
let notificationsApi: ReturnType<typeof createNotificationsApi>

function getSettingsMap() {
  const rows = queryAll<{ key: string; value: string }>('SELECT key, value FROM settings')
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  return settings
}

const DEFAULT_SETTINGS: Record<string, string> = {
  company_name: 'Rental Car Agency',
  company_phone: '',
  company_whatsapp: '',
  company_email: 'contact@rentalcaragency.ma',
  company_address: '94 Rue Abderrahman El Majdoub, Hay Tarik 1',
  company_city: 'Fès 30000, Maroc',
  company_hours: 'Ouvert 24h/24, 7j/7',
  company_about: 'Rental Car Agency est une agence de location de voitures basée à Fès, Maroc.',
  company_fax: '',
  company_tagline: 'Location de voitures',
  company_logo: '',
  contract_conditions_image: '',
  company_ice: '',
  company_rc: '',
  company_if: '',
  company_tp: '',
  company_cnss: '',
  default_franchise_amount: '0',
  legal_mention_fr:
    'Chaque dommage touche la société pendant la période de location ; le locataire sera exposé à la responsabilité administrative et judiciaire jusqu\'à la décision finale, ainsi qu\'au paiement de tous les frais résultants.',
  legal_mention_ar: '',
  currency: 'MAD',
  language: 'fr',
  notification_return_days: '1',
  notification_doc_days: '30',
}

function ensureSetting(key: string, value: string) {
  run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO NOTHING`,
    [key, value],
  )
}

function applyDefaultSettings() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    ensureSetting(key, value)
  }
}

function now() {
  return new Date().toISOString()
}

function daysBetween(start: string, end: string) {
  const a = new Date(start)
  const b = new Date(end)
  const diff = Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(1, diff)
}

/** Write to a temp file and rename: an interrupted write must not corrupt the database. */
function save() {
  const data = db.export()
  const tempPath = `${dbPath}.tmp`
  fs.writeFileSync(tempPath, Buffer.from(data))
  fs.renameSync(tempPath, dbPath)
}

function queryAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  const stmt = db.prepare(sql)
  stmt.bind(params as never[])
  const rows: T[] = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject() as T)
  }
  stmt.free()
  return rows
}

function queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  const rows = queryAll<T>(sql, params)
  return rows[0] ?? null
}

function run(sql: string, params: unknown[] = []) {
  db.run(sql, params as never[])
  save()
}

function readLastInsertId() {
  const result = db.exec('SELECT last_insert_rowid() AS id')
  return Number(result[0]?.values[0]?.[0] ?? 0)
}

function runInsert(sql: string, params: unknown[] = []) {
  db.run(sql, params as never[])
  const id = readLastInsertId()
  save()
  if (!id) throw new Error('INSERT_FAILED')
  return id
}

function lastId() {
  return readLastInsertId()
}

const dbHelpers = () => ({
  queryAll,
  queryOne,
  run,
  runInsert,
  lastId,
  now,
})

function createSupportSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      cin TEXT,
      address TEXT,
      license_number TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'cash',
      status TEXT NOT NULL DEFAULT 'completed',
      paid_at TEXT NOT NULL,
      note TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL UNIQUE,
      returned_at TEXT NOT NULL,
      mileage INTEGER,
      fuel_level TEXT,
      damages TEXT,
      extra_fees REAL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)
}

export async function initDb(userDataPath: string) {
  const wasmPath = resolveSqlWasmPath()
  const SQL = await initSqlJs({
    locateFile: () => wasmPath,
  })

  initStorage(userDataPath)
  initCustomerStorage(userDataPath)
  initChauffeurStorage(userDataPath)
  initContractStorage(userDataPath)
  initExpenseStorage(userDataPath)
  initSettingsStorage(userDataPath)
  dbPath = path.join(userDataPath, 'rentalcar.sqlite')
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  migrateCarsTable(db, dbHelpers())
  createCarsSchema(db)
  migrateCarStatusColumn(db, dbHelpers())
  migrateCarCarteGrisePath2Column(db, dbHelpers())
  migrateCarDocumentHistoryTable(db, dbHelpers())
  migrateCarVidangeColumns(db, dbHelpers())
  createVidangeSchema(db)
  createCustomersSchema(db)
  migrateCustomersTable(db, dbHelpers())
  migrateClientsToCustomers(db, dbHelpers())
  createReservationsSchema(db)
  migrateReservationsTable(db, dbHelpers())
  createReservationPaymentsSchema(db)
  createSupportSchema(db)
  migrateContractsTable(db, dbHelpers())
  createExpensesSchema(db)
  migrateExpensesTable(db, dbHelpers())
  createChauffeursSchema(db)

  carsApi = createCarsApi(dbHelpers())
  customersApi = createCustomersApi(dbHelpers())
  reservationsApi = createReservationsApi(dbHelpers(), carsApi)
  reservationPaymentsApi = createReservationPaymentsApi(dbHelpers())
  contractsApi = createContractsApi(dbHelpers(), carsApi, () => {
    const rows = queryAll<{ key: string; value: string }>('SELECT key, value FROM settings')
    const settings: Record<string, string> = {}
    for (const row of rows) settings[row.key] = row.value
    return settings
  })
  expensesApi = createExpensesApi(dbHelpers())
  vidangeApi = createVidangeApi(
    dbHelpers(),
    (data) =>
      expensesApi.createExpense({
        title: data.title,
        category: 'maintenance',
        amount: data.amount,
        expense_date: data.expense_date,
        payment_method: 'cash',
        car_id: data.car_id,
        notes: data.notes,
      }),
    (expenseId) => {
      expensesApi.deleteExpense(expenseId)
    },
    (expenseId, data) => {
      const existing = expensesApi.getExpense(expenseId)
      if (!existing) return
      expensesApi.updateExpense(expenseId, {
        title: existing.title,
        category: existing.category,
        amount: data.amount,
        expense_date: data.expense_date,
        payment_method: existing.payment_method,
        receipt_path: existing.receipt_path,
        notes: data.notes ?? existing.notes,
        car_id: existing.car_id,
      })
    },
  )
  chauffeursApi = createChauffeursApi(dbHelpers())
  revenueApi = createRevenueApi(dbHelpers())
  notificationsApi = createNotificationsApi(dbHelpers(), getSettingsMap)

  migratePaymentsTable(db, dbHelpers())
  syncAllReservationPaymentStatuses(dbHelpers())
  reconcileAllOverpayments(dbHelpers())
  syncAllCarStatuses(dbHelpers())

  applyDefaultSettings()

  const orphanImages = queryAll<{ id: number; path: string; car_id: number }>(
    'SELECT id, path, car_id FROM car_images',
  )
  for (const img of orphanImages) {
    if (!fileExists(img.path) || !img.car_id) {
      run('DELETE FROM car_images WHERE id = ?', [img.id])
    }
  }
  run(
    `DELETE FROM car_images WHERE car_id NOT IN (SELECT id FROM cars)`,
  )

  save()

  initAuth(userDataPath, dbHelpers())
}

export type { CarInput, CarFilters } from './cars-db'
export type { CustomerInput, CustomerStats } from './customers-db'
export type { ReservationInput, ReservationFilters, ReservationStats } from './reservations-db'
export type { ReservationPaymentInput, ReservationPaymentFilters } from './reservation-payments-db'
export type { ContractInput, ContractFilters, CloseContractInput, DeliveryHandoverInput, ExtendContractInput, SetContractExtensionInput } from './contracts-db'
export type { ExpenseInput, ExpenseFilters } from './expenses-db'
export type { ChauffeurInput, ChauffeurFilters } from './chauffeurs-db'
export type { RevenueStats, RevenueMonthPoint, RevenueMethodPoint } from './revenue-db'
export type { Notification, NotificationCounts, NotificationKind, NotificationSeverity } from './notifications-db'

export type PaymentInput = {
  contract_id: number
  amount: number
  method?: string
  status?: PaymentRecordStatus
  paid_at?: string
  note?: string
}

export type ReturnInput = {
  returned_at?: string
  return_place?: string
  mileage?: number
  fuel_level?: string
  damages?: string
  return_damages?: Array<{ part: string; type: string; note: string; photo?: string }>
  extra_fees?: number
  notes?: string
}

/** A contract's billed total may have changed: give cash back if it now exceeds the total. */
function afterContractTotalChange(id: number) {
  reconcileContractOverpayment(dbHelpers(), id)
  syncReservationPaymentStatusForContract(dbHelpers(), id)
}

export function getDbApi() {
  return {
    getDashboardStats() {
      const carStats = carsApi.getCarStats()
      const cars = carStats.total
      const available = carStats.disponible
      const rented = carStats.louee
      const maintenance = carStats.hors_service
      const clients = queryOne<{ c: number }>('SELECT COUNT(*) as c FROM customers')
      const activeContracts = queryOne<{ c: number }>(
        "SELECT COUNT(*) as c FROM contracts WHERE status = 'active' AND deleted_at IS NULL",
      )
      const overdueContracts = queryOne<{ c: number }>(OVERDUE_RENTALS_COUNT_SQL)

      const revenueStats = revenueApi.getRevenueStats()
      const operableFleet = available + rented
      const fleet_utilization_pct =
        operableFleet > 0 ? Math.round((rented / operableFleet) * 100) : 0

      const upcoming = queryAll(UPCOMING_RETURNS_SQL)

      const top_cars_usage = queryAll<{
        car_id: number
        name: string
        brand: string
        model: string
        plate_number: string
        rentals: number
      }>(
        `SELECT ca.id as car_id, ca.name, ca.brand, ca.model, ca.plate_number, COUNT(c.id) as rentals
         FROM cars ca
         LEFT JOIN contracts c ON c.car_id = ca.id AND c.deleted_at IS NULL
           AND c.status IN ('active', 'closed')
         GROUP BY ca.id
         ORDER BY rentals DESC, ca.name ASC
         LIMIT 6`,
      )

      const cars_in_use = queryAll(CARS_IN_USE_SQL)

      return {
        cars,
        available,
        rented,
        maintenance,
        clients: clients?.c ?? 0,
        activeContracts: activeContracts?.c ?? 0,
        overdueContracts: overdueContracts?.c ?? 0,
        monthRevenue: revenueStats.month_revenue,
        upcomingReturns: upcoming,
        charts: {
          monthly_trend: revenueStats.monthly_trend,
          unpaid_total: revenueStats.unpaid_total,
          fleet_utilization_pct,
          top_cars_usage,
          cars_in_use,
        },
      }
    },

    getCarStats: () => carsApi.getCarStats(),
    listCars: (filters?: CarFilters) => carsApi.listCars(filters),
    getCar: (id: number) => carsApi.getCar(id),
    createCar: (data: CarInput) => carsApi.createCar(data),
    updateCar: (id: number, data: CarInput) => carsApi.updateCar(id, data),
    renewCarDocument: (id: number, docType: CarDocType, data: CarDocumentRenewInput) =>
      carsApi.renewCarDocument(id, docType, data),
    updateCarStatus: (id: number, status: import('./cars-db').CarComputedStatus) =>
      carsApi.updateCarStatus(id, status),
    deleteCar: (id: number) => carsApi.deleteCar(id),
    deleteCarImage: (id: number) => carsApi.deleteCarImage(id),

    listCustomers: (q?: string) => customersApi.listCustomers(q),
    getCustomer: (id: number) => customersApi.getCustomer(id),
    createCustomer: (data: CustomerInput) => customersApi.createCustomer(data),
    updateCustomer: (id: number, data: CustomerInput) => customersApi.updateCustomer(id, data),
    deleteCustomer: (id: number) => customersApi.deleteCustomer(id),
    getCustomerStats: () => customersApi.getCustomerStats(),

    listClients(q?: string) {
      return customersApi.listCustomers(q).map((c) => ({
        id: c.id,
        full_name: c.name,
        phone: c.phone,
        email: c.email,
        cin: c.cin_number,
        address: c.address,
        license_number: c.license_number,
        notes: '',
      }))
    },

    getClient(id: number) {
      const c = customersApi.getCustomer(id)
      if (!c) return null
      return {
        id: c.id,
        full_name: c.name,
        phone: c.phone,
        email: c.email,
        cin: c.cin_number,
        address: c.address,
        license_number: c.license_number,
        notes: '',
      }
    },

    createClient(data: { full_name: string; phone?: string; email?: string; cin?: string; address?: string; license_number?: string }) {
      const created = customersApi.createCustomer({
        name: data.full_name,
        phone: data.phone,
        email: data.email,
        cin_number: data.cin,
        address: data.address,
        license_number: data.license_number,
      })
      return this.getClient(created!.id)
    },

    updateClient(id: number, data: { full_name: string; phone?: string; email?: string; cin?: string; address?: string; license_number?: string }) {
      const existing = customersApi.getCustomer(id)
      if (!existing) throw new Error('CUSTOMER_NOT_FOUND')
      this.updateCustomer(id, {
        name: data.full_name,
        phone: data.phone,
        email: data.email,
        cin_number: data.cin,
        address: data.address,
        license_number: data.license_number,
        birth_date: existing.birth_date,
        birth_place: existing.birth_place,
        nationality: existing.nationality,
        cin_pdf_path: existing.cin_pdf_path,
        cin_issue_date: existing.cin_issue_date,
        cin_expiry_date: existing.cin_expiry_date,
        passport_number: existing.passport_number,
        passport_pdf_path: existing.passport_pdf_path,
        passport_issue_date: existing.passport_issue_date,
        passport_expiry_date: existing.passport_expiry_date,
        license_pdf_path: existing.license_pdf_path,
        license_issue_date: existing.license_issue_date,
        license_expiry_date: existing.license_expiry_date,
      })
      return this.getClient(id)
    },

    deleteClient(id: number) {
      return customersApi.deleteCustomer(id)
    },

    listReservations: (filters?: ReservationFilters) => reservationsApi.listReservations(filters),
    getReservation: (id: number) => reservationsApi.getReservation(id),
    createReservation: (data: ReservationInput) => reservationsApi.createReservation(data),
    updateReservation: (id: number, data: ReservationInput) => reservationsApi.updateReservation(id, data),
    getReservationStats: () => reservationsApi.getReservationStats(),
    deleteReservation: (id: number) => {
      // A reservation that produced a live contract cannot be removed: the contract would
      // be left pointing at a row that no longer exists.
      const liveContract = queryOne(
        `SELECT id FROM contracts
         WHERE reservation_id = ? AND deleted_at IS NULL AND status != 'cancelled'`,
        [id],
      )
      if (liveContract) throw new Error('RESERVATION_HAS_CONTRACTS')

      const t = now()
      // Cancelled contracts still hold payments: archive them so recettes/stats drop them.
      run(
        `UPDATE contracts SET deleted_at = ?, updated_at = ?
         WHERE reservation_id = ? AND deleted_at IS NULL`,
        [t, t, id],
      )
      reservationPaymentsApi.deleteReservationPaymentsByReservation(id)
      const result = reservationsApi.deleteReservation(id)
      syncAllCarStatuses(dbHelpers())
      return result
    },

    listReservationPayments: (filters?: ReservationPaymentFilters) =>
      reservationPaymentsApi.listReservationPayments(filters),
    getReservationPayment: (id: number) => reservationPaymentsApi.getReservationPayment(id),
    createReservationPayment: (data: ReservationPaymentInput) =>
      reservationPaymentsApi.createReservationPayment(data),
    updateReservationPayment: (id: number, data: Partial<ReservationPaymentInput>) =>
      reservationPaymentsApi.updateReservationPayment(id, data),
    deleteReservationPayment: (id: number) => reservationPaymentsApi.deleteReservationPayment(id),
    applyReservationPaymentStatus: (
      id: number,
      data: { payment_status: PaymentStatus; paid_amount?: number },
    ) => {
      reservationPaymentsApi.applyReservationPaymentStatus(id, data.payment_status, data.paid_amount)
      return reservationsApi.getReservation(id)
    },
    getPaymentStats: () => reservationPaymentsApi.getPaymentStats(),

    listContracts: (filters?: ContractFilters) => contractsApi.listContracts(filters),
    getContract: (id: number) => contractsApi.getContract(id),
    createContract: (data: ContractInput) => {
      const result = contractsApi.createContract(data)
      syncAllCarStatuses(dbHelpers())
      return result
    },
    updateContract: (id: number, data: ContractInput) => {
      const result = contractsApi.updateContract(id, data)
      syncAllCarStatuses(dbHelpers())
      afterContractTotalChange(id)
      return result
    },
    deleteContract: (id: number) => {
      const linked = queryOne<{ reservation_id: number | null }>(
        'SELECT reservation_id FROM contracts WHERE id = ?',
        [id],
      )
      const result = contractsApi.deleteContract(id)
      syncAllCarStatuses(dbHelpers())
      if (linked?.reservation_id) {
        syncReservationPaymentStatus(dbHelpers(), linked.reservation_id)
      }
      return result
    },
    restoreContract: (id: number) => {
      const result = contractsApi.restoreContract(id)
      syncAllCarStatuses(dbHelpers())
      afterContractTotalChange(id)
      return result
    },
    createContractFromReservation: (reservationId: number) => {
      const result = contractsApi.createFromReservation(reservationId)
      syncAllCarStatuses(dbHelpers())
      return result
    },
    markContractDelivered: (id: number, data?: DeliveryHandoverInput) => {
      const result = contractsApi.markDelivered(id, data)
      syncAllCarStatuses(dbHelpers())
      return result
    },
    closeContract: (id: number, data: CloseContractInput) => {
      const result = contractsApi.closeContract(id, data)
      syncAllCarStatuses(dbHelpers())
      afterContractTotalChange(id)
      return result
    },
    updateReturnHandover: (id: number, data: CloseContractInput) => {
      const result = contractsApi.updateReturnHandover(id, data)
      syncAllCarStatuses(dbHelpers())
      afterContractTotalChange(id)
      return result
    },
    cancelContract: (id: number) => {
      const result = contractsApi.cancelContract(id)
      syncAllCarStatuses(dbHelpers())
      afterContractTotalChange(id)
      return result
    },
    extendContract: (id: number, data: ExtendContractInput) => {
      const result = contractsApi.extendContract(id, data)
      syncAllCarStatuses(dbHelpers())
      afterContractTotalChange(id)
      return result
    },
    setContractExtension: (id: number, data: SetContractExtensionInput) => {
      const result = contractsApi.setContractExtension(id, data)
      syncAllCarStatuses(dbHelpers())
      afterContractTotalChange(id)
      return result
    },
    removeContractExtension: (id: number) => {
      const result = contractsApi.removeContractExtension(id)
      syncAllCarStatuses(dbHelpers())
      afterContractTotalChange(id)
      return result
    },
    getContractStats: () => contractsApi.getContractStats(),
    getContractInvoiceBreakdown: (id: number) => contractsApi.invoiceBreakdown(id),
    returnContract(id: number, data: ReturnInput) {
      const result = contractsApi.closeContract(id, {
        return_at: data.returned_at,
        return_place: data.return_place,
        return_mileage: data.mileage,
        return_fuel_level: data.fuel_level,
        return_notes: data.notes?.trim() || undefined,
        return_damages: data.return_damages,
        return_extra_fees: data.extra_fees,
      })
      syncAllCarStatuses(dbHelpers())
      afterContractTotalChange(id)
      return result
    },

    listPayments(contractId?: number) {
      if (contractId) {
        return queryAll(
          `SELECT * FROM payments WHERE contract_id = ?
           ORDER BY datetime(replace(substr(COALESCE(paid_at, created_at, ''), 1, 19), 'T', ' ')) DESC, id DESC`,
          [contractId],
        )
      }
      return queryAll(
        `SELECT p.*, c.contract_number, cu.name as client_name
         FROM payments p
         JOIN contracts c ON c.id = p.contract_id
         JOIN customers cu ON cu.id = c.client_id
         ORDER BY datetime(replace(substr(COALESCE(p.paid_at, p.created_at, ''), 1, 19), 'T', ' ')) DESC, p.id DESC`,
      )
    },

    createPayment(data: PaymentInput) {
      const id = createContractPayment(dbHelpers(), data)
      return queryOne('SELECT * FROM payments WHERE id = ?', [id])
    },

    deletePayment(id: number) {
      deleteContractPayment(dbHelpers(), id)
      return { ok: true }
    },

    updatePayment(id: number, data: Partial<Omit<PaymentInput, 'contract_id'>>) {
      updateContractPayment(dbHelpers(), id, data)
      return queryOne('SELECT * FROM payments WHERE id = ?', [id])
    },

    listExpenses: (filters?: ExpenseFilters) => expensesApi.listExpenses(filters),
    getExpense: (id: number) => expensesApi.getExpense(id),
    createExpense: (data: ExpenseInput) => expensesApi.createExpense(data),
    updateExpense: (id: number, data: ExpenseInput) => expensesApi.updateExpense(id, data),
    deleteExpense: (id: number) => expensesApi.deleteExpense(id),
    getExpenseStats: (filters?: ExpenseFilters) => expensesApi.getExpenseStats(filters),

    listVidanges: (carId: number) => vidangeApi.listVidanges(carId),
    getVidangeStatus: (carId: number) => vidangeApi.getVidangeStatus(carId),
    createVidange: (data: CarVidangeInput) => vidangeApi.createVidange(data),
    updateVidange: (id: number, data: Partial<Omit<CarVidangeInput, 'car_id' | 'create_expense'>>) =>
      vidangeApi.updateVidange(id, data),
    deleteVidange: (id: number) => vidangeApi.deleteVidange(id),
    updateVidangeIntervals: (carId: number, intervalKm: number, intervalMonths: number) =>
      vidangeApi.updateVidangeIntervals(carId, intervalKm, intervalMonths),

    listChauffeurs: (filters?: ChauffeurFilters) => chauffeursApi.listChauffeurs(filters),
    getChauffeur: (id: number) => chauffeursApi.getChauffeur(id),
    createChauffeur: (data: ChauffeurInput) => chauffeursApi.createChauffeur(data),
    updateChauffeur: (id: number, data: ChauffeurInput) => chauffeursApi.updateChauffeur(id, data),
    deleteChauffeur: (id: number) => chauffeursApi.deleteChauffeur(id),

    getRevenueStats: () => revenueApi.getRevenueStats(),
    getRevenuePeriodSummary: (year: number, month: number) => revenueApi.getRevenuePeriodSummary(year, month),

    getNotifications: () => notificationsApi.getNotifications(),
    getNotificationCounts: () => notificationsApi.getNotificationCounts(),

    getSettings() {
      return getSettingsMap()
    },

    saveSettings(data: Record<string, string>) {
      // One export at the end instead of one per key, so the file never holds a half-saved form.
      for (const [key, value] of Object.entries(data)) {
        db.run(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [key, value] as never[],
        )
      }
      save()
      return this.getSettings()
    },
  }
}
