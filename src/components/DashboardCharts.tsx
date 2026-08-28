import { Link } from 'react-router-dom'
import { useLang } from '../context/LangContext'
import type { Dict } from '../i18n'
import type { DashboardCarUsage } from '../types'

type Segment = { key: string; value: number; color: string; labelKey: keyof Dict }

function maxValue(values: number[]) {
  return Math.max(...values, 1)
}

function buildConicGradient(segments: Segment[]) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  if (total <= 0) return 'conic-gradient(var(--border) 0 100%)'

  let cursor = 0
  const stops: string[] = []
  for (const segment of segments) {
    if (segment.value <= 0) continue
    const pct = (segment.value / total) * 100
    stops.push(`${segment.color} ${cursor}% ${cursor + pct}%`)
    cursor += pct
  }
  return `conic-gradient(${stops.join(', ')})`
}

export function FleetStatusOverview({
  available,
  rented,
  maintenance,
  utilizationPct,
}: {
  available: number
  rented: number
  maintenance: number
  utilizationPct: number
}) {
  const { t } = useLang()
  const total = available + rented + maintenance
  const clampedUtilization = Math.max(0, Math.min(100, utilizationPct))

  const segments: Segment[] = [
    { key: 'available', value: available, color: '#10b981', labelKey: 'availableCars' },
    { key: 'rented', value: rented, color: '#3b82f6', labelKey: 'rentedCars' },
    { key: 'maintenance', value: maintenance, color: '#f59e0b', labelKey: 'horsServiceCars' },
  ]

  return (
    <div className="fleet-status-overview">
      <div className="fleet-status-main">
        <div
          className="fleet-status-donut-box"
          style={{ background: buildConicGradient(segments) }}
        >
          <div className="fleet-status-donut-hole">
            <strong>{total}</strong>
            <span>{t.totalCars}</span>
          </div>
        </div>

        <div className="fleet-status-legend">
          {segments.map((segment) => {
            const pct = total > 0 ? Math.round((segment.value / total) * 100) : 0
            return (
              <div className="fleet-status-item" key={segment.key}>
                <div className="fleet-status-item-meta">
                  <span className="fleet-status-item-label">
                    <i className="fleet-status-item-dot" style={{ background: segment.color }} />
                    {t[segment.labelKey]}
                  </span>
                  <div className="fleet-status-item-vals">
                    <span className="fleet-status-item-count">{segment.value}</span>
                    <span className="fleet-status-item-pct">{total ? `${pct}%` : '0%'}</span>
                  </div>
                </div>
                <div className="fleet-status-item-bar">
                  <div
                    className="fleet-status-item-bar-fill"
                    style={{
                      width: `${total ? pct : 0}%`,
                      background: segment.color,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="fleet-utilization-card">
        <div className="fleet-utilization-card-header">
          <div className="fleet-utilization-card-info">
            <h4>{t.fleetUtilization}</h4>
            <p>{t.fleetUtilizationHint}</p>
          </div>
          <span className="fleet-utilization-badge">{clampedUtilization}%</span>
        </div>
        <div className="fleet-utilization-bar">
          <div
            className="fleet-utilization-bar-fill"
            style={{ width: `${clampedUtilization}%` }}
          />
        </div>
      </div>
    </div>
  )
}

export function FleetStatusDonut({
  available,
  rented,
  maintenance,
}: {
  available: number
  rented: number
  maintenance: number
}) {
  const { t } = useLang()
  const total = available + rented + maintenance
  const segments: Segment[] = [
    { key: 'available', value: available, color: '#10b981', labelKey: 'availableCars' },
    { key: 'rented', value: rented, color: '#3b82f6', labelKey: 'rentedCars' },
    { key: 'maintenance', value: maintenance, color: '#f59e0b', labelKey: 'horsServiceCars' },
  ]

  return (
    <div className="revenue-donut-wrap">
      <div className="revenue-donut" style={{ background: buildConicGradient(segments) }}>
        <div className="revenue-donut-hole">
          <strong>{total}</strong>
          <span>{t.totalCars}</span>
        </div>
      </div>
      <div className="revenue-donut-legend">
        {segments.map((segment) => {
          const pct = total > 0 ? Math.round((segment.value / total) * 100) : 0
          return (
            <div className="legend-row" key={segment.key}>
              <i className="legend-dot" style={{ background: segment.color }} />
              <span>{t[segment.labelKey]}</span>
              <strong>{segment.value}</strong>
              <span className="muted-text">{total ? `${pct}%` : '—'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function FleetUtilizationGauge({ percent }: { percent: number }) {
  const { t } = useLang()
  const clamped = Math.max(0, Math.min(100, percent))

  return (
    <div className="fleet-utilization">
      <div
        className="fleet-utilization-ring"
        style={{
          background: `conic-gradient(var(--rented) 0 ${clamped}%, var(--border) ${clamped}% 100%)`,
        }}
      >
        <div className="fleet-utilization-hole">
          <strong>{clamped}%</strong>
          <span>{t.fleetUtilization}</span>
        </div>
      </div>
      <p className="muted-text fleet-utilization-hint">{t.fleetUtilizationHint}</p>
    </div>
  )
}

export function TopCarsUsageChart({ cars }: { cars: DashboardCarUsage[] }) {
  const { t } = useLang()
  const max = maxValue(cars.map((car) => car.rentals))

  if (cars.length === 0) {
    return <div className="empty">{t.noData}</div>
  }

  return (
    <div className="revenue-hbars">
      {cars.map((car) => {
        const label = car.name || `${car.brand} ${car.model}`.trim()
        return (
          <div className="revenue-hbar-row" key={car.car_id}>
            <div className="revenue-hbar-meta">
              <span>
                <Link className="link-btn" to={`/cars/${car.car_id}`}>
                  {label}
                </Link>
                <span className="muted-text"> · {car.plate_number}</span>
              </span>
              <strong>
                {car.rentals} {t.rentalsCount}
              </strong>
            </div>
            <div className="revenue-hbar-track">
              <div
                className="revenue-hbar-fill dashboard-hbar-fill--info"
                style={{ width: `${(car.rentals / max) * 100}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
