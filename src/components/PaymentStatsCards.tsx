import { useEffect, useState } from 'react'
import { StatCard } from './ui'
import { useLang } from '../context/LangContext'
import type { PaymentStats } from '../types'

type PaymentStatsCardsProps = {
  refreshKey?: number
}

export function PaymentStatsCards({ refreshKey = 0 }: PaymentStatsCardsProps) {
  const { t, money } = useLang()
  const [stats, setStats] = useState<PaymentStats | null>(null)

  useEffect(() => {
    window.api.getPaymentStats().then(setStats)
  }, [refreshKey])

  if (!stats) {
    return (
      <div className="cards cards--3">
        <div className="stat-card stat-card--loading">{t.loading}</div>
      </div>
    )
  }

  return (
    <div className="cards cards--3">
      <StatCard
        label={t.todayRevenue}
        value={money(stats.today_revenue)}
        hint={t.todayPaymentsHint.replace('{count}', String(stats.today_payments_count))}
        tone="success"
      />
      <StatCard
        label={t.unpaidStats}
        value={money(stats.unpaid_total)}
        hint={t.unpaidStatsHint}
        tone="warn"
      />
      <StatCard
        label={t.monthRevenuePayments}
        value={money(stats.month_revenue)}
        hint={t.monthRevenuePaymentsHint}
        tone="info"
      />
    </div>
  )
}
