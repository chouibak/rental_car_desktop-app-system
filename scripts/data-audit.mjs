/**
 * Read-only integrity check of the live database: orphan rows, broken links and
 * statuses that disagree with the data behind them.
 * Run with: node scripts/data-audit.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs from 'sql.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dbPath = path.join(process.env.APPDATA, 'rental-car-crm', 'rentalcar.sqlite')

const SQL = await initSqlJs({
  locateFile: () => path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
})
const db = new SQL.Database(fs.readFileSync(dbPath))

const rows = (sql) => {
  const result = db.exec(sql)
  if (!result.length) return []
  return result[0].values.map((value) =>
    Object.fromEntries(result[0].columns.map((column, index) => [column, value[index]])),
  )
}

let problems = 0
const report = (label, list) => {
  problems += list.length
  console.log(`${list.length === 0 ? 'OK  ' : 'FAIL'}  ${label}: ${list.length}`)
  for (const row of list.slice(0, 5)) console.log('       ', row)
}

console.log('\n--- Referential integrity ---')

// Archived (soft-deleted) contracts are excluded: every screen filters them out already.
report(
  'Live contracts pointing at a missing customer',
  rows(`SELECT c.id, c.contract_number, c.client_id FROM contracts c
        WHERE c.deleted_at IS NULL AND c.client_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM customers cu WHERE cu.id = c.client_id)`),
)

report(
  'Live contracts pointing at a missing car',
  rows(`SELECT c.id, c.contract_number, c.car_id FROM contracts c
        WHERE c.deleted_at IS NULL AND c.car_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM cars ca WHERE ca.id = c.car_id)`),
)

report(
  'Live contracts pointing at a missing reservation',
  rows(`SELECT c.id, c.contract_number, c.reservation_id FROM contracts c
        WHERE c.deleted_at IS NULL AND c.reservation_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.id = c.reservation_id)`),
)

report(
  'Reservations pointing at a missing customer or car',
  rows(`SELECT r.id, r.reference FROM reservations r
        WHERE NOT EXISTS (SELECT 1 FROM customers cu WHERE cu.id = r.customer_id)
           OR NOT EXISTS (SELECT 1 FROM cars ca WHERE ca.id = r.car_id)`),
)

report(
  'Reservations pointing at a missing chauffeur',
  rows(`SELECT r.id, r.reference, r.chauffeur_id FROM reservations r
        WHERE r.chauffeur_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM chauffeurs ch WHERE ch.id = r.chauffeur_id)`),
)

report(
  'Payments on a missing contract',
  rows(`SELECT p.id, p.contract_id FROM payments p
        WHERE NOT EXISTS (SELECT 1 FROM contracts c WHERE c.id = p.contract_id)`),
)

report(
  'Reservation payments on a missing reservation',
  rows(`SELECT rp.id, rp.reservation_id FROM reservation_payments rp
        WHERE NOT EXISTS (SELECT 1 FROM reservations r WHERE r.id = rp.reservation_id)`),
)

report(
  'Expenses on a missing car',
  rows(`SELECT e.id, e.title, e.car_id FROM expenses e
        WHERE e.car_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM cars ca WHERE ca.id = e.car_id)`),
)

report(
  'Vidanges on a missing car',
  rows(`SELECT v.id, v.car_id FROM car_vidanges v
        WHERE NOT EXISTS (SELECT 1 FROM cars ca WHERE ca.id = v.car_id)`),
)

console.log('\n--- Business rules ---')

report(
  'Duplicate plate numbers',
  rows(`SELECT plate_number, COUNT(*) as c FROM cars
        GROUP BY plate_number HAVING c > 1`),
)

report(
  'Duplicate contract numbers',
  rows(`SELECT contract_number, COUNT(*) as c FROM contracts
        WHERE deleted_at IS NULL GROUP BY contract_number HAVING c > 1`),
)

report(
  'Duplicate reservation references',
  rows(`SELECT reference, COUNT(*) as c FROM reservations
        GROUP BY reference HAVING c > 1`),
)

report(
  'Reservations with more than one live contract',
  rows(`SELECT r.id, r.reference, COUNT(c.id) as contracts FROM reservations r
        JOIN contracts c ON c.reservation_id = r.id AND c.deleted_at IS NULL AND c.status != 'cancelled'
        GROUP BY r.id HAVING contracts > 1`),
)

report(
  'Cars marked rented without a live rental',
  rows(`SELECT ca.id, ca.name, ca.plate_number FROM cars ca
        WHERE ca.status = 'louee'
          AND NOT EXISTS (
            SELECT 1 FROM contracts c
            WHERE c.car_id = ca.id AND c.status = 'active' AND c.deleted_at IS NULL)
          AND NOT EXISTS (
            SELECT 1 FROM reservations r
            WHERE r.car_id = ca.id AND r.status IN ('pending', 'confirmed')
              AND datetime(r.pickup_date) <= datetime('now')
              AND datetime(r.return_date) > datetime('now'))`),
)

report(
  'Cars marked available while rented out',
  rows(`SELECT ca.id, ca.name, ca.plate_number FROM cars ca
        WHERE ca.status = 'disponible'
          AND EXISTS (
            SELECT 1 FROM contracts c
            WHERE c.car_id = ca.id AND c.status = 'active' AND c.deleted_at IS NULL)`),
)

report(
  'Overlapping active contracts on the same car',
  rows(`SELECT a.id as contract_a, b.id as contract_b, a.car_id FROM contracts a
        JOIN contracts b ON b.car_id = a.car_id AND b.id > a.id
        WHERE a.status = 'active' AND b.status = 'active'
          AND a.deleted_at IS NULL AND b.deleted_at IS NULL
          AND NOT (date(b.end_date) < date(a.start_date) OR date(b.start_date) > date(a.end_date))`),
)

report(
  'Contracts ending before they start',
  rows(`SELECT id, contract_number, start_date, end_date FROM contracts
        WHERE deleted_at IS NULL AND date(end_date) < date(start_date)`),
)

report(
  'Reservations ending before they start',
  rows(`SELECT id, reference, pickup_date, return_date FROM reservations
        WHERE datetime(return_date) <= datetime(pickup_date)`),
)

report(
  'Negative or zero amounts',
  rows(`SELECT 'payment' as source, id, amount FROM payments WHERE amount <= 0
        UNION ALL SELECT 'reservation_payment', id, amount FROM reservation_payments WHERE amount <= 0
        UNION ALL SELECT 'expense', id, amount FROM expenses WHERE amount <= 0`),
)

report(
  'Customers without a name',
  rows(`SELECT id FROM customers WHERE TRIM(COALESCE(name, '')) = ''`),
)

console.log(`\n${problems === 0 ? 'No integrity problems found.' : `${problems} row(s) need attention.`}`)
