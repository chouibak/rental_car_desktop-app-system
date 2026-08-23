import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  IconCalendar,
  IconChevronLeft,
  IconEdit,
  IconFile,
  IconTrash,
  IconWallet,
} from '../components/icons'
import { ReservationPaymentsPanel } from '../components/ReservationPaymentsPanel'
import { PageHeader, PaymentBadge, StatusBadge } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Contract, Reservation, ReservationStatus } from '../types'
import { isLiveContract } from '../utils/contracts'
import { mapAppError } from '../utils/errors'
import { deliveryLocationLabel } from '../utils/reservation'

const RESERVATION_STATUSES: ReservationStatus[] = ['pending', 'confirmed', 'completed', 'cancelled']

const RESERVATION_STATUS_TONE: Record<ReservationStatus, 'active' | 'draft' | 'closed' | 'cancelled'> = {
  pending: 'draft',
  confirmed: 'active',
  completed: 'closed',
  cancelled: 'cancelled',
}

function reservationUpdatePayload(reservation: Reservation, status: ReservationStatus) {
  return {
    car_id: reservation.car_id,
    customer_id: reservation.customer_id,
    chauffeur_id: reservation.chauffeur_id,
    pickup_date: reservation.pickup_date,
    return_date: reservation.return_date,
    delivery_location: reservation.delivery_location,
    message: reservation.message,
    daily_rate: reservation.daily_rate,
    deposit_amount: reservation.deposit_amount,
    deposit_status: reservation.deposit_status,
    franchise_applies: reservation.franchise_applies,
    franchise_amount: reservation.franchise_amount,
    status,
  }
}

type ReservationTab = 'details' | 'contract' | 'payments'

function formatDatetime(value: string, locale: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })
}

function display(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string' && !value.trim()) return '—'
  return String(value)
}

export default function ReservationDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, money, lang } = useLang()
  const locale = lang === 'ar' ? 'ar-MA' : 'fr-FR'
  const [reservation, setReservation] = useState<Reservation | null>(null)
  const [linkedContracts, setLinkedContracts] = useState<Contract[]>([])
  const [activeTab, setActiveTab] = useState<ReservationTab>('details')
  const [statusSaving, setStatusSaving] = useState(false)

  useEffect(() => {
    if (!id) return
    const reservationId = Number(id)

    window.api.getReservation(reservationId).then((data) => {
      if (!data) {
        navigate('/reservations')
        return
      }
      setReservation(data)
    })

    window.api.listContracts().then((contracts) => {
      setLinkedContracts(
        contracts.filter(
          (contract) => Number(contract.reservation_id) === reservationId && isLiveContract(contract),
        ),
      )
    })
  }, [id, navigate])

  const onCreateContract = () => {
    if (!reservation || linkedContracts.length > 0) return
    navigate(`/contracts/new?reservation=${reservation.id}`)
  }

  const onDelete = async () => {
    if (!reservation || !confirm(t.confirmDelete)) return
    try {
      await window.api.deleteReservation(reservation.id)
      navigate('/reservations')
    } catch {
      alert(t.cannotDeleteReservation)
    }
  }

  const onStatusChange = async (status: ReservationStatus) => {
    if (!reservation || status === reservation.status || statusSaving) return
    setStatusSaving(true)
    try {
      const updated = await window.api.updateReservation(
        reservation.id,
        reservationUpdatePayload(reservation, status),
      )
      if (updated) setReservation(updated)
    } catch (err) {
      alert(mapAppError(err, t) || t.statusUpdateFailed)
    } finally {
      setStatusSaving(false)
    }
  }

  if (!reservation) return <div className="empty">{t.loading}</div>

  const paid = reservation.paid_amount ?? 0
  const paymentStatus =
    reservation.total_amount > 0 && paid >= reservation.total_amount
      ? 'paid'
      : paid > 0
        ? 'partial'
        : 'unpaid'

  const infoItems = [
    {
      label: t.customer,
      value: reservation.customer_name ? (
        <Link className="link-btn" to={`/customers/${reservation.customer_id}`}>
          {reservation.customer_name}
        </Link>
      ) : (
        '—'
      ),
    },
    {
      label: t.chauffeur,
      value: reservation.chauffeur_name ? (
        reservation.chauffeur_id ? (
          <Link className="link-btn" to={`/chauffeurs/${reservation.chauffeur_id}`}>
            {reservation.chauffeur_name}
          </Link>
        ) : (
          reservation.chauffeur_name
        )
      ) : (
        t.noChauffeur
      ),
    },
    {
      label: t.car,
      value: reservation.car_name ? (
        <Link className="link-btn" to={`/cars/${reservation.car_id}`}>
          {reservation.car_name}
          {reservation.car_plate ? ` (${reservation.car_plate})` : ''}
        </Link>
      ) : (
        '—'
      ),
    },
    { label: t.pickupDate, value: formatDatetime(reservation.pickup_date, locale) },
    { label: t.returnDateTime, value: formatDatetime(reservation.return_date, locale) },
    { label: t.days, value: display(reservation.days) },
    { label: t.dailyPrice, value: money(reservation.daily_rate) },
    { label: t.total, value: money(reservation.total_amount) },
    { label: t.deposit, value: money(reservation.deposit_amount) },
    {
      label: t.franchise,
      value:
        reservation.franchise_applies !== 0 && (reservation.franchise_amount ?? 0) > 0
          ? money(reservation.franchise_amount ?? 0)
          : '—',
    },
    { label: t.deliveryLocation, value: deliveryLocationLabel(reservation.delivery_location, t) },
  ]

  const tabs: {
    id: ReservationTab
    label: string
    icon: ReactNode
    badge?: string | number
    badgeTone?: 'muted' | 'ok' | 'warn' | 'danger'
  }[] = [
    {
      id: 'details',
      label: t.details,
      icon: <IconCalendar size={15} />,
    },
    {
      id: 'contract',
      label: t.contracts,
      icon: <IconFile size={15} />,
      badge: linkedContracts.length,
      badgeTone: linkedContracts.length > 0 ? 'ok' : 'muted',
    },
    {
      id: 'payments',
      label: t.payments,
      icon: <IconWallet size={15} />,
      badgeTone: paymentStatus === 'paid' ? 'ok' : paymentStatus === 'partial' ? 'warn' : 'danger',
      badge: paymentStatus === 'paid' ? t.paid : paymentStatus === 'partial' ? t.partial : t.unpaid,
    },
  ]

  return (
    <div className="reservation-detail-page">
      <PageHeader
        title={reservation.reference}
        subtitle={[reservation.customer_name, reservation.car_plate].filter(Boolean).join(' · ') || undefined}
      >
        <div className="toolbar-nav">
          <Link className="btn btn-back" to="/reservations">
            <IconChevronLeft size={16} />
            {t.back}
          </Link>
        </div>

        <div className="toolbar-manage reservation-header-actions">
          <div className="contract-status-switch" role="group" aria-label={t.reservationStatus}>
            {RESERVATION_STATUSES.map((status) => (
              <button
                key={status}
                type="button"
                className={`contract-status-btn contract-status-btn--${RESERVATION_STATUS_TONE[status]}${reservation.status === status ? ' is-active' : ''}`}
                disabled={statusSaving}
                aria-pressed={reservation.status === status}
                onClick={() => onStatusChange(status)}
              >
                {t[status]}
              </button>
            ))}
          </div>
          <Link className="btn btn-edit" to={`/reservations/${reservation.id}/edit`}>
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
        <PaymentBadge status={paymentStatus} />
        <span className="muted-text">
          {money(paid)} / {money(reservation.total_amount)}
        </span>
      </div>

      <nav className="car-detail-tabs" aria-label={t.details}>
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

              {reservation.message?.trim() ? (
                <div className="detail-notes">
                  <h4>{t.message}</h4>
                  <p>{reservation.message}</p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {activeTab === 'contract' && (
          <div className="panel car-detail-panel">
            <div className="panel-header">
              <div>
                <h3>{t.contractForReservation}</h3>
                <p className="panel-subtitle">{t.contractForReservationHint}</p>
              </div>
            </div>
            <div className="panel-body contract-action-body">
              {linkedContracts.length > 0 ? (
                <div className="contract-action-existing">
                  {linkedContracts.length > 1 ? (
                    <p className="contract-duplicate-reservation">{t.duplicateReservationWarning}</p>
                  ) : null}
                  <div className="linked-contracts-list">
                    {linkedContracts.map((contract) => (
                      <div className="linked-contract-row" key={contract.id}>
                        <div>
                          <strong>{contract.contract_number}</strong>
                          <p className="muted-text">
                            {contract.client_name} · {money(contract.total_amount)}
                            {' · '}
                            <StatusBadge status={contract.status === 'completed' ? 'closed' : contract.status} />
                          </p>
                        </div>
                        <div className="contract-action-buttons">
                          <Link className="btn sm" to={`/contracts/${contract.id}`}>
                            {t.viewContract}
                          </Link>
                          <Link className="btn secondary sm" to={`/contracts/${contract.id}/edit`}>
                            {t.editContractAction}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : reservation.status === 'cancelled' ? (
                <p className="muted-text">{t.contractCancelledHint}</p>
              ) : (
                <div className="contract-action-create">
                  <div className="contract-action-create-copy">
                    <strong>{t.noContractYet}</strong>
                    <p className="muted-text">{t.contractForReservationHint}</p>
                  </div>
                  <button type="button" className="btn" onClick={onCreateContract}>
                    <IconFile size={16} />
                    {t.createContractFromReservation}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'payments' && (
          <ReservationPaymentsPanel
            reservationId={reservation.id}
            reservation={reservation}
            onReservationChange={setReservation}
          />
        )}
      </div>
    </div>
  )
}
