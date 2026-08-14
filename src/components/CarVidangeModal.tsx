import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLang } from '../context/LangContext'
import type { CarVidange } from '../types'

type CarVidangeModalProps = {
  open: boolean
  carId: number
  carLabel: string
  currentMileage: number
  vidange?: CarVidange | null
  onClose: () => void
  onSaved: () => void
}

const emptyForm = (mileage: number) => ({
  performed_at: new Date().toISOString().slice(0, 10),
  mileage,
  cost: '',
  notes: '',
})

export function CarVidangeModal({
  open,
  carId,
  carLabel,
  currentMileage,
  vidange,
  onClose,
  onSaved,
}: CarVidangeModalProps) {
  const { t } = useLang()
  const isEdit = Boolean(vidange?.id)
  const [form, setForm] = useState(emptyForm(currentMileage))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    if (vidange) {
      setForm({
        performed_at: vidange.performed_at.slice(0, 10),
        mileage: vidange.mileage,
        cost: vidange.cost > 0 ? String(vidange.cost) : '',
        notes: vidange.notes || '',
      })
      return
    }
    setForm(emptyForm(currentMileage))
  }, [open, vidange, currentMileage])

  if (!open) return null

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.performed_at) {
      setError(t.invalidVidangeDate)
      return
    }
    if (!Number.isFinite(Number(form.mileage)) || Number(form.mileage) < 0) {
      setError(t.invalidVidangeMileage)
      return
    }
    const cost = Number(form.cost)
    if (!Number.isFinite(cost) || cost <= 0) {
      setError(t.invalidVidangeCost)
      return
    }

    setSaving(true)
    try {
      if (isEdit && vidange) {
        await window.api.updateVidange(vidange.id, {
          performed_at: form.performed_at,
          mileage: Number(form.mileage),
          cost,
          notes: form.notes.trim(),
        })
      } else {
        // Always create the matching car maintenance expense.
        await window.api.createVidange({
          car_id: carId,
          performed_at: form.performed_at,
          mileage: Number(form.mileage),
          cost,
          notes: form.notes.trim(),
          create_expense: true,
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      const msg = String(err)
      if (msg.includes('INVALID_VIDANGE_DATE')) setError(t.invalidVidangeDate)
      else if (msg.includes('INVALID_VIDANGE_MILEAGE')) setError(t.invalidVidangeMileage)
      else if (msg.includes('INVALID_VIDANGE_COST')) setError(t.invalidVidangeCost)
      else setError(t.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal car-expense-modal" onSubmit={onSubmit} onClick={(e) => e.stopPropagation()}>
        <header className="car-expense-modal-header">
          <div>
            <strong>{isEdit ? t.editVidange : t.recordVidange}</strong>
            <p className="car-expense-modal-sub">{carLabel}</p>
          </div>
          <button type="button" className="btn secondary sm icon-only" onClick={onClose} aria-label={t.cancel}>
            ×
          </button>
        </header>

        <div className="car-expense-modal-body">
          {error ? <div className="form-error">{error}</div> : null}

          <div className="form-grid form-grid-2">
            <div className="field">
              <label>{t.vidangeDate} *</label>
              <input
                type="date"
                className="input"
                value={form.performed_at}
                onChange={(e) => setForm((f) => ({ ...f, performed_at: e.target.value }))}
                required
                autoFocus
              />
            </div>

            <div className="field">
              <label>{t.mileageAtVidange} *</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form.mileage}
                onChange={(e) => setForm((f) => ({ ...f, mileage: Number(e.target.value) }))}
                required
              />
            </div>

            <div className="field">
              <label>{t.vidangeCost} *</label>
              <input
                type="number"
                min={0.01}
                step="0.01"
                className="input"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                required
                placeholder="0"
              />
            </div>
          </div>

          <div className="field">
            <label>{t.notes}</label>
            <textarea
              className="input"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>

          <p className="muted-text">{t.vidangeExpenseAutoHint}</p>
        </div>

        <footer className="form-actions">
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
