import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { useLang } from '../context/LangContext'
import { fileBasename } from '../utils/file'
import type { Customer } from '../types'

type DocKey = 'cin' | 'passport' | 'license'

const DOC_FIELDS: { key: DocKey; labelKey: keyof import('../i18n').Dict; numberKey: keyof Customer }[] = [
  { key: 'cin', labelKey: 'cinDoc', numberKey: 'cin_number' },
  { key: 'passport', labelKey: 'passport', numberKey: 'passport_number' },
  { key: 'license', labelKey: 'licenseDoc', numberKey: 'license_number' },
]

const emptyForm = (): Partial<Customer> => ({
  name: '',
  phone: '',
  email: '',
  birth_date: '',
  birth_place: '',
  nationality: '',
  address: '',
  cin_number: '',
  cin_pdf_path: '',
  cin_issue_date: '',
  cin_expiry_date: '',
  passport_number: '',
  passport_pdf_path: '',
  passport_issue_date: '',
  passport_expiry_date: '',
  license_number: '',
  license_pdf_path: '',
  license_issue_date: '',
  license_expiry_date: '',
})

export default function CustomerFormPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const customerId = id ? Number(id) : undefined

  const [form, setForm] = useState(emptyForm())
  const [docFileNames, setDocFileNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isEdit || !customerId) return
    setLoading(true)
    window.api.getCustomer(customerId).then((customer) => {
      if (!customer) {
        navigate('/customers')
        return
      }
      setForm(customer)
      setDocFileNames({
        cin_pdf_path: fileBasename(customer.cin_pdf_path),
        passport_pdf_path: fileBasename(customer.passport_pdf_path),
        license_pdf_path: fileBasename(customer.license_pdf_path),
      })
      setLoading(false)
    })
  }, [isEdit, customerId, navigate])

  const docMeta = useMemo(
    () =>
      DOC_FIELDS.map((doc) => ({
        ...doc,
        pathKey: `${doc.key}_pdf_path` as keyof Customer,
        issueKey: `${doc.key}_issue_date` as keyof Customer,
        expiryKey: `${doc.key}_expiry_date` as keyof Customer,
      })),
    [],
  )

  const onAddDocument = async (docKey: DocKey) => {
    const picked = await window.api.pickCustomerDocument(customerId)
    if (!picked) return
    const pathKey = `${docKey}_pdf_path` as keyof Customer
    const oldPath = form[pathKey] as string
    if (oldPath && oldPath !== picked.path) await window.api.deleteCustomerFile(oldPath)

    const nextForm = { ...form, [pathKey]: picked.path }
    setForm(nextForm)
    setDocFileNames((names) => ({ ...names, [pathKey]: picked.name || fileBasename(picked.path) }))

    if (isEdit && customerId) {
      try {
        const updated = await window.api.updateCustomer(customerId, {
          ...nextForm,
          name: nextForm.name?.trim() || '',
        })
        setForm(updated)
        setDocFileNames({
          cin_pdf_path: fileBasename(updated.cin_pdf_path),
          passport_pdf_path: fileBasename(updated.passport_pdf_path),
          license_pdf_path: fileBasename(updated.license_pdf_path),
        })
      } catch {
        setError(t.cannotSaveDocument)
      }
    }
  }

  const onRemoveDocument = async (docKey: DocKey) => {
    const pathKey = `${docKey}_pdf_path` as keyof Customer
    const oldPath = form[pathKey] as string
    if (oldPath) await window.api.deleteCustomerFile(oldPath)
    const nextForm = { ...form, [pathKey]: '' }
    setForm(nextForm)
    setDocFileNames((names) => ({ ...names, [pathKey]: '' }))

    if (isEdit && customerId && oldPath) {
      try {
        await window.api.updateCustomer(customerId, {
          ...nextForm,
          name: nextForm.name?.trim() || '',
        })
      } catch {
        setError(t.cannotSaveDocument)
      }
    }
  }

  const onOpenDocument = async (filePath: string) => {
    try {
      await window.api.openCustomerFile(filePath)
    } catch {
      setError(t.cannotOpenDocument)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    const payload = { ...form, name: form.name?.trim() || '' }

    try {
      if (isEdit && customerId) await window.api.updateCustomer(customerId, payload)
      else await window.api.createCustomer(payload)
      navigate('/customers')
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="empty">{t.loading}</div>

  return (
    <div>
      <PageHeader title={isEdit ? t.editCustomer : t.newCustomer} subtitle={t.customersSubtitle}>
        <button className="btn secondary" onClick={() => navigate('/customers')}>
          {t.back}
        </button>
      </PageHeader>

      <form className="car-form" onSubmit={onSubmit}>
        <section className="form-section">
          <h3 className="section-title">{t.details}</h3>
          <div className="form-grid">
            <div className="field">
              <label>{t.name}</label>
              <input
                className="input"
                required
                value={form.name || ''}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>{t.phone}</label>
              <input
                className="input"
                value={form.phone || ''}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>{t.email}</label>
              <input
                className="input"
                type="email"
                value={form.email || ''}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>{t.birthDate}</label>
              <input
                className="input"
                type="date"
                value={form.birth_date || ''}
                onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>{t.birthPlace}</label>
              <input
                className="input"
                value={form.birth_place || ''}
                onChange={(e) => setForm((f) => ({ ...f, birth_place: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>{t.nationality}</label>
              <input
                className="input"
                value={form.nationality || ''}
                onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value }))}
              />
            </div>
            <div className="field full">
              <label>{t.address}</label>
              <input
                className="input"
                value={form.address || ''}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
          </div>
        </section>

        <section className="form-section">
          <h3 className="section-title">{t.documents}</h3>
          <div className="doc-list">
            {docMeta.map((doc) => {
              const path = form[doc.pathKey] as string
              const number = form[doc.numberKey] as string
              const issue = form[doc.issueKey] as string
              const expiry = form[doc.expiryKey] as string
              return (
                <div className="doc-row customer-doc-row" key={doc.key}>
                  <div className="doc-info">
                    <strong>{t[doc.labelKey]}</strong>
                    <input
                      className="input input-sm"
                      placeholder={t.documentNumber}
                      value={number || ''}
                      onChange={(e) => setForm((f) => ({ ...f, [doc.numberKey]: e.target.value }))}
                    />
                    {path ? (
                      <>
                        <span className="muted-text doc-file-name">{docFileNames[doc.pathKey] || fileBasename(path)}</span>
                        <button type="button" className="link-btn" onClick={() => onOpenDocument(path)}>
                          {t.viewDocument}
                        </button>
                      </>
                    ) : (
                      <span className="muted-text">{t.noData}</span>
                    )}
                  </div>
                  <div className="field doc-expiry-field">
                    <label>{t.issueDate}</label>
                    <input
                      className="input"
                      type="date"
                      value={issue || ''}
                      onChange={(e) => setForm((f) => ({ ...f, [doc.issueKey]: e.target.value }))}
                    />
                  </div>
                  <div className="field doc-expiry-field">
                    <label>{t.expiryDate}</label>
                    <input
                      className="input"
                      type="date"
                      value={expiry || ''}
                      onChange={(e) => setForm((f) => ({ ...f, [doc.expiryKey]: e.target.value }))}
                    />
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn secondary" onClick={() => onAddDocument(doc.key)}>
                      {path ? t.edit : t.addDocument}
                    </button>
                    {path && (
                      <button type="button" className="btn danger" onClick={() => onRemoveDocument(doc.key)}>
                        {t.delete}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {error && <div className="error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="btn secondary" onClick={() => navigate('/customers')}>
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
