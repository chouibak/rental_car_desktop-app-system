import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { useLang } from '../context/LangContext'
import { fileBasename } from '../utils/file'
import { mapAppError } from '../utils/errors'
import { FUEL_FRACTION, FUEL_LEVELS } from '../utils/contracts'
import type { Car, CarCategory, CarComputedStatus, CarFuel, CarImage, CarTransmission } from '../types'

const CATEGORIES: CarCategory[] = ['economique', 'compacte', 'suv', '4x4', 'monospace']
const TRANSMISSIONS: CarTransmission[] = ['manuelle', 'automatique']
const FUELS: CarFuel[] = ['Essence', 'Diesel', 'Hybride', 'Électrique']
const STATUSES: CarComputedStatus[] = ['disponible', 'louee', 'hors_service']

type DocKey =
  | 'doc_assurance'
  | 'doc_controle_technique'
  | 'doc_vignette'
  | 'doc_autorisation'

const DOC_FIELDS: { key: DocKey; labelKey: keyof import('../i18n').Dict; hasExpiry: boolean }[] = [
  { key: 'doc_assurance', labelKey: 'assurance', hasExpiry: true },
  { key: 'doc_controle_technique', labelKey: 'controleTechnique', hasExpiry: true },
  { key: 'doc_vignette', labelKey: 'vignette', hasExpiry: true },
  { key: 'doc_autorisation', labelKey: 'autorisation', hasExpiry: true },
]

const CARTE_GRISE_PATHS = ['doc_carte_grise_path', 'doc_carte_grise_path_2'] as const
const CARTE_GRISE_LABELS: (keyof import('../i18n').Dict)[] = ['carteGriseDoc1', 'carteGriseDoc2']

const emptyForm = (): Partial<Car> & { images: CarImage[] } => ({
  name: '',
  brand: '',
  model: '',
  plate_number: '',
  year: new Date().getFullYear(),
  color: '',
  category: 'compacte',
  price_per_day: 0,
  transmission: 'manuelle',
  seats: 5,
  fuel: 'Essence',
  bags: 2,
  badge: '',
  status: 'disponible',
  is_available: true,
  mileage: 0,
  fuel_level: 'plein',
  condition_notes: '',
  vidange_interval_km: 10000,
  vidange_interval_months: 6,
  vidange_last_date: '',
  vidange_last_mileage: 0,
  doc_carte_grise_path: '',
  doc_carte_grise_path_2: '',
  doc_carte_grise_expiry: '',
  doc_assurance_path: '',
  doc_assurance_expiry: '',
  doc_controle_technique_path: '',
  doc_controle_technique_expiry: '',
  doc_vignette_path: '',
  doc_vignette_expiry: '',
  doc_autorisation_path: '',
  doc_autorisation_expiry: '',
  images: [],
})

export default function CarFormPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = Boolean(id)
  const carId = id ? Number(id) : undefined

  const [form, setForm] = useState(emptyForm())
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [docFileNames, setDocFileNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isEdit || !carId) return
    setLoading(true)
    window.api.getCar(carId).then(async (car) => {
      if (!car) {
        navigate('/cars')
        return
      }
      setForm({
        ...car,
        status: car.status ?? car.computed_status ?? 'disponible',
        is_available: Boolean(car.is_available),
        images: car.images ?? [],
      })

      const pUrls: Record<string, string> = {}
      for (const img of car.images ?? []) {
        pUrls[img.path] = await window.api.getCarFileUrl(img.path)
      }
      setPhotoUrls(pUrls)
      setDocFileNames({
        doc_carte_grise_path: fileBasename(car.doc_carte_grise_path),
        doc_carte_grise_path_2: fileBasename(car.doc_carte_grise_path_2),
        doc_assurance_path: fileBasename(car.doc_assurance_path),
        doc_controle_technique_path: fileBasename(car.doc_controle_technique_path),
        doc_vignette_path: fileBasename(car.doc_vignette_path),
        doc_autorisation_path: fileBasename(car.doc_autorisation_path),
      })
    })
      .catch(() => setError(t.loadFailed))
      .finally(() => setLoading(false))
  }, [isEdit, carId, navigate, t])

  const docMeta = useMemo(
    () =>
      DOC_FIELDS.map((doc) => ({
        ...doc,
        pathKey: `${doc.key}_path` as keyof Car,
        expiryKey: `${doc.key}_expiry` as keyof Car,
      })),
    [],
  )

  const syncName = <T extends Partial<Car>>(next: T): T => {
    if (!next.name && next.brand && next.model) {
      next.name = `${next.brand} ${next.model}`.trim()
    }
    return next
  }

  const buildPayload = (next: Partial<Car> & { images: CarImage[] }) =>
    syncName({
      ...next,
      // Carte grise has no expiry in Morocco workflow — never persist one.
      doc_carte_grise_expiry: '',
      name: next.name || `${next.brand} ${next.model}`.trim(),
      status: (next.status ?? 'disponible') as CarComputedStatus,
      images: (next.images ?? []).map((img, index) => ({ path: img.path, position: index })),
    })

  const refreshPhotoUrls = async (images: CarImage[]) => {
    const pUrls: Record<string, string> = {}
    for (const img of images) {
      pUrls[img.path] = await window.api.getCarFileUrl(img.path)
    }
    setPhotoUrls(pUrls)
  }

  /** Saves an edited car right away; returns false when the car was left untouched. */
  const persistIfEdit = async (nextForm: Partial<Car> & { images: CarImage[] }) => {
    if (!isEdit || !carId) return false
    try {
      const updated = await window.api.updateCar(carId, buildPayload(nextForm))
      const images = updated.images ?? []
      setForm({ ...updated, images })
      await refreshPhotoUrls(images)
      setDocFileNames({
        doc_carte_grise_path: fileBasename(updated.doc_carte_grise_path),
        doc_carte_grise_path_2: fileBasename(updated.doc_carte_grise_path_2),
        doc_assurance_path: fileBasename(updated.doc_assurance_path),
        doc_controle_technique_path: fileBasename(updated.doc_controle_technique_path),
        doc_vignette_path: fileBasename(updated.doc_vignette_path),
        doc_autorisation_path: fileBasename(updated.doc_autorisation_path),
      })
      return true
    } catch (err) {
      setError(mapAppError(err, t))
      return false
    }
  }

  const onAddPhoto = async () => {
    try {
      const picked = await window.api.pickCarPhotos(carId)
      if (!picked.length) return

      const current = form.images ?? []
      const nextImages = [
        ...current,
        ...picked.map((photo, index) => ({
          path: photo.path,
          position: current.length + index,
          url: photo.url,
        })),
      ]
      const nextForm = { ...form, images: nextImages }
      setForm(nextForm)

      setPhotoUrls((u) => {
        const next = { ...u }
        for (const photo of picked) next[photo.path] = photo.url
        return next
      })

      await persistIfEdit(nextForm)
    } catch (err) {
      const msg = String(err)
      setError(msg.includes('NOT_AN_IMAGE') ? t.notAnImage : mapAppError(err, t))
    }
  }

  const onRemovePhoto = async (path: string) => {
    const nextForm = {
      ...form,
      images: (form.images ?? []).filter((img) => img.path !== path),
    }
    setForm(nextForm)
    setPhotoUrls((u) => {
      const next = { ...u }
      delete next[path]
      return next
    })

    // On a saved car the update removes the file; otherwise drop the pending upload here.
    const persisted = await persistIfEdit(nextForm)
    if (!persisted && !isEdit) await window.api.deleteCarFile(path)
  }

  const onAddDocumentByPath = async (pathKey: typeof CARTE_GRISE_PATHS[number] | `${DocKey}_path`) => {
    const picked = await window.api.pickCarDocument(carId)
    if (!picked) return
    const oldPath = form[pathKey] as string
    if (!isEdit && oldPath && oldPath !== picked.path) await window.api.deleteCarFile(oldPath)

    const nextForm = { ...form, [pathKey]: picked.path }
    setForm(nextForm)
    setDocFileNames((names) => ({
      ...names,
      [pathKey]: picked.name || fileBasename(picked.path),
    }))
    await persistIfEdit(nextForm)
  }

  const onAddDocument = async (docKey: DocKey) => {
    await onAddDocumentByPath(`${docKey}_path` as `${DocKey}_path`)
  }

  const onOpenDocument = async (filePath: string) => {
    try {
      await window.api.openCarFile(filePath)
    } catch {
      setError(t.cannotOpenDocument)
    }
  }

  const onRemoveDocumentByPath = async (pathKey: typeof CARTE_GRISE_PATHS[number] | `${DocKey}_path`, expiryKey?: `${DocKey}_expiry`) => {
    const oldPath = form[pathKey] as string
    const nextForm = {
      ...form,
      [pathKey]: '',
      ...(expiryKey ? { [expiryKey]: '' } : {}),
    }
    setForm(nextForm)
    setDocFileNames((names) => ({ ...names, [pathKey]: '' }))
    const saved = !isEdit || (await persistIfEdit(nextForm))
    if (saved && oldPath && !isEdit) await window.api.deleteCarFile(oldPath)
  }

  const onRemoveDocument = async (docKey: DocKey) => {
    await onRemoveDocumentByPath(`${docKey}_path` as `${DocKey}_path`, `${docKey}_expiry`)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSaving(true)

    const payload = buildPayload(form)

    try {
      if (isEdit && carId) await window.api.updateCar(carId, payload)
      else await window.api.createCar(payload)
      navigate('/cars')
    } catch (err) {
      setError(mapAppError(err, t))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="empty">{t.loading}</div>

  return (
    <div>
      <PageHeader title={isEdit ? t.editCar : t.newCar}>
        <button className="btn secondary" onClick={() => navigate('/cars')}>
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
                value={form.name || ''}
                onChange={(e) => setForm((f) => syncName({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>{t.brand}</label>
              <input
                className="input"
                required
                value={form.brand || ''}
                onChange={(e) => setForm((f) => syncName({ ...f, brand: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>{t.model}</label>
              <input
                className="input"
                required
                value={form.model || ''}
                onChange={(e) => setForm((f) => syncName({ ...f, model: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>{t.plate}</label>
              <input
                className="input"
                required
                value={form.plate_number || ''}
                onChange={(e) => setForm((f) => ({ ...f, plate_number: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>{t.year}</label>
              <input
                className="input"
                type="number"
                value={form.year ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
              />
            </div>
            <div className="field">
              <label>{t.color}</label>
              <input
                className="input"
                value={form.color || ''}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>{t.category}</label>
              <select
                className="select"
                value={form.category || 'compacte'}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as CarCategory }))}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t.pricePerDay}</label>
              <input
                className="input"
                type="number"
                min={0}
                required
                value={form.price_per_day ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, price_per_day: Number(e.target.value) }))}
              />
            </div>
            <div className="field">
              <label>{t.transmission}</label>
              <select
                className="select"
                value={form.transmission || 'manuelle'}
                onChange={(e) => setForm((f) => ({ ...f, transmission: e.target.value as CarTransmission }))}
              >
                {TRANSMISSIONS.map((tr) => (
                  <option key={tr} value={tr}>
                    {t[tr]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t.seats}</label>
              <input
                className="input"
                type="number"
                min={1}
                value={form.seats ?? 5}
                onChange={(e) => setForm((f) => ({ ...f, seats: Number(e.target.value) }))}
              />
            </div>
            <div className="field">
              <label>{t.fuel}</label>
              <select
                className="select"
                value={form.fuel || 'Essence'}
                onChange={(e) => setForm((f) => ({ ...f, fuel: e.target.value as CarFuel }))}
              >
                {FUELS.map((fuel) => (
                  <option key={fuel} value={fuel}>
                    {t[fuel]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t.bags}</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.bags ?? 2}
                onChange={(e) => setForm((f) => ({ ...f, bags: Number(e.target.value) }))}
              />
            </div>
            <div className="field">
              <label>{t.mileage}</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.mileage ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, mileage: Number(e.target.value) }))}
              />
            </div>
            <div className="field">
              <label>{t.vidangeIntervalKm}</label>
              <input
                className="input"
                type="number"
                min={0}
                step={500}
                value={form.vidange_interval_km ?? 10000}
                onChange={(e) => setForm((f) => ({ ...f, vidange_interval_km: Number(e.target.value) }))}
              />
            </div>
            <div className="field">
              <label>{t.vidangeIntervalMonths}</label>
              <input
                className="input"
                type="number"
                min={0}
                value={form.vidange_interval_months ?? 6}
                onChange={(e) =>
                  setForm((f) => ({ ...f, vidange_interval_months: Number(e.target.value) }))
                }
              />
            </div>
            <div className="field">
              <label>{t.fuelLevel}</label>
              <select
                className="select"
                value={form.fuel_level || 'plein'}
                onChange={(e) => setForm((f) => ({ ...f, fuel_level: e.target.value }))}
              >
                {FUEL_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {FUEL_FRACTION[level]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t.badge}</label>
              <input
                className="input"
                value={form.badge || ''}
                onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>{t.status}</label>
              <select
                className="select"
                value={form.status ?? 'disponible'}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as CarComputedStatus,
                    is_available: e.target.value === 'disponible',
                  }))
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field full">
              <label>{t.conditionNotes}</label>
              <textarea
                className="textarea"
                value={form.condition_notes || ''}
                onChange={(e) => setForm((f) => ({ ...f, condition_notes: e.target.value }))}
              />
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="section-head">
            <div>
              <h3 className="section-title">{t.photos}</h3>
              <p className="muted-text">{t.addPhotosHint}</p>
            </div>
            <button type="button" className="btn secondary" onClick={onAddPhoto}>
              {t.addPhoto}
            </button>
          </div>
          <div className="photo-grid">
            {(form.images ?? []).length === 0 && <div className="empty-inline">{t.noData}</div>}
            {(form.images ?? []).map((img) => {
              const src = photoUrls[img.path] || img.url
              return (
                <div className="photo-card" key={img.path}>
                  {src ? (
                    <img src={src} alt="" />
                  ) : (
                    <div className="photo-card-placeholder">{t.loading}</div>
                  )}
                  <button type="button" className="btn danger" onClick={() => onRemovePhoto(img.path)}>
                    {t.delete}
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        <section className="form-section">
          <h3 className="section-title">{t.documents}</h3>
          <div className="doc-list">
            <div className="doc-row doc-row--group">
              <div className="doc-info">
                <strong>{t.carteGrise}</strong>
              </div>
              <div className="doc-expiry-field doc-expiry-field--none" />
              <div />
            </div>
            {CARTE_GRISE_PATHS.map((pathKey, index) => {
              const path = form[pathKey] as string
              return (
                <div className="doc-row doc-row--nested" key={pathKey}>
                  <div className="doc-info">
                    <strong>{t[CARTE_GRISE_LABELS[index]]}</strong>
                    {path ? (
                      <>
                        <span className="muted-text doc-file-name">{docFileNames[pathKey] || fileBasename(path)}</span>
                        <button type="button" className="link-btn" onClick={() => onOpenDocument(path)}>
                          {t.viewDocument}
                        </button>
                      </>
                    ) : (
                      <span className="muted-text">{t.noData}</span>
                    )}
                  </div>
                  <div className="doc-expiry-field doc-expiry-field--none" />
                  <div className="row-actions">
                    <button type="button" className="btn secondary" onClick={() => onAddDocumentByPath(pathKey)}>
                      {path ? t.edit : t.addDocument}
                    </button>
                    {path ? (
                      <button type="button" className="btn danger" onClick={() => onRemoveDocumentByPath(pathKey)}>
                        {t.delete}
                      </button>
                    ) : null}
                  </div>
                </div>
              )
            })}
            {docMeta.map((doc) => {
              const path = form[doc.pathKey] as string
              const expiry = form[doc.expiryKey] as string
              const hasExpiry = DOC_FIELDS.find((d) => d.key === doc.key)?.hasExpiry !== false
              return (
                <div className="doc-row" key={doc.key}>
                  <div className="doc-info">
                    <strong>{t[doc.labelKey]}</strong>
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
                  {hasExpiry ? (
                    <div className="field doc-expiry-field">
                      <label>{t.expiryDate}</label>
                      <input
                        className="input"
                        type="date"
                        value={expiry || ''}
                        onChange={(e) => setForm((f) => ({ ...f, [doc.expiryKey]: e.target.value }))}
                      />
                    </div>
                  ) : (
                    <div className="doc-expiry-field doc-expiry-field--none" />
                  )}
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

        <div className="form-actions form-actions--sticky car-form-actions">
          <button
            type="button"
            className="btn secondary"
            onClick={() => navigate(isEdit && carId ? `/cars/${carId}` : '/cars')}
            disabled={saving}
          >
            {t.cancel}
          </button>
          <button className="btn btn-register" type="submit" disabled={saving}>
            {saving ? t.loading : t.save}
          </button>
        </div>
      </form>
    </div>
  )
}
