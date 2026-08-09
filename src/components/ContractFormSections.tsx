import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { Dict } from '../i18n'
import type { ContractDamage } from '../utils/contracts'
import { DAMAGE_PARTS, DAMAGE_TYPES, FUEL_FRACTION, FUEL_LEVELS } from '../utils/contracts'

function DamagePhotoPreview({ path }: { path: string }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let active = true
    window.api.getCarFileUrl(path).then((resolved) => {
      if (active) setUrl(resolved)
    })
    return () => {
      active = false
    }
  }, [path])

  if (!url) return null
  return <img className="damage-preview" src={url} alt="" />
}

type ContractDamageRepeaterProps = {
  damages: ContractDamage[]
  kind: 'departure' | 'return'
  onChange: (damages: ContractDamage[]) => void
  t: Dict
}

export function ContractDamageRepeater({ damages, kind, onChange, t }: ContractDamageRepeaterProps) {
  const update = (index: number, patch: Partial<ContractDamage>) => {
    onChange(damages.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  const addRow = () => {
    onChange([...damages, { part: 'front', type: 'R', note: '' }])
  }

  const removeRow = (index: number) => {
    onChange(damages.filter((_, i) => i !== index))
  }

  const pickPhoto = async (index: number) => {
    try {
      const result = await window.api.pickContractDamagePhoto(kind)
      if (result) update(index, { photo: result.path })
    } catch {
      // ignore cancel
    }
  }

  return (
    <div className="damage-repeater">
      <div className="damage-add-wrap">
        <button type="button" className="btn secondary damage-add-btn" onClick={addRow}>
          {t.addDamageBtn}
        </button>
      </div>

      {damages.map((damage, index) => (
        <div className="damage-row panel panel-body" key={`${kind}-${index}`}>
          <div className="field">
            <label>{t.damagePart}</label>
            <select className="select" value={damage.part} onChange={(e) => update(index, { part: e.target.value })}>
              {DAMAGE_PARTS.map((part) => (
                <option key={part} value={part}>
                  {t[`part_${part}` as keyof Dict] || part}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t.damageType}</label>
            <select className="select" value={damage.type} onChange={(e) => update(index, { type: e.target.value })}>
              {DAMAGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t[`damage_${type}` as keyof Dict] || type}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t.damageNote}</label>
            <input className="input" value={damage.note} onChange={(e) => update(index, { note: e.target.value })} />
          </div>
          <div className="field damage-photo-field">
            <label>{t.photo}</label>
            <div className="damage-photo-actions">
              <button type="button" className="btn secondary btn-sm" onClick={() => pickPhoto(index)}>
                {t.addPhoto}
              </button>
              {damage.photo && <span className="muted-text">{t.photoAdded}</span>}
            </div>
            {damage.photo && <DamagePhotoPreview path={damage.photo} />}
          </div>
          <div className="field damage-remove-field">
            <button type="button" className="btn danger btn-sm" onClick={() => removeRow(index)}>
              {t.delete}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

type ContractVehicleStateSectionProps = {
  kind: 'departure' | 'return'
  fuelLevel: string
  notes: string
  damages: ContractDamage[]
  onFuelChange: (value: string) => void
  onNotesChange: (value: string) => void
  onDamagesChange: (damages: ContractDamage[]) => void
  t: Dict
}

export function ContractVehicleStateSection({
  kind,
  fuelLevel,
  notes,
  damages,
  onFuelChange,
  onNotesChange,
  onDamagesChange,
  t,
}: ContractVehicleStateSectionProps) {
  return (
    <div className="vehicle-state-body">
      <div className="vehicle-state-top">
        <div className="field">
          <label>{t.fuelLevel}</label>
          <select className="select" value={fuelLevel} onChange={(e) => onFuelChange(e.target.value)}>
            <option value="">{t.selectOption}</option>
            {FUEL_LEVELS.map((level) => (
              <option key={level} value={level}>
                {FUEL_FRACTION[level]} — {t[`fuel_${level}` as keyof Dict] || level}
              </option>
            ))}
          </select>
        </div>
        <div className="field vehicle-state-remarks">
          <label>{t.remarks}</label>
          <textarea className="textarea" rows={4} value={notes} onChange={(e) => onNotesChange(e.target.value)} />
        </div>
      </div>

      <div className="vehicle-state-damages">
        <label className="vehicle-state-damages-label">{t.observedDamages}</label>
        <ContractDamageRepeater kind={kind} damages={damages} onChange={onDamagesChange} t={t} />
      </div>
    </div>
  )
}

type DriverFieldsProps = {
  prefix: 'driver1' | 'driver2'
  form: Record<string, string | number | boolean | string[] | ContractDamage[]>
  setForm: Dispatch<SetStateAction<Record<string, unknown>>>
  t: Dict
  required?: boolean
  onCopyFromCustomer?: () => void
}

export function DriverFields({ prefix, form, setForm, t, required = false, onCopyFromCustomer }: DriverFieldsProps) {
  const field = (name: string) => `${prefix}_${name}`

  const setValue = (name: string, value: string) => {
    setForm((current) => ({ ...current, [field(name)]: value }))
  }

  return (
    <>
      {onCopyFromCustomer && (
        <div className="field full">
          <button type="button" className="btn secondary btn-sm" onClick={onCopyFromCustomer}>
            {t.copyFromCustomer}
          </button>
        </div>
      )}
      <div className="field">
        <label>{t.driverName}{required ? ' *' : ''}</label>
        <input
          className="input"
          required={required}
          value={String(form[field('name')] ?? '')}
          onChange={(e) => setValue('name', e.target.value)}
        />
      </div>
      <div className="field">
        <label>{t.phone}</label>
        <input className="input" value={String(form[field('phone')] ?? '')} onChange={(e) => setValue('phone', e.target.value)} />
      </div>
      <div className="field">
        <label>{t.birthDate}</label>
        <input className="input" type="date" value={String(form[field('birth_date')] ?? '')} onChange={(e) => setValue('birth_date', e.target.value)} />
      </div>
      <div className="field">
        <label>{t.birthPlace}</label>
        <input className="input" value={String(form[field('birth_place')] ?? '')} onChange={(e) => setValue('birth_place', e.target.value)} />
      </div>
      <div className="field">
        <label>{t.nationality}</label>
        <input className="input" value={String(form[field('nationality')] ?? '')} onChange={(e) => setValue('nationality', e.target.value)} />
      </div>
      <div className="field full">
        <label>{t.address}</label>
        <input className="input" value={String(form[field('address')] ?? '')} onChange={(e) => setValue('address', e.target.value)} />
      </div>
      <div className="field">
        <label>{t.cin}</label>
        <input className="input" value={String(form[field('cin_number')] ?? '')} onChange={(e) => setValue('cin_number', e.target.value)} />
      </div>
      <div className="field">
        <label>{t.cinIssuedAt}</label>
        <input className="input" type="date" value={String(form[field('cin_issued_at')] ?? '')} onChange={(e) => setValue('cin_issued_at', e.target.value)} />
      </div>
      <div className="field">
        <label>{t.cinExpiresAt}</label>
        <input className="input" type="date" value={String(form[field('cin_expires_at')] ?? '')} onChange={(e) => setValue('cin_expires_at', e.target.value)} />
      </div>
      <div className="field">
        <label>{t.passportNumber}</label>
        <input className="input" value={String(form[field('passport_number')] ?? '')} onChange={(e) => setValue('passport_number', e.target.value)} />
      </div>
      <div className="field">
        <label>{t.passportIssuedAt}</label>
        <input className="input" type="date" value={String(form[field('passport_issued_at')] ?? '')} onChange={(e) => setValue('passport_issued_at', e.target.value)} />
      </div>
      <div className="field">
        <label>{t.passportExpiresAt}</label>
        <input className="input" type="date" value={String(form[field('passport_expires_at')] ?? '')} onChange={(e) => setValue('passport_expires_at', e.target.value)} />
      </div>
      <div className="field">
        <label>{t.license}</label>
        <input className="input" value={String(form[field('license_number')] ?? '')} onChange={(e) => setValue('license_number', e.target.value)} />
      </div>
      <div className="field">
        <label>{t.licenseIssuedAt}</label>
        <input className="input" type="date" value={String(form[field('license_issued_at')] ?? '')} onChange={(e) => setValue('license_issued_at', e.target.value)} />
      </div>
      <div className="field">
        <label>{t.licenseExpiresAt}</label>
        <input className="input" type="date" value={String(form[field('license_expires_at')] ?? '')} onChange={(e) => setValue('license_expires_at', e.target.value)} />
      </div>
    </>
  )
}
