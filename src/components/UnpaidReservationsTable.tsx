import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { IconChevronRight } from './icons'
import { EmptyState, PaymentBadge } from './ui'
import { useLang } from '../context/LangContext'
import type { Reservation } from '../types'

type UnpaidRow = Reservation & {
  paid_amount: number
  remaining: number
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
    setLoading(true)
    window.api.listReservations().then((reservations) => {
      const unpaid = reservations
        .filter((reservation) => reservation.status !== 'cancelled')
        .map((reservation) => {
          const paid_amount = reservation.paid_amount ?? 0
          const remaining = Math.max(0, reservation.total_amount - paid_amount)
          return {
            ...reservation,
            paid_amount,
            remaining,
          }
        })
        .filter((row) => row.remaining > 0)
        .sort((a, b) => b.remaining - a.remaining)

      setRows(unpaid)
      setLoading(false)
    })
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
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <EmptyState message={t.noUnpaid} />
                </td>
              </tr>
            )}
            {filtered.map((row) => (
              <tr
                key={row.id}
                className="clickable-row"
                onClick={() => navigate(`/reservations/${row.id}`)}
              >
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
                    status={
                      row.remaining <= 0 ? 'paid' : row.paid_amount > 0 ? 'partial' : 'unpaid'
                    }
                  />
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
