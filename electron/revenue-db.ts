import { UNPAID_RESERVATIONS_PAID_SUBQUERY } from './payment-sync'

type DbHelpers = {
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
}

export type RevenueMonthPoint = {
  month: string
  revenue: number
  expenses: number
  net: number
}

export type RevenueMethodPoint = {
  method: string
  amount: number
}

export type RevenueStats = {
  today_revenue: number
  month_revenue: number
  last_month_revenue: number
  year_revenue: number
  month_expenses: number
  month_net: number
  unpaid_total: number
  month_payments_count: number
  month_growth_pct: number | null
  monthly_trend: RevenueMonthPoint[]
  revenue_by_source: { contracts: number; reservations: number }
  by_payment_method: RevenueMethodPoint[]
}

function monthKeys(count: number) {
  const keys: string[] = []
  const cursor = new Date()
  cursor.setDate(1)
  cursor.setMonth(cursor.getMonth() - (count - 1))
  for (let i = 0; i < count; i++) {
    keys.push(cursor.toISOString().slice(0, 7))
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return keys
}

function previousMonthKey(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number)
  const date = new Date(year, month - 2, 1)
  return date.toISOString().slice(0, 7)
}

function sumContractRevenue(helpers: DbHelpers, monthPrefix?: string) {
  if (monthPrefix) {
    return (
      helpers.queryOne<{ s: number }>(
        `SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE paid_at LIKE ?`,
        [`${monthPrefix}%`],
      )?.s ?? 0
    )
  }
  return helpers.queryOne<{ s: number }>(`SELECT COALESCE(SUM(amount), 0) as s FROM payments`)?.s ?? 0
}

function sumReservationRevenue(helpers: DbHelpers, monthPrefix?: string, day?: string) {
  const clauses = [`type = 'rental'`, `status = 'completed'`]
  const params: unknown[] = []
  if (day) {
    clauses.push('paid_at = ?')
    params.push(day)
  } else if (monthPrefix) {
    clauses.push('paid_at LIKE ?')
    params.push(`${monthPrefix}%`)
  }
  return (
    helpers.queryOne<{ s: number }>(
      `SELECT COALESCE(SUM(amount), 0) as s FROM reservation_payments WHERE ${clauses.join(' AND ')}`,
      params,
    )?.s ?? 0
  )
}

function totalRevenue(helpers: DbHelpers, monthPrefix?: string, day?: string) {
  return sumContractRevenue(helpers, monthPrefix) + sumReservationRevenue(helpers, monthPrefix, day)
}

function countPayments(helpers: DbHelpers, monthPrefix: string) {
  const contracts =
    helpers.queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM payments WHERE paid_at LIKE ?`,
      [`${monthPrefix}%`],
    )?.c ?? 0
  const reservations =
    helpers.queryOne<{ c: number }>(
      `SELECT COUNT(*) as c FROM reservation_payments
       WHERE type = 'rental' AND status = 'completed' AND paid_at LIKE ?`,
      [`${monthPrefix}%`],
    )?.c ?? 0
  return contracts + reservations
}

function sumExpenses(helpers: DbHelpers, monthPrefix?: string) {
  if (monthPrefix) {
    return (
      helpers.queryOne<{ s: number }>(
        `SELECT COALESCE(SUM(amount), 0) as s FROM expenses WHERE expense_date LIKE ?`,
        [`${monthPrefix}%`],
      )?.s ?? 0
    )
  }
  return helpers.queryOne<{ s: number }>(`SELECT COALESCE(SUM(amount), 0) as s FROM expenses`)?.s ?? 0
}

function unpaidTotal(helpers: DbHelpers) {
  return (
    helpers.queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(
        CASE
          WHEN r.total_amount > COALESCE(p.paid, 0) THEN r.total_amount - COALESCE(p.paid, 0)
          ELSE 0
        END
      ), 0) as total
       FROM reservations r
       LEFT JOIN (${UNPAID_RESERVATIONS_PAID_SUBQUERY}) p ON p.reservation_id = r.id
       WHERE r.status != 'cancelled'`,
    )?.total ?? 0
  )
}

export function createRevenueApi(helpers: DbHelpers) {
  return {
    getRevenueStats(): RevenueStats {
      const today = new Date().toISOString().slice(0, 10)
      const monthPrefix = today.slice(0, 7)
      const lastMonthPrefix = previousMonthKey(monthPrefix)
      const yearPrefix = today.slice(0, 4)

      const today_revenue = totalRevenue(helpers, undefined, today)
      const month_revenue = totalRevenue(helpers, monthPrefix)
      const last_month_revenue = totalRevenue(helpers, lastMonthPrefix)
      const year_revenue =
        (helpers.queryOne<{ s: number }>(
          `SELECT COALESCE(SUM(amount), 0) as s FROM payments WHERE paid_at LIKE ?`,
          [`${yearPrefix}%`],
        )?.s ?? 0) +
        (helpers.queryOne<{ s: number }>(
          `SELECT COALESCE(SUM(amount), 0) as s FROM reservation_payments
           WHERE type = 'rental' AND status = 'completed' AND paid_at LIKE ?`,
          [`${yearPrefix}%`],
        )?.s ?? 0)

      const month_expenses = sumExpenses(helpers, monthPrefix)
      const month_net = month_revenue - month_expenses
      const month_growth_pct =
        last_month_revenue > 0
          ? Math.round(((month_revenue - last_month_revenue) / last_month_revenue) * 1000) / 10
          : null

      const monthly_trend = monthKeys(6).map((month) => {
        const revenue = totalRevenue(helpers, month)
        const expenses = sumExpenses(helpers, month)
        return { month, revenue, expenses, net: revenue - expenses }
      })

      const contracts = sumContractRevenue(helpers, monthPrefix)
      const reservations = sumReservationRevenue(helpers, monthPrefix)

      const contractMethods = helpers.queryAll<{ method: string; amount: number }>(
        `SELECT method, COALESCE(SUM(amount), 0) as amount
         FROM payments WHERE paid_at LIKE ?
         GROUP BY method`,
        [`${monthPrefix}%`],
      )
      const reservationMethods = helpers.queryAll<{ method: string; amount: number }>(
        `SELECT method, COALESCE(SUM(amount), 0) as amount
         FROM reservation_payments
         WHERE type = 'rental' AND status = 'completed' AND paid_at LIKE ?
         GROUP BY method`,
        [`${monthPrefix}%`],
      )
      const methodMap = new Map<string, number>()
      for (const row of [...contractMethods, ...reservationMethods]) {
        methodMap.set(row.method, (methodMap.get(row.method) ?? 0) + row.amount)
      }
      const by_payment_method = Array.from(methodMap.entries())
        .map(([method, amount]) => ({ method, amount }))
        .sort((a, b) => b.amount - a.amount)

      return {
        today_revenue,
        month_revenue,
        last_month_revenue,
        year_revenue,
        month_expenses,
        month_net,
        unpaid_total: unpaidTotal(helpers),
        month_payments_count: countPayments(helpers, monthPrefix),
        month_growth_pct,
        monthly_trend,
        revenue_by_source: { contracts, reservations },
        by_payment_method,
      }
    },
  }
}
