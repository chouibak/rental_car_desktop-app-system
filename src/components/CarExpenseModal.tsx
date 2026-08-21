import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../context/LangContext'
import type { Dict } from '../i18n'
import type { Expense, ExpenseCategory, ExpensePaymentMethod } from '../types'
import { todayYmd } from '../utils/calendar'
import { mapAppError } from '../utils/errors'

const CAR_CATEGORIES: ExpenseCategory[] = ['fuel', 'maintenance', 'insurance', 'other']

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

type CarExpenseModalProps = {
  open: boolean
  carId: number
  carLabel: string
  expense?: Expense | null
  onClose: () => void
  onSaved: (expense: Expense) => void
}

const emptyForm = (): Partial<Expense> => ({
  title: '',
  category: 'maintenance',
  amount: 0,
  expense_date: todayYmd(),
  payment_method: 'cash',
  receipt_path: '',
  notes: '',
})

export function CarExpenseModal({ open, carId, carLabel, expense, onClose, onSaved }: CarExpenseModalProps) {
  const { t } = useLang()
  const isEdit = Boolean(expense?.id)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [receiptPreview, setReceiptPreview] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (expense) {
      setForm(expense)
      if (expense.receipt_path) {
        window.api.getExpenseFileUrl(expense.receipt_path).then(setReceiptPreview)
      } else {
        setReceiptPreview('')
      }
      return
    }
    setForm(emptyForm())
    setReceiptPreview('')
  }, [open, expense])

  if (!open) return null

  const onAddReceipt = async () => {
    const picked = await window.api.pickExpenseReceipt(expense?.id)
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

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.title?.trim()) {
      setError(t.titleRequired)
      return
    }

    if (!Number(form.amount) || Number(form.amount) <= 0) {
      setError(t.invalidAmount)
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
      car_id: carId,
    }

    try {
      const saved = isEdit && expense
        ? await window.api.updateExpense(expense.id, payload)
        : await window.api.createExpense(payload)
      onSaved(saved)
      onClose()
    } catch (err) {
      setError(mapAppError(err, t))
    } finally {
      setSaving(false)
    }
  }

  const isImageReceipt = receiptPreview.startsWith('data:image')

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal car-expense-modal" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <header className="car-expense-modal-header">
          <div>
            <strong>{isEdit ? t.editCarExpenseModal : t.addCarExpenseModal}</strong>
            <p className="car-expense-modal-sub">{carLabel}</p>
          </div>
          <button type="button" className="btn secondary sm icon-only" onClick={onClose} aria-label={t.cancel}>
            ×
          </button>
        </header>

        <div className="car-expense-modal-body">
          {error ? <div className="form-error">{error}</div> : null}

          <div className="field">
            <label>{t.expenseTitle} *</label>
            <input
              className="input"
              value={form.title || ''}
              onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
              autoFocus
              required
            />
          </div>

          <div className="form-grid">
            <div className="field">
              <label>{t.category}</label>
              <select
                className="select"
                value={form.category || 'maintenance'}
                onChange={(e) =>
                  setForm((current) => ({ ...current, category: e.target.value as ExpenseCategory }))
                }
              >
                {CAR_CATEGORIES.map((item) => (
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
          </div>

          <div className="field">
            <label>{t.notes}</label>
            <textarea
              className="input"
              rows={2}
              value={form.notes || ''}
              onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
            />
          </div>

          <div className="field">
            <label>{t.receipt}</label>
            {form.receipt_path ? (
              <div className="car-expense-receipt">
                {isImageReceipt ? (
                  <img src={receiptPreview} alt={t.receipt} className="car-expense-receipt-img" />
                ) : (
                  <span className="doc-name">{form.receipt_path.split(/[/\\]/).pop()}</span>
                )}
                <div className="row-actions">
                  <button type="button" className="btn secondary sm" onClick={onRemoveReceipt}>
                    {t.removeReceipt}
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn secondary sm" onClick={onAddReceipt}>
                {t.addReceipt}
              </button>
            )}
          </div>
        </div>

        <footer className="form-actions form-actions--sticky">
          <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
            {t.cancel}
          </button>
          <button type="submit" className="btn btn-register" disabled={saving}>
            {saving ? t.loading : t.save}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}
