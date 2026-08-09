import { useLang } from '../context/LangContext'
import type { RevenueCategoryPoint, RevenueMethodPoint, RevenueMonthPoint } from '../types'

function maxValue(values: number[]) {
  return Math.max(...values, 1)
}

function formatMonthLabel(month: string, lang: 'fr' | 'ar') {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(year, m - 1, 1)
  return date.toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-FR', { month: 'short', year: '2-digit' })
}

export function RevenueTrendChart({ data }: { data: RevenueMonthPoint[] }) {
  const { t, money, lang } = useLang()
  const max = maxValue(data.flatMap((point) => [point.revenue, point.expenses]))

  return (
    <div className="revenue-chart">
      <div className="revenue-chart-legend">
        <span className="legend-item">
          <i className="legend-dot legend-dot--revenue" />
          {t.revenueLabel}
        </span>
        <span className="legend-item">
          <i className="legend-dot legend-dot--expense" />
          {t.expensesLabel}
        </span>
      </div>
      <div className="revenue-bar-chart revenue-bar-chart--grouped">
        {data.map((point) => (
          <div className="revenue-bar-group" key={point.month}>
            <div className="revenue-bar-columns">
              <div
                className="revenue-bar revenue-bar--revenue"
                style={{ height: `${(point.revenue / max) * 100}%` }}
                title={`${t.revenueLabel}: ${money(point.revenue)}`}
              />
              <div
                className="revenue-bar revenue-bar--expense"
                style={{ height: `${(point.expenses / max) * 100}%` }}
                title={`${t.expensesLabel}: ${money(point.expenses)}`}
              />
            </div>
            <span className="revenue-bar-label">{formatMonthLabel(point.month, lang)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function RevenueNetChart({ data }: { data: RevenueMonthPoint[] }) {
  const { money, lang } = useLang()
  const max = maxValue(data.map((point) => Math.abs(point.net)))

  return (
    <div className="revenue-chart">
      <div className="revenue-bar-chart revenue-bar-chart--net">
        {data.map((point) => {
          const positive = point.net >= 0
          const height = (Math.abs(point.net) / max) * 100
          return (
            <div className="revenue-bar-group" key={point.month}>
              <div className="revenue-bar-columns revenue-bar-columns--center">
                <div
                  className={`revenue-bar revenue-bar--net ${positive ? 'positive' : 'negative'}`}
                  style={{ height: `${height}%` }}
                  title={money(point.net)}
                />
              </div>
              <span className="revenue-bar-label">{formatMonthLabel(point.month, lang)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function RevenueSourceDonut({
  contracts,
  reservations,
}: {
  contracts: number
  reservations: number
}) {
  const { t, money } = useLang()
  const total = contracts + reservations
  const contractPct = total > 0 ? (contracts / total) * 100 : 50
  const reservationPct = total > 0 ? 100 - contractPct : 50

  return (
    <div className="revenue-donut-wrap">
      <div
        className="revenue-donut"
        style={{
          background: total
            ? `conic-gradient(var(--accent) 0 ${contractPct}%, var(--rented) ${contractPct}% 100%)`
            : 'conic-gradient(var(--border) 0 100%)',
        }}
      >
        <div className="revenue-donut-hole">
          <strong>{money(total)}</strong>
          <span>{t.total}</span>
        </div>
      </div>
      <div className="revenue-donut-legend">
        <div className="legend-row">
          <i className="legend-dot legend-dot--revenue" />
          <span>{t.contractsRevenue}</span>
          <strong>{money(contracts)}</strong>
          <span className="muted-text">{total ? `${Math.round(contractPct)}%` : '—'}</span>
        </div>
        <div className="legend-row">
          <i className="legend-dot legend-dot--reservation" />
          <span>{t.reservationsRevenue}</span>
          <strong>{money(reservations)}</strong>
          <span className="muted-text">{total ? `${Math.round(reservationPct)}%` : '—'}</span>
        </div>
      </div>
    </div>
  )
}

export function HorizontalBreakdownChart({
  rows,
  labelForKey,
}: {
  rows: { key: string; amount: number }[]
  labelForKey: (key: string) => string
}) {
  const { money } = useLang()
  const max = maxValue(rows.map((row) => row.amount))

  if (rows.length === 0) {
    return <div className="empty">{money(0)}</div>
  }

  return (
    <div className="revenue-hbars">
      {rows.map((row) => (
        <div className="revenue-hbar-row" key={row.key}>
          <div className="revenue-hbar-meta">
            <span>{labelForKey(row.key)}</span>
            <strong>{money(row.amount)}</strong>
          </div>
          <div className="revenue-hbar-track">
            <div className="revenue-hbar-fill" style={{ width: `${(row.amount / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function toMethodRows(rows: RevenueMethodPoint[]) {
  return rows.map((row) => ({ key: row.method, amount: row.amount }))
}

export function toCategoryRows(rows: RevenueCategoryPoint[]) {
  return rows.map((row) => ({ key: row.category, amount: row.amount }))
}
