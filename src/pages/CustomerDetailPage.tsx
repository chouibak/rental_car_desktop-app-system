import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  IconCalendar,
  IconChevronLeft,
  IconChevronRight,
  IconEdit,
  IconFile,
  IconPlus,
  IconTrash,
  IconUsers,
} from '../components/icons'
import { EmptyState, PageHeader, PaymentBadge, StatusBadge } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Contract, Customer, Reservation } from '../types'
import type { Dict } from '../i18n'
import { formatDisplayDate } from '../utils/customer'
import { fileBasename } from '../utils/file'

type CustomerTab = 'details' | 'documents' | 'contracts' | 'reservations'

const DOC_FIELDS = [
  {
    labelKey: 'cinDoc' as const,
    numberKey: 'cin_number' as const,
    pathKey: 'cin_pdf_path' as const,
    issueKey: 'cin_issue_date' as const,
    expiryKey: 'cin_expiry_date' as const,
  },
  {
    labelKey: 'passport' as const,
    numberKey: 'passport_number' as const,
    pathKey: 'passport_pdf_path' as const,
    issueKey: 'passport_issue_date' as const,
    expiryKey: 'passport_expiry_date' as const,
  },
  {
    labelKey: 'licenseDoc' as const,
    numberKey: 'license_number' as const,
    pathKey: 'license_pdf_path' as const,
    issueKey: 'license_issue_date' as const,
    expiryKey: 'license_expiry_date' as const,
  },
] as const

function display(value: string | undefined | null) {
  return value?.trim() ? value : '—'
}

function formatDatetime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

function rentalPaymentStatus(paid: number, total: number) {
  if (total <= 0 || paid >= total) return 'paid' as const
  if (paid > 0) return 'partial' as const
  return 'unpaid' as const
}

export default function CustomerDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, money } = useLang()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loadingReservations, setLoadingReservations] = useState(true)
  const [loadingContracts, setLoadingContracts] = useState(true)
  const [activeTab, setActiveTab] = useState<CustomerTab>('details')

  useEffect(() => {
    if (!id) return
    const customerId = Number(id)

    window.api.getCustomer(customerId).then((data) => {
      if (!data) {
        navigate('/customers')
        return
      }
      setCustomer(data)
    })

    setLoadingReservations(true)
    window.api.listReservations({ customer_id: customerId }).then((rows) => {
      setReservations(rows)
      setLoadingReservations(false)
    })

    setLoadingContracts(true)
    window.api.listContracts({ client_id: customerId }).then((rows) => {
      setContracts(rows)
      setLoadingContracts(false)
    })
  }, [id, navigate])

  const onOpenDocument = async (filePath: string) => {
    try {
      await window.api.openCustomerFile(filePath)
    } catch {
      alert(t.cannotOpenDocument)
    }
  }

  const onDelete = async () => {
    if (!customer || !confirm(t.confirmDelete)) return
    try {
      await window.api.deleteCustomer(customer.id)
      navigate('/customers')
    } catch {
      alert(t.cannotDeleteCustomer)
    }
  }

  const docsCount = useMemo(() => {
    if (!customer) return 0
    return DOC_FIELDS.filter((doc) => Boolean(customer[doc.pathKey])).length
  }, [customer])

  if (!customer) return <div className="empty">{t.loading}</div>

  const infoItems = [
    { label: t.phone, value: display(customer.phone) },
    { label: t.email, value: display(customer.email) },
    { label: t.cin, value: display(customer.cin_number) },
    { label: t.birthDate, value: formatDisplayDate(customer.birth_date) },
    { label: t.birthPlace, value: display(customer.birth_place) },
    { label: t.nationality, value: display(customer.nationality) },
    { label: t.address, value: display(customer.address) },
    { label: t.license, value: display(customer.license_number) },
  ]

  const newContractTo = `/contracts/new?customer=${customer.id}`
  const newReservationTo = `/reservations/new?customer=${customer.id}`

  const tabs: {
    id: CustomerTab
    label: string
    icon: ReactNode
    badge?: string | number
    badgeTone?: 'muted' | 'ok' | 'warn' | 'danger'
  }[] = [
    {
      id: 'details',
      label: t.details,
      icon: <IconUsers size={15} />,
    },
    {
      id: 'documents',
      label: t.documents,
      icon: <IconFile size={15} />,
      badge: `${docsCount}/${DOC_FIELDS.length}`,
      badgeTone: docsCount === DOC_FIELDS.length ? 'ok' : docsCount > 0 ? 'warn' : 'muted',
    },
    {
      id: 'contracts',
      label: t.contracts,
      icon: <IconFile size={15} />,
      badge: loadingContracts ? '…' : contracts.length,
      badgeTone: 'muted',
    },
    {
      id: 'reservations',
      label: t.reservations,
      icon: <IconCalendar size={15} />,
      badge: loadingReservations ? '…' : reservations.length,
      badgeTone: 'muted',
    },
  ]

  return (
    <div className="customer-detail-page">
      <PageHeader
        title={customer.name}
        subtitle={[customer.phone, customer.email].filter(Boolean).join(' · ') || undefined}
      >
        <div className="toolbar-nav">
          <Link className="btn btn-back" to="/customers">
            <IconChevronLeft size={16} />
            {t.back}
          </Link>
        </div>

        <div className="toolbar-actions">
          <Link className="btn sm" to={newReservationTo}>
            <IconCalendar size={15} />
            {t.newReservation}
          </Link>
          <Link className="btn sm" to={newContractTo}>
            <IconFile size={15} />
            {t.newContract}
          </Link>
        </div>

        <div className="toolbar-manage">
          <Link className="btn btn-edit" to={`/customers/${customer.id}/edit`}>
            <IconEdit size={16} />
            {t.edit}
          </Link>
          <button type="button" className="btn danger" onClick={onDelete}>
            <IconTrash size={15} />
            {t.delete}
          </button>
        </div>
      </PageHeader>

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
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="panel car-detail-panel">
            <div className="panel-header">
              <div>
                <h3>{t.documents}</h3>
                <p className="panel-subtitle">
                  {docsCount}/{DOC_FIELDS.length}
                </p>
              </div>
              <Link className="btn secondary sm" to={`/customers/${customer.id}/edit`}>
                <IconEdit size={15} />
                {t.edit}
              </Link>
            </div>
            <div className="panel-body">
              <div className="doc-list">
                {DOC_FIELDS.map((doc) => {
                  const path = customer[doc.pathKey]
                  const number = customer[doc.numberKey]
                  const issue = customer[doc.issueKey]
                  const expiry = customer[doc.expiryKey]
                  const label = t[doc.labelKey as keyof Dict]

                  return (
                    <div className="doc-row doc-row-readonly customer-doc-row-readonly" key={doc.pathKey}>
                      <div className="doc-info">
                        <strong>{label}</strong>
                        <span className="muted-text">{display(number)}</span>
                        {path ? (
                          <>
                            <span className="muted-text doc-file-name">{fileBasename(path)}</span>
                            <button type="button" className="link-btn" onClick={() => onOpenDocument(path)}>
                              {t.viewDocument}
                            </button>
                          </>
                        ) : (
                          <span className="muted-text">{t.noData}</span>
                        )}
                      </div>
                      <span className="muted-text">
                        {issue ? `${t.issueDate}: ${formatDisplayDate(issue)}` : '—'}
                      </span>
                      <span className="muted-text">
                        {expiry ? `${t.expiryDate}: ${formatDisplayDate(expiry)}` : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'contracts' && (
          <div className="panel car-detail-panel">
            <div className="panel-header">
              <div>
                <h3>{t.contractHistory}</h3>
                <p className="panel-subtitle">
                  {loadingContracts ? t.loading : `${contracts.length}`}
                </p>
              </div>
              <Link className="btn sm" to={newContractTo}>
                <IconPlus size={15} />
                {t.newContract}
              </Link>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.reference}</th>
                    <th>{t.car}</th>
                    <th>{t.pickupDate}</th>
                    <th>{t.total}</th>
                    <th>{t.amountPaid}</th>
                    <th>{t.remainingUnpaid}</th>
                    <th>{t.status}</th>
                    <th>{t.paymentStatus}</th>
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {loadingContracts ? (
                    <tr>
                      <td colSpan={9}>
                        <div className="empty-inline">{t.loading}</div>
                      </td>
                    </tr>
                  ) : contracts.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <EmptyState message={t.noData} />
                      </td>
                    </tr>
                  ) : (
                    contracts.map((contract) => {
                      const total = contract.total_amount ?? 0
                      const paid = contract.paid_amount ?? 0
                      const remaining = Math.max(0, total - paid)
                      const paymentStatus = rentalPaymentStatus(paid, total)
                      const departure = contract.departure_at || contract.start_date
                      const returnAt = contract.return_at || contract.end_date
                      const carLabel =
                        [contract.vehicle_brand || contract.brand, contract.vehicle_model || contract.model]
                          .filter(Boolean)
                          .join(' ') || '—'
                      const plate = contract.vehicle_plate || contract.plate_number

                      return (
                        <tr
                          key={contract.id}
                          className="clickable-row"
                          onClick={() => navigate(`/contracts/${contract.id}`)}
                        >
                          <td>
                            <strong>{contract.contract_number}</strong>
                          </td>
                          <td>
                            {carLabel}
                            {plate ? <div className="muted-text">{plate}</div> : null}
                          </td>
                          <td>
                            {departure ? formatDatetime(departure) : '—'}
                            {returnAt ? <div className="muted-text">→ {formatDatetime(returnAt)}</div> : null}
                          </td>
                          <td>{money(total)}</td>
                          <td>{money(paid)}</td>
                          <td className={remaining > 0 ? 'text-danger' : ''}>
                            {remaining > 0 ? money(remaining) : t.fullyPaid}
                          </td>
                          <td>
                            <StatusBadge status={contract.status === 'completed' ? 'closed' : contract.status} />
                          </td>
                          <td>
                            <PaymentBadge status={paymentStatus} />
                          </td>
                          <td>
                            <span className="row-chevron">
                              <IconChevronRight size={18} />
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'reservations' && (
          <div className="panel car-detail-panel">
            <div className="panel-header">
              <div>
                <h3>{t.reservationHistory}</h3>
                <p className="panel-subtitle">
                  {loadingReservations ? t.loading : `${reservations.length}`}
                </p>
              </div>
              <Link className="btn sm" to={newReservationTo}>
                <IconPlus size={15} />
                {t.newReservation}
              </Link>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.reference}</th>
                    <th>{t.car}</th>
                    <th>{t.pickupDate}</th>
                    <th>{t.total}</th>
                    <th>{t.paidRental}</th>
                    <th>{t.remaining}</th>
                    <th>{t.status}</th>
                    <th>{t.paymentStatus}</th>
                    <th aria-hidden />
                  </tr>
                </thead>
                <tbody>
                  {loadingReservations ? (
                    <tr>
                      <td colSpan={9}>
                        <div className="empty-inline">{t.loading}</div>
                      </td>
                    </tr>
                  ) : reservations.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <EmptyState message={t.noData} />
                      </td>
                    </tr>
                  ) : (
                    reservations.map((reservation) => {
                      const paid = reservation.paid_amount ?? 0
                      const remaining = Math.max(0, reservation.total_amount - paid)
                      const paymentStatus = rentalPaymentStatus(paid, reservation.total_amount)

                      return (
                        <tr
                          key={reservation.id}
                          className="clickable-row"
                          onClick={() => navigate(`/reservations/${reservation.id}`)}
                        >
                          <td>
                            <strong>{reservation.reference}</strong>
                            {(reservation.contract_count ?? 0) > 1 ? (
                              <div className="muted-text text-danger">{t.duplicateContractWarning}</div>
                            ) : null}
                          </td>
                          <td>
                            {reservation.car_name}
                            <div className="muted-text">{reservation.car_plate}</div>
                          </td>
                          <td>
                            {formatDatetime(reservation.pickup_date)}
                            <div className="muted-text">→ {formatDatetime(reservation.return_date)}</div>
                          </td>
                          <td>{money(reservation.total_amount)}</td>
                          <td>{money(paid)}</td>
                          <td className={remaining > 0 ? 'text-danger' : ''}>{money(remaining)}</td>
                          <td>
                            <StatusBadge status={reservation.status} />
                          </td>
                          <td>
                            <PaymentBadge status={paymentStatus} />
                          </td>
                          <td>
                            <span className="row-chevron">
                              <IconChevronRight size={18} />
                            </span>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
