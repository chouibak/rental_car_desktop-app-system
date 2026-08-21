import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Dict } from '../i18n'
import type { Expense, ExpenseCategory, ExpensePaymentMethod } from '../types'
import { todayYmd } from '../utils/calendar'
import { mapAppError } from '../utils/errors'

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

const emptyForm = (): Partial<Expense> => ({
  title: '',
  category: 'other',
  amount: 0,
  expense_date: todayYmd(),
  payment_method: 'cash',
  receipt_path: '',
  notes: '',
  car_id: null,
})

export default function ExpenseFormPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const expenseId = id ? Number(id) : undefined

  const [form, setForm] = useState(emptyForm())
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [receiptPreview, setReceiptPreview] = useState('')

  useEffect(() => {
    if (!isEdit || !expenseId) return
    setLoading(true)
    window.api.getExpense(expenseId).then(async (expense) => {
      if (!expense) {
        navigate('/expenses')
        return
      }
      setForm(expense)
      if (expense.receipt_path) {
        setReceiptPreview(await window.api.getExpenseFileUrl(expense.receipt_path))
      }
      setLoading(false)
    })
  }, [isEdit, expenseId, navigate])

  const onAddReceipt = async () => {
    const picked = await window.api.pickExpenseReceipt(expenseId)
    if (!picked) return
    const oldPath = form.receipt_path
    if (oldPath && oldPath !== picked.path) await window.api.deleteExpenseFile(oldPath)
    setForm((current) => ({ ...current, receipt_path: picked.path }))
    setReceiptPreview(picked.url || '')
  }

  const onRemoveReceipt = async () => {
    const oldPath = form.receipt_path
    if (oldPath) await window.api.deleteExpenseFile(oldPath)
    setForm((current) => ({ ...current, receipt_path: '' }))
    setReceiptPreview('')
  }

  const onOpenReceipt = async () => {
    if (!form.receipt_path) return
    try {
      await window.api.openExpenseFile(form.receipt_path)
    } catch {
      setError(t.cannotOpenDocument)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.title?.trim()) {
      setError(t.titleRequired)
      return
    }

    setSaving(true)
    const payload = {
      title: form.title.trim(),
      category: form.category,
      amount: Number(form.amount),
      expense_date: form.expense_date,
      payment_method: form.payment_method,
      receipt_path: form.receipt_path,
      notes: form.notes?.trim() || '',
      car_id: null,
    }

    try {
      if (isEdit && expenseId) await window.api.updateExpense(expenseId, payload)
      else await window.api.createExpense(payload)
      navigate('/expenses')
    } catch (err) {
      setError(mapAppError(err, t))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="empty">{t.loading}</div>

  const isImageReceipt = receiptPreview.startsWith('data:image')

  return (
    <div>
      <PageHeader title={isEdit ? t.editExpense : t.newExpense} subtitle={t.expensesSubtitle}>
        <button className="btn secondary" onClick={() => navigate('/expenses')}>
          {t.back}
        </button>
      </PageHeader>

      <form className="car-form" onSubmit={onSubmit}>
        {error ? <div className="form-error">{error}</div> : null}

        <section className="form-section">
          <h3 className="section-title">{t.details}</h3>
          <div className="form-grid">
            <div className="field full">
              <label>{t.expenseTitle} *</label>
              <input
                className="input"
                value={form.title || ''}
                onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                autoFocus
                required
              />
            </div>

            <div className="field">
              <label>{t.category}</label>
              <select
                className="select"
                value={form.category || 'other'}
                onChange={(e) =>
                  setForm((current) => ({ ...current, category: e.target.value as ExpenseCategory }))
                }
              >
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {t[CATEGORY_LABEL_KEYS[item]]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>{t.amount} *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={form.amount ?? ''}
                onChange={(e) => setForm((current) => ({ ...current, amount: Number(e.target.value) }))}
                required
              />
            </div>

            <div className="field">
              <label>{t.expenseDate}</label>
              <input
                type="date"
                className="input"
                value={form.expense_date || ''}
                onChange={(e) => setForm((current) => ({ ...current, expense_date: e.target.value }))}
              />
            </div>

            <div className="field">
              <label>{t.paymentMethod}</label>
              <select
                className="select"
                value={form.payment_method || 'cash'}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    payment_method: e.target.value as ExpensePaymentMethod,
                  }))
                }
              >
                {PAYMENT_METHODS.map((item) => (
                  <option key={item} value={item}>
                    {t[item]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field full">
              <label>{t.notes}</label>
              <textarea
                className="input"
                rows={3}
                value={form.notes || ''}
                onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
              />
            </div>

            <div className="field full">
              <label>{t.receipt}</label>
              <div className="doc-row">
                {form.receipt_path ? (
                  <div className="doc-preview">
                    {isImageReceipt ? (
                      <img src={receiptPreview} alt={t.receipt} className="car-thumb" />
                    ) : (
                      <span className="doc-name">{form.receipt_path.split(/[/\\]/).pop()}</span>
                    )}
                    <div className="row-actions">
                      <button type="button" className="btn secondary sm" onClick={onOpenReceipt}>
                        {t.openReceipt}
                      </button>
                      <button type="button" className="btn danger sm" onClick={onRemoveReceipt}>
                        {t.removeReceipt}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="btn secondary" onClick={onAddReceipt}>
                    {t.addReceipt}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="form-actions form-actions--sticky">
          <button type="button" className="btn secondary" onClick={() => navigate('/expenses')}>
            {t.cancel}
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? t.loading : t.save}
          </button>
        </div>
      </form>
    </div>
  )
}
