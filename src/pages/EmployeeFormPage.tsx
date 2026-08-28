import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { NationalitiesDatalist } from '../components/NationalitiesDatalist'
import { useLang } from '../context/LangContext'
import type { Dict } from '../i18n'
import type { Employee, EmployeeRole } from '../types'
import { mapAppError } from '../utils/errors'

const ROLES: EmployeeRole[] = ['manager', 'agent', 'mechanic', 'other']

const emptyForm = (): Partial<Employee> => ({
  name: '',
  phone: '',
  email: '',
  address: '',
  cin_number: '',
  birth_date: '',
  birth_place: '',
  nationality: '',
  role: 'agent',
  salary: 0,
  hire_date: '',
  is_active: true,
  notes: '',
})

export default function EmployeeFormPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const employeeId = id ? Number(id) : undefined

  const [form, setForm] = useState(emptyForm())
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isEdit || !employeeId) return
    setLoading(true)
    window.api
      .getEmployee(employeeId)
      .then((employee) => {
        if (!employee) {
          navigate('/employees')
          return
        }
        setForm({
          ...employee,
          is_active: employee.is_active === true || employee.is_active === 1,
        })
      })
      .catch(() => setError(t.loadFailed))
      .finally(() => setLoading(false))
  }, [isEdit, employeeId, navigate, t])

  const roleLabel = (role: EmployeeRole) => {
    const key = `employeeRole_${role}` as keyof Dict
    return (t[key] as string | undefined) ?? role
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload = {
        ...form,
        name: form.name?.trim() || '',
        is_active: Boolean(form.is_active),
        salary: Number(form.salary ?? 0),
      }
      if (isEdit && employeeId) {
        await window.api.updateEmployee(employeeId, payload)
        navigate(`/employees/${employeeId}`)
      } else {
        const created = await window.api.createEmployee(payload)
        navigate(`/employees/${created.id}`)
      }
    } catch (err) {
      setError(mapAppError(err, t))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="empty">{t.loading}</div>

  return (
    <div>
      <PageHeader title={isEdit ? t.editEmployee : t.newEmployee} subtitle={t.employeesSubtitle}>
        <button type="button" className="btn secondary" onClick={() => navigate('/employees')}>
          {t.cancel}
        </button>
      </PageHeader>

      <form className="car-form panel" onSubmit={onSubmit}>
        <div className="panel-body">
          <div className="form-section">
            <h3>{t.details}</h3>
            <div className="form-grid">
              <div className="field">
                <label>{t.fullName} *</label>
                <input
                  className="input"
                  value={form.name ?? ''}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="field">
                <label>{t.phone}</label>
                <input
                  className="input"
                  value={form.phone ?? ''}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="field">
                <label>{t.email}</label>
                <input
                  className="input"
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="field">
                <label>{t.cin}</label>
                <input
                  className="input"
                  value={form.cin_number ?? ''}
                  onChange={(e) => setForm({ ...form, cin_number: e.target.value })}
                />
              </div>
              <div className="field">
                <label>{t.birthDate}</label>
                <input
                  className="input"
                  type="date"
                  value={form.birth_date ?? ''}
                  onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
                />
              </div>
              <div className="field">
                <label>{t.birthPlace}</label>
                <input
                  className="input"
                  value={form.birth_place ?? ''}
                  onChange={(e) => setForm({ ...form, birth_place: e.target.value })}
                />
              </div>
              <div className="field">
                <label>{t.nationality}</label>
                <input
                  className="input"
                  list="employee-nationalities"
                  value={form.nationality ?? ''}
                  onChange={(e) => setForm({ ...form, nationality: e.target.value })}
                  placeholder="ex: Marocaine"
                />
                <NationalitiesDatalist id="employee-nationalities" />
              </div>
              <div className="field">
                <label>{t.address}</label>
                <input
                  className="input"
                  value={form.address ?? ''}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="field">
                <label>{t.employeeRole}</label>
                <select
                  className="select"
                  value={form.role ?? 'agent'}
                  onChange={(e) => setForm({ ...form, role: e.target.value as EmployeeRole })}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t.monthlySalary}</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.salary ?? 0}
                  onChange={(e) => setForm({ ...form, salary: Number(e.target.value) || 0 })}
                />
              </div>
              <div className="field">
                <label>{t.hireDate}</label>
                <input
                  className="input"
                  type="date"
                  value={form.hire_date ?? ''}
                  onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
                />
              </div>
              <div className="field">
                <label>{t.isActive}</label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={Boolean(form.is_active)}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  <span>{form.is_active ? t.isActive : t.inactive}</span>
                </label>
              </div>
              <div className="field full">
                <label>{t.notes}</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={form.notes ?? ''}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
              {error ? <p className="field full settings-error">{error}</p> : null}
            </div>
          </div>
        </div>
        <div className="form-actions form-actions--sticky">
          <button type="button" className="btn secondary" onClick={() => navigate('/employees')}>
            {t.cancel}
          </button>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? t.loading : t.save}
          </button>
        </div>
      </form>
    </div>
  )
}
