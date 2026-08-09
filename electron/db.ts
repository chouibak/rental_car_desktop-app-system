import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import initSqlJs, { Database } from 'sql.js'
import {
  createCarsApi,
  createCarsSchema,
  migrateCarsTable,
  migrateCarStatusColumn,
  syncAllCarStatuses,
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
import { syncReservationPaymentStatusForContract } from './payment-sync'
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
} from './contracts-db'
import {
  createExpensesApi,
  createExpensesSchema,
  type ExpenseFilters,
  type ExpenseInput,
} from './expenses-db'
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

let db: Database
let dbPath = ''
let carsApi: ReturnType<typeof createCarsApi>
let customersApi: ReturnType<typeof createCustomersApi>
let reservationsApi: ReturnType<typeof createReservationsApi>
let reservationPaymentsApi: ReturnType<typeof createReservationPaymentsApi>
let contractsApi: ReturnType<typeof createContractsApi>
let expensesApi: ReturnType<typeof createExpensesApi>
let chauffeursApi: ReturnType<typeof createChauffeursApi>
let revenueApi: ReturnType<typeof createRevenueApi>
let notificationsApi: ReturnType<typeof createNotificationsApi>

function getSettingsMap() {
  const rows = queryAll<{ key: string; value: string }>('SELECT key, value FROM settings')
  const settings: Record<string, string> = {}
  for (const row of rows) settings[row.key] = row.value
  return settings
}

function ensureSetting(key: string, value: string) {
  const existing = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])
  if (!existing) {
    run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value])
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

function save() {
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
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

export async function initDb(userDataPath: string) {
  const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm')
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
  carsApi = createCarsApi(dbHelpers())
  createCustomersSchema(db)
  migrateCustomersTable(db, dbHelpers())
  migrateClientsToCustomers(db, dbHelpers())
  customersApi = createCustomersApi(dbHelpers())

  createReservationsSchema(db)
  reservationsApi = createReservationsApi(dbHelpers(), carsApi)
  createReservationPaymentsSchema(db)
  syncAllReservationPaymentStatuses(dbHelpers())
  syncAllCarStatuses(dbHelpers())
  reservationPaymentsApi = createReservationPaymentsApi(dbHelpers())

  migrateContractsTable(db, dbHelpers())
  contractsApi = createContractsApi(dbHelpers(), carsApi, () => {
    const rows = queryAll<{ key: string; value: string }>('SELECT key, value FROM settings')
    const settings: Record<string, string> = {}
    for (const row of rows) settings[row.key] = row.value
    return settings
  })

  createExpensesSchema(db)
  expensesApi = createExpensesApi(dbHelpers())

  createChauffeursSchema(db)
  chauffeursApi = createChauffeursApi(dbHelpers())

  revenueApi = createRevenueApi(dbHelpers())
  notificationsApi = createNotificationsApi(dbHelpers(), getSettingsMap)

  ensureSetting('notification_return_days', '1')
  ensureSetting('notification_doc_days', '30')

  const orphanImages = queryAll<{ id: number; path: string }>('SELECT id, path FROM car_images')
  for (const img of orphanImages) {
    if (!fileExists(img.path)) {
      run('DELETE FROM car_images WHERE id = ?', [img.id])
    }
  }

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

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_number TEXT NOT NULL UNIQUE,
      client_id INTEGER NOT NULL,
      car_id INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      daily_price REAL NOT NULL,
      total_days INTEGER NOT NULL,
      discount REAL DEFAULT 0,
      deposit REAL DEFAULT 0,
      total_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY(client_id) REFERENCES clients(id),
      FOREIGN KEY(car_id) REFERENCES cars(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL DEFAULT 'cash',
      paid_at TEXT NOT NULL,
      note TEXT,
      created_at TEXT,
      FOREIGN KEY(contract_id) REFERENCES contracts(id)
    );

    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id INTEGER NOT NULL UNIQUE,
      returned_at TEXT NOT NULL,
      mileage INTEGER,
      fuel_level TEXT,
      damages TEXT,
      extra_fees REAL DEFAULT 0,
      notes TEXT,
      FOREIGN KEY(contract_id) REFERENCES contracts(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `)

  const company = queryOne("SELECT value FROM settings WHERE key = 'company_name'")
  if (!company) {
    const defaults: Record<string, string> = {
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
    for (const [key, value] of Object.entries(defaults)) {
      db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value])
    }

    // Demo seed data so the app is not empty on first launch
    const t = now()
    const carCount = queryOne<{ c: number }>('SELECT COUNT(*) as c FROM cars')
    if ((carCount?.c ?? 0) === 0) {
      carsApi.createCar({
        name: 'Dacia Logan',
        brand: 'Dacia',
        model: 'Logan',
        plate_number: '12345-A-1',
        year: 2022,
        color: 'Blanc',
        fuel: 'Diesel',
        price_per_day: 250,
        category: 'compacte',
        mileage: 45000,
        is_available: true,
      })
      carsApi.createCar({
        name: 'Hyundai Tucson',
        brand: 'Hyundai',
        model: 'Tucson',
        plate_number: '67890-B-2',
        year: 2023,
        color: 'Noir',
        fuel: 'Essence',
        price_per_day: 450,
        category: 'suv',
        mileage: 22000,
        is_available: true,
      })
      carsApi.createCar({
        name: 'Renault Clio',
        brand: 'Renault',
        model: 'Clio',
        plate_number: '11223-C-3',
        year: 2021,
        color: 'Rouge',
        fuel: 'Essence',
        price_per_day: 200,
        category: 'economique',
        mileage: 61000,
        is_available: false,
      })
    }
    db.run(
      `INSERT INTO customers (name, phone, email, cin_number, address, license_number, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Ahmed Benali', '0612345678', 'ahmed@email.com', 'AB123456', 'Casablanca', 'L-998877', t, t],
    )
    db.run(
      `INSERT INTO customers (name, phone, email, cin_number, address, license_number, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['Fatima Zahra', '0698765432', 'fatima@email.com', 'CD654321', 'Rabat', 'L-112233', t, t],
    )
    save()
  } else {
    save()
  }
}

export type { CarInput, CarFilters } from './cars-db'
export type { CustomerInput } from './customers-db'
export type { ReservationInput, ReservationFilters } from './reservations-db'
export type { ReservationPaymentInput, ReservationPaymentFilters } from './reservation-payments-db'
export type { ContractInput, ContractFilters, CloseContractInput } from './contracts-db'
export type { ExpenseInput, ExpenseFilters } from './expenses-db'
export type { ChauffeurInput, ChauffeurFilters } from './chauffeurs-db'
export type { RevenueStats, RevenueMonthPoint, RevenueMethodPoint } from './revenue-db'
export type { Notification, NotificationCounts, NotificationKind, NotificationSeverity } from './notifications-db'

export type PaymentInput = {
  contract_id: number
  amount: number
  method?: string
  paid_at?: string
  note?: string
}

export type ReturnInput = {
  returned_at?: string
  mileage?: number
  fuel_level?: string
  damages?: string
  extra_fees?: number
  notes?: string
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
    updateCarStatus: (id: number, status: import('./cars-db').CarComputedStatus) =>
      carsApi.updateCarStatus(id, status),
    deleteCar: (id: number) => carsApi.deleteCar(id),
    deleteCarImage: (id: number) => carsApi.deleteCarImage(id),

    listCustomers: (q?: string) => customersApi.listCustomers(q),
    getCustomer: (id: number) => customersApi.getCustomer(id),
    createCustomer: (data: CustomerInput) => customersApi.createCustomer(data),
    updateCustomer: (id: number, data: CustomerInput) => customersApi.updateCustomer(id, data),
    deleteCustomer: (id: number) => customersApi.deleteCustomer(id),

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
    deleteReservation: (id: number) => {
      reservationPaymentsApi.deleteReservationPaymentsByReservation(id)
      return reservationsApi.deleteReservation(id)
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
    createContract: (data: ContractInput) => contractsApi.createContract(data),
    updateContract: (id: number, data: ContractInput) => contractsApi.updateContract(id, data),
    deleteContract: (id: number) => contractsApi.deleteContract(id),
    restoreContract: (id: number) => contractsApi.restoreContract(id),
    createContractFromReservation: (reservationId: number) => contractsApi.createFromReservation(reservationId),
    markContractDelivered: (id: number) => {
      const result = contractsApi.markDelivered(id)
      syncAllCarStatuses(dbHelpers())
      return result
    },
    closeContract: (id: number, data: CloseContractInput) => {
      const result = contractsApi.closeContract(id, data)
      syncAllCarStatuses(dbHelpers())
      return result
    },
    cancelContract: (id: number) => {
      const result = contractsApi.cancelContract(id)
      syncAllCarStatuses(dbHelpers())
      return result
    },
    getContractStats: () => contractsApi.getContractStats(),
    getContractInvoiceBreakdown: (id: number) => contractsApi.invoiceBreakdown(id),
    returnContract(id: number, data: ReturnInput) {
      return contractsApi.closeContract(id, {
        return_at: data.returned_at,
        return_mileage: data.mileage,
        return_fuel_level: data.fuel_level,
        return_notes: data.notes,
        return_extra_fees: data.extra_fees,
      })
    },

    listPayments(contractId?: number) {
      if (contractId) {
        return queryAll('SELECT * FROM payments WHERE contract_id = ? ORDER BY id DESC', [contractId])
      }
      return queryAll(
        `SELECT p.*, c.contract_number, cu.name as client_name
         FROM payments p
         JOIN contracts c ON c.id = p.contract_id
         JOIN customers cu ON cu.id = c.client_id
         ORDER BY p.id DESC`,
      )
    },

    createPayment(data: PaymentInput) {
      const t = now()
      const id = runInsert(
        `INSERT INTO payments (contract_id, amount, method, paid_at, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [data.contract_id, data.amount, data.method ?? 'cash', data.paid_at ?? t.slice(0, 10), data.note ?? '', t],
      )
      syncReservationPaymentStatusForContract(dbHelpers(), data.contract_id)
      return queryOne('SELECT * FROM payments WHERE id = ?', [id])
    },

    deletePayment(id: number) {
      const payment = queryOne<{ contract_id: number }>('SELECT contract_id FROM payments WHERE id = ?', [id])
      run('DELETE FROM payments WHERE id = ?', [id])
      if (payment?.contract_id) {
        syncReservationPaymentStatusForContract(dbHelpers(), payment.contract_id)
      }
      return { ok: true }
    },

    updatePayment(id: number, data: Partial<Omit<PaymentInput, 'contract_id'>>) {
      const existing = queryOne<{ contract_id: number; amount: number; method: string; paid_at: string; note: string }>(
        'SELECT contract_id, amount, method, paid_at, note FROM payments WHERE id = ?',
        [id],
      )
      if (!existing) throw new Error('PAYMENT_NOT_FOUND')

      const amount = data.amount ?? existing.amount
      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('INVALID_AMOUNT')

      run(
        `UPDATE payments SET amount = ?, method = ?, paid_at = ?, note = ? WHERE id = ?`,
        [
          amount,
          data.method ?? existing.method,
          data.paid_at ?? existing.paid_at,
          data.note ?? existing.note,
          id,
        ],
      )
      syncReservationPaymentStatusForContract(dbHelpers(), existing.contract_id)
      return queryOne('SELECT * FROM payments WHERE id = ?', [id])
    },

    listExpenses: (filters?: ExpenseFilters) => expensesApi.listExpenses(filters),
    getExpense: (id: number) => expensesApi.getExpense(id),
    createExpense: (data: ExpenseInput) => expensesApi.createExpense(data),
    updateExpense: (id: number, data: ExpenseInput) => expensesApi.updateExpense(id, data),
    deleteExpense: (id: number) => expensesApi.deleteExpense(id),
    getExpenseStats: (filters?: ExpenseFilters) => expensesApi.getExpenseStats(filters),

    listChauffeurs: (filters?: ChauffeurFilters) => chauffeursApi.listChauffeurs(filters),
    getChauffeur: (id: number) => chauffeursApi.getChauffeur(id),
    createChauffeur: (data: ChauffeurInput) => chauffeursApi.createChauffeur(data),
    updateChauffeur: (id: number, data: ChauffeurInput) => chauffeursApi.updateChauffeur(id, data),
    deleteChauffeur: (id: number) => chauffeursApi.deleteChauffeur(id),

    getRevenueStats: () => revenueApi.getRevenueStats(),

    getNotifications: () => notificationsApi.getNotifications(),
    getNotificationCounts: () => notificationsApi.getNotificationCounts(),

    getSettings() {
      return getSettingsMap()
    },

    saveSettings(data: Record<string, string>) {
      for (const [key, value] of Object.entries(data)) {
        run(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          [key, value],
        )
      }
      return this.getSettings()
    },
  }
}
