import { FormEvent, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  IconCalendar,
  IconCar,
  IconChevronLeft,
  IconEdit,
  IconFile,
  IconPlus,
  IconReceipt,
  IconTrash,
} from '../components/icons'
import { CarDamageDiagram } from '../components/CarDamageDiagram'
import { ContractDamagesView } from '../components/ContractDamagesView'
import { ContractHandoverForm } from '../components/ContractHandoverModal'
import { CarStatusBadge, EmptyState, PaymentBadge, StatCard, StatusBadge } from '../components/ui'
import { useLang } from '../context/LangContext'
import { useToast } from '../context/ToastContext'
import type { Car, Contract, ContractStatus, Payment, PaymentMethod } from '../types'
import { deletePayment, paymentErrorMessage, savePayment } from '../utils/payments'
import { mapAppError } from '../utils/errors'
import { CONTRACT_STATUSES, FUEL_FRACTION, formatContractDate, formatContractDatetime, parseDamages, parseEquipment, getBaseReturnAt, getOriginalRentalTotal, calcExtensionPreview } from '../utils/contracts'
import { deliveryPlaceForDisplay } from '../utils/reservation'
import { todayYmd } from '../utils/calendar'

type ContractTab = 'overview' | 'livraison' | 'reprise' | 'prolongation'

function display(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string' && !value.trim()) return '—'
  return String(value)
}

/** Hide auto-generated prolongation audit lines from the Notes panel. */
function displayContractNotes(notes: string | null | undefined) {
  if (!notes?.trim()) return ''
  return notes
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^Prolongation\b/i.test(line))
    .join('\n')
    .trim()
}

function contractPaymentStatus(paid: number, total: number) {
  if (total <= 0 || paid >= total) return 'paid'
  if (paid > 0) return 'partial'
  return 'unpaid'
}

function fuelLabel(level?: string) {
  if (!level) return '—'
  return FUEL_FRACTION[level as keyof typeof FUEL_FRACTION] ?? level
}

export default function ContractDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, money } = useLang()
  const { showSuccess } = useToast()
  const [contract, setContract] = useState<Contract | null>(null)
  const [car, setCar] = useState<Car | null>(null)
  const [carThumbUrl, setCarThumbUrl] = useState('')
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfSaving, setPdfSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<ContractTab>('overview')
  const [extendSaving, setExtendSaving] = useState(false)
  const [extendError, setExtendError] = useState('')
  const [extendForm, setExtendForm] = useState({
    extension_days: 0,
    note: '',
  })
  const [payOpen, setPayOpen] = useState(false)
  const [paySaving, setPaySaving] = useState(false)
  const [payError, setPayError] = useState('')
  const [payFromExtension, setPayFromExtension] = useState(false)
  const [payEditing, setPayEditing] = useState<Payment | null>(null)
  const [payForm, setPayForm] = useState({
    amount: 0,
    method: 'cash',
    paid_at: todayYmd(),
    note: '',
  })
  const [statusSaving, setStatusSaving] = useState(false)

  const load = async () => {
    if (!id) return
    const data = await window.api.getContract(Number(id))
    if (!data) {
      navigate('/contracts')
      return
    }
    setContract(data)

    if (data?.car_id) {
      const carData = await window.api.getCar(data.car_id)
      setCar(carData)
      const imagePath = carData?.images?.[0]?.path || carData?.thumbnail || ''
      if (imagePath) {
        setCarThumbUrl(await window.api.getCarFileUrl(imagePath))
      } else {
        setCarThumbUrl('')
      }
    } else {
      setCar(null)
      setCarThumbUrl('')
    }
  }

  useEffect(() => {
    // A missing or unreadable contract must not leave the page spinning forever.
    load().catch(() => navigate('/contracts'))
  }, [id])

  useEffect(() => {
    if (!contract) return
    setExtendForm((prev) => ({
      ...prev,
      extension_days: Math.max(0, Math.floor(Number(contract.extension_days ?? 0))),
    }))
  }, [contract?.id, contract?.extension_days])

  const summary = useMemo(() => {
    if (!contract) return null
    const total = contract.total_amount || 0
    const paid = contract.paid_amount || 0
    const remaining = Math.max(0, total - paid)
    const dailyRate = contract.daily_rate ?? contract.daily_price ?? 0
    const days = contract.billed_days ?? contract.total_days ?? 0
    const deposit = contract.deposit_amount ?? contract.deposit ?? 0
    const brand = contract.vehicle_brand || contract.brand || ''
    const model = contract.vehicle_model || contract.model || ''
    const plate = contract.vehicle_plate || contract.plate_number || ''
    const departure = contract.departure_at || contract.start_date
    const returnAt = contract.return_at || contract.end_date
    const paymentStatus = contractPaymentStatus(paid, total)
    const progress = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0

    return {
      total,
      paid,
      remaining,
      dailyRate,
      days,
      deposit,
      brand,
      model,
      plate,
      departure,
      returnAt,
      paymentStatus,
      progress,
    }
  }, [contract])

  const extendPreview = useMemo(() => {
    if (!contract) return null
    const currentExtension = Math.max(0, Math.floor(Number(contract.extension_days ?? 0)))
    const targetDays = Math.max(0, Math.floor(Number(extendForm.extension_days) || 0))
    const currentReturn = contract.return_at || contract.end_date || ''
    const departure = contract.departure_at || contract.start_date || ''
    const dailyRate = contract.daily_rate ?? contract.daily_price ?? 0
    const paid = contract.paid_amount || 0
    const originalReturnAt = getBaseReturnAt(
      currentReturn,
      currentExtension,
      contract.original_return_at,
    )
    const originalTotal = getOriginalRentalTotal(
      contract.total_amount || 0,
      currentExtension,
      dailyRate,
      contract.original_total_amount,
    )
    const preview = calcExtensionPreview({
      originalReturnAt,
      originalTotal,
      extensionDays: targetDays,
      dailyRate,
      departure,
      paid,
    })
    const dirty = targetDays !== currentExtension

    return {
      currentExtension,
      targetDays,
      dirty,
      baseReturnAt: originalReturnAt,
      paid,
      ...preview,
      unchanged: !dirty,
    }
  }, [contract, extendForm.extension_days])

  const displaySummary = useMemo(() => {
    if (!summary) return null
    if (activeTab !== 'prolongation' || !extendPreview) return summary
    return {
      ...summary,
      total: extendPreview.newTotal,
      days: extendPreview.newBilledDays || summary.days,
      remaining: extendPreview.newRemaining,
      paid: extendPreview.paid,
    }
  }, [summary, activeTab, extendPreview])

  const departureDamages = useMemo(
    () => (contract ? parseDamages(contract.departure_damages) : []),
    [contract],
  )
  const returnDamages = useMemo(() => (contract ? parseDamages(contract.return_damages) : []), [contract])
  const hasDepartureHandover = Boolean(
    contract?.delivered_at ||
      contract?.departure_mileage ||
      contract?.departure_fuel_level ||
      departureDamages.length > 0 ||
      contract?.departure_notes?.trim(),
  )
  const hasReturnHandover = contract?.status === 'closed' || Boolean(
    contract?.return_mileage ||
      contract?.return_fuel_level ||
      returnDamages.length > 0 ||
      contract?.return_notes?.trim(),
  )
  const equipment = useMemo(() => (contract ? parseEquipment(contract.equipment) : []), [contract])
  const carStatus = car?.computed_status || car?.status || ''

  if (!contract || !summary) return <div className="empty">{t.loading}</div>

  const payments = contract.payments || []
  const canPay = contract.status === 'active' || contract.status === 'draft' || contract.status === 'closed'
  const canExtend = contract.status === 'active' || contract.status === 'draft'
  const extensionDaysTotal = Number(contract.extension_days ?? 0) || 0
  const currentStatus: ContractStatus = contract.status === 'completed' ? 'closed' : (contract.status as ContractStatus)

  const tabs: {
    id: ContractTab
    label: string
    icon: ReactNode
    badge?: string | number
    badgeTone?: 'muted' | 'ok' | 'warn' | 'danger'
  }[] = [
    {
      id: 'overview',
      label: t.contractTabOverview,
      icon: <IconFile size={15} />,
    },
    {
      id: 'livraison',
      label: t.contractTabDelivery,
      icon: <IconCar size={15} />,
      badge: hasDepartureHandover ? t.contractTabDeliveryDone : t.contractTabDeliveryPending,
      badgeTone: hasDepartureHandover ? 'ok' : 'warn',
    },
    {
      id: 'reprise',
      label: t.contractTabReturn,
      icon: <IconReceipt size={15} />,
      badge: hasReturnHandover ? t.contractTabReturnDone : t.contractTabReturnPending,
      badgeTone: hasReturnHandover ? 'ok' : contract.status === 'closed' ? 'muted' : 'warn',
    },
    {
      id: 'prolongation',
      label: t.contractTabExtension,
      icon: <IconCalendar size={15} />,
      badge: extensionDaysTotal > 0 ? `+${extensionDaysTotal}` : undefined,
      badgeTone: extensionDaysTotal > 0 ? 'ok' : 'muted',
    },
  ]

  const doExtend = async (e: FormEvent) => {
    e.preventDefault()
    if (!contract || !extendPreview) return
    setExtendError('')
    if (!Number.isFinite(extendForm.extension_days) || extendForm.extension_days < 0) {
      setExtendError(t.invalidExtensionDays)
      return
    }
    if (extendPreview.unchanged) {
      setExtendError(t.extensionUnchanged)
      return
    }
    if (extendForm.extension_days < 1 && extendPreview.currentExtension < 1) {
      setExtendError(t.invalidExtensionDays)
      return
    }
    setExtendSaving(true)
    try {
      const targetDays = Math.floor(extendForm.extension_days)
      const extraToCollect = Math.max(0, Number(extendPreview.newRemaining) || 0)
      const updated = await window.api.setContractExtension(contract.id, {
        extension_days: targetDays,
        note: extendForm.note.trim() || undefined,
      })
      if (updated) setContract(updated)
      setExtendForm({ extension_days: targetDays, note: '' })
      await load()
      showSuccess(targetDays < 1 ? t.extensionRemoveSuccess : t.extendSaveSuccess)
      if (
        targetDays > extendPreview.currentExtension &&
        extraToCollect > 0.001 &&
        (contract.status === 'active' || contract.status === 'draft' || contract.status === 'closed')
      ) {
        openPayForm(extraToCollect, true)
      }
    } catch (err) {
      const shown = mapAppError(err, t)
      setExtendError(shown)
      alert(shown)
    } finally {
      setExtendSaving(false)
    }
  }

  const doRemoveExtension = async () => {
    if (!contract || extensionDaysTotal < 1) return
    const message = t.confirmRemoveExtension
    if (!confirm(message)) return
    setExtendError('')
    setExtendSaving(true)
    try {
      const updated = await window.api.removeContractExtension(contract.id)
      if (updated) setContract(updated)
      setExtendForm({ extension_days: 0, note: '' })
      await load()
      showSuccess(t.extensionRemoveSuccess)
    } catch (err) {
      const shown = mapAppError(err, t)
      setExtendError(shown)
      alert(shown)
    } finally {
      setExtendSaving(false)
    }
  }

  const openPayForm = (suggestedAmount?: number, fromExtension = false) => {
    const amount =
      suggestedAmount != null && Number.isFinite(suggestedAmount) && suggestedAmount > 0
        ? Math.round(suggestedAmount * 100) / 100
        : summary?.remaining && summary.remaining > 0
          ? Math.round(summary.remaining * 100) / 100
          : 0
    setPayError('')
    setPayEditing(null)
    setPayFromExtension(fromExtension)
    setPayForm({
      amount,
      method: 'cash',
      paid_at: todayYmd(),
      // Stable marker (FR) so clawback finds prolongation payments in any UI language.
      note: fromExtension ? 'Prolongation' : '',
    })
    setPayOpen(true)
  }

  const openPayEdit = (payment: Payment) => {
    setPayError('')
    setPayEditing(payment)
    setPayFromExtension(false)
    setPayForm({
      amount: payment.amount,
      method: payment.method || 'cash',
      paid_at: payment.paid_at?.slice(0, 10) || todayYmd(),
      note: payment.note || '',
    })
    setPayOpen(true)
  }

  const submitPayment = async (e: FormEvent) => {
    e.preventDefault()
    if (!contract) return
    setPayError('')
    if (!Number.isFinite(payForm.amount) || payForm.amount <= 0) {
      setPayError(t.invalidAmount)
      return
    }
    setPaySaving(true)
    try {
      await savePayment({
        source: payEditing?.source ?? 'contract',
        id: payEditing?.id,
        contract_id: contract.id,
        reservation_id: payEditing?.reservation_id ?? contract.reservation_id,
        amount: payForm.amount,
        method: payForm.method as PaymentMethod,
        paid_at: payForm.paid_at,
        note: payForm.note.trim() || (payFromExtension ? 'Prolongation' : ''),
      })
      setPayOpen(false)
      setPayEditing(null)
      setPayFromExtension(false)
      await load()
      showSuccess(t.paymentSaveSuccess)
    } catch (err) {
      setPayError(paymentErrorMessage(err, t))
    } finally {
      setPaySaving(false)
    }
  }

  const removePayment = async (payment: Payment) => {
    if (!confirm(t.confirmDelete)) return
    try {
      await deletePayment({ source: payment.source ?? 'contract', id: payment.id })
      await load()
    } catch (err) {
      alert(paymentErrorMessage(err, t))
    }
  }

  const deleteContract = async () => {
    const message = t.confirmDeleteContract.replace('{number}', contract.contract_number)
    if (!confirm(message)) return
    try {
      await window.api.deleteContract(contract.id)
      navigate('/contracts')
    } catch {
      alert(t.cannotDeleteContract)
    }
  }

  const changeContractStatus = async (next: ContractStatus) => {
    if (next === currentStatus || statusSaving) return
    setStatusSaving(true)
    try {
      let updated: Contract | null = null
      if (next === 'active' && currentStatus === 'draft') {
        updated = await window.api.markContractDelivered(contract.id)
      } else if (next === 'closed' && currentStatus === 'active') {
        updated = await window.api.closeContract(contract.id, {
          return_at: contract.return_at,
          return_mileage: contract.return_mileage,
          return_fuel_level: contract.return_fuel_level,
          return_notes: contract.return_notes,
        })
      } else if (next === 'cancelled' && currentStatus !== 'closed') {
        updated = await window.api.cancelContract(contract.id)
      } else {
        updated = await window.api.updateContract(contract.id, { status: next })
      }
      if (updated) setContract(updated)
      await load()
      showSuccess(t.saveSuccess)
    } catch (err) {
      alert(mapAppError(err, t))
    } finally {
      setStatusSaving(false)
    }
  }

  const openPdfDialog = () => setPdfOpen(true)

  const confirmPdfDownload = async () => {
    if (!contract) return
    setPdfSaving(true)
    try {
      await window.api.generateContractPdf(contract.id)
      setPdfOpen(false)
    } catch (err) {
      alert(mapAppError(err, t))
    } finally {
      setPdfSaving(false)
    }
  }

  const toggleDamagePhotosInPdf = async (checked: boolean) => {
    const previous = contract.include_damage_photos_in_pdf
    setContract({ ...contract, include_damage_photos_in_pdf: checked ? 1 : 0 })
    try {
      const updated = await window.api.updateContract(contract.id, {
        include_damage_photos_in_pdf: checked ? 1 : 0,
      })
      if (updated) setContract(updated)
    } catch (err) {
      setContract({ ...contract, include_damage_photos_in_pdf: previous })
      alert(mapAppError(err, t))
    }
  }

  return (
    <div className="contract-detail-page">
      <div className="page-header contract-detail-toolbar">
        <div className="toolbar">
          <div className="toolbar-nav">
            <Link className="btn btn-back" to="/contracts">
              <IconChevronLeft size={16} />
              {t.back}
            </Link>
          </div>
          <div className="toolbar-actions contract-header-actions">
            <div className="contract-status-switch" role="group" aria-label={t.status}>
              {CONTRACT_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`contract-status-btn contract-status-btn--${status}${currentStatus === status ? ' is-active' : ''}`}
                  disabled={statusSaving}
                  aria-pressed={currentStatus === status}
                  onClick={() => changeContractStatus(status)}
                >
                  {t[status]}
                </button>
              ))}
            </div>
            <Link className="btn btn-edit" to={`/contracts/${contract.id}/edit`}>
              <IconEdit size={16} />
              {t.edit}
            </Link>
            <button type="button" className="btn secondary" onClick={openPdfDialog}>
              {t.downloadPdf}
            </button>
            <button type="button" className="btn danger icon-only" onClick={deleteContract} title={t.delete} aria-label={t.delete}>
              <IconTrash size={15} />
            </button>
          </div>
        </div>
      </div>

      <div className="cards cards--4 contract-detail-stats">
        <StatCard label={t.total} value={money((displaySummary || summary).total)} tone="info" />
        <StatCard label={t.amountPaid} value={money((displaySummary || summary).paid)} tone="success" />
        <StatCard
          label={t.remainingUnpaid}
          value={(displaySummary || summary).remaining > 0 ? money((displaySummary || summary).remaining) : t.fullyPaid}
          tone={(displaySummary || summary).remaining > 0 ? 'warn' : 'success'}
        />
        <StatCard
          label={t.days}
          value={(displaySummary || summary).days}
          hint={`${money((displaySummary || summary).dailyRate)} / ${t.days.toLowerCase()}`}
        />
      </div>

      <nav className="car-detail-tabs contract-detail-tabs" aria-label={t.contracts}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`car-detail-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="car-detail-tab-icon" aria-hidden>
              {tab.icon}
            </span>
            <span className="car-detail-tab-label">{tab.label}</span>
            {tab.badge != null && tab.badge !== '' ? (
              <span className={`car-detail-tab-badge car-detail-tab-badge--${tab.badgeTone || 'muted'}`}>
                {tab.badge}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      <div className="car-detail-tab-panels">
      {activeTab === 'overview' && (
      <div className="detail-grid contract-detail-grid">
        <div className="contract-detail-main">
          <div className="panel">
            <div className="panel-header">
              <h3>{t.contractOverview}</h3>
              <div className="row-actions">
                <StatusBadge status={contract.status === 'completed' ? 'closed' : contract.status} />
                <PaymentBadge status={summary.paymentStatus} />
              </div>
            </div>
            <div className="panel-body">
              <div className="info-grid">
                <div className="info-item">
                  <span>{t.contractNumber}</span>
                  <strong>{contract.contract_number}</strong>
                </div>
                <div className="info-item">
                  <span>{t.contractDate}</span>
                  <strong>{formatContractDate(contract.contract_date || contract.start_date)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.contractCity}</span>
                  <strong>{display(contract.contract_city)}</strong>
                </div>
                {contract.reservation_id ? (
                  <div className="info-item">
                    <span>{t.reservationLinked}</span>
                    <strong>
                      {contract.reservation_reference ? (
                        <Link className="link-btn" to={`/reservations/${contract.reservation_id}`}>
                          {contract.reservation_reference}
                        </Link>
                      ) : (
                        <Link className="link-btn" to={`/reservations/${contract.reservation_id}`}>
                          #{contract.reservation_id}
                        </Link>
                      )}
                    </strong>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>{t.clientAndDriver}</h3>
            </div>
            <div className="panel-body">
              <div className="info-grid">
                <div className="info-item">
                  <span>{t.client}</span>
                  <strong>
                    <Link className="link-btn" to={`/customers/${contract.client_id}`}>
                      {contract.client_name}
                    </Link>
                  </strong>
                  {contract.client_phone ? <div className="muted-text">{contract.client_phone}</div> : null}
                </div>
                <div className="info-item">
                  <span>{t.driver1}</span>
                  <strong>{display(contract.driver1_name || contract.client_name)}</strong>
                  {contract.driver1_phone ? <div className="muted-text">{contract.driver1_phone}</div> : null}
                </div>
                <div className="info-item">
                  <span>{t.phone}</span>
                  <strong>{display(contract.driver1_phone || contract.client_phone)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.cin}</span>
                  <strong>{display(contract.driver1_cin_number)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.license}</span>
                  <strong>{display(contract.driver1_license_number)}</strong>
                </div>
                {contract.driver2_name ? (
                  <>
                    <div className="info-item">
                      <span>{t.driver2}</span>
                      <strong>{contract.driver2_name}</strong>
                      {contract.driver2_phone ? <div className="muted-text">{contract.driver2_phone}</div> : null}
                    </div>
                    <div className="info-item">
                      <span>{t.cin}</span>
                      <strong>{display(contract.driver2_cin_number)}</strong>
                    </div>
                    <div className="info-item">
                      <span>{t.license}</span>
                      <strong>{display(contract.driver2_license_number)}</strong>
                    </div>
                    {contract.driver2_address ? (
                      <div className="info-item">
                        <span>{t.address}</span>
                        <strong>{display(contract.driver2_address)}</strong>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {contract.driver1_address ? (
                  <div className="info-item">
                    <span>{t.address}</span>
                    <strong>{display(contract.driver1_address)}</strong>
                  </div>
                ) : null}
                {contract.driver1_nationality ? (
                  <div className="info-item">
                    <span>{t.nationality}</span>
                    <strong>{display(contract.driver1_nationality)}</strong>
                  </div>
                ) : null}
                {contract.driver1_birth_date ? (
                  <div className="info-item">
                    <span>{t.birthDate}</span>
                    <strong>{formatContractDate(contract.driver1_birth_date)}</strong>
                  </div>
                ) : null}
                {contract.driver1_passport_number ? (
                  <div className="info-item">
                    <span>{t.passport}</span>
                    <strong>{display(contract.driver1_passport_number)}</strong>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>{t.vehicleAndDates}</h3>
              {carStatus ? <CarStatusBadge status={carStatus} /> : null}
            </div>
            <div className="panel-body">
              <div className="contract-vehicle-layout">
                <div className="contract-vehicle-hero">
                  <div className="contract-vehicle-stack">
                    <div className="contract-vehicle-media">
                      {carThumbUrl ? (
                        <Link to={`/cars/${contract.car_id}`} className="contract-vehicle-photo-link" title={t.details}>
                          <img className="contract-vehicle-photo" src={carThumbUrl} alt="" />
                        </Link>
                      ) : (
                        <Link to={`/cars/${contract.car_id}`} className="contract-vehicle-placeholder" title={t.details}>
                          <IconCar size={32} />
                        </Link>
                      )}
                    </div>

                    <div className="contract-vehicle-identity">
                      <span className="contract-vehicle-kicker">{t.car}</span>
                      <Link className="contract-vehicle-name link-btn" to={`/cars/${contract.car_id}`}>
                        {summary.brand} {summary.model}
                      </Link>
                      <span className="contract-vehicle-plate">{summary.plate || '—'}</span>
                      {(car?.category || car?.year || car?.color) ? (
                        <div className="contract-vehicle-meta">
                          {car?.category ? (
                            <span>{t[car.category as keyof typeof t] || car.category}</span>
                          ) : null}
                          {car?.year ? <span>{car.year}</span> : null}
                          {car?.color ? <span>{car.color}</span> : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="contract-vehicle-dates">
                    <div className="contract-vehicle-date-card">
                      <span>{t.departureAt}</span>
                      <strong>{formatContractDatetime(summary.departure)}</strong>
                      {contract.departure_place ? (
                        <div className="muted-text">{deliveryPlaceForDisplay(contract.departure_place, t)}</div>
                      ) : null}
                    </div>
                    <div className="contract-vehicle-date-card">
                      <span>{t.returnAt}</span>
                      <strong className={contract.is_overdue ? 'text-danger' : ''}>
                        {formatContractDatetime(summary.returnAt)}
                      </strong>
                      {contract.return_place ? (
                        <div className="muted-text">{deliveryPlaceForDisplay(contract.return_place, t)}</div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="info-grid contract-vehicle-details">
                  <div className="info-item">
                    <span>{t.departureMileage}</span>
                    <strong>{display(contract.departure_mileage)} km</strong>
                  </div>
                  <div className="info-item">
                    <span>{t.fuelLevel}</span>
                    <strong>{fuelLabel(contract.departure_fuel_level)}</strong>
                    <div className="muted-text">{t.departureState}</div>
                  </div>
                  {contract.return_mileage ? (
                    <div className="info-item">
                      <span>{t.returnMileage}</span>
                      <strong>{display(contract.return_mileage)} km</strong>
                    </div>
                  ) : null}
                  {contract.return_fuel_level ? (
                    <div className="info-item">
                      <span>{t.fuelLevel}</span>
                      <strong>{fuelLabel(contract.return_fuel_level)}</strong>
                      <div className="muted-text">{t.returnState}</div>
                    </div>
                  ) : null}
                  {contract.extension_until || contract.extension_days ? (
                    <>
                      <div className="info-item">
                        <span>{t.extensionUntil}</span>
                        <strong>{formatContractDate(contract.extension_until)}</strong>
                      </div>
                      <div className="info-item">
                        <span>{t.extensionDaysLabel}</span>
                        <strong>{display(contract.extension_days)}</strong>
                      </div>
                    </>
                  ) : null}
                  {car?.mileage != null && car.mileage !== contract.departure_mileage ? (
                    <div className="info-item">
                      <span>{t.mileage}</span>
                      <strong>{car.mileage} km</strong>
                      <div className="muted-text">{t.carSnapshot}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          {equipment.length > 0 || contract.equipment_other?.trim() ? (
            <div className="panel">
              <div className="panel-header">
                <h3>{t.equipmentIncluded}</h3>
              </div>
              <div className="panel-body">
                {equipment.length > 0 ? (
                  <div className="equipment-tags">
                    {equipment.map((item) => (
                      <span className="equipment-tag" key={item}>
                        {t[`equip_${item}` as keyof typeof t] || item}
                      </span>
                    ))}
                  </div>
                ) : null}
                {contract.equipment_other?.trim() ? (
                  <p className="muted-text equipment-other">{contract.equipment_other}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-header">
              <h3>{t.financialSummary}</h3>
            </div>
            <div className="panel-body">
              <div className="info-grid">
                <div className="info-item">
                  <span>{t.dailyPrice}</span>
                  <strong>{money(summary.dailyRate)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.days}</span>
                  <strong>{summary.days}</strong>
                </div>
                <div className="info-item">
                  <span>{t.discount}</span>
                  <strong>{money(contract.discount ?? 0)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.deposit}</span>
                  <strong>{money(summary.deposit)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.vatApplies}</span>
                  <strong>{contract.vat_applies !== 0 ? t.yes : t.no}</strong>
                </div>
                <div className="info-item">
                  <span>{t.vatRate}</span>
                  <strong>{display(contract.vat_rate)}%</strong>
                </div>
                <div className="info-item">
                  <span>{t.franchise}</span>
                  <strong>
                    {contract.franchise_applies !== 0 && (contract.franchise_amount ?? 0) > 0
                      ? money(contract.franchise_amount ?? 0)
                      : t.no}
                  </strong>
                </div>
                <div className="info-item">
                  <span>{t.extraCharges}</span>
                  <strong>{money(contract.extra_charges ?? 0)}</strong>
                  {contract.extra_charges_note?.trim() ? (
                    <div className="muted-text">{contract.extra_charges_note}</div>
                  ) : null}
                </div>
                <div className="info-item info-item--highlight">
                  <span>{t.total}</span>
                  <strong>{money(summary.total)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.amountPaid}</span>
                  <strong>{money(summary.paid)}</strong>
                </div>
                <div className={`info-item${summary.remaining > 0 ? ' info-item--warn' : ''}`}>
                  <span>{t.remainingUnpaid}</span>
                  <strong className={summary.remaining > 0 ? 'text-danger' : ''}>
                    {summary.remaining > 0 ? money(summary.remaining) : t.fullyPaid}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {displayContractNotes(contract.notes) ? (
            <div className="panel">
              <div className="panel-header">
                <h3>{t.notes}</h3>
              </div>
              <div className="panel-body detail-notes">
                <p>{displayContractNotes(contract.notes)}</p>
              </div>
            </div>
          ) : null}

          {contract.returnInfo ? (
            <div className="panel">
              <div className="panel-header">
                <h3>{t.returnCar}</h3>
              </div>
              <div className="panel-body">
                <div className="info-grid">
                  <div className="info-item">
                    <span>{t.returnDate}</span>
                    <strong>{formatContractDatetime(contract.returnInfo.returned_at)}</strong>
                  </div>
                  <div className="info-item">
                    <span>{t.mileage}</span>
                    <strong>{display(contract.returnInfo.mileage)} km</strong>
                  </div>
                  <div className="info-item">
                    <span>{t.extraFees}</span>
                    <strong>{money(contract.returnInfo.extra_fees)}</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="contract-detail-side">
          <div className="panel contract-payments-panel">
            <div className="panel-header">
              <h3>{t.payments}</h3>
              {canPay ? (
                <button type="button" className="btn btn-register sm" onClick={() => openPayForm(summary.remaining)}>
                  <IconPlus size={15} />
                  {t.addPayment}
                </button>
              ) : null}
            </div>

            <div className="panel-body contract-payment-summary">
              {(contract.reservation_contract_count ?? 0) > 1 ? (
                <div className="alert alert-warn contract-duplicate-reservation">
                  {t.duplicateReservationWarning}
                </div>
              ) : null}
              <div className="contract-payment-progress">
                <div className="contract-payment-progress-head">
                  <span>{t.paymentProgress}</span>
                  <strong>{summary.progress}%</strong>
                </div>
                <div className="contract-payment-progress-bar">
                  <div className="contract-payment-progress-fill" style={{ width: `${summary.progress}%` }} />
                </div>
              </div>
              <div className="info-grid payment-summary-inline">
                <div className="info-item">
                  <span>{t.amountPaid}</span>
                  <strong>{money(summary.paid)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.remainingUnpaid}</span>
                  <strong className={summary.remaining > 0 ? 'text-danger' : ''}>
                    {summary.remaining > 0 ? money(summary.remaining) : t.fullyPaid}
                  </strong>
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.amount}</th>
                    <th>{t.method}</th>
                    <th>{t.paidAt}</th>
                    <th>{t.source}</th>
                    <th>{t.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={5}>
                        <EmptyState message={t.noData} />
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment) => (
                      <tr key={`${payment.source || 'contract'}-${payment.id}`}>
                        <td>
                          <strong>{money(payment.amount)}</strong>
                        </td>
                        <td>{t[payment.method as 'cash' | 'card' | 'transfer' | 'bank_transfer'] || payment.method}</td>
                        <td>{display(payment.paid_at)}</td>
                        <td>
                          {payment.source === 'reservation' ? (
                            contract.reservation_id ? (
                              <Link className="link-btn muted-text" to={`/reservations/${contract.reservation_id}`}>
                                {t.paymentFromReservation}
                              </Link>
                            ) : (
                              t.paymentFromReservation
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn secondary sm icon-only"
                              onClick={() => openPayEdit(payment)}
                              title={t.edit}
                            >
                              <IconEdit size={15} />
                            </button>
                            <button
                              type="button"
                              className="btn danger sm icon-only"
                              onClick={() => removePayment(payment)}
                              title={t.delete}
                            >
                              <IconTrash size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </aside>
      </div>
      )}

      {activeTab === 'livraison' && (
        <div className="panel admin-simple-panel">
          <div className="panel-header">
            <h3>{t.contractTabDelivery}</h3>
            <span className={`badge ${hasDepartureHandover ? 'paid' : 'pending'}`}>
              {hasDepartureHandover ? t.contractTabDeliveryDone : t.contractTabDeliveryPending}
            </span>
          </div>
          <div className="panel-body">
            {contract.status === 'cancelled' ? (
              <div className="info-grid">
                <div className="info-item">
                  <span>{t.departureAt}</span>
                  <strong>
                    {contract.delivered_at || contract.departure_at
                      ? formatContractDatetime(contract.delivered_at || contract.departure_at)
                      : '—'}
                  </strong>
                </div>
                <div className="info-item">
                  <span>{t.departureMileage}</span>
                  <strong>{contract.departure_mileage ? `${contract.departure_mileage} km` : '—'}</strong>
                </div>
                <div className="info-item">
                  <span>{t.fuelLevel}</span>
                  <strong>{fuelLabel(contract.departure_fuel_level)}</strong>
                </div>
                {contract.departure_notes?.trim() ? (
                  <div className="info-item">
                    <span>{t.remarks}</span>
                    <strong>{contract.departure_notes}</strong>
                  </div>
                ) : null}
                <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                  <span>{t.observedDamages}</span>
                  <CarDamageDiagram damages={departureDamages} t={t} readOnly />
                  <ContractDamagesView damages={departureDamages} t={t} compact />
                </div>
              </div>
            ) : (
              <ContractHandoverForm
                inline
                open
                mode={contract.status === 'draft' && !hasDepartureHandover ? 'deliver' : 'departure-edit'}
                contract={contract}
                car={car}
                onSaved={load}
              />
            )}
          </div>
        </div>
      )}

      {activeTab === 'reprise' && (
        <div className="panel admin-simple-panel">
          <div className="panel-header">
            <h3>{t.contractTabReturn}</h3>
            <span className={`badge ${hasReturnHandover ? 'paid' : 'pending'}`}>
              {hasReturnHandover ? t.contractTabReturnDone : t.contractTabReturnPending}
            </span>
          </div>
          <div className="panel-body">
            {contract.status === 'cancelled' || contract.status === 'draft' ? (
              <>
                <div className="info-grid">
                  <div className="info-item">
                    <span>{t.returnAt}</span>
                    <strong>
                      {contract.closed_at || contract.return_at
                        ? formatContractDatetime(contract.return_at || contract.closed_at)
                        : '—'}
                    </strong>
                  </div>
                  <div className="info-item">
                    <span>{t.returnMileage}</span>
                    <strong>{contract.return_mileage ? `${contract.return_mileage} km` : '—'}</strong>
                  </div>
                  <div className="info-item">
                    <span>{t.fuelLevel}</span>
                    <strong>{fuelLabel(contract.return_fuel_level)}</strong>
                  </div>
                  {contract.return_notes?.trim() ? (
                    <div className="info-item">
                      <span>{t.remarks}</span>
                      <strong>{contract.return_notes}</strong>
                    </div>
                  ) : null}
                  <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                    <span>{t.observedDamages}</span>
                    <CarDamageDiagram damages={returnDamages} t={t} readOnly />
                    <ContractDamagesView damages={returnDamages} t={t} compact />
                  </div>
                </div>
                {contract.status === 'draft' ? (
                  <p className="muted-text" style={{ marginTop: 12 }}>
                    {t.contractReturnNeedsDelivery}
                  </p>
                ) : null}
              </>
            ) : (
              <ContractHandoverForm
                inline
                open
                mode={hasReturnHandover || contract.status === 'closed' ? 'return-edit' : 'return'}
                contract={contract}
                car={car}
                onSaved={load}
              />
            )}
          </div>
        </div>
      )}

      {activeTab === 'prolongation' && extendPreview && (
        <div className="panel admin-simple-panel">
          <div className="panel-header">
            <div className="panel-header-title">
              <h3>{t.contractTabExtension}</h3>
              {extensionDaysTotal > 0 ? (
                <span className="badge paid">+{extensionDaysTotal} j</span>
              ) : null}
            </div>
            {canPay ? (
              <button
                type="button"
                className="btn btn-register sm"
                onClick={() =>
                  openPayForm(
                    extendPreview.newRemaining > 0
                      ? extendPreview.newRemaining
                      : summary?.remaining,
                    true,
                  )
                }
              >
                <IconPlus size={15} />
                {t.addPayment}
              </button>
            ) : null}
          </div>
          <div className="panel-body">
            {canExtend ? (
              <form className="admin-extend-form" onSubmit={doExtend}>
                <div className="form-grid">
                  <div className="field">
                    <label>{t.extensionDays}</label>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      step={1}
                      value={extendForm.extension_days}
                      onChange={(e) =>
                        setExtendForm({
                          ...extendForm,
                          extension_days: Math.max(0, Math.floor(Number(e.target.value) || 0)),
                        })
                      }
                    />
                  </div>
                  <div className="field">
                    <label>{t.newReturnAt}</label>
                    <strong>
                      {extendPreview.newReturnAt
                        ? formatContractDatetime(extendPreview.newReturnAt)
                        : '—'}
                    </strong>
                  </div>
                  <div className="field">
                    <label>{t.extensionExtraCost}</label>
                    <strong>{money(extendPreview.extensionCost)}</strong>
                  </div>
                  <div className="field">
                    <label>{t.remainingUnpaid}</label>
                    <strong className={extendPreview.newRemaining > 0 ? 'text-danger' : ''}>
                      {extendPreview.newRemaining > 0 ? money(extendPreview.newRemaining) : t.fullyPaid}
                    </strong>
                  </div>
                  {extendError ? <p className="field full settings-error">{extendError}</p> : null}
                </div>
                <div className="form-actions form-actions--sticky">
                  <button
                    className="btn"
                    type="submit"
                    disabled={extendSaving || extendPreview.unchanged}
                  >
                    {extendSaving ? t.loading : t.saveExtension}
                  </button>
                  {extensionDaysTotal > 0 ? (
                    <button
                      className="btn danger"
                      type="button"
                      disabled={extendSaving}
                      onClick={doRemoveExtension}
                    >
                      {t.removeExtension}
                    </button>
                  ) : null}
                </div>
              </form>
            ) : (
              <p className="muted-text">{t.contractExtensionUnavailable}</p>
            )}
          </div>
        </div>
      )}
      </div>

      {payOpen && (
        <div className="modal-backdrop" onClick={() => !paySaving && setPayOpen(false)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitPayment}
          >
            <header>
              <strong>{payEditing ? t.edit : t.addPayment}</strong>
            </header>
            <div className="panel-body form-grid">
              <div className="field">
                <label>{t.amount}</label>
                <input
                  className="input"
                  type="number"
                  required
                  min={0.01}
                  step={0.01}
                  autoFocus
                  value={payForm.amount || ''}
                  onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>{t.method}</label>
                <select
                  className="select"
                  value={payForm.method}
                  onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
                >
                  <option value="cash">{t.cash}</option>
                  <option value="card">{t.card}</option>
                  <option value="transfer">{t.transfer}</option>
                  <option value="bank_transfer">{t.bank_transfer}</option>
                </select>
              </div>
              <div className="field">
                <label>{t.paidAt}</label>
                <input
                  className="input"
                  type="date"
                  value={payForm.paid_at}
                  onChange={(e) => setPayForm({ ...payForm, paid_at: e.target.value })}
                />
              </div>
              <div className="field full">
                <label>{t.notes}</label>
                <textarea
                  className="textarea"
                  rows={2}
                  value={payForm.note}
                  onChange={(e) => setPayForm({ ...payForm, note: e.target.value })}
                />
              </div>
              {payError ? <p className="field full settings-error">{payError}</p> : null}
            </div>
            <footer>
              <button type="button" className="btn secondary" onClick={() => setPayOpen(false)} disabled={paySaving}>
                {t.cancel}
              </button>
              <button className="btn btn-register" type="submit" disabled={paySaving}>
                {paySaving ? t.loading : t.save}
              </button>
            </footer>
          </form>
        </div>
      )}

      {pdfOpen && (
        <div className="modal-backdrop" onClick={() => !pdfSaving && setPdfOpen(false)}>
          <div className="modal contract-pdf-modal" onClick={(e) => e.stopPropagation()}>
            <header>
              <strong>{t.downloadPdf}</strong>
            </header>
            <div className="panel-body">
              <p className="muted-text">{t.includeDamagePhotosHint}</p>
              <label className="checkbox-row contract-pdf-toggle">
                <input
                  type="checkbox"
                  checked={Number(contract.include_damage_photos_in_pdf) === 1}
                  onChange={(e) => toggleDamagePhotosInPdf(e.target.checked)}
                />
                {t.includeDamagePhotos}
              </label>
            </div>
            <footer>
              <button type="button" className="btn secondary" onClick={() => setPdfOpen(false)} disabled={pdfSaving}>
                {t.cancel}
              </button>
              <button type="button" className="btn" onClick={confirmPdfDownload} disabled={pdfSaving}>
                {pdfSaving ? t.loading : t.downloadPdf}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
