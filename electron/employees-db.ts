import type { Database } from 'sql.js'
import { mergeDefined } from './input-utils'

export type EmployeeRole = 'manager' | 'agent' | 'mechanic' | 'other'

export type EmployeeRecord = {
  id: number
  name: string
  phone: string
  email: string
  address: string
  cin_number: string
  birth_date: string
  birth_place: string
  nationality: string
  role: EmployeeRole | string
  salary: number
  hire_date: string
  is_active: number
  notes: string
  created_at: string
  updated_at: string
}

export type EmployeeInput = {
  name: string
  phone?: string
  email?: string
  address?: string
  cin_number?: string
  birth_date?: string
  birth_place?: string
  nationality?: string
  role?: EmployeeRole | string
  salary?: number
  hire_date?: string
  is_active?: boolean | number
  notes?: string
}

export type EmployeeFilters = {
  q?: string
  activeOnly?: boolean
  role?: EmployeeRole | ''
}

export type EmployeeStats = {
  total: number
  active: number
  monthly_payroll: number
}

export type EmployeeDocumentRecord = {
  id: number
  employee_id: number
  name: string
  doc_type: string
  path: string
  created_at: string
}

export type EmployeeDocumentInput = {
  employee_id: number
  name: string
  doc_type?: string
  path: string
}

export type SalaryPaymentRecord = {
  id: number
  employee_id: number
  amount: number
  payment_date: string
  period_year: number
  period_month: number
  payment_method: string
  notes: string
  expense_id: number | null
  created_at: string
}

export type SalaryPaymentInput = {
  employee_id: number
  amount: number
  payment_date?: string
  period_year: number
  period_month: number
  payment_method?: string
  notes?: string
  expense_id?: number | null
}

type DbHelpers = {
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
  run: (sql: string, params?: unknown[]) => void
  runInsert: (sql: string, params?: unknown[]) => number
  now: () => string
}

const ROLES: EmployeeRole[] = ['manager', 'agent', 'mechanic', 'other']
const PAYMENT_METHODS = ['cash', 'card', 'bank_transfer']

function normalizeRole(value: unknown): EmployeeRole {
  const role = String(value ?? '').trim()
  return ROLES.includes(role as EmployeeRole) ? (role as EmployeeRole) : 'agent'
}

function normalizeSalary(value: unknown) {
  const salary = Number(value ?? 0)
  if (!Number.isFinite(salary) || salary < 0) throw new Error('INVALID_SALARY')
  return Math.round(salary * 100) / 100
}

function normalizeEmployeeInput(data: EmployeeInput) {
  const name = data.name?.trim() || ''
  if (!name) throw new Error('NAME_REQUIRED')

  return {
    name,
    phone: data.phone?.trim() ?? '',
    email: data.email?.trim() ?? '',
    address: data.address?.trim() ?? '',
    cin_number: data.cin_number?.trim() ?? '',
    birth_date: data.birth_date?.trim() ?? '',
    birth_place: data.birth_place?.trim() ?? '',
    nationality: data.nationality?.trim() ?? '',
    role: normalizeRole(data.role),
    salary: normalizeSalary(data.salary ?? 0),
    hire_date: data.hire_date?.trim() ?? '',
    is_active: data.is_active === false || data.is_active === 0 ? 0 : 1,
    notes: data.notes?.trim() ?? '',
  }
}

export function createEmployeesSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      cin_number TEXT DEFAULT '',
      birth_date TEXT DEFAULT '',
      birth_place TEXT DEFAULT '',
      nationality TEXT DEFAULT '',
      role TEXT NOT NULL DEFAULT 'agent',
      salary REAL NOT NULL DEFAULT 0,
      hire_date TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    );
  `)
}

export function migrateEmployeesTable(db: Database, helpers: DbHelpers) {
  createEmployeesSchema(db)
  const info = db.exec('PRAGMA table_info(employees)')
  const existing = new Set((info[0]?.values ?? []).map((row) => String(row[1])))
  const columns: Array<[string, string]> = [
    ['address', "ALTER TABLE employees ADD COLUMN address TEXT DEFAULT ''"],
    ['cin_number', "ALTER TABLE employees ADD COLUMN cin_number TEXT DEFAULT ''"],
    ['birth_date', "ALTER TABLE employees ADD COLUMN birth_date TEXT DEFAULT ''"],
    ['birth_place', "ALTER TABLE employees ADD COLUMN birth_place TEXT DEFAULT ''"],
    ['nationality', "ALTER TABLE employees ADD COLUMN nationality TEXT DEFAULT ''"],
  ]
  for (const [col, sql] of columns) {
    if (!existing.has(col)) helpers.run(sql)
  }
}

export function createEmployeeDocumentsSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS employee_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      doc_type TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      created_at TEXT
    );
  `)
}

export function migrateEmployeeDocumentsTable(db: Database, helpers: DbHelpers) {
  createEmployeeDocumentsSchema(db)
  const info = db.exec('PRAGMA table_info(employee_documents)')
  const existing = new Set((info[0]?.values ?? []).map((row) => String(row[1])))
  if (!existing.has('doc_type')) {
    helpers.run('ALTER TABLE employee_documents ADD COLUMN doc_type TEXT NOT NULL DEFAULT \'\'')
  }
}

export function createSalaryPaymentsSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS salary_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      payment_date TEXT NOT NULL,
      period_year INTEGER NOT NULL,
      period_month INTEGER NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      notes TEXT DEFAULT '',
      expense_id INTEGER,
      created_at TEXT
    );
  `)
}

export function createEmployeesApi(helpers: DbHelpers) {
  return {
    listEmployees(filters?: EmployeeFilters): EmployeeRecord[] {
      const clauses: string[] = []
      const params: unknown[] = []

      if (filters?.activeOnly) clauses.push('is_active = 1')
      if (filters?.role) {
        clauses.push('role = ?')
        params.push(filters.role)
      }
      if (filters?.q?.trim()) {
        clauses.push('(name LIKE ? OR phone LIKE ? OR email LIKE ? OR role LIKE ? OR address LIKE ? OR cin_number LIKE ?)')
        const like = `%${filters.q.trim()}%`
        params.push(like, like, like, like, like, like)
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      return helpers.queryAll<EmployeeRecord>(
        `SELECT * FROM employees ${where} ORDER BY name ASC, id DESC`,
        params,
      )
    },

    getEmployee(id: number): EmployeeRecord | null {
      return helpers.queryOne<EmployeeRecord>('SELECT * FROM employees WHERE id = ?', [id])
    },

    getEmployeeStats(): EmployeeStats {
      const row = helpers.queryOne<{ total: number; active: number; monthly_payroll: number }>(
        `SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active,
          COALESCE(SUM(CASE WHEN is_active = 1 THEN salary ELSE 0 END), 0) AS monthly_payroll
         FROM employees`,
      )
      return {
        total: Number(row?.total ?? 0),
        active: Number(row?.active ?? 0),
        monthly_payroll: Number(row?.monthly_payroll ?? 0),
      }
    },

    createEmployee(data: EmployeeInput) {
      const normalized = normalizeEmployeeInput(data)
      const t = helpers.now()

      const id = helpers.runInsert(
        `INSERT INTO employees (
          name, phone, email, address, cin_number, birth_date, birth_place, nationality,
          role, salary, hire_date, is_active, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalized.name,
          normalized.phone,
          normalized.email,
          normalized.address,
          normalized.cin_number,
          normalized.birth_date,
          normalized.birth_place,
          normalized.nationality,
          normalized.role,
          normalized.salary,
          normalized.hire_date,
          normalized.is_active,
          normalized.notes,
          t,
          t,
        ],
      )

      const created = this.getEmployee(id)
      if (!created) throw new Error('EMPLOYEE_CREATE_FAILED')
      return created
    },

    updateEmployee(id: number, data: Partial<EmployeeInput>) {
      const existing = helpers.queryOne<EmployeeRecord>('SELECT * FROM employees WHERE id = ?', [id])
      if (!existing) throw new Error('EMPLOYEE_NOT_FOUND')

      const normalized = normalizeEmployeeInput(mergeDefined(existing as EmployeeInput, data))
      const t = helpers.now()

      helpers.run(
        `UPDATE employees SET
          name = ?, phone = ?, email = ?, address = ?, cin_number = ?, birth_date = ?,
          birth_place = ?, nationality = ?, role = ?, salary = ?, hire_date = ?,
          is_active = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        [
          normalized.name,
          normalized.phone,
          normalized.email,
          normalized.address,
          normalized.cin_number,
          normalized.birth_date,
          normalized.birth_place,
          normalized.nationality,
          normalized.role,
          normalized.salary,
          normalized.hire_date,
          normalized.is_active,
          normalized.notes,
          t,
          id,
        ],
      )

      const updated = this.getEmployee(id)
      if (!updated) throw new Error('EMPLOYEE_NOT_FOUND')
      return updated
    },

    deleteEmployee(id: number) {
      const existing = helpers.queryOne<EmployeeRecord>('SELECT id FROM employees WHERE id = ?', [id])
      if (!existing) throw new Error('EMPLOYEE_NOT_FOUND')
      helpers.run('DELETE FROM salary_payments WHERE employee_id = ?', [id])
      helpers.run('DELETE FROM employee_documents WHERE employee_id = ?', [id])
      helpers.run('DELETE FROM employees WHERE id = ?', [id])
      return { ok: true }
    },

    // Document methods
    listEmployeeDocuments(employeeId: number): EmployeeDocumentRecord[] {
      return helpers.queryAll<EmployeeDocumentRecord>(
        'SELECT * FROM employee_documents WHERE employee_id = ? ORDER BY created_at DESC, id DESC',
        [employeeId],
      )
    },

    addEmployeeDocument(data: EmployeeDocumentInput): EmployeeDocumentRecord {
      const employee = helpers.queryOne<{ id: number }>('SELECT id FROM employees WHERE id = ?', [data.employee_id])
      if (!employee) throw new Error('EMPLOYEE_NOT_FOUND')
      const t = helpers.now()
      const id = helpers.runInsert(
        'INSERT INTO employee_documents (employee_id, name, doc_type, path, created_at) VALUES (?, ?, ?, ?, ?)',
        [data.employee_id, data.name.trim() || 'Document', data.doc_type?.trim() ?? '', data.path.trim(), t],
      )
      return helpers.queryOne<EmployeeDocumentRecord>('SELECT * FROM employee_documents WHERE id = ?', [id])!
    },

    deleteEmployeeDocument(id: number): { ok: boolean; path: string } {
      const doc = helpers.queryOne<EmployeeDocumentRecord>('SELECT * FROM employee_documents WHERE id = ?', [id])
      if (!doc) throw new Error('DOCUMENT_NOT_FOUND')
      helpers.run('DELETE FROM employee_documents WHERE id = ?', [id])
      return { ok: true, path: doc.path }
    },

    // Salary payment methods
    listSalaryPayments(employeeId: number): SalaryPaymentRecord[] {
      return helpers.queryAll<SalaryPaymentRecord>(
        `SELECT * FROM salary_payments WHERE employee_id = ?
         ORDER BY period_year DESC, period_month DESC, id DESC`,
        [employeeId],
      )
    },

    createSalaryPaymentRecord(data: SalaryPaymentInput): SalaryPaymentRecord {
      const employee = helpers.queryOne<{ id: number }>('SELECT id FROM employees WHERE id = ?', [data.employee_id])
      if (!employee) throw new Error('EMPLOYEE_NOT_FOUND')

      const amount = Number(data.amount ?? 0)
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('INVALID_SALARY')

      const paymentMethod = PAYMENT_METHODS.includes(data.payment_method ?? '') ? data.payment_method! : 'cash'
      const t = helpers.now()
      const paymentDate = data.payment_date?.trim() || t.slice(0, 10)

      const id = helpers.runInsert(
        `INSERT INTO salary_payments (
          employee_id, amount, payment_date, period_year, period_month,
          payment_method, notes, expense_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.employee_id,
          amount,
          paymentDate,
          data.period_year,
          data.period_month,
          paymentMethod,
          data.notes?.trim() ?? '',
          data.expense_id ?? null,
          t,
        ],
      )
      return helpers.queryOne<SalaryPaymentRecord>('SELECT * FROM salary_payments WHERE id = ?', [id])!
    },

    getSalaryPayment(id: number): SalaryPaymentRecord | null {
      return helpers.queryOne<SalaryPaymentRecord>('SELECT * FROM salary_payments WHERE id = ?', [id])
    },

    deleteSalaryPaymentRecord(id: number): { ok: boolean; expense_id: number | null } {
      const payment = helpers.queryOne<SalaryPaymentRecord>('SELECT * FROM salary_payments WHERE id = ?', [id])
      if (!payment) throw new Error('SALARY_PAYMENT_NOT_FOUND')
      helpers.run('DELETE FROM salary_payments WHERE id = ?', [id])
      return { ok: true, expense_id: payment.expense_id }
    },

    getSalaryPaymentsWithExpenseIds(employeeId: number): { id: number; expense_id: number | null }[] {
      return helpers.queryAll<{ id: number; expense_id: number | null }>(
        'SELECT id, expense_id FROM salary_payments WHERE employee_id = ?',
        [employeeId],
      )
    },
  }
}
