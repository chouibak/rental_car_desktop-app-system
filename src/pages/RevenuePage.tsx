import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { IconDownload } from '../components/icons'
import { PeriodPdfModal } from '../components/PeriodPdfModal'
import {
  HorizontalBreakdownChart,
  RevenueNetChart,
  RevenueSourceDonut,
  RevenueTrendChart,
  toMethodRows,
} from '../components/RevenueCharts'
import { PageHeader, StatCard } from '../components/ui'
import { useLang } from '../context/LangContext'
import { useToast } from '../context/ToastContext'
import { mapAppError } from '../utils/errors'
import type { RevenueStats } from '../types'

const PAYMENT_METHOD_KEYS: Record<string, 'cash' | 'card' | 'bank_transfer'> = {
  cash: 'cash',
  card: 'card',
  transfer: 'bank_transfer',
  bank_transfer: 'bank_transfer',
}

function currentYear() {
  return new Date().getFullYear()
}

function currentMonth() {
  return new Date().getMonth() + 1
}

export default function RevenuePage() {
  const { t, money, lang } = useLang()
  const { showError } = useToast()
  const [stats, setStats] = useState<RevenueStats | null>(null)
  const [error, setError] = useState('')
  const [year, setYear] = useState(currentYear)
  const [month, setMonth] = useState(currentMonth)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfSaving, setPdfSaving] = useState(false)

  const years = useMemo(() => {
    const y = currentYear()
    return [y, y - 1, y - 2, y - 3]
  }, [])

  const monthOptions = useMemo(() => {
    const locale = lang === 'ar' ? 'ar-MA' : 'fr-FR'
    return Array.from({ length: 12 }, (_, index) => ({
      value: index + 1,
      label: new Date(2000, index, 1).toLocaleDateString(locale, { month: 'long' }),
    }))
  }, [lang])

  useEffect(() => {
    window.api.getRevenueStats().then(setStats).catch(() => setError(t.loadFailed))
  }, [t])

  const growthHint = useMemo(() => {
    if (!stats || stats.month_growth_pct === null) return t.noData
    const sign = stats.month_growth_pct >= 0 ? '+' : ''
    return `${sign}${stats.month_growth_pct}%`
  }, [stats, t.noData])

  const onDownloadPdf = async () => {
    setPdfSaving(true)
    try {
      const result = await window.api.exportRevenuePdf(year, month)
      if (result?.ok) setPdfOpen(false)
      else if (!result?.canceled) showError(t.saveFailed)
    } catch (err) {
      showError(mapAppError(err, t))
    } finally {
      setPdfSaving(false)
    }
  }

  if (error) return <div className="empty">{error}</div>
  if (!stats) return <div className="empty">{t.loading}</div>

  const growthTone =
    stats.month_growth_pct === null ? 'default' : stats.month_growth_pct >= 0 ? 'success' : 'warn'

  return (
    <div className="revenue-page">
      <PageHeader title={t.revenue} subtitle={t.revenueSubtitle}>
        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={() => setPdfOpen(true)}>
            <IconDownload size={15} />
            {t.downloadPdf}
          </button>
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
          hint={t.monthPaymentsHint.replace('{count}', String(stats.month_payments_count))}
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
                labelForKey={(key) => {
                  const mapped = PAYMENT_METHOD_KEYS[key]
                  return mapped ? t[mapped] : key
                }}
              />
            )}
          </div>
        </div>
      </div>

      {pdfOpen ? (
        <PeriodPdfModal
          open={pdfOpen}
          year={year}
          month={month}
          years={years}
          monthOptions={monthOptions}
          saving={pdfSaving}
          onYearChange={setYear}
          onMonthChange={setMonth}
          onCancel={() => setPdfOpen(false)}
          onConfirm={onDownloadPdf}
        />
      ) : null}
    </div>
  )
}
