import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CarDocCard } from '../components/CarDocCard'
import { CarExpenseModal } from '../components/CarExpenseModal'
import { IconEdit, IconPlus, IconTrash } from '../components/icons'
import { EmptyState, PageHeader, StatCard } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Dict } from '../i18n'
import { formatDisplayDate } from '../utils/customer'
import type { Car, CarComputedStatus, Expense, ExpenseCategory } from '../types'

const STATUSES: CarComputedStatus[] = ['disponible', 'louee', 'hors_service']

const DOC_FIELDS = [
  { pathKey: 'doc_carte_grise_path', expiryKey: 'doc_carte_grise_expiry', labelKey: 'carteGrise' },
  { pathKey: 'doc_assurance_path', expiryKey: 'doc_assurance_expiry', labelKey: 'assurance' },
  { pathKey: 'doc_controle_technique_path', expiryKey: 'doc_controle_technique_expiry', labelKey: 'controleTechnique' },
  { pathKey: 'doc_vignette_path', expiryKey: 'doc_vignette_expiry', labelKey: 'vignette' },
  { pathKey: 'doc_autorisation_path', expiryKey: 'doc_autorisation_expiry', labelKey: 'autorisation' },
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

export default function CarDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, money } = useLang()
  const [car, setCar] = useState<Car | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const [activePhoto, setActivePhoto] = useState('')
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)

  const loadExpenses = useCallback(async (carId: number) => {
    const list = await window.api.listExpenses({ car_id: carId })
    setExpenses(list)
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
  }, [id, navigate, loadExpenses])

  const expenseTotal = useMemo(
    () => expenses.reduce((sum, item) => sum + item.amount, 0),
    [expenses],
  )

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
    { label: t.fuelLevel, value: car.fuel_level || '—' },
    { label: t.badge, value: car.badge || '—' },
    { label: t.status, value: t[carStatus as keyof typeof t] ?? carStatus },
  ]

  return (
    <div>
      <PageHeader title={car.name} subtitle={`${car.brand} ${car.model}`}>
        <Link className="btn secondary sm" to="/cars">
          {t.back}
        </Link>
        <Link className="btn sm" to={`/cars/${car.id}/edit`}>
          <IconEdit size={15} />
          {t.edit}
        </Link>
        <button className="btn danger sm" onClick={onDelete}>
          <IconTrash size={15} />
          {t.delete}
        </button>
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
            {t.returnOn} {car.return_date}
          </span>
        )}
      </div>

      <div className="detail-grid">
        <div className="panel">
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

        <div className="panel">
          <div className="panel-header">
            <h3>{t.photos}</h3>
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

          <div className="panel-header panel-header-divider">
            <h3>{t.documents}</h3>
          </div>
          <div className="panel-body">
            <div className="car-doc-list">
              {DOC_FIELDS.map((doc) => (
                <CarDocCard
                  key={doc.pathKey}
                  label={t[doc.labelKey]}
                  filePath={car[doc.pathKey]}
                  expiry={car[doc.expiryKey]}
                  viewLabel={t.viewDocument}
                  noDataLabel={t.noData}
                  expiryDateLabel={t.expiryDate}
                  onOpen={() => onOpenDocument(car[doc.pathKey])}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel car-expenses-panel">
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

      <CarExpenseModal
        open={expenseModalOpen}
        carId={car.id}
        carLabel={`${car.name} · ${car.plate_number}`}
        expense={editingExpense}
        onClose={closeExpenseModal}
        onSaved={onExpenseSaved}
      />
    </div>
  )
}
