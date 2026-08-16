/**
 * Read-only health check of the live payment data.
 * Run with: node scripts/payment-audit.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs from 'sql.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = path.join(process.env.APPDATA, 'rental-car-crm', 'rentalcar.sqlite')

const SQL = await initSqlJs({ locateFile: () => path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm') })
const db = new SQL.Database(fs.readFileSync(dbPath))
const rows = (sql) => {
  const result = db.exec(sql)
  if (!result.length) return []
  return result[0].values.map((value) => Object.fromEntries(result[0].columns.map((c, i) => [c, value[i]])))
}

const contractPaid = `(
  COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.contract_id = c.id AND p.status = 'completed'), 0)
  + CASE WHEN c.reservation_id IS NOT NULL THEN COALESCE((
      SELECT SUM(rp.amount) FROM reservation_payments rp
      WHERE rp.reservation_id = c.reservation_id AND rp.type = 'rental' AND rp.status = 'completed'
    ), 0) ELSE 0 END
)`

const reservationPaid = `(
  COALESCE((SELECT SUM(rp.amount) FROM reservation_payments rp
    WHERE rp.reservation_id = r.id AND rp.type = 'rental' AND rp.status = 'completed'), 0)
  + COALESCE((SELECT SUM(p.amount) FROM payments p
      INNER JOIN contracts pc ON pc.id = p.contract_id AND pc.deleted_at IS NULL AND pc.status != 'cancelled'
      WHERE pc.reservation_id = r.id AND p.status = 'completed'), 0)
)`

const reservationTotal = `MAX(COALESCE(r.total_amount, 0), COALESCE((
  SELECT MAX(tc.total_amount) FROM contracts tc
  WHERE tc.reservation_id = r.id AND tc.deleted_at IS NULL AND tc.status != 'cancelled'), 0))`

console.log('payments columns:', rows('PRAGMA table_info(payments)').map((c) => c.name).join(', '))

const report = (label, list) => {
  console.log(`\n${label}: ${list.length}`)
  for (const row of list.slice(0, 10)) console.log('  ', row)
}

report(
  'Overpaid contracts',
  rows(`SELECT c.id, c.contract_number, c.total_amount, ${contractPaid} as paid
        FROM contracts c
        WHERE c.deleted_at IS NULL AND c.status != 'cancelled' AND ${contractPaid} > COALESCE(c.total_amount, 0) + 0.001`),
)

report(
  'Overpaid reservations',
  rows(`SELECT r.id, r.reference, ${reservationTotal} as total, ${reservationPaid} as paid
        FROM reservations r
        WHERE r.status != 'cancelled' AND ${reservationPaid} > ${reservationTotal} + 0.001`),
)

report(
  'Reservations whose stored status disagrees with the ledger',
  rows(`SELECT r.id, r.reference, r.payment_status, ${reservationPaid} as paid, ${reservationTotal} as total
        FROM reservations r
        WHERE r.status != 'cancelled'
          AND r.payment_status != (
            CASE WHEN ${reservationPaid} <= 0.001 THEN 'unpaid'
                 WHEN ${reservationTotal} > 0 AND ${reservationPaid} >= ${reservationTotal} - 0.001 THEN 'paid'
                 ELSE 'partial' END)`),
)

report(
  'Payments on missing or deleted contracts',
  rows(`SELECT p.id, p.contract_id, p.amount FROM payments p
        LEFT JOIN contracts c ON c.id = p.contract_id
        WHERE c.id IS NULL OR c.deleted_at IS NOT NULL`),
)

report(
  'Reservation payments on missing reservations',
  rows(`SELECT p.id, p.reservation_id, p.amount FROM reservation_payments p
        LEFT JOIN reservations r ON r.id = p.reservation_id
        WHERE r.id IS NULL`),
)

report('Payments with an invalid amount', rows('SELECT id, amount FROM payments WHERE amount IS NULL OR amount <= 0'))
report(
  'Payments with an unknown status',
  rows(`SELECT id, status FROM payments WHERE status NOT IN ('completed','pending','cancelled')`),
)
