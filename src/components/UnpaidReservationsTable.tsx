import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconChevronRight } from './icons'
import { EmptyState, PaymentBadge } from './ui'
import { WhatsAppButton } from './WhatsAppButton'
import { useLang } from '../context/LangContext'
import { isLiveContract } from '../utils/contracts'

type UnpaidRow = {
  key: string
  href: string
  reference: string
  customer_name: string
  car_name: string
  car_plate: string
  total_amount: number
  paid_amount: number
  remaining: number
  reservationId?: number
}

type UnpaidReservationsTableProps = {
  search?: string
  refreshKey?: number
}

export function UnpaidReservationsTable({ search = '', refreshKey = 0 }: UnpaidReservationsTableProps) {
  const { t, money } = useLang()
  const navigate = useNavigate()
  const [rows, setRows] = useState<UnpaidRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([window.api.listReservations(), window.api.listContracts()])
      .then(([reservations, contracts]) => {
        if (cancelled) return
        const reservationRows: UnpaidRow[] = reservations
          .filter((reservation) => reservation.status !== 'cancelled')
          .map((reservation) => {
            const paid_amount = reservation.paid_amount ?? 0
            const remaining = Math.max(0, reservation.total_amount - paid_amount)
            return {
              key: `reservation-${reservation.id}`,
              href: `/reservations/${reservation.id}`,
              reference: reservation.reference,
              customer_name: reservation.customer_name || '',
              car_name: reservation.car_name || '',
              car_plate: reservation.car_plate || '',
              total_amount: reservation.total_amount,
              paid_amount,
              remaining,
              reservationId: reservation.id,
            }
          })
          .filter((row) => row.remaining > 0.001)

        const walkInRows: UnpaidRow[] = contracts
          .filter((contract) => isLiveContract(contract) && !contract.reservation_id)
          .map((contract) => {
            const paid_amount = contract.paid_amount ?? 0
            const remaining = Math.max(0, (contract.total_amount || 0) - paid_amount)
            return {
              key: `contract-${contract.id}`,
              href: `/contracts/${contract.id}`,
              reference: contract.contract_number,
              customer_name: contract.client_name || '',
              car_name: [contract.brand, contract.model].filter(Boolean).join(' ') || '',
              car_plate: contract.plate_number || '',
              total_amount: contract.total_amount || 0,
              paid_amount,
              remaining,
            }
          })
          .filter((row) => row.remaining > 0.001)

        setRows([...reservationRows, ...walkInRows].sort((a, b) => b.remaining - a.remaining))
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setRows([])
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) =>
      [row.reference, row.customer_name, row.car_name, row.car_plate].some((value) =>
        value?.toLowerCase().includes(q),
      ),
    )
  }, [rows, search])

  if (loading) return <div className="empty">{t.loading}</div>

  return (
    <div className="panel unpaid-panel">
      <div className="panel-header">
        <div>
          <h3>{t.unpaidTracking}</h3>
          <p className="muted-text">{t.unpaidTrackingSubtitle}</p>
        </div>
        <span className="unpaid-count">{filtered.length}</span>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t.reference}</th>
              <th>{t.customer}</th>
              <th>{t.car}</th>
              <th>{t.total}</th>
              <th>{t.paidRental}</th>
              <th>{t.remaining}</th>
              <th>{t.paymentStatus}</th>
              <th>{t.actions}</th>
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <EmptyState message={t.noUnpaid} />
                </td>
              </tr>
            )}
            {filtered.map((row) => (
              <tr key={row.key} className="clickable-row" onClick={() => navigate(row.href)}>
                <td>
                  <strong>{row.reference}</strong>
                </td>
                <td>{row.customer_name}</td>
                <td>
                  {row.car_name}
                  <div className="muted-text">{row.car_plate}</div>
                </td>
                <td>{money(row.total_amount)}</td>
                <td>{money(row.paid_amount)}</td>
                <td>
                  <strong className="unpaid-remaining">{money(row.remaining)}</strong>
                </td>
                <td>
                  <PaymentBadge
                    status={row.remaining <= 0 ? 'paid' : row.paid_amount > 0 ? 'partial' : 'unpaid'}
                  />
                </td>
                <td>
                  {row.reservationId ? (
                    <WhatsAppButton
                      size="sm"
                      title={t.whatsappPayment}
                      onSend={() => window.api.sendWhatsAppPaymentReminder(row.reservationId!)}
                    />
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <span className="row-chevron">
                    <IconChevronRight size={18} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
