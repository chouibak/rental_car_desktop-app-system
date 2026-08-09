import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm')
const candidates = [
  path.join(process.env.APPDATA || '', 'rental-car-crm', 'rentalcar.sqlite'),
  path.join(process.env.APPDATA || '', 'RentalCar CRM', 'rentalcar.sqlite'),
  path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'rental-car-crm', 'rentalcar.sqlite'),
]
const dbPath = candidates.find((p) => fs.existsSync(p))
console.log('DB path:', dbPath || 'NOT FOUND')
if (!dbPath) process.exit(0)

const SQL = await initSqlJs({ locateFile: () => wasmPath })
const db = new SQL.Database(fs.readFileSync(dbPath))

function q(sql) {
  try {
    const res = db.exec(sql)
    return res[0]?.values ?? []
  } catch (err) {
    return { error: String(err) }
  }
}

console.log('Tables:', q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r[0]).join(', '))
console.log('reservation_payments:', q('SELECT COUNT(*) FROM reservation_payments')[0]?.[0])
console.log('contract payments:', q('SELECT COUNT(*) FROM payments')[0]?.[0])
console.log('reservations:', q('SELECT COUNT(*) FROM reservations')[0]?.[0])

const unpaidSql = `SELECT COALESCE(SUM(remaining), 0) as total FROM (
  SELECT MAX(0, r.total_amount - COALESCE(p.paid, 0)) as remaining
  FROM reservations r
  LEFT JOIN (
    SELECT reservation_id, SUM(amount) as paid
    FROM reservation_payments
    WHERE type = 'rental' AND status = 'completed'
    GROUP BY reservation_id
  ) p ON p.reservation_id = r.id
  WHERE r.status != 'cancelled' AND r.payment_status IN ('unpaid', 'partial')
)`
console.log('unpaid stats query:', q(unpaidSql))

const orphanPayments = q(`
  SELECT p.id, p.reservation_id
  FROM reservation_payments p
  LEFT JOIN reservations r ON r.id = p.reservation_id
  WHERE r.id IS NULL
`)
console.log('orphan reservation_payments:', orphanPayments)

const brokenJoin = q(`
  SELECT p.id
  FROM reservation_payments p
  JOIN reservations r ON r.id = p.reservation_id
  JOIN customers cu ON cu.id = r.customer_id
  JOIN cars ca ON ca.id = r.car_id
`)
console.log('payments with valid joins:', brokenJoin.length)

const mismatched = q(`
  SELECT r.id, r.reference, r.payment_status, r.total_amount,
    COALESCE((SELECT SUM(amount) FROM reservation_payments rp WHERE rp.reservation_id = r.id AND rp.type='rental' AND rp.status='completed'), 0) as paid
  FROM reservations r
  WHERE r.status != 'cancelled'
`)
console.log('reservation payment sync check:')
for (const row of mismatched) {
  const [id, ref, status, total, paid] = row
  let expected = 'unpaid'
  if (paid <= 0) expected = 'unpaid'
  else if (paid >= total) expected = 'paid'
  else expected = 'partial'
  if (status !== expected) {
    console.log('  MISMATCH', ref, 'stored=', status, 'expected=', expected, 'total=', total, 'paid=', paid)
  }
}
