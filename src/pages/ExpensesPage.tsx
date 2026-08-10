import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconDownload, IconEdit, IconPlus, IconSearch, IconTrash } from '../components/icons'
import { HorizontalBreakdownChart, toCategoryRows } from '../components/RevenueCharts'
import { EmptyState, PageHeader, StatCard } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Dict } from '../i18n'
import type { Car, Expense, ExpenseCategory, ExpenseStats } from '../types'
import { formatDisplayDate } from '../utils/customer'

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

const CATEGORY_LABEL_KEYS: Record<ExpenseCategory, keyof Dict> = {
  fuel: 'expenseFuel',
  maintenance: 'expenseMaintenance',
  insurance: 'expenseInsurance',
  rent: 'expenseRent',
  salaries: 'expenseSalaries',
  utilities: 'expenseUtilities',
  marketing: 'expenseMarketing',
  office: 'expenseOffice',
  other: 'expenseOther',
}

const PAYMENT_METHOD_KEYS = {
  cash: 'cash',
  card: 'card',
  bank_transfer: 'bank_transfer',
} as const

export default function ExpensesPage() {
  const { t, money } = useLang()
  const navigate = useNavigate()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [stats, setStats] = useState<ExpenseStats | null>(null)
  const [cars, setCars] = useState<Car[]>([])
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<ExpenseCategory | ''>('')
  const [carId, setCarId] = useState<number | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const filters = useMemo(
    () => ({
      q: q || undefined,
      category: category || undefined,
      car_id: carId || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }),
    [q, category, carId, dateFrom, dateTo],
  )

  const load = async () => {
    const [list, expenseStats] = await Promise.all([
      window.api.listExpenses(filters),
      window.api.getExpenseStats(filters),
    ])
    setExpenses(list)
    setStats(expenseStats)
  }

  useEffect(() => {
    window.api.listCars().then(setCars)
  }, [])

  useEffect(() => {
    load()
  }, [q, category, carId, dateFrom, dateTo])

  const onDelete = async (id: number) => {
    if (!confirm(t.confirmDelete)) return
    try {
      await window.api.deleteExpense(id)
      await load()
    } catch {
      alert(t.cannotDeleteExpense)
    }
  }

  const onExport = async () => {
    const result = await window.api.exportExpensesExcel(filters)
    if (result.ok && result.filePath) {
      await window.api.openExpenseFile(result.filePath)
    }
  }

  const categoryLabel = (value: ExpenseCategory) => t[CATEGORY_LABEL_KEYS[value]]

  return (
    <div className="expenses-page">
      <PageHeader title={t.expenses} subtitle={t.expensesSubtitle}>
        <div className="toolbar-filters">
          <div className="search-field search-field-sm">
            <IconSearch size={15} />
            <input
              className="input input-sm"
              placeholder={t.search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className="select select-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value as ExpenseCategory | '')}
          >
            <option value="">{t.expenseCategory}</option>
            {CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {categoryLabel(item)}
              </option>
            ))}
          </select>
          <select
            className="select select-sm"
            value={carId}
            onChange={(e) => setCarId(e.target.value ? Number(e.target.value) : '')}
            title={t.filterByVehicle}
          >
            <option value="">{t.filterByVehicle}</option>
            {cars.map((car) => (
              <option key={car.id} value={car.id}>
                {car.name} — {car.plate_number}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input input-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title={t.dateFrom}
          />
          <input
            type="date"
            className="input input-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title={t.dateTo}
          />
        </div>
        <div className="toolbar-actions">
          <button className="btn secondary sm" onClick={onExport}>
            <IconDownload size={16} />
            {t.exportExcel}
          </button>
          <button className="btn sm" onClick={() => navigate('/expenses/new')}>
            <IconPlus size={16} />
            {t.addExpense}
          </button>
        </div>
      </PageHeader>

      {stats && (
        <div className="cards">
          <StatCard
            label={t.monthExpenses}
            value={money(stats.month_total)}
            hint={t.monthExpensesHint.replace('{count}', String(stats.month_count))}
          />
          <StatCard
            label={t.totalExpensesFiltered}
            value={money(stats.total)}
            hint={t.totalExpensesFilteredHint.replace('{count}', String(stats.count))}
          />
        </div>
      )}

      {stats && (
        <div className="panel revenue-panel">
          <div className="panel-header">
            <h3>{t.expensesByCategory}</h3>
          </div>
          <div className="panel-body">
            {stats.by_category.length === 0 ? (
              <EmptyState message={t.noData} />
            ) : (
              <HorizontalBreakdownChart
                rows={toCategoryRows(stats.by_category)}
                labelForKey={(key) => categoryLabel(key as ExpenseCategory)}
              />
            )}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.expenseTitle}</th>
                <th>{t.category}</th>
                <th>{t.expenseVehicle}</th>
                <th>{t.amount}</th>
                <th>{t.expenseDate}</th>
                <th>{t.paymentMethod}</th>
                <th>{t.receipt}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState message={t.noData} />
                  </td>
                </tr>
              )}
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td>
                    <strong>{expense.title}</strong>
                    {expense.notes ? <div className="muted text-sm">{expense.notes}</div> : null}
                  </td>
                  <td>{categoryLabel(expense.category)}</td>
                  <td>
                    {expense.car_id ? (
                      <Link className="link-btn" to={`/cars/${expense.car_id}`}>
                        {expense.car_name ?? `#${expense.car_id}`}
                        {expense.car_plate ? ` · ${expense.car_plate}` : ''}
                      </Link>
                    ) : (
                      <span className="muted-text">{t.expenseAgency}</span>
                    )}
                  </td>
                  <td>{money(expense.amount)}</td>
                  <td>{formatDisplayDate(expense.expense_date)}</td>
                  <td>{t[PAYMENT_METHOD_KEYS[expense.payment_method]]}</td>
                  <td>{expense.receipt_path ? t.hasReceipt : '—'}</td>
                  <td>
                    <div className="row-actions">
                      <Link
                        className="btn secondary sm icon-only"
                        to={`/expenses/${expense.id}/edit`}
                        title={t.edit}
                      >
                        <IconEdit size={15} />
                      </Link>
                      <button
                        className="btn danger sm icon-only"
                        title={t.delete}
                        onClick={() => onDelete(expense.id)}
                      >
                        <IconTrash size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
