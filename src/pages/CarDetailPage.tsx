import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CarDocCard } from '../components/CarDocCard'
import { CarExpenseModal } from '../components/CarExpenseModal'
import { CarVidangeModal } from '../components/CarVidangeModal'
import {
  IconCar,
  IconChevronLeft,
  IconEdit,
  IconEye,
  IconFile,
  IconPlus,
  IconReceipt,
  IconTrash,
  IconWallet,
} from '../components/icons'
import { EmptyState, PageHeader, StatCard } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Dict } from '../i18n'
import { FUEL_FRACTION, formatContractDatetime } from '../utils/contracts'
import { formatDisplayDate } from '../utils/customer'
import { getDocExpiryInfo } from '../utils/docExpiry'
import { computeVidangeStatus, formatKm, formatVidangeBadgeLabel, getVidangeTrafficLevel } from '../utils/vidange'
import type { Car, CarComputedStatus, CarVidange, Expense, ExpenseCategory } from '../types'

const STATUSES: CarComputedStatus[] = ['disponible', 'louee', 'hors_service']

const DOC_FIELDS = [
  { pathKey: 'doc_carte_grise_path', expiryKey: 'doc_carte_grise_expiry', labelKey: 'carteGrise', hasExpiry: false },
  { pathKey: 'doc_assurance_path', expiryKey: 'doc_assurance_expiry', labelKey: 'assurance', hasExpiry: true },
  { pathKey: 'doc_controle_technique_path', expiryKey: 'doc_controle_technique_expiry', labelKey: 'controleTechnique', hasExpiry: true },
  { pathKey: 'doc_vignette_path', expiryKey: 'doc_vignette_expiry', labelKey: 'vignette', hasExpiry: true },
  { pathKey: 'doc_autorisation_path', expiryKey: 'doc_autorisation_expiry', labelKey: 'autorisation', hasExpiry: true },
] as const

const EXPENSE_CATEGORY_KEYS: Record<ExpenseCategory, keyof Dict> = {
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

type CarDetailTab = 'details' | 'photos' | 'documents' | 'vidange' | 'expenses'

const CAR_DETAIL_TABS: CarDetailTab[] = ['details', 'photos', 'documents', 'vidange', 'expenses']

function isCarDetailTab(value: string | null): value is CarDetailTab {
  return Boolean(value && CAR_DETAIL_TABS.includes(value as CarDetailTab))
}

export default function CarDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t, money } = useLang()
  const [car, setCar] = useState<Car | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [vidanges, setVidanges] = useState<CarVidange[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [activePhoto, setActivePhoto] = useState('')
  const tabFromUrl = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState<CarDetailTab>(
    isCarDetailTab(tabFromUrl) ? tabFromUrl : 'details',
  )
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [vidangeModalOpen, setVidangeModalOpen] = useState(false)
  const [editingVidange, setEditingVidange] = useState<CarVidange | null>(null)
  const [intervalKm, setIntervalKm] = useState(10000)
  const [intervalMonths, setIntervalMonths] = useState(6)
  const [savingInterval, setSavingInterval] = useState(false)

  const loadExpenses = useCallback(async (carId: number) => {
    const list = await window.api.listExpenses({ car_id: carId })
    setExpenses(list)
  }, [])

  const refreshCarVidangeData = useCallback(async (carId: number) => {
    const list = await window.api.listVidanges(carId)
    setVidanges(list)
    const data = await window.api.getCar(carId)
    if (data) setCar(data)
    await loadExpenses(carId)
  }, [loadExpenses])

  const loadVidanges = useCallback(async (carId: number) => {
    const list = await window.api.listVidanges(carId)
    setVidanges(list)
    const data = await window.api.getCar(carId)
    if (data) setCar(data)
  }, [])

  const reloadCar = useCallback(async (carId: number) => {
    const data = await window.api.getCar(carId)
    if (data) setCar(data)
  }, [])

  useEffect(() => {
    if (!id) return
    const carId = Number(id)
    window.api.getCar(carId).then(async (data) => {
      if (!data) {
        navigate('/cars')
        return
      }
      setCar(data)

      const photos: Record<string, string> = {}
      for (const img of data.images ?? []) {
        photos[img.path] = await window.api.getCarFileUrl(img.path)
      }
      setPhotoUrls(photos)

      const firstImage = data.images?.[0]?.path
      if (firstImage && photos[firstImage]) {
        setActivePhoto(firstImage)
      } else if (data.thumbnail) {
        const thumbUrl = await window.api.getCarFileUrl(data.thumbnail)
        setPhotoUrls((prev) => ({ ...prev, [data.thumbnail!]: thumbUrl }))
        setActivePhoto(data.thumbnail)
      }
    })

    loadExpenses(carId)
    loadVidanges(carId)
  }, [id, navigate, loadExpenses, loadVidanges])

  useEffect(() => {
    if (!car) return
    setIntervalKm(Number(car.vidange_interval_km ?? 10000) || 0)
    setIntervalMonths(Number(car.vidange_interval_months ?? 6) || 0)
  }, [car])

  useEffect(() => {
    const tab = searchParams.get('tab')
    setActiveTab(isCarDetailTab(tab) ? tab : 'details')
  }, [searchParams, id])

  const expenseTotal = useMemo(
    () => expenses.reduce((sum, item) => sum + item.amount, 0),
    [expenses],
  )

  const vidangeStatus = useMemo(() => {
    if (!car) return null
    const latest = vidanges[0]
    const lastDate = (car.vidange_last_date || latest?.performed_at || '').trim()
    const lastMileageRaw = Number(car.vidange_last_mileage ?? 0)
    const lastMileage =
      lastMileageRaw > 0 ? lastMileageRaw : Math.max(0, Number(latest?.mileage ?? 0) || 0)
    return computeVidangeStatus({
      ...car,
      vidange_interval_km: Number(car.vidange_interval_km ?? intervalKm) || 0,
      vidange_interval_months: Number(car.vidange_interval_months ?? intervalMonths) || 0,
      vidange_last_date: lastDate,
      vidange_last_mileage: lastMileage,
    })
  }, [car, vidanges, intervalKm, intervalMonths])
  const vidangeLevel = useMemo(
    () => (vidangeStatus ? getVidangeTrafficLevel(vidangeStatus) : 'ok'),
    [vidangeStatus],
  )
  const vidangeBadge = useMemo(() => {
    if (!vidangeStatus?.enabled) return ''
    return formatVidangeBadgeLabel(vidangeStatus, {
      neverDone: t.vidangeNeverDone,
      overdue: t.vidangeOverdue,
      dueSoon: t.vidangeDueSoon,
      ok: t.vidangeOk,
      kmOverdue: t.vidangeKmOverdue,
      kmRemaining: t.vidangeKmRemaining,
      dueByDate: t.vidangeDueByDate,
    })
  }, [vidangeStatus, t])

  const docsAlertCount = useMemo(() => {
    if (!car) return 0
    return DOC_FIELDS.reduce((count, doc) => {
      if (!doc.hasExpiry) return count
      const expiry = car[doc.expiryKey]
      if (!expiry?.trim()) return count
      const info = getDocExpiryInfo(expiry)
      if (!info) return count
      return info.severity === 'critical' || info.severity === 'high' ? count + 1 : count
    }, 0)
  }, [car])

  const vidangeStatusLabel =
    vidangeLevel === 'never'
      ? t.vidangeNeverDone
      : vidangeLevel === 'due'
        ? t.vidangeStatusDue
        : vidangeLevel === 'soon'
          ? t.vidangeStatusSoon
          : t.vidangeStatusOk

  const vidangeRemainingText = useMemo(() => {
    if (!vidangeStatus || vidangeStatus.never_done) return null
    if (vidangeStatus.km_remaining == null) return null
    const n = Math.abs(Math.round(vidangeStatus.km_remaining)).toLocaleString('fr-FR')
    if (vidangeStatus.km_remaining <= 0) return t.vidangeKmOverdue.replace('{n}', n)
    return t.vidangeKmRemaining.replace('{n}', n)
  }, [vidangeStatus, t])

  const vidangeNextText = useMemo(() => {
    if (!vidangeStatus?.enabled) return '—'
    if (vidangeStatus.never_done) return '—'

    const parts: string[] = []
    if (vidangeStatus.next_due_km != null) {
      parts.push(formatKm(vidangeStatus.next_due_km, t.kmUnit))
    }
    if (vidangeStatus.next_due_date) {
      parts.push(formatDisplayDate(vidangeStatus.next_due_date))
    }
    return parts.length ? parts.join(' · ') : '—'
  }, [vidangeStatus, t.kmUnit])

  const intervalDirty = useMemo(() => {
    if (!car) return false
    const savedKm = Math.max(0, Number(car.vidange_interval_km ?? 10000) || 0)
    const savedMonths = Math.max(0, Number(car.vidange_interval_months ?? 6) || 0)
    return (
      Math.max(0, Math.floor(Number(intervalKm) || 0)) !== savedKm ||
      Math.max(0, Math.floor(Number(intervalMonths) || 0)) !== savedMonths
    )
  }, [car, intervalKm, intervalMonths])

  const onSelectTab = (tab: CarDetailTab) => {
    setActiveTab(tab)
    if (!id) return
    navigate(`/cars/${id}?tab=${tab}`, { replace: true })
  }

  const onOpenDocument = async (filePath: string) => {
    try {
      await window.api.openCarFile(filePath)
    } catch {
      alert(t.cannotOpenDocument)
    }
  }

  const onStatusChange = async (status: CarComputedStatus) => {
    if (!car || status === (car.status ?? car.computed_status)) return
    try {
      const updated = await window.api.updateCarStatus(car.id, status)
      if (updated) setCar(updated)
    } catch {
      alert(t.statusUpdateFailed)
    }
  }

  const onDeleteExpense = async (expenseId: number) => {
    if (!confirm(t.confirmDelete)) return
    try {
      await window.api.deleteExpense(expenseId)
      setExpenses((current) => current.filter((item) => item.id !== expenseId))
      // Clear expense_id on linked vidanges in DB; refresh history so UI stays consistent.
      if (car) await loadVidanges(car.id)
    } catch {
      alert(t.cannotDeleteExpense)
    }
  }

  const openAddExpense = () => {
    setEditingExpense(null)
    setExpenseModalOpen(true)
  }

  const openEditExpense = (expense: Expense) => {
    setEditingExpense(expense)
    setExpenseModalOpen(true)
  }

  const closeExpenseModal = () => {
    setExpenseModalOpen(false)
    setEditingExpense(null)
  }

  const onExpenseSaved = (saved: Expense) => {
    setExpenses((current) => {
      const index = current.findIndex((item) => item.id === saved.id)
      if (index >= 0) {
        const next = [...current]
        next[index] = saved
        return next
      }
      return [saved, ...current]
    })
  }

  const onSaveVidangeInterval = async () => {
    if (!car) return
    const nextKm = Math.max(0, Math.floor(Number(intervalKm) || 0))
    const nextMonths = Math.max(0, Math.floor(Number(intervalMonths) || 0))
    setSavingInterval(true)
    try {
      await window.api.updateVidangeIntervals(car.id, nextKm, nextMonths)
      // Sequential: listVidanges syncs last_* then we reload car + expenses.
      await refreshCarVidangeData(car.id)
    } catch {
      alert(t.saveFailed)
    } finally {
      setSavingInterval(false)
    }
  }

  const openAddVidange = () => {
    setEditingVidange(null)
    setVidangeModalOpen(true)
  }

  const openEditVidange = (row: CarVidange) => {
    setEditingVidange(row)
    setVidangeModalOpen(true)
  }

  const closeVidangeModal = () => {
    setVidangeModalOpen(false)
    setEditingVidange(null)
  }

  const onVidangeSaved = async () => {
    if (!car) return
    await refreshCarVidangeData(car.id)
  }

  const onDeleteVidange = async (vidangeId: number) => {
    if (!confirm(t.confirmDelete)) return
    try {
      await window.api.deleteVidange(vidangeId)
      if (car) await refreshCarVidangeData(car.id)
    } catch {
      alert(t.saveFailed)
    }
  }

  const images = useMemo(() => car?.images ?? [], [car])
  const activeUrl = activePhoto ? photoUrls[activePhoto] : ''
  const carStatus = car?.status ?? car?.computed_status ?? 'disponible'

  if (!car) return <div className="empty">{t.loading}</div>

  const onDelete = async () => {
    if (!confirm(t.confirmDelete)) return
    try {
      await window.api.deleteCar(car.id)
      navigate('/cars')
    } catch {
      alert(t.cannotDeleteCar)
    }
  }

  const infoItems = [
    { label: t.brand, value: car.brand },
    { label: t.model, value: car.model },
    { label: t.plate, value: car.plate_number },
    { label: t.year, value: car.year ?? '—' },
    { label: t.color, value: car.color || '—' },
    { label: t.category, value: t[car.category as keyof typeof t] ?? car.category },
    { label: t.pricePerDay, value: money(car.price_per_day) },
    { label: t.transmission, value: t[car.transmission as keyof typeof t] ?? car.transmission },
    { label: t.seats, value: car.seats },
    { label: t.fuel, value: t[car.fuel as keyof typeof t] ?? car.fuel },
    { label: t.bags, value: car.bags },
    { label: t.mileage, value: car.mileage?.toLocaleString() ?? '0' },
    { label: t.fuelLevel, value: FUEL_FRACTION[car.fuel_level as keyof typeof FUEL_FRACTION] || car.fuel_level || '—' },
    { label: t.badge, value: car.badge || '—' },
    { label: t.status, value: t[carStatus as keyof typeof t] ?? carStatus },
  ]

  const tabs: Array<{
    id: CarDetailTab
    label: string
    icon: ReactNode
    badge?: string | number
    badgeTone?: 'muted' | 'warn' | 'danger' | 'ok'
  }> = [
    { id: 'details', label: t.details, icon: <IconCar size={16} /> },
    {
      id: 'photos',
      label: t.photos,
      icon: <IconEye size={16} />,
      badge: images.length || undefined,
      badgeTone: 'muted',
    },
    {
      id: 'documents',
      label: t.documents,
      icon: <IconFile size={16} />,
      badge: docsAlertCount || undefined,
      badgeTone: 'danger',
    },
    {
      id: 'vidange',
      label: t.vidange,
      icon: <IconReceipt size={16} />,
      badge:
        vidangeStatus?.enabled && (vidangeLevel === 'due' || vidangeLevel === 'soon')
          ? vidangeStatusLabel
          : undefined,
      badgeTone: vidangeLevel === 'due' ? 'danger' : 'warn',
    },
    {
      id: 'expenses',
      label: t.carExpenses,
      icon: <IconWallet size={16} />,
      badge: expenses.length || undefined,
      badgeTone: 'muted',
    },
  ]

  return (
    <div className="car-detail-page">
      <PageHeader title={car.name} subtitle={`${car.brand} ${car.model}`}>
        <div className="toolbar-nav">
          <Link className="btn btn-back" to="/cars">
            <IconChevronLeft size={16} />
            {t.back}
          </Link>
        </div>
        <div className="toolbar-manage">
          <Link className="btn btn-edit" to={`/cars/${car.id}/edit`}>
            <IconEdit size={16} />
            {t.edit}
          </Link>
          <button type="button" className="btn danger" onClick={onDelete}>
            <IconTrash size={15} />
            {t.delete}
          </button>
        </div>
      </PageHeader>

      <div className="car-detail-meta">
        <span className="plate-chip">{car.plate_number}</span>
        <select
          className="select select-sm status-select"
          value={carStatus}
          onChange={(e) => onStatusChange(e.target.value as CarComputedStatus)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t[s]}
            </option>
          ))}
        </select>
        {carStatus === 'louee' && car.return_date && (
          <span className="muted-text">
            {t.returnOn} {formatContractDatetime(car.return_date)}
          </span>
        )}
      </div>

      <nav className="car-detail-tabs" aria-label={t.details}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`car-detail-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onSelectTab(tab.id)}
          >
            <span className="car-detail-tab-icon" aria-hidden>
              {tab.icon}
            </span>
            <span className="car-detail-tab-label">{tab.label}</span>
            {tab.badge != null && tab.badge !== '' ? (
              <span
                className={`car-detail-tab-badge car-detail-tab-badge--${tab.badgeTone || 'muted'}`}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="car-detail-tab-panels">
        {activeTab === 'details' && (
          <div className="panel car-detail-panel">
            <div className="panel-header">
              <h3>{t.details}</h3>
            </div>
            <div className="panel-body">
              <div className="info-grid">
                {infoItems.map((item) => (
                  <div className="info-item" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>

              {car.condition_notes && (
                <div className="detail-notes">
                  <h4>{t.conditionNotes}</h4>
                  <p>{car.condition_notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'photos' && (
          <div className="panel car-detail-panel">
            <div className="panel-header">
              <div>
                <h3>{t.photos}</h3>
                <p className="panel-subtitle">
                  {images.length} {t.photos.toLowerCase()}
                </p>
              </div>
            </div>
            <div className="panel-body car-gallery-compact">
              <div className="car-gallery-main">
                {activeUrl ? (
                  <img src={activeUrl} alt={car.name} className="car-gallery-image" />
                ) : (
                  <div className="car-gallery-empty">{t.noData}</div>
                )}
              </div>
              {images.length > 1 && (
                <div className="car-gallery-thumbs">
                  {images.map((img) => {
                    const url = photoUrls[img.path]
                    if (!url) return null
                    return (
                      <button
                        key={img.path}
                        type="button"
                        className={`car-gallery-thumb ${activePhoto === img.path ? 'active' : ''}`}
                        onClick={() => setActivePhoto(img.path)}
                      >
                        <img src={url} alt="" />
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="panel car-detail-panel">
            <div className="panel-header">
              <div>
                <h3>{t.documents}</h3>
                {docsAlertCount > 0 ? (
                  <p className="panel-subtitle car-detail-alert-hint">
                    {docsAlertCount} {t.documents.toLowerCase()}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="panel-body">
              <div className="car-doc-list">
                {DOC_FIELDS.map((doc) => (
                  <CarDocCard
                    key={doc.pathKey}
                    label={t[doc.labelKey]}
                    filePath={car[doc.pathKey]}
                    expiry={doc.hasExpiry ? car[doc.expiryKey] : undefined}
                    viewLabel={t.viewDocument}
                    noDataLabel={t.noData}
                    expiryDateLabel={t.expiryDate}
                    onOpen={() => onOpenDocument(car[doc.pathKey])}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'vidange' && (
          <div className="panel car-detail-panel">
            <div className="panel-header">
              <h3>{t.vidange}</h3>
              <button type="button" className="btn sm" onClick={openAddVidange}>
                <IconPlus size={15} />
                {t.recordVidange}
              </button>
            </div>
            <div className="panel-body">
              <div className="vidange-interval-row">
                <div className="field">
                  <label>{t.vidangeIntervalKm}</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step={500}
                    value={intervalKm}
                    onChange={(e) => setIntervalKm(Number(e.target.value))}
                  />
                </div>
                <div className="field">
                  <label>{t.vidangeIntervalMonths}</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    value={intervalMonths}
                    onChange={(e) => setIntervalMonths(Number(e.target.value))}
                  />
                </div>
                {intervalDirty ? (
                  <button
                    type="button"
                    className="btn sm"
                    disabled={savingInterval}
                    onClick={onSaveVidangeInterval}
                  >
                    {savingInterval ? t.loading : t.save}
                  </button>
                ) : null}
              </div>

              {vidangeStatus?.enabled ? (
                <div className="vidange-simple">
                  <div className={`vidange-status-banner vidange-status-banner--${vidangeLevel}`}>
                    <span className="vidange-status-dot" aria-hidden />
                    <strong>{vidangeStatusLabel}</strong>
                    {vidangeRemainingText ? <span>· {vidangeRemainingText}</span> : null}
                  </div>

                  <div className="vidange-simple-metrics">
                    <div className="vidange-metric">
                      <span>{t.currentMileage}</span>
                      <strong>{formatKm(vidangeStatus.current_mileage, t.kmUnit)}</strong>
                    </div>
                    <div className="vidange-metric">
                      <span>{t.lastVidange}</span>
                      <strong>
                        {vidangeStatus.last_mileage > 0
                          ? formatKm(vidangeStatus.last_mileage, t.kmUnit)
                          : vidangeStatus.last_date
                            ? formatDisplayDate(vidangeStatus.last_date)
                            : '—'}
                      </strong>
                      {vidangeStatus.last_mileage > 0 && vidangeStatus.last_date ? (
                        <p className="muted-text">{formatDisplayDate(vidangeStatus.last_date)}</p>
                      ) : null}
                    </div>
                    <div className={`vidange-metric vidange-metric--${vidangeLevel}`}>
                      <span>{t.vidangeNextSimple}</span>
                      <strong>{vidangeNextText}</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="muted-text">{t.vidangeDisabledHint}</p>
              )}

              <div className="vidange-history-block">
                <h4 className="vidange-history-title">{t.vidangeHistory}</h4>
                {vidanges.length === 0 ? (
                  <EmptyState message={t.noVidangeYet} />
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{t.vidangeDate}</th>
                          <th>{t.mileage}</th>
                          <th>{t.amount}</th>
                          <th>{t.actions}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vidanges.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <strong>{formatDisplayDate(row.performed_at)}</strong>
                            </td>
                            <td>{formatKm(row.mileage, t.kmUnit)}</td>
                            <td>{row.cost > 0 ? money(row.cost) : '—'}</td>
                            <td>
                              <div className="row-actions">
                                <button
                                  type="button"
                                  className="btn secondary sm icon-only"
                                  title={t.edit}
                                  onClick={() => openEditVidange(row)}
                                >
                                  <IconEdit size={15} />
                                </button>
                                <button
                                  type="button"
                                  className="btn danger sm icon-only"
                                  title={t.delete}
                                  onClick={() => onDeleteVidange(row.id)}
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
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="panel car-detail-panel">
            <div className="panel-header">
              <div>
                <h3>{t.carExpenses}</h3>
                <p className="panel-subtitle">{t.carExpensesHint}</p>
              </div>
              <button type="button" className="btn sm" onClick={openAddExpense}>
                <IconPlus size={15} />
                {t.addCarExpense}
              </button>
            </div>
            <div className="panel-body">
              <div className="car-expenses-summary">
                <StatCard
                  label={t.carExpensesTotal}
                  value={money(expenseTotal)}
                  hint={`${expenses.length} ${t.expenses.toLowerCase()}`}
                />
              </div>
              {expenses.length === 0 ? (
                <EmptyState message={t.noData} />
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t.expenseTitle}</th>
                        <th>{t.category}</th>
                        <th>{t.amount}</th>
                        <th>{t.expenseDate}</th>
                        <th>{t.actions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((expense) => (
                        <tr key={expense.id}>
                          <td>
                            <strong>{expense.title}</strong>
                            {expense.notes ? <div className="muted text-sm">{expense.notes}</div> : null}
                          </td>
                          <td>{t[EXPENSE_CATEGORY_KEYS[expense.category]]}</td>
                          <td>{money(expense.amount)}</td>
                          <td>{formatDisplayDate(expense.expense_date)}</td>
                          <td>
                            <div className="row-actions">
                              <button
                                type="button"
                                className="btn secondary sm icon-only"
                                title={t.edit}
                                onClick={() => openEditExpense(expense)}
                              >
                                <IconEdit size={15} />
                              </button>
                              <button
                                className="btn danger sm icon-only"
                                title={t.delete}
                                onClick={() => onDeleteExpense(expense.id)}
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
              )}
            </div>
          </div>
        )}
      </div>

      <CarExpenseModal
        open={expenseModalOpen}
        carId={car.id}
        carLabel={`${car.name} · ${car.plate_number}`}
        expense={editingExpense}
        onClose={closeExpenseModal}
        onSaved={onExpenseSaved}
      />

      <CarVidangeModal
        open={vidangeModalOpen}
        carId={car.id}
        carLabel={`${car.name} · ${car.plate_number}`}
        currentMileage={car.mileage ?? 0}
        vidange={editingVidange}
        onClose={closeVidangeModal}
        onSaved={onVidangeSaved}
      />
    </div>
  )
}
