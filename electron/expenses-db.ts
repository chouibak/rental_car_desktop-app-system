import type { Database } from 'sql.js'
import { deleteFileIfExists } from './storage'
import { deleteExpenseStorage, moveToExpenseStorage } from './expense-storage'

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
}

export type ExpenseFilters = {
  q?: string
  category?: ExpenseCategory | ''
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
      created_at TEXT
    )
  `)
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

  return {
    title,
    category,
    amount,
    expense_date: data.expense_date?.trim() || new Date().toISOString().slice(0, 10),
    payment_method,
    receipt_path: data.receipt_path?.trim() || '',
    notes: data.notes?.trim() || '',
  }
}

function finalizeReceiptPath(receiptPath: string, expenseId: number) {
  if (!receiptPath) return ''
  return moveToExpenseStorage(receiptPath, expenseId)
}

export function createExpensesApi(helpers: DbHelpers) {
  return {
    listExpenses(filters?: ExpenseFilters): ExpenseRecord[] {
      const clauses: string[] = []
      const params: unknown[] = []

      if (filters?.q?.trim()) {
        clauses.push('(title LIKE ? OR notes LIKE ?)')
        const q = `%${filters.q.trim()}%`
        params.push(q, q)
      }
      if (filters?.category) {
        clauses.push('category = ?')
        params.push(filters.category)
      }
      if (filters?.date_from) {
        clauses.push('expense_date >= ?')
        params.push(filters.date_from)
      }
      if (filters?.date_to) {
        clauses.push('expense_date <= ?')
        params.push(filters.date_to)
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      return helpers.queryAll<ExpenseRecord>(
        `SELECT * FROM expenses ${where} ORDER BY expense_date DESC, id DESC`,
        params,
      )
    },

    getExpense(id: number): ExpenseRecord | null {
      return helpers.queryOne<ExpenseRecord>('SELECT * FROM expenses WHERE id = ?', [id])
    },

    createExpense(data: ExpenseInput): ExpenseRecord {
      const normalized = normalizeInput(data)
      const t = helpers.now()

      const id = helpers.runInsert(
        `INSERT INTO expenses (title, category, amount, expense_date, payment_method, receipt_path, notes, created_at)
         VALUES (?, ?, ?, ?, ?, '', ?, ?)`,
        [
          normalized.title,
          normalized.category,
          normalized.amount,
          normalized.expense_date,
          normalized.payment_method,
          normalized.notes,
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
         payment_method = ?, receipt_path = ?, notes = ? WHERE id = ?`,
        [
          normalized.title,
          normalized.category,
          normalized.amount,
          normalized.expense_date,
          normalized.payment_method,
          receipt_path,
          normalized.notes,
          id,
        ],
      )

      const updated = this.getExpense(id)
      if (!updated) throw new Error('EXPENSE_NOT_FOUND')
      return updated
    },

    deleteExpense(id: number) {
      const existing = this.getExpense(id)
      if (!existing) throw new Error('EXPENSE_NOT_FOUND')

      if (existing.receipt_path) deleteFileIfExists(existing.receipt_path)
      deleteExpenseStorage(id)
      helpers.run('DELETE FROM expenses WHERE id = ?', [id])
      return { ok: true }
    },

    getExpenseStats(filters?: ExpenseFilters): ExpenseStats {
      const clauses: string[] = []
      const params: unknown[] = []

      if (filters?.q?.trim()) {
        clauses.push('(title LIKE ? OR notes LIKE ?)')
        const q = `%${filters.q.trim()}%`
        params.push(q, q)
      }
      if (filters?.category) {
        clauses.push('category = ?')
        params.push(filters.category)
      }
      if (filters?.date_from) {
        clauses.push('expense_date >= ?')
        params.push(filters.date_from)
      }
      if (filters?.date_to) {
        clauses.push('expense_date <= ?')
        params.push(filters.date_to)
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      const month = new Date().toISOString().slice(0, 7)

      const totals = helpers.queryOne<{ total: number; count: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM expenses ${where}`,
        params,
      )

      const monthClauses = [...clauses, 'expense_date LIKE ?']
      const monthParams = [...params, `${month}%`]
      const monthWhere = monthClauses.length ? `WHERE ${monthClauses.join(' AND ')}` : ''

      const monthTotals = helpers.queryOne<{ total: number; count: number }>(
        `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count FROM expenses ${monthWhere}`,
        monthParams,
      )

      const by_category = helpers
        .queryAll<{ category: string; amount: number }>(
          `SELECT category, COALESCE(SUM(amount), 0) as amount
           FROM expenses ${monthWhere}
           GROUP BY category ORDER BY amount DESC`,
          monthParams,
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
    Montant: expense.amount,
    Date: expense.expense_date,
    'Mode de paiement': METHOD_LABELS[expense.payment_method] ?? expense.payment_method,
    Notes: expense.notes,
    'Reçu': expense.receipt_path ? 'Oui' : 'Non',
    'Créé le': expense.created_at?.slice(0, 10) ?? '',
  }))
}
