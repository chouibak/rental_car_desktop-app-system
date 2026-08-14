import {
  datePrefixEquals,
  localYmd,
  localYearMonth,
  roundMoney,
  shiftYearMonth,
  trailingYearMonths,
} from './local-date'
import { queryUnpaidTotal } from './payment-sync'

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

function sumContractRevenue(helpers: DbHelpers, prefix?: string) {
  const clauses = ['c.deleted_at IS NULL']
  const params: unknown[] = []
  if (prefix) {
    clauses.push(datePrefixEquals('p.paid_at', prefix))
    params.push(prefix)
  }
  return roundMoney(
    helpers.queryOne<{ s: number }>(
      `SELECT COALESCE(SUM(p.amount), 0) as s
       FROM payments p
       INNER JOIN contracts c ON c.id = p.contract_id
       WHERE ${clauses.join(' AND ')}`,
      params,
    )?.s ?? 0,
  )
}

function sumReservationRevenue(helpers: DbHelpers, prefix?: string) {
  const clauses = [`p.type = 'rental'`, `p.status = 'completed'`, `r.status != 'cancelled'`]
  const params: unknown[] = []
  if (prefix) {
    clauses.push(datePrefixEquals('p.paid_at', prefix))
    params.push(prefix)
  }
  return roundMoney(
    helpers.queryOne<{ s: number }>(
      `SELECT COALESCE(SUM(p.amount), 0) as s
       FROM reservation_payments p
       INNER JOIN reservations r ON r.id = p.reservation_id
       WHERE ${clauses.join(' AND ')}`,
      params,
    )?.s ?? 0,
  )
}

function totalRevenue(helpers: DbHelpers, prefix?: string) {
  return roundMoney(sumContractRevenue(helpers, prefix) + sumReservationRevenue(helpers, prefix))
}

function countPayments(helpers: DbHelpers, prefix: string) {
  const contracts =
    helpers.queryOne<{ c: number }>(
      `SELECT COUNT(*) as c
       FROM payments p
       INNER JOIN contracts c ON c.id = p.contract_id AND c.deleted_at IS NULL
       WHERE ${datePrefixEquals('p.paid_at', prefix)}`,
      [prefix],
    )?.c ?? 0
  const reservations =
    helpers.queryOne<{ c: number }>(
      `SELECT COUNT(*) as c
       FROM reservation_payments p
       INNER JOIN reservations r ON r.id = p.reservation_id AND r.status != 'cancelled'
       WHERE p.type = 'rental' AND p.status = 'completed' AND ${datePrefixEquals('p.paid_at', prefix)}`,
      [prefix],
    )?.c ?? 0
  return contracts + reservations
}

function sumExpenses(helpers: DbHelpers, prefix?: string) {
  if (prefix) {
    return roundMoney(
      helpers.queryOne<{ s: number }>(
        `SELECT COALESCE(SUM(amount), 0) as s FROM expenses WHERE ${datePrefixEquals('expense_date', prefix)}`,
        [prefix],
      )?.s ?? 0,
    )
  }
  return roundMoney(helpers.queryOne<{ s: number }>(`SELECT COALESCE(SUM(amount), 0) as s FROM expenses`)?.s ?? 0)
}

function growthPct(current: number, previous: number) {
  if (previous === 0 && current === 0) return null
  if (previous === 0) return 100
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export function createRevenueApi(helpers: DbHelpers) {
  return {
    getRevenueStats(): RevenueStats {
      const today = localYmd()
      const monthPrefix = localYearMonth()
      const lastMonthPrefix = shiftYearMonth(monthPrefix, -1)
      const yearPrefix = today.slice(0, 4)

      const today_revenue = totalRevenue(helpers, today)
      const month_revenue = totalRevenue(helpers, monthPrefix)
      const last_month_revenue = totalRevenue(helpers, lastMonthPrefix)
      const year_revenue = totalRevenue(helpers, yearPrefix)
      const month_expenses = sumExpenses(helpers, monthPrefix)
      const month_net = roundMoney(month_revenue - month_expenses)

      const monthly_trend = trailingYearMonths(6).map((month) => {
        const revenue = totalRevenue(helpers, month)
        const expenses = sumExpenses(helpers, month)
        return { month, revenue, expenses, net: roundMoney(revenue - expenses) }
      })

      const contracts = sumContractRevenue(helpers, monthPrefix)
      const reservations = sumReservationRevenue(helpers, monthPrefix)

      const contractMethods = helpers.queryAll<{ method: string; amount: number }>(
        `SELECT COALESCE(NULLIF(TRIM(p.method), ''), 'cash') as method, COALESCE(SUM(p.amount), 0) as amount
         FROM payments p
         INNER JOIN contracts c ON c.id = p.contract_id AND c.deleted_at IS NULL
         WHERE ${datePrefixEquals('p.paid_at', monthPrefix)}
         GROUP BY COALESCE(NULLIF(TRIM(p.method), ''), 'cash')`,
        [monthPrefix],
      )
      const reservationMethods = helpers.queryAll<{ method: string; amount: number }>(
        `SELECT COALESCE(NULLIF(TRIM(p.method), ''), 'cash') as method, COALESCE(SUM(p.amount), 0) as amount
         FROM reservation_payments p
         INNER JOIN reservations r ON r.id = p.reservation_id AND r.status != 'cancelled'
         WHERE p.type = 'rental' AND p.status = 'completed' AND ${datePrefixEquals('p.paid_at', monthPrefix)}
         GROUP BY COALESCE(NULLIF(TRIM(p.method), ''), 'cash')`,
        [monthPrefix],
      )
      const methodMap = new Map<string, number>()
      for (const row of [...contractMethods, ...reservationMethods]) {
        methodMap.set(row.method, roundMoney((methodMap.get(row.method) ?? 0) + Number(row.amount)))
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
        unpaid_total: roundMoney(queryUnpaidTotal(helpers)),
        month_payments_count: countPayments(helpers, monthPrefix),
        month_growth_pct: growthPct(month_revenue, last_month_revenue),
        monthly_trend,
        revenue_by_source: { contracts, reservations },
        by_payment_method,
      }
    },
  }
}
