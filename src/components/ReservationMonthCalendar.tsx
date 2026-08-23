import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { IconCalendar, IconChevronLeft, IconChevronRight } from './icons'
import { useLang } from '../context/LangContext'
import type { Car, Contract, Reservation } from '../types'
import type { Dict } from '../i18n'
import {
  addMonths,
  daysInMonth,
  getReservationBarInMonth,
  isSameDay,
  isWeekend,
  startOfMonth,
} from '../utils/calendar'

type ReservationMonthCalendarProps = {
  month: Date
  onMonthChange: (month: Date) => void
  cars: Car[]
  reservations: Reservation[]
  /** Contracts created directly (without a reservation) still need a calendar bar. */
  contracts?: Contract[]
  thumbUrls: Record<number, string>
}

function carMeta(car: Car, t: Dict) {
  const category = (t as Dict)[car.category as keyof Dict] ?? car.category
  const transmission = (t as Dict)[car.transmission as keyof Dict] ?? car.transmission
  return `${category} · ${transmission}`
}

export function ReservationMonthCalendar({
  month,
  onMonthChange,
  cars,
  reservations,
  contracts = [],
  thumbUrls,
}: ReservationMonthCalendarProps) {
  const { t, lang } = useLang()
  const locale = lang === 'ar' ? 'ar-MA' : 'fr-FR'
  const today = useMemo(() => new Date(), [])

  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const totalDays = daysInMonth(year, monthIndex)
  const gridTemplate = `220px repeat(${totalDays}, minmax(34px, 1fr))`

  const dayHeaders = useMemo(() => {
    return Array.from({ length: totalDays }, (_, index) => {
      const day = index + 1
      const date = new Date(year, monthIndex, day)
      return {
        day,
        date,
        weekday: date.toLocaleDateString(locale, { weekday: 'short' }).replace('.', ''),
        isWeekend: isWeekend(date),
        isToday: isSameDay(date, today) && monthIndex === today.getMonth() && year === today.getFullYear(),
      }
    })
  }, [totalDays, year, monthIndex, locale, today])

  type CalendarBooking = {
    id: string
    carId: number
    link: string
    label: string
    tone: 'completed' | 'pending' | 'confirmed' | 'cancelled'
    pickup: string
    return: string
  }

  const bookings = useMemo<CalendarBooking[]>(() => {
    const fromReservations: CalendarBooking[] = reservations
      .filter((r) => r.status !== 'cancelled')
      .map((r) => ({
        id: `reservation-${r.id}`,
        carId: r.car_id,
        link: `/reservations/${r.id}`,
        label: r.customer_name || r.reference,
        tone: (r.status === 'completed' ? 'completed' : r.status === 'pending' ? 'pending' : 'confirmed') as CalendarBooking['tone'],
        pickup: r.pickup_date,
        return: r.return_date,
      }))

    // Contracts created directly (no linked reservation) still need a bar of their own.
    const fromContracts: CalendarBooking[] = contracts
      .filter((c) => !c.reservation_id && c.status !== 'cancelled')
      .map((c) => ({
        id: `contract-${c.id}`,
        carId: c.car_id,
        link: `/contracts/${c.id}`,
        label: c.client_name || c.contract_number,
        tone: (c.status === 'closed' ? 'completed' : c.status === 'draft' ? 'pending' : 'confirmed') as CalendarBooking['tone'],
        pickup: c.departure_at || c.start_date,
        return: c.return_at || c.end_date,
      }))

    return [...fromReservations, ...fromContracts]
  }, [reservations, contracts])

  const rows = useMemo(() => {
    return cars
      .map((car) => {
        const carBookings = bookings
          .filter((b) => b.carId === car.id)
          .map((booking) => ({
            booking,
            span: getReservationBarInMonth(booking.pickup, booking.return, year, monthIndex),
          }))
          .filter((entry) => entry.span !== null)

        return { car, bookings: carBookings }
      })
      .filter(({ bookings: carBookings }) => carBookings.length > 0)
  }, [cars, bookings, year, monthIndex])

  const monthLabel = month.toLocaleDateString(locale, { month: 'long', year: 'numeric' })

  return (
    <div className="month-calendar">
      <div className="month-calendar-head">
        <div>
          <h3>{t.calendarView}</h3>
          <p>{t.calendarSubtitle}</p>
        </div>
        <div className="month-calendar-nav">
          <button type="button" className="btn secondary sm icon-only" onClick={() => onMonthChange(addMonths(month, -1))}>
            <IconChevronLeft size={16} />
          </button>
          <div className="month-calendar-current">
            <IconCalendar size={16} />
            <span>{monthLabel}</span>
          </div>
          <button type="button" className="btn secondary sm icon-only" onClick={() => onMonthChange(addMonths(month, 1))}>
            <IconChevronRight size={16} />
          </button>
          <button type="button" className="btn secondary sm" onClick={() => onMonthChange(startOfMonth(new Date()))}>
            {t.today}
          </button>
        </div>
      </div>

      <div className="month-calendar-scroll">
        <div className="month-calendar-grid">
          <div className="month-calendar-header-row" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="month-calendar-vehicle-head">{t.vehicle}</div>
            {dayHeaders.map((header) => (
              <div
                key={header.day}
                className={`month-calendar-day-head ${header.isWeekend ? 'weekend' : ''} ${header.isToday ? 'today' : ''}`}
              >
                <strong>{header.day}</strong>
                <span>{header.weekday}</span>
              </div>
            ))}
          </div>

          {rows.length === 0 && <div className="month-calendar-empty">{t.noData}</div>}

          {rows.map(({ car, bookings }) => (
            <div key={car.id} className="month-calendar-row" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="month-calendar-vehicle">
                {thumbUrls[car.id] ? (
                  <img src={thumbUrls[car.id]} alt={car.name} className="month-calendar-thumb" />
                ) : (
                  <div className="month-calendar-thumb month-calendar-thumb-empty">{car.name.slice(0, 1)}</div>
                )}
                <div className="month-calendar-vehicle-meta">
                  <strong>{car.name}</strong>
                  <span className="muted-text">{carMeta(car, t)}</span>
                </div>
              </div>

              {dayHeaders.map((header) => (
                <div
                  key={header.day}
                  className={`month-calendar-cell ${header.isWeekend ? 'weekend' : ''} ${header.isToday ? 'today' : ''}`}
                />
              ))}

              {bookings.map(({ booking, span }) => {
                if (!span) return null

                return (
                  <Link
                    key={booking.id}
                    to={booking.link}
                    className={`month-calendar-bar ${booking.tone}`}
                    style={{
                      gridColumn: `${span.startDay + 1} / ${span.endDay + 2}`,
                    }}
                    title={booking.label}
                  >
                    {booking.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
