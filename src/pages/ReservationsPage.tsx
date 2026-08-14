import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ReservationMonthCalendar } from '../components/ReservationMonthCalendar'
import { IconEdit, IconPlus, IconSearch, IconTrash } from '../components/icons'
import { EmptyState, PageHeader, PaymentBadge, StatusBadge } from '../components/ui'
import { useLang } from '../context/LangContext'
import { monthBoundaryIsoRange, startOfMonth } from '../utils/calendar'
import type { Car, Customer, Reservation, ReservationStatus } from '../types'

const STATUSES: ReservationStatus[] = ['pending', 'confirmed', 'cancelled', 'completed']

function formatDatetime(value: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

function reservationPaymentStatus(paid: number, total: number) {
  if (total <= 0 || paid >= total) return 'paid' as const
  if (paid > 0) return 'partial' as const
  return 'unpaid' as const
}

export default function ReservationsPage() {
  const { t, money } = useLang()
  const navigate = useNavigate()
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [cars, setCars] = useState<Car[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({})
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<ReservationStatus | ''>('')
  const [carId, setCarId] = useState<number | ''>('')
  const [customerId, setCustomerId] = useState<number | ''>('')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))

  const calendarCars = useMemo(() => {
    if (carId) return cars.filter((car) => car.id === carId)
    return cars
  }, [cars, carId])

  const load = async () => {
    const filters: {
      q?: string
      status?: ReservationStatus
      car_id?: number
      customer_id?: number
      date_from?: string
      date_to?: string
    } = {
      q: q || undefined,
      status: status || undefined,
      car_id: carId || undefined,
      customer_id: customerId || undefined,
    }

    if (view === 'calendar') {
      Object.assign(filters, monthBoundaryIsoRange(calendarMonth))
    }

    const [list, carList, customerList] = await Promise.all([
      window.api.listReservations(filters),
      window.api.listCars(),
      window.api.listCustomers(),
    ])

    setReservations(list)
    setCars(carList)
    setCustomers(customerList)

    if (view === 'calendar') {
      const rentedCarIds = new Set(
        list.filter((reservation) => reservation.status !== 'cancelled').map((reservation) => reservation.car_id),
      )
      const urls: Record<number, string> = {}
      await Promise.all(
        carList
          .filter((car) => rentedCarIds.has(car.id))
          .map(async (car) => {
            if (car.thumbnail) urls[car.id] = await window.api.getCarFileUrl(car.thumbnail)
          }),
      )
      setThumbUrls(urls)
    }
  }

  useEffect(() => {
    load()
  }, [q, status, carId, customerId, view, calendarMonth])

  const onDelete = async (id: number) => {
    if (!confirm(t.confirmDelete)) return
    try {
      await window.api.deleteReservation(id)
      await load()
    } catch {
      alert(t.cannotDeleteReservation)
    }
  }

  return (
    <div className="reservations-page">
      <PageHeader title={t.reservations} subtitle={t.reservationsSubtitle}>
        <div className="toolbar-filters">
          <div className="search-field search-field-sm">
            <IconSearch size={15} />
            <input
              className="input input-sm"
              placeholder={t.search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select
            className="select select-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as ReservationStatus | '')}
          >
            <option value="">{t.status}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t[s]}
              </option>
            ))}
          </select>
          <select
            className="select select-sm"
            value={carId}
            onChange={(e) => setCarId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">{t.car}</option>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.plate_number}
              </option>
            ))}
          </select>
          <select
            className="select select-sm"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
          >
            <option value="">{t.customer}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar-view-toggle" role="group" aria-label={t.listView}>
          <button
            type="button"
            className={`btn secondary sm ${view === 'list' ? 'active' : ''}`}
            onClick={() => setView('list')}
          >
            {t.listView}
          </button>
          <button
            type="button"
            className={`btn secondary sm ${view === 'calendar' ? 'active' : ''}`}
            onClick={() => setView('calendar')}
          >
            {t.calendarView}
          </button>
        </div>

        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={() => navigate('/reservations/new')}>
            <IconPlus size={16} />
            {t.newReservation}
          </button>
        </div>
      </PageHeader>

      {view === 'list' ? (
        <div className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.reference}</th>
                  <th>{t.customer}</th>
                  <th>{t.car}</th>
                  <th>{t.pickupDate}</th>
                  <th>{t.total}</th>
                  <th>{t.paidRental}</th>
                  <th>{t.remaining}</th>
                  <th>{t.status}</th>
                  <th>{t.paymentStatus}</th>
                  <th className="col-actions">{t.actions}</th>
                </tr>
              </thead>
              <tbody>
                {reservations.length === 0 && (
                  <tr>
                    <td colSpan={10}>
                      <EmptyState message={t.noData} />
                    </td>
                  </tr>
                )}
                {reservations.map((r) => {
                  const paid = r.paid_amount ?? 0
                  const remaining = Math.max(0, r.total_amount - paid)
                  const paymentStatus = reservationPaymentStatus(paid, r.total_amount)

                  return (
                    <tr
                      key={r.id}
                      className="clickable-row"
                      onClick={() => navigate(`/reservations/${r.id}`)}
                    >
                      <td>
                        <strong>{r.reference}</strong>
                        {(r.contract_count ?? 0) > 1 ? (
                          <div className="muted-text text-danger">{t.duplicateContractWarning}</div>
                        ) : null}
                      </td>
                      <td>{r.customer_name}</td>
                      <td>
                        {r.car_name}
                        <div className="muted-text">{r.car_plate}</div>
                      </td>
                      <td>
                        {formatDatetime(r.pickup_date)}
                        <div className="muted-text">→ {formatDatetime(r.return_date)}</div>
                      </td>
                      <td>{money(r.total_amount)}</td>
                      <td>{money(paid)}</td>
                      <td className={remaining > 0 ? 'text-danger' : ''}>{money(remaining)}</td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td>
                        <PaymentBadge status={paymentStatus} />
                      </td>
                      <td className="col-actions">
                        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                          <Link
                            className="btn secondary sm icon-only"
                            to={`/reservations/${r.id}/edit`}
                            title={t.edit}
                            aria-label={t.edit}
                          >
                            <IconEdit size={15} />
                          </Link>
                          <button
                            type="button"
                            className="btn danger sm icon-only"
                            onClick={() => onDelete(r.id)}
                            title={t.delete}
                            aria-label={t.delete}
                          >
                            <IconTrash size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="panel panel-body month-calendar-panel">
          <ReservationMonthCalendar
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            cars={calendarCars}
            reservations={reservations}
            thumbUrls={thumbUrls}
          />
        </div>
      )}
    </div>
  )
}
