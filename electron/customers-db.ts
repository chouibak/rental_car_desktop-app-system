import type { Database } from 'sql.js'
import {
  deleteCustomerStorage,
  moveToCustomerStorage,
} from './customer-storage'
import { deleteFileIfExists } from './storage'
import { mergeDefined } from './input-utils'

export type CustomerRecord = {
  id: number
  name: string
  phone: string
  email: string
  birth_date: string
  birth_place: string
  nationality: string
  address: string
  cin_number: string
  cin_pdf_path: string
  cin_issue_date: string
  cin_expiry_date: string
  passport_number: string
  passport_pdf_path: string
  passport_issue_date: string
  passport_expiry_date: string
  license_number: string
  license_pdf_path: string
  license_issue_date: string
  license_expiry_date: string
  created_at: string
  updated_at: string
}

export type CustomerInput = {
  name: string
  phone?: string
  email?: string
  birth_date?: string
  birth_place?: string
  nationality?: string
  address?: string
  cin_number?: string
  cin_pdf_path?: string
  cin_issue_date?: string
  cin_expiry_date?: string
  passport_number?: string
  passport_pdf_path?: string
  passport_issue_date?: string
  passport_expiry_date?: string
  license_number?: string
  license_pdf_path?: string
  license_issue_date?: string
  license_expiry_date?: string
}

type DbHelpers = {
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
  run: (sql: string, params?: unknown[]) => void
  runInsert: (sql: string, params?: unknown[]) => number
  now: () => string
}

const PDF_COLUMNS = [
  'cin_pdf_path',
  'passport_pdf_path',
  'license_pdf_path',
] as const

export function createCustomersSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      birth_date TEXT DEFAULT '',
      birth_place TEXT DEFAULT '',
      nationality TEXT DEFAULT '',
      address TEXT DEFAULT '',
      cin_number TEXT DEFAULT '',
      cin_pdf_path TEXT DEFAULT '',
      cin_issue_date TEXT DEFAULT '',
      cin_expiry_date TEXT DEFAULT '',
      passport_number TEXT DEFAULT '',
      passport_pdf_path TEXT DEFAULT '',
      passport_issue_date TEXT DEFAULT '',
      passport_expiry_date TEXT DEFAULT '',
      license_number TEXT DEFAULT '',
      license_pdf_path TEXT DEFAULT '',
      license_issue_date TEXT DEFAULT '',
      license_expiry_date TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    );
  `)
}

const CUSTOMER_DOC_COLUMNS = [
  'cin_pdf_path',
  'passport_pdf_path',
  'license_pdf_path',
  'cin_issue_date',
  'cin_expiry_date',
  'passport_issue_date',
  'passport_expiry_date',
  'license_issue_date',
  'license_expiry_date',
  'birth_date',
  'birth_place',
  'nationality',
] as const

export function migrateCustomersTable(db: Database, helpers: DbHelpers) {
  createCustomersSchema(db)
  const info = db.exec('PRAGMA table_info(customers)')
  const existing = new Set((info[0]?.values ?? []).map((row) => String(row[1])))
  for (const column of CUSTOMER_DOC_COLUMNS) {
    if (!existing.has(column)) {
      helpers.run(`ALTER TABLE customers ADD COLUMN ${column} TEXT DEFAULT ''`)
    }
  }
}

export function migrateClientsToCustomers(db: Database, helpers: DbHelpers) {
  createCustomersSchema(db)

  const count = helpers.queryOne<{ c: number }>('SELECT COUNT(*) as c FROM customers')
  if ((count?.c ?? 0) > 0) return

  const hasClients = helpers.queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='clients'",
  )
  if (!hasClients) return

  const rows = helpers.queryAll<{
    id: number
    full_name: string
    phone: string
    email: string
    cin: string
    address: string
    license_number: string
    created_at: string
    updated_at: string
  }>('SELECT * FROM clients ORDER BY id ASC')

  for (const row of rows) {
    helpers.run(
      `INSERT INTO customers (
        id, name, phone, email, address, cin_number, license_number, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.id,
        row.full_name,
        row.phone ?? '',
        row.email ?? '',
        row.address ?? '',
        row.cin ?? '',
        row.license_number ?? '',
        row.created_at,
        row.updated_at,
      ],
    )
  }
}

function normalizeCustomerInput(data: CustomerInput) {
  const name = data.name?.trim() ?? ''
  if (!name) throw new Error('NAME_REQUIRED')
  return {
    name,
    phone: data.phone?.trim() ?? '',
    email: data.email?.trim() ?? '',
    birth_date: data.birth_date ?? '',
    birth_place: data.birth_place?.trim() ?? '',
    nationality: data.nationality?.trim() ?? '',
    address: data.address?.trim() ?? '',
    cin_number: data.cin_number?.trim() ?? '',
    cin_pdf_path: data.cin_pdf_path ?? '',
    cin_issue_date: data.cin_issue_date ?? '',
    cin_expiry_date: data.cin_expiry_date ?? '',
    passport_number: data.passport_number?.trim() ?? '',
    passport_pdf_path: data.passport_pdf_path ?? '',
    passport_issue_date: data.passport_issue_date ?? '',
    passport_expiry_date: data.passport_expiry_date ?? '',
    license_number: data.license_number?.trim() ?? '',
    license_pdf_path: data.license_pdf_path ?? '',
    license_issue_date: data.license_issue_date ?? '',
    license_expiry_date: data.license_expiry_date ?? '',
  }
}

function finalizePdfPaths(customerId: number, data: ReturnType<typeof normalizeCustomerInput>) {
  const result = { ...data }
  for (const col of PDF_COLUMNS) {
    const current = result[col]
    if (current) {
      result[col] = moveToCustomerStorage(current, customerId)
    }
  }
  return result
}

function deleteRemovedPdfs(previous: CustomerRecord | null, next: ReturnType<typeof normalizeCustomerInput>) {
  if (!previous) return
  for (const col of PDF_COLUMNS) {
    const oldPath = previous[col]
    const newPath = next[col]
    if (oldPath && oldPath !== newPath) deleteFileIfExists(oldPath)
  }
}

export function createCustomersApi(helpers: DbHelpers) {
  return {
    listCustomers(q?: string): CustomerRecord[] {
      if (q) {
        const like = `%${q}%`
        return helpers.queryAll<CustomerRecord>(
          `SELECT * FROM customers
           WHERE name LIKE ? OR phone LIKE ? OR email LIKE ? OR cin_number LIKE ?
           ORDER BY id DESC`,
          [like, like, like, like],
        )
      }
      return helpers.queryAll<CustomerRecord>('SELECT * FROM customers ORDER BY id DESC')
    },

    getCustomer(id: number): CustomerRecord | null {
      return helpers.queryOne<CustomerRecord>('SELECT * FROM customers WHERE id = ?', [id])
    },

    createCustomer(data: CustomerInput) {
      const normalized = normalizeCustomerInput(data)
      const t = helpers.now()

      const id = helpers.runInsert(
        `INSERT INTO customers (
          name, phone, email, birth_date, birth_place, nationality, address,
          cin_number, cin_pdf_path, cin_issue_date, cin_expiry_date,
          passport_number, passport_pdf_path, passport_issue_date, passport_expiry_date,
          license_number, license_pdf_path, license_issue_date, license_expiry_date,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalized.name,
          normalized.phone,
          normalized.email,
          normalized.birth_date,
          normalized.birth_place,
          normalized.nationality,
          normalized.address,
          normalized.cin_number,
          '',
          normalized.cin_issue_date,
          normalized.cin_expiry_date,
          normalized.passport_number,
          '',
          normalized.passport_issue_date,
          normalized.passport_expiry_date,
          normalized.license_number,
          '',
          normalized.license_issue_date,
          normalized.license_expiry_date,
          t,
          t,
        ],
      )

      const withPdfs = finalizePdfPaths(id, normalized)
      helpers.run(
        `UPDATE customers SET
          cin_pdf_path = ?, passport_pdf_path = ?, license_pdf_path = ?, updated_at = ?
         WHERE id = ?`,
        [withPdfs.cin_pdf_path, withPdfs.passport_pdf_path, withPdfs.license_pdf_path, t, id],
      )

      const created = this.getCustomer(id)
      if (!created) throw new Error('CUSTOMER_CREATE_FAILED')
      return created
    },

    updateCustomer(id: number, data: Partial<CustomerInput>) {
      const existing = helpers.queryOne<CustomerRecord>('SELECT * FROM customers WHERE id = ?', [id])
      if (!existing) throw new Error('CUSTOMER_NOT_FOUND')

      const normalized = normalizeCustomerInput(mergeDefined(existing as CustomerInput, data))
      deleteRemovedPdfs(existing, normalized)
      const withPdfs = finalizePdfPaths(id, normalized)
      const t = helpers.now()

      helpers.run(
        `UPDATE customers SET
          name = ?, phone = ?, email = ?, birth_date = ?, birth_place = ?, nationality = ?, address = ?,
          cin_number = ?, cin_pdf_path = ?, cin_issue_date = ?, cin_expiry_date = ?,
          passport_number = ?, passport_pdf_path = ?, passport_issue_date = ?, passport_expiry_date = ?,
          license_number = ?, license_pdf_path = ?, license_issue_date = ?, license_expiry_date = ?,
          updated_at = ?
         WHERE id = ?`,
        [
          withPdfs.name,
          withPdfs.phone,
          withPdfs.email,
          withPdfs.birth_date,
          withPdfs.birth_place,
          withPdfs.nationality,
          withPdfs.address,
          withPdfs.cin_number,
          withPdfs.cin_pdf_path,
          withPdfs.cin_issue_date,
          withPdfs.cin_expiry_date,
          withPdfs.passport_number,
          withPdfs.passport_pdf_path,
          withPdfs.passport_issue_date,
          withPdfs.passport_expiry_date,
          withPdfs.license_number,
          withPdfs.license_pdf_path,
          withPdfs.license_issue_date,
          withPdfs.license_expiry_date,
          t,
          id,
        ],
      )

      return this.getCustomer(id)
    },

    deleteCustomer(id: number) {
      const used = helpers.queryOne(
        'SELECT id FROM contracts WHERE client_id = ? AND deleted_at IS NULL LIMIT 1',
        [id],
      )
      const reserved = helpers.queryOne(
        `SELECT id FROM reservations WHERE customer_id = ? AND status IN ('pending', 'confirmed') LIMIT 1`,
        [id],
      )
      if (used) throw new Error('CUSTOMER_HAS_CONTRACTS')
      if (reserved) throw new Error('CUSTOMER_HAS_RESERVATIONS')

      const customer = helpers.queryOne<CustomerRecord>('SELECT * FROM customers WHERE id = ?', [id])
      if (!customer) throw new Error('CUSTOMER_NOT_FOUND')

      for (const col of PDF_COLUMNS) {
        deleteFileIfExists(customer[col])
      }

      helpers.run('DELETE FROM customers WHERE id = ?', [id])
      deleteCustomerStorage(id)
      return { ok: true }
    },
  }
}
