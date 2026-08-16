import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { useLang } from '../context/LangContext'
import { fileBasename } from '../utils/file'
import { mapAppError } from '../utils/errors'
import type { Chauffeur } from '../types'

type DocKey = 'cin' | 'passport' | 'license'

const DOC_FIELDS: { key: DocKey; labelKey: keyof import('../i18n').Dict; numberKey: keyof Chauffeur }[] = [
  { key: 'cin', labelKey: 'cinDoc', numberKey: 'cin_number' },
  { key: 'passport', labelKey: 'passport', numberKey: 'passport_number' },
  { key: 'license', labelKey: 'licenseDoc', numberKey: 'license_number' },
]

const emptyForm = (): Partial<Chauffeur> => ({
  name: '',
  phone: '',
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
  is_active: true,
  notes: '',
})

export default function ChauffeurFormPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const chauffeurId = id ? Number(id) : undefined

  const [form, setForm] = useState(emptyForm())
  const [docFileNames, setDocFileNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isEdit || !chauffeurId) return
    setLoading(true)
    window.api.getChauffeur(chauffeurId).then((chauffeur) => {
      if (!chauffeur) {
        navigate('/chauffeurs')
        return
      }
      setForm({
        ...chauffeur,
        is_active: chauffeur.is_active === true || chauffeur.is_active === 1,
      })
      setDocFileNames({
        cin_pdf_path: fileBasename(chauffeur.cin_pdf_path),
        passport_pdf_path: fileBasename(chauffeur.passport_pdf_path),
        license_pdf_path: fileBasename(chauffeur.license_pdf_path),
      })
    })
      .catch(() => setError(t.loadFailed))
      .finally(() => setLoading(false))
  }, [isEdit, chauffeurId, navigate, t])

  const docMeta = useMemo(
    () =>
      DOC_FIELDS.map((doc) => ({
        ...doc,
        pathKey: `${doc.key}_pdf_path` as keyof Chauffeur,
        issueKey: `${doc.key}_issue_date` as keyof Chauffeur,
        expiryKey: `${doc.key}_expiry_date` as keyof Chauffeur,
      })),
    [],
  )

  const onAddDocument = async (docKey: DocKey) => {
    const picked = await window.api.pickChauffeurDocument(chauffeurId)
    if (!picked) return
    const pathKey = `${docKey}_pdf_path` as keyof Chauffeur
    const oldPath = form[pathKey] as string
    // On a saved chauffeur the main process removes the replaced file once the row is updated.
    if (!isEdit && oldPath && oldPath !== picked.path) await window.api.deleteChauffeurFile(oldPath)

    const nextForm = { ...form, [pathKey]: picked.path }
    setForm(nextForm)
    setDocFileNames((names) => ({ ...names, [pathKey]: picked.name || fileBasename(picked.path) }))

    if (isEdit && chauffeurId) {
      try {
        const updated = await window.api.updateChauffeur(chauffeurId, {
          ...nextForm,
          name: nextForm.name?.trim() || '',
          is_active: Boolean(nextForm.is_active),
        })
        setForm({
          ...updated,
          is_active: updated.is_active === true || updated.is_active === 1,
        })
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
    const pathKey = `${docKey}_pdf_path` as keyof Chauffeur
    const oldPath = form[pathKey] as string
    const previousForm = form
    const nextForm = { ...form, [pathKey]: '' }
    setForm(nextForm)
    setDocFileNames((names) => ({ ...names, [pathKey]: '' }))

    if (isEdit && chauffeurId && oldPath) {
      // Delete the file only through the update, so a failed save keeps the document.
      try {
        await window.api.updateChauffeur(chauffeurId, {
          ...nextForm,
          name: nextForm.name?.trim() || '',
          is_active: Boolean(nextForm.is_active),
        })
      } catch {
        setForm(previousForm)
        setDocFileNames((names) => ({ ...names, [pathKey]: fileBasename(oldPath) }))
        setError(t.cannotSaveDocument)
      }
      return
    }

    if (oldPath) await window.api.deleteChauffeurFile(oldPath)
  }

  const onOpenDocument = async (filePath: string) => {
    try {
      await window.api.openChauffeurFile(filePath)
    } catch {
      setError(t.cannotOpenDocument)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    const payload = {
      ...form,
      name: form.name?.trim() || '',
      is_active: Boolean(form.is_active),
    }

    try {
      if (isEdit && chauffeurId) await window.api.updateChauffeur(chauffeurId, payload)
      else await window.api.createChauffeur(payload)
      navigate('/chauffeurs')
    } catch (err) {
      setError(mapAppError(err, t))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="empty">{t.loading}</div>

  return (
    <div>
      <PageHeader title={isEdit ? t.editChauffeur : t.newChauffeur} subtitle={t.chauffeursSubtitle}>
        <button className="btn secondary" onClick={() => navigate('/chauffeurs')}>
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
            <div className="field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(form.is_active)}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                {t.isActive}
              </label>
            </div>
            <div className="field full">
              <label>{t.address}</label>
              <input
                className="input"
                value={form.address || ''}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="field full">
              <label>{t.notes}</label>
              <textarea
                className="input"
                rows={3}
                value={form.notes || ''}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
          <button type="button" className="btn secondary" onClick={() => navigate('/chauffeurs')}>
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
