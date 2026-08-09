import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  HorizontalBreakdownChart,
  RevenueNetChart,
  RevenueSourceDonut,
  RevenueTrendChart,
  toMethodRows,
} from '../components/RevenueCharts'
import { PageHeader, StatCard } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { RevenueStats } from '../types'

const PAYMENT_METHOD_KEYS = {
  cash: 'cash',
  card: 'card',
  bank_transfer: 'bank_transfer',
} as const

export default function RevenuePage() {
  const { t, money } = useLang()
  const [stats, setStats] = useState<RevenueStats | null>(null)

  useEffect(() => {
    window.api.getRevenueStats().then(setStats)
  }, [])

  const growthHint = useMemo(() => {
    if (!stats || stats.month_growth_pct === null) return t.noData
    const sign = stats.month_growth_pct >= 0 ? '+' : ''
    return `${sign}${stats.month_growth_pct}%`
  }, [stats, t.noData])

  if (!stats) return <div className="empty">{t.loading}</div>

  const growthTone =
    stats.month_growth_pct === null ? 'default' : stats.month_growth_pct >= 0 ? 'success' : 'warn'

  return (
    <div className="revenue-page">
      <PageHeader title={t.revenue} subtitle={t.revenueSubtitle}>
        <div className="toolbar-actions">
          <Link className="btn secondary sm" to="/payments">
            {t.payments}
          </Link>
          <Link className="btn secondary sm" to="/expenses">
            {t.expenses}
          </Link>
        </div>
      </PageHeader>

      <div className="cards cards--4">
        <StatCard label={t.revenueToday} value={money(stats.today_revenue)} tone="success" />
        <StatCard
          label={t.revenueMonth}
          value={money(stats.month_revenue)}
          hint={`${t.lastMonthRevenue}: ${money(stats.last_month_revenue)}`}
          tone="info"
        />
        <StatCard
          label={t.netProfit}
          value={money(stats.month_net)}
          hint={t.netProfitHint}
          tone={stats.month_net >= 0 ? 'success' : 'warn'}
        />
        <StatCard
          label={t.unpaidStats}
          value={money(stats.unpaid_total)}
          hint={t.unpaidStatsHint}
          tone="warn"
        />
      </div>

      <div className="cards cards--4">
        <StatCard label={t.expensesLabel} value={money(stats.month_expenses)} tone="warn" />
        <StatCard label={t.monthGrowth} value={growthHint} tone={growthTone} />
        <StatCard
          label={t.paymentsCount}
          value={stats.month_payments_count}
          hint={t.todayPaymentsHint.replace('{count}', String(stats.month_payments_count))}
        />
        <StatCard label={t.revenueYear} value={money(stats.year_revenue)} tone="info" />
      </div>

      <div className="revenue-grid">
        <div className="panel revenue-panel">
          <div className="panel-header">
            <h3>{t.revenueVsExpenses}</h3>
          </div>
          <div className="panel-body">
            <RevenueTrendChart data={stats.monthly_trend} />
          </div>
        </div>

        <div className="panel revenue-panel">
          <div className="panel-header">
            <h3>{t.revenueSources}</h3>
          </div>
          <div className="panel-body">
            <RevenueSourceDonut
              contracts={stats.revenue_by_source.contracts}
              reservations={stats.revenue_by_source.reservations}
            />
          </div>
        </div>
      </div>

      <div className="revenue-grid">
        <div className="panel revenue-panel">
          <div className="panel-header">
            <h3>{t.netTrend}</h3>
          </div>
          <div className="panel-body">
            <RevenueNetChart data={stats.monthly_trend} />
          </div>
        </div>

        <div className="panel revenue-panel">
          <div className="panel-header">
            <h3>{t.paymentMethodsBreakdown}</h3>
          </div>
          <div className="panel-body">
            {stats.by_payment_method.length === 0 ? (
              <div className="empty">{t.noData}</div>
            ) : (
              <HorizontalBreakdownChart
                rows={toMethodRows(stats.by_payment_method)}
                labelForKey={(key) => t[PAYMENT_METHOD_KEYS[key as keyof typeof PAYMENT_METHOD_KEYS] ?? 'cash'] ?? key}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
