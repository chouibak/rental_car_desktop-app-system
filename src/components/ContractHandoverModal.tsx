import { FormEvent, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ContractVehicleStateSection } from './ContractFormSections'
import { useLang } from '../context/LangContext'
import { useToast } from '../context/ToastContext'
import type { Car, Contract } from '../types'
import type { ContractDamage } from '../utils/contracts'
import { parseDamages } from '../utils/contracts'
import { mapAppError } from '../utils/errors'

export type HandoverMode = 'deliver' | 'departure-edit' | 'return' | 'return-edit'

type ContractHandoverFormProps = {
  open?: boolean
  mode: HandoverMode
  contract: Contract
  car: Car | null
  onClose?: () => void
  onSaved: () => void
  /** Render editable form in-page (no modal). */
  inline?: boolean
}

function toDatetimeLocal(value?: string) {
  if (!value) return new Date().toISOString().slice(0, 16)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 16)
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

function isMeaningfulDamage(row: ContractDamage) {
  return Boolean(
    row.note?.trim() ||
      row.photo ||
      row.video ||
      (Number.isFinite(Number(row.x)) && Number.isFinite(Number(row.y))) ||
      row.part?.trim(),
  )
}

function buildInitialForm(mode: HandoverMode, contract: Contract, car: Car | null) {
  const isReturn = mode === 'return' || mode === 'return-edit'
  const departureMileage = Number(contract.departure_mileage ?? car?.mileage ?? 0)
  const existingDamages = parseDamages(isReturn ? contract.return_damages : contract.departure_damages).filter(
    isMeaningfulDamage,
  )

  if (isReturn) {
    return {
      at: toDatetimeLocal(contract.return_at || contract.end_date || new Date().toISOString()),
      place: contract.return_place || contract.contract_city || '',
      mileage: Number(contract.return_mileage || car?.mileage || departureMileage || 0),
      fuel_level: contract.return_fuel_level || car?.fuel_level || contract.departure_fuel_level || '',
      notes: contract.return_notes || '',
      damages: existingDamages,
      extra_fees: '' as number | '',
      sketch: contract.return_sketch || '',
    }
  }

  return {
    at: toDatetimeLocal(contract.departure_at || contract.start_date || new Date().toISOString()),
    place: contract.departure_place || contract.contract_city || '',
    mileage: departureMileage,
    fuel_level: contract.departure_fuel_level || car?.fuel_level || '',
    notes: contract.departure_notes || '',
    damages: existingDamages,
    extra_fees: '' as number | '',
    sketch: contract.departure_sketch || '',
  }
}

export function ContractHandoverForm({
  open = true,
  mode,
  contract,
  car,
  onClose,
  onSaved,
  inline = false,
}: ContractHandoverFormProps) {
  const { t } = useLang()
  const { showSuccess } = useToast()
  const isReturn = mode === 'return' || mode === 'return-edit'
  const kind = isReturn ? 'return' : 'departure'

  const [form, setForm] = useState(() => buildInitialForm(mode, contract, car))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!inline && !open) return
    setError('')
    setForm(buildInitialForm(mode, contract, car))
  }, [
    open,
    mode,
    contract.id,
    car?.id,
    contract.updated_at,
    contract.departure_mileage,
    contract.return_mileage,
    contract.departure_fuel_level,
    contract.return_fuel_level,
    inline,
  ])

  const title = useMemo(() => {
    if (mode === 'deliver') return t.handoverDeliveryTitle
    if (mode === 'departure-edit') return t.handoverEditDeparture
    if (mode === 'return-edit') return t.handoverEditReturn
    return t.handoverReturnTitle
  }, [mode, t])

  const submitLabel = useMemo(() => {
    if (mode === 'deliver') return t.handoverConfirmDelivery
    if (mode === 'departure-edit') return t.handoverSaveDelivery
    if (mode === 'return-edit') return t.handoverSaveReturn
    return t.confirmReturn
  }, [mode, t])

  if (!inline && !open) return null

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!Number.isFinite(Number(form.mileage)) || Number(form.mileage) < 0) {
      setError(t.invalidMileage)
      return
    }

    const departureMileage = Number(contract.departure_mileage ?? 0)
    if (isReturn && Number(form.mileage) < departureMileage) {
      setError(t.returnMileageInvalid)
      return
    }

    const damages = form.damages.filter(isMeaningfulDamage)

    setSaving(true)
    try {
      if (mode === 'deliver') {
        await window.api.markContractDelivered(contract.id, {
          departure_at: new Date(form.at).toISOString(),
          departure_place: form.place.trim(),
          departure_mileage: Number(form.mileage),
          departure_fuel_level: form.fuel_level,
          departure_notes: form.notes.trim(),
          departure_damages: damages,
          departure_sketch: form.sketch || undefined,
        })
      } else if (mode === 'departure-edit') {
        await window.api.updateContract(contract.id, {
          departure_at: new Date(form.at).toISOString(),
          departure_place: form.place.trim(),
          departure_mileage: Number(form.mileage),
          departure_fuel_level: form.fuel_level,
          departure_notes: form.notes.trim(),
          departure_damages: damages,
          departure_sketch: form.sketch || undefined,
        })
      } else if (mode === 'return-edit') {
        await window.api.updateReturnHandover(contract.id, {
          return_at: new Date(form.at).toISOString(),
          return_place: form.place.trim(),
          return_mileage: Number(form.mileage),
          return_fuel_level: form.fuel_level,
          return_notes: form.notes.trim(),
          return_damages: damages,
          return_sketch: form.sketch || undefined,
        })
      } else {
        await window.api.closeContract(contract.id, {
          return_at: new Date(form.at).toISOString(),
          return_place: form.place.trim(),
          return_mileage: Number(form.mileage),
          return_fuel_level: form.fuel_level,
          return_notes: form.notes.trim(),
          return_damages: damages,
          return_extra_fees: Number(form.extra_fees) || 0,
          return_sketch: form.sketch || undefined,
        })
      }
      showSuccess(t.handoverSaveSuccess)
      onSaved()
      if (!inline) onClose?.()
    } catch (err) {
      const msg = String(err)
      if (msg.includes('RETURN_MILEAGE_INVALID')) setError(t.returnMileageInvalid)
      else if (msg.includes('INVALID_CONTRACT_STATUS')) setError(t.invalidContractStatus)
      else setError(mapAppError(err, t))
    } finally {
      setSaving(false)
    }
  }

  const formBody = (
    <form
      className={inline ? 'contract-handover-inline' : 'modal contract-handover-modal'}
      onSubmit={onSubmit}
    >
      {!inline ? (
        <header>
          <div>
            <strong>{title}</strong>
          </div>
        </header>
      ) : null}

      <div className={`form-grid handover-form-grid${inline ? ' is-admin' : ' panel-body handover-form-scroll'}`}>
        <div className="field">
          <label>{isReturn ? t.returnAt : t.departureAt}</label>
          <input
            className="input"
            type="datetime-local"
            required
            value={form.at}
            onChange={(e) => setForm({ ...form, at: e.target.value })}
          />
        </div>
        <div className="field">
          <label>{isReturn ? t.returnPlace : t.departurePlace}</label>
          <input
            className="input"
            value={form.place}
            onChange={(e) => setForm({ ...form, place: e.target.value })}
          />
        </div>
        <div className="field">
          <label>{isReturn ? t.returnMileage : t.departureMileage}</label>
          <input
            className="input"
            type="number"
            required
            min={isReturn ? Number(contract.departure_mileage ?? 0) : 0}
            value={form.mileage || ''}
            onChange={(e) => setForm({ ...form, mileage: Number(e.target.value) })}
          />
        </div>
        {mode === 'return' ? (
          <div className="field">
            <label>{t.extraFees}</label>
            <input
              className="input"
              type="number"
              min={0}
              step={0.01}
              placeholder="0"
              value={form.extra_fees}
              onChange={(e) =>
                setForm({
                  ...form,
                  extra_fees: e.target.value === '' ? '' : Number(e.target.value),
                })
              }
            />
          </div>
        ) : null}

        <div className="field full vehicle-state-panel">
          <ContractVehicleStateSection
            kind={kind}
            fuelLevel={form.fuel_level}
            notes={form.notes}
            damages={form.damages}
            sketch={form.sketch}
            onFuelChange={(fuel_level) => setForm({ ...form, fuel_level })}
            onNotesChange={(notes) => setForm({ ...form, notes })}
            onDamagesChange={(damages: ContractDamage[]) => setForm({ ...form, damages })}
            onSketchChange={(sketch) => setForm({ ...form, sketch })}
            t={t}
            compact={inline}
          />
        </div>
      </div>

      {error ? <p className="form-error handover-form-error">{error}</p> : null}

      <footer className={`form-actions form-actions--sticky${inline ? ' handover-inline-footer' : ''}`}>
        {!inline ? (
          <button type="button" className="btn secondary" onClick={onClose} disabled={saving}>
            {t.cancel}
          </button>
        ) : null}
        <button className="btn" type="submit" disabled={saving}>
          {saving ? t.loading : submitLabel}
        </button>
      </footer>
    </form>
  )

  if (inline) return formBody

  return createPortal(<div className="modal-backdrop">{formBody}</div>, document.body)
}

/** @deprecated Prefer ContractHandoverForm — kept as alias for existing imports. */
export const ContractHandoverModal = ContractHandoverForm
