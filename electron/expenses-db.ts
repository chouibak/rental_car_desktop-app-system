import type { Database } from 'sql.js'
import { deleteFileIfExists } from './storage'
import { deleteExpenseStorage, moveToExpenseStorage } from './expense-storage'
import { datePrefixEquals, localYmd, localYearMonth } from './local-date'

export type ExpenseCategory =
  | 'fuel'
  | 'maintenance'
  | 'insurance'
  | 'rent'
  | 'salaries'
  | 'utilities'
  | 'marketing'
  | 'office'
  | 'other'

export type ExpensePaymentMethod = 'cash' | 'card' | 'bank_transfer'

export type ExpenseRecord = {
  id: number
  title: string
  category: ExpenseCategory
  amount: number
  expense_date: string
  payment_method: ExpensePaymentMethod
  receipt_path: string
  notes: string
  car_id: number | null
  car_name?: string
  car_plate?: string
  created_at: string
}

export type ExpenseInput = {
  title: string
  category?: ExpenseCategory
  amount: number
  expense_date?: string
  payment_method?: ExpensePaymentMethod
  receipt_path?: string
  notes?: string
  car_id?: number | null | ''
}

export type ExpenseFilters = {
  q?: string
  category?: ExpenseCategory | ''
  car_id?: number | ''
  date_from?: string
  date_to?: string
}

export type ExpenseStats = {
  month_total: number
  month_count: number
  total: number
  count: number
  by_category: { category: string; amount: number }[]
}

type DbHelpers = {
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
  run: (sql: string, params?: unknown[]) => void
  runInsert: (sql: string, params?: unknown[]) => number
  lastId: () => number
  now: () => string
}

const CATEGORIES: ExpenseCategory[] = [
  'fuel',
  'maintenance',
  'insurance',
  'rent',
  'salaries',
  'utilities',
  'marketing',
  'office',
  'other',
]

const PAYMENT_METHODS: ExpensePaymentMethod[] = ['cash', 'card', 'bank_transfer']

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fuel: 'Carburant',
  maintenance: 'Entretien',
  insurance: 'Assurance',
  rent: 'Loyer',
  salaries: 'Salaires',
  utilities: 'Charges',
  marketing: 'Marketing',
  office: 'Bureau',
  other: 'Autre',
}

const METHOD_LABELS: Record<ExpensePaymentMethod, string> = {
  cash: 'Espèces',
  card: 'Carte',
  bank_transfer: 'Virement bancaire',
}

export function createExpensesSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      receipt_path TEXT,
      notes TEXT,
      car_id INTEGER,
      created_at TEXT
    )
  `)
}

export function migrateExpensesTable(db: Database, helpers: DbHelpers) {
  createExpensesSchema(db)
  const info = db.exec('PRAGMA table_info(expenses)')
  const existing = new Set((info[0]?.values ?? []).map((row) => String(row[1])))
  if (!existing.has('car_id')) {
    helpers.run('ALTER TABLE expenses ADD COLUMN car_id INTEGER')
  }
  if (!existing.has('employee_id')) {
    helpers.run('ALTER TABLE expenses ADD COLUMN employee_id INTEGER')
  }
}

function normalizeInput(data: ExpenseInput) {
  const title = data.title?.trim() || ''
  if (!title) throw new Error('TITLE_REQUIRED')

  const amount = Number(data.amount)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('INVALID_AMOUNT')

  const category = CATEGORIES.includes(data.category as ExpenseCategory)
    ? (data.category as ExpenseCategory)
    : 'other'

  const payment_method = PAYMENT_METHODS.includes(data.payment_method as ExpensePaymentMethod)
    ? (data.payment_method as ExpensePaymentMethod)
    : 'cash'

  const rawCarId = data.car_id
  const car_id =
    rawCarId === null || rawCarId === undefined || rawCarId === ''
      ? null
      : Number(rawCarId)

  if (car_id !== null && (!Number.isFinite(car_id) || car_id <= 0)) {
    throw new Error('INVALID_CAR')
  }

  return {
    title,
    category,
    amount,
    expense_date: data.expense_date?.trim() || localYmd(),
    payment_method,
    receipt_path: data.receipt_path?.trim() || '',
    notes: data.notes?.trim() || '',
    car_id,
  }
}

function assertCarExists(helpers: DbHelpers, carId: number | null) {
  if (!carId) return
  const car = helpers.queryOne<{ id: number }>('SELECT id FROM cars WHERE id = ?', [carId])
  if (!car) throw new Error('CAR_NOT_FOUND')
}

const EXPENSE_SELECT = `
  SELECT e.*, ca.name as car_name, ca.plate_number as car_plate
  FROM expenses e
  LEFT JOIN cars ca ON ca.id = e.car_id
`

function buildExpenseWhere(filters?: ExpenseFilters) {
  const clauses: string[] = []
  const params: unknown[] = []

  if (filters?.q?.trim()) {
    clauses.push('(e.title LIKE ? OR e.notes LIKE ?)')
    const q = `%${filters.q.trim()}%`
    params.push(q, q)
  }
  if (filters?.category) {
    clauses.push('e.category = ?')
    params.push(filters.category)
  }
  if (filters?.car_id) {
    clauses.push('e.car_id = ?')
    params.push(Number(filters.car_id))
  }
  if (filters?.date_from) {
    clauses.push('e.expense_date >= ?')
    params.push(filters.date_from)
  }
  if (filters?.date_to) {
    clauses.push('e.expense_date <= ?')
    params.push(filters.date_to)
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return { where, params }
}

function finalizeReceiptPath(receiptPath: string, expenseId: number) {
  if (!receiptPath) return ''
  return moveToExpenseStorage(receiptPath, expenseId)
}

export function createExpensesApi(helpers: DbHelpers) {
  return {
    listExpenses(filters?: ExpenseFilters): ExpenseRecord[] {
      const { where, params } = buildExpenseWhere(filters)
      return helpers.queryAll<ExpenseRecord>(
        `${EXPENSE_SELECT} ${where} ORDER BY e.expense_date DESC, e.id DESC`,
        params,
      )
    },

    getExpense(id: number): ExpenseRecord | null {
      return helpers.queryOne<ExpenseRecord>(`${EXPENSE_SELECT} WHERE e.id = ?`, [id])
    },

    createExpense(data: ExpenseInput): ExpenseRecord {
      const normalized = normalizeInput(data)
      assertCarExists(helpers, normalized.car_id)
      const t = helpers.now()

      const id = helpers.runInsert(
        `INSERT INTO expenses (title, category, amount, expense_date, payment_method, receipt_path, notes, car_id, created_at)
         VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)`,
        [
          normalized.title,
          normalized.category,
          normalized.amount,
          normalized.expense_date,
          normalized.payment_method,
          normalized.notes,
          normalized.car_id,
          t,
        ],
      )

      const receipt_path = finalizeReceiptPath(normalized.receipt_path, id)
      if (receipt_path) {
        helpers.run('UPDATE expenses SET receipt_path = ? WHERE id = ?', [receipt_path, id])
      }

      const created = this.getExpense(id)
      if (!created) throw new Error('INSERT_FAILED')
      return created
    },

    updateExpense(id: number, data: ExpenseInput): ExpenseRecord {
      const existing = this.getExpense(id)
      if (!existing) throw new Error('EXPENSE_NOT_FOUND')

      const normalized = normalizeInput(data)
      assertCarExists(helpers, normalized.car_id)
      let receipt_path = existing.receipt_path

      if (normalized.receipt_path && normalized.receipt_path !== existing.receipt_path) {
        if (existing.receipt_path) deleteFileIfExists(existing.receipt_path)
        receipt_path = finalizeReceiptPath(normalized.receipt_path, id)
      } else if (!normalized.receipt_path && existing.receipt_path) {
        deleteFileIfExists(existing.receipt_path)
        receipt_path = ''
      }

      helpers.run(
        `UPDATE expenses SET title = ?, category = ?, amount = ?, expense_date = ?,
         payment_method = ?, receipt_path = ?, notes = ?, car_id = ? WHERE id = ?`,
        [
          normalized.title,
          normalized.category,
          normalized.amount,
          normalized.expense_date,
          normalized.payment_method,
          receipt_path,
          normalized.notes,
          normalized.car_id,
          id,
        ],
      )

      const updated = this.getExpense(id)
      if (!updated) throw new Error('EXPENSE_NOT_FOUND')
      helpers.run(
        `UPDATE car_vidanges SET cost = ?, performed_at = ?, notes = ?
         WHERE expense_id = ?`,
        [normalized.amount, normalized.expense_date, normalized.notes, id],
      )
      return updated
    },

    deleteExpense(id: number) {
      const existing = this.getExpense(id)
      if (!existing) throw new Error('EXPENSE_NOT_FOUND')

      if (existing.receipt_path) deleteFileIfExists(existing.receipt_path)
      deleteExpenseStorage(id)
      // Keep vidange ↔ expense link consistent when expense is removed from Dépenses tab.
      helpers.run('UPDATE car_vidanges SET expense_id = NULL WHERE expense_id = ?', [id])
      helpers.run('DELETE FROM expenses WHERE id = ?', [id])
      return { ok: true }
    },

    getExpenseStats(filters?: ExpenseFilters): ExpenseStats {
      const { where, params } = buildExpenseWhere(filters)
      const month = localYearMonth()

      const totals = helpers.queryOne<{ total: number; count: number }>(
        `SELECT COALESCE(SUM(e.amount), 0) as total, COUNT(*) as count
         FROM expenses e ${where}`,
        params,
      )

      const monthMatch = datePrefixEquals('e.expense_date', month)
      const monthClauses = where ? `${where} AND ${monthMatch}` : `WHERE ${monthMatch}`
      const monthParams = [...params, month]

      const monthTotals = helpers.queryOne<{ total: number; count: number }>(
        `SELECT COALESCE(SUM(e.amount), 0) as total, COUNT(*) as count
         FROM expenses e ${monthClauses}`,
        monthParams,
      )

      // The breakdown sits next to the filtered table, so it follows the filters, not the month.
      const by_category = helpers
        .queryAll<{ category: string; amount: number }>(
          `SELECT e.category, COALESCE(SUM(e.amount), 0) as amount
           FROM expenses e ${where}
           GROUP BY e.category ORDER BY amount DESC`,
          params,
        )
        .map((row) => ({ category: row.category, amount: row.amount }))

      return {
        month_total: monthTotals?.total ?? 0,
        month_count: monthTotals?.count ?? 0,
        total: totals?.total ?? 0,
        count: totals?.count ?? 0,
        by_category,
      }
    },
  }
}

export function exportExpensesRows(expenses: ExpenseRecord[]) {
  return expenses.map((expense) => ({
    Titre: expense.title,
    Catégorie: CATEGORY_LABELS[expense.category] ?? expense.category,
    Véhicule: expense.car_name ? `${expense.car_name} (${expense.car_plate ?? ''})` : 'Agence',
    Montant: expense.amount,
    Date: expense.expense_date,
    'Mode de paiement': METHOD_LABELS[expense.payment_method] ?? expense.payment_method,
    Notes: expense.notes,
    'Reçu': expense.receipt_path ? 'Oui' : 'Non',
    'Créé le': expense.created_at?.slice(0, 10) ?? '',
  }))
}
