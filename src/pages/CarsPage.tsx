import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CarListStatusCell } from '../components/CarListStatusCell'
import { ReservationMonthCalendar } from '../components/ReservationMonthCalendar'
import { IconChevronRight, IconDownload, IconEdit, IconPlus, IconSearch, IconTrash } from '../components/icons'
import { EmptyState, PageHeader, StatCard } from '../components/ui'
import { useLang } from '../context/LangContext'
import { monthBoundaryIsoRange, startOfMonth } from '../utils/calendar'
import type { Car, CarComputedStatus, CarStats, Contract, Reservation } from '../types'

const CATEGORIES = ['economique', 'compacte', 'suv', '4x4', 'monospace'] as const
const STATUSES: CarComputedStatus[] = ['disponible', 'louee', 'hors_service']

function isCurrentlyRented(car: Car) {
  return (car.computed_status ?? car.status) === 'louee'
}

export default function CarsPage() {
  const { t, money } = useLang()
  const navigate = useNavigate()
  const [cars, setCars] = useState<Car[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [stats, setStats] = useState<CarStats | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<CarComputedStatus | ''>('')
  const [category, setCategory] = useState<(typeof CATEGORIES)[number] | ''>('')
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({})
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))

  const calendarCars = useMemo(
    () => (view === 'calendar' ? cars.filter(isCurrentlyRented) : cars),
    [cars, view],
  )

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      await fetchCars()
    } catch {
      setError(t.loadFailed)
    } finally {
      setLoading(false)
    }
  }

  const fetchCars = async () => {
    const filters = {
      q: q || undefined,
      status: status || undefined,
      category: category || undefined,
    }

    const requests: [
      Promise<Car[]>,
      Promise<CarStats>,
      Promise<Reservation[]>,
      Promise<Contract[]>,
    ] = [
      window.api.listCars(filters),
      window.api.getCarStats(),
      view === 'calendar'
        ? window.api.listReservations(monthBoundaryIsoRange(calendarMonth))
        : Promise.resolve([]),
      view === 'calendar' ? window.api.listContracts() : Promise.resolve([]),
    ]

    const [list, carStats, reservationList, contractList] = await Promise.all(requests)
    setCars(list)
    setStats(carStats)
    setReservations(reservationList)
    // Only contracts made without a reservation need their own calendar bar.
    const standaloneContracts = contractList.filter((c) => !c.reservation_id)
    setContracts(standaloneContracts)

    const urls: Record<number, string> = {}
    const targetCars = view === 'calendar' ? list.filter(isCurrentlyRented) : list

    await Promise.all(
      targetCars.map(async (car) => {
        if (car.thumbnail) urls[car.id] = await window.api.getCarFileUrl(car.thumbnail)
      }),
    )
    setThumbUrls(urls)
  }

  useEffect(() => {
    load()
  }, [q, status, category, view, calendarMonth])

  const onDelete = async (id: number) => {
    if (!confirm(t.confirmDelete)) return
    try {
      await window.api.deleteCar(id)
      await load()
    } catch {
      alert(t.cannotDeleteCar)
    }
  }

  const onExport = async () => {
    await window.api.exportCarsExcel({
      q: q || undefined,
      status: status || undefined,
      category: category || undefined,
    })
  }

  return (
    <div>
      <PageHeader title={t.cars} subtitle={t.carsSubtitle}>
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
            onChange={(e) => setStatus(e.target.value as CarComputedStatus | '')}
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
            value={category}
            onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number] | '')}
          >
            <option value="">{t.category}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="toolbar-actions">
          <button className={`btn secondary sm ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')}>
            {t.listView}
          </button>
          <button className={`btn secondary sm ${view === 'calendar' ? 'active' : ''}`} onClick={() => setView('calendar')}>
            {t.calendarView}
          </button>
          <button className="btn secondary sm" onClick={onExport}>
            <IconDownload size={16} />
            {t.exportExcel}
          </button>
          <button className="btn sm" onClick={() => navigate('/cars/new')}>
            <IconPlus size={16} />
            {t.addCar}
          </button>
        </div>
      </PageHeader>

      {view === 'list' && stats && (
        <div className="cards">
          <StatCard label={t.totalCarsStat} value={stats.total} />
          <StatCard label={t.disponibleCars} value={stats.disponible} tone="success" />
          <StatCard label={t.loueeCars} value={stats.louee} tone="info" />
          <StatCard label={t.horsServiceCars} value={stats.hors_service} tone="warn" />
        </div>
      )}

      {view === 'list' ? (
        <div className="panel">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.photos}</th>
                  <th>{t.name}</th>
                  <th>{t.plate}</th>
                  <th>{t.category}</th>
                  <th>{t.status}</th>
                  <th>{t.pricePerDay}</th>
                  <th>{t.actions}</th>
                  <th aria-hidden />
                </tr>
              </thead>
              <tbody>
                {cars.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState message={loading ? t.loading : error || t.noData} />
                    </td>
                  </tr>
                )}
                {cars.map((car) => (
                  <tr
                    key={car.id}
                    className="clickable-row"
                    onClick={() => navigate(`/cars/${car.id}`)}
                  >
                    <td>
                      <div className="car-thumb">
                        {thumbUrls[car.id] ? (
                          <img src={thumbUrls[car.id]} alt={car.name} />
                        ) : (
                          <span className="car-thumb-placeholder">—</span>
                        )}
                      </div>
                    </td>
                    <td className="car-cell-name">
                      <strong>{car.name}</strong>
                      <div className="muted-text">
                        {car.brand} · {car.model}
                      </div>
                    </td>
                    <td>
                      <span className="plate-chip">{car.plate_number}</span>
                    </td>
                    <td>{t[car.category as keyof typeof t] ?? car.category}</td>
                    <td>
                      <CarListStatusCell car={car} />
                    </td>
                    <td>
                      <strong>{money(car.price_per_day)}</strong>
                    </td>
                    <td>
                      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                        <Link className="btn secondary sm icon-only" to={`/cars/${car.id}/edit`} title={t.edit}>
                          <IconEdit size={15} />
                        </Link>
                        <button className="btn danger sm icon-only" onClick={() => onDelete(car.id)} title={t.delete}>
                          <IconTrash size={15} />
                        </button>
                      </div>
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
      ) : (
        <div className="panel panel-body month-calendar-panel">
          <ReservationMonthCalendar
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            cars={calendarCars}
            reservations={reservations}
            contracts={contracts}
            thumbUrls={thumbUrls}
          />
        </div>
      )}
    </div>
  )
}
