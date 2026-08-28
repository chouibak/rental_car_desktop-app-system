import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FleetStatusOverview,
  TopCarsUsageChart,
} from '../components/DashboardCharts'
import { RevenueNetChart, RevenueTrendChart } from '../components/RevenueCharts'
import { formatContractDatetime } from '../utils/contracts'
import { PageHeader, StatCard, StatusBadge } from '../components/ui'
import { WhatsAppButton } from '../components/WhatsAppButton'
import { LicenseTrialDashboard } from '../components/LicenseTrialBanner'
import { useLang } from '../context/LangContext'
import type { DashboardStats } from '../types'

export default function DashboardPage() {
  const { t, money } = useLang()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    window.api.getDashboardStats().then(setStats).catch(() => setError(t.loadFailed))
  }, [t])

  if (error) return <div className="empty">{error}</div>
  if (!stats) return <div className="empty">{t.loading}</div>

  const { charts } = stats

  return (
    <div className="dashboard-page">
      <PageHeader title={t.dashboard} subtitle={t.dashboardSubtitle}>
        <LicenseTrialDashboard />
      </PageHeader>

      <div className="cards">
        <StatCard label={t.totalCars} value={stats.cars} />
        <StatCard label={t.availableCars} value={stats.available} tone="success" />
        <StatCard label={t.rentedCars} value={stats.rented} tone="info" />
        <StatCard label={t.horsServiceCars} value={stats.maintenance} tone="warn" />
      </div>

      <div className="cards cards--4">
        <StatCard
          label={t.fleetUtilization}
          value={`${charts.fleet_utilization_pct}%`}
          hint={t.fleetUtilizationHint}
          tone="info"
        />
        <StatCard label={t.totalClients} value={stats.clients} />
        <StatCard label={t.activeContractsCount} value={stats.activeContracts} tone="info" />
        <StatCard label={t.monthRevenue} value={money(stats.monthRevenue)} tone="success" />
      </div>

      <div className="dashboard-grid">
        <div className="panel dashboard-panel">
          <div className="panel-header">
            <div>
              <h3>{t.carsInUse}</h3>
              <p className="muted-text">{t.carsInUseHint}</p>
            </div>
            <Link className="btn secondary btn-sm" to="/cars">
              {t.cars}
            </Link>
          </div>
          <div className="table-wrap dashboard-table-wrap">
            <table className="data-table dashboard-table">
              <thead>
                <tr>
                  <th>{t.car}</th>
                  <th>{t.client}</th>
                  <th>{t.contractNumber}</th>
                  <th>{t.returnAt}</th>
                </tr>
              </thead>
              <tbody>
                {charts.cars_in_use.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      {t.noCarsInUse}
                    </td>
                  </tr>
                )}
                {charts.cars_in_use.map((row) => (
                  <tr key={row.car_id} className="clickable-row">
                    <td>
                      <Link className="link-btn" to={`/cars/${row.car_id}`}>
                        {row.car_name}
                      </Link>
                      <div className="muted-text">{row.plate_number}</div>
                    </td>
                    <td>{row.client_name}</td>
                    <td>
                      {row.contract_id ? (
                        <Link to={`/contracts/${row.contract_id}`}>
                          {row.contract_number}
                          {row.contract_status === 'draft' && (
                            <span className="muted-text"> ({t.draft})</span>
                          )}
                        </Link>
                      ) : row.reservation_id ? (
                        <Link to={`/reservations/${row.reservation_id}`}>{row.reservation_reference}</Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{formatContractDatetime(row.return_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel dashboard-panel">
          <div className="panel-header">
            <div>
              <h3>{t.topCarsUsage}</h3>
              <p className="muted-text">{t.topCarsUsageHint}</p>
            </div>
            <Link className="btn secondary btn-sm" to="/cars">
              {t.cars}
            </Link>
          </div>
          <div className="panel-body">
            <TopCarsUsageChart cars={charts.top_cars_usage} />
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel dashboard-panel">
          <div className="panel-header">
            <div>
              <h3>{t.revenueVsExpenses}</h3>
              <p className="muted-text">{t.dashboardRevenueHint}</p>
            </div>
            <Link className="btn secondary btn-sm" to="/revenue">
              {t.revenue}
            </Link>
          </div>
          <div className="panel-body">
            <RevenueTrendChart data={charts.monthly_trend} />
          </div>
        </div>

        <div className="panel dashboard-panel">
          <div className="panel-header">
            <div>
              <h3>{t.netTrend}</h3>
              <p className="muted-text">{t.dashboardNetHint}</p>
            </div>
          </div>
          <div className="panel-body">
            <RevenueNetChart data={charts.monthly_trend} />
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel dashboard-panel">
          <div className="panel-header">
            <div>
              <h3>{t.fleetStatus}</h3>
              <p className="muted-text">{t.fleetStatusHint}</p>
            </div>
            <Link className="btn secondary btn-sm" to="/cars">
              {t.cars}
            </Link>
          </div>
          <div className="panel-body">
            <FleetStatusOverview
              available={stats.available}
              rented={stats.rented}
              maintenance={stats.maintenance}
              utilizationPct={charts.fleet_utilization_pct}
            />
          </div>
        </div>

        <div className="panel dashboard-panel dashboard-panel--highlight">
          <div className="panel-header">
            <div>
              <h3>{t.unpaidStats}</h3>
              <p className="muted-text">{t.unpaidStatsHint}</p>
            </div>
            <Link className="btn secondary btn-sm" to="/payments">
              {t.payments}
            </Link>
          </div>
          <div className="panel-body dashboard-unpaid-summary">
            <strong className="dashboard-unpaid-amount">{money(charts.unpaid_total)}</strong>
            <p className="muted-text">{t.dashboardUnpaidHint}</p>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>{t.upcomingReturns}</h3>
            <p className="muted-text">{t.upcomingReturnsHint}</p>
          </div>
          <Link className="btn secondary btn-sm" to="/contracts">
            {t.contracts}
          </Link>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.contractNumber}</th>
                <th>{t.client}</th>
                <th>{t.car}</th>
                <th>{t.returnAt}</th>
                <th>{t.status}</th>
                <th>{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {stats.upcomingReturns.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    {t.noData}
                  </td>
                </tr>
              )}
              {stats.upcomingReturns.map((item) => (
                <tr
                  key={`${item.kind}-${item.id}`}
                  className={item.is_overdue ? 'row-overdue' : 'clickable-row'}
                >
                  <td>
                    {item.kind === 'contract' && item.contract_id ? (
                      <Link to={`/contracts/${item.contract_id}`}>{item.reference}</Link>
                    ) : item.reservation_id ? (
                      <Link to={`/reservations/${item.reservation_id}`}>{item.reference}</Link>
                    ) : (
                      item.reference
                    )}
                  </td>
                  <td>{item.client_name}</td>
                  <td>
                    <Link className="link-btn" to={`/cars/${item.car_id}`}>
                      {item.car_name}
                    </Link>
                    <div className="muted-text">{item.plate_number}</div>
                  </td>
                  <td className={item.is_overdue ? 'text-danger' : ''}>
                    {formatContractDatetime(item.return_at)}
                  </td>
                  <td>
                    <StatusBadge status={item.status === 'completed' ? 'closed' : item.status} />
                  </td>
                  <td>
                    <WhatsAppButton
                      size="sm"
                      title={t.whatsappReturn}
                      onSend={() =>
                        window.api.sendWhatsAppReturnReminder(
                          item.contract_id
                            ? { contractId: item.contract_id }
                            : { reservationId: item.reservation_id ?? undefined },
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
