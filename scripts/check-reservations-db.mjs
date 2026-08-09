import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm')
const dbPath = path.join(process.env.APPDATA || '', 'rental-car-crm', 'rentalcar.sqlite')

function q(db, sql) {
  try {
    return db.exec(sql)[0]?.values ?? []
  } catch (err) {
    return { error: String(err) }
  }
}

const SQL = await initSqlJs({ locateFile: () => wasmPath })
if (!fs.existsSync(dbPath)) {
  console.log('DB not found:', dbPath)
  process.exit(0)
}

const db = new SQL.Database(fs.readFileSync(dbPath))
console.log('=== RESERVATIONS DB AUDIT ===\n')

const rows = q(
  db,
  `
  SELECT r.id, r.reference, r.status, r.payment_status, r.deposit_status,
    r.customer_id, cu.name, r.car_id, ca.name, ca.plate_number,
    r.days, r.daily_rate, r.total_amount, r.deposit_amount,
    r.pickup_date, r.return_date,
    COALESCE((
      SELECT SUM(amount) FROM reservation_payments rp
      WHERE rp.reservation_id = r.id AND rp.type = 'rental' AND rp.status = 'completed'
    ), 0) as paid,
    (SELECT COUNT(*) FROM contracts c WHERE c.reservation_id = r.id AND c.deleted_at IS NULL) as contract_count
  FROM reservations r
  JOIN customers cu ON cu.id = r.customer_id
  JOIN cars ca ON ca.id = r.car_id
  ORDER BY r.id
`,
)

console.log('Reservations:', rows.length)

for (const row of rows) {
  const [
    id,
    ref,
    status,
    payStatus,
    depStatus,
    custId,
    custName,
    carId,
    carName,
    plate,
    days,
    rate,
    total,
    deposit,
    pickup,
    ret,
    paid,
    contractCount,
  ] = row

  let expected = 'unpaid'
  if (paid <= 0) expected = 'unpaid'
  else if (paid >= total) expected = 'paid'
  else expected = 'partial'

  console.log(`\n--- ${ref} (id=${id}) ---`)
  console.log(`  client: ${custName} (id=${custId})`)
  console.log(`  car: ${carName} ${plate} (id=${carId})`)
  console.log(`  dates: ${pickup} → ${ret}`)
  console.log(`  status: ${status} | deposit_status: ${depStatus}`)
  console.log(
    `  payment_status: ${payStatus}${payStatus !== expected ? ` (EXPECTED ${expected})` : ' OK'}`,
  )
  console.log(`  total: ${total} | paid: ${paid} | remaining: ${Math.max(0, total - paid)}`)
  if (days * rate !== total) {
    console.log(`  WARN: days(${days}) x rate(${rate}) = ${days * rate} != total(${total})`)
  }
  if (contractCount > 1) console.log(`  WARN: ${contractCount} contracts linked (duplicate)`)
  else if (contractCount === 1) console.log(`  contract linked: yes`)
  else console.log(`  contract linked: none`)
}

const orphanCustomer = q(
  db,
  `SELECT r.id, r.reference FROM reservations r
   LEFT JOIN customers cu ON cu.id = r.customer_id WHERE cu.id IS NULL`,
)
console.log('\nOrphan customer refs:', orphanCustomer.length ? orphanCustomer : 'none')

const orphanCar = q(
  db,
  `SELECT r.id, r.reference FROM reservations r
   LEFT JOIN cars ca ON ca.id = r.car_id WHERE ca.id IS NULL`,
)
console.log('Orphan car refs:', orphanCar.length ? orphanCar : 'none')

const overlaps = q(
  db,
  `
  SELECT r1.reference, r2.reference, ca.plate_number FROM reservations r1
  JOIN reservations r2 ON r1.car_id = r2.car_id AND r1.id < r2.id
  JOIN cars ca ON ca.id = r1.car_id
  WHERE r1.status IN ('pending', 'confirmed') AND r2.status IN ('pending', 'confirmed')
    AND NOT (r1.return_date <= r2.pickup_date OR r1.pickup_date >= r2.return_date)
`,
)
console.log('Overlapping active reservations (same car):', overlaps.length ? overlaps : 'none')

const orphanPayments = q(
  db,
  `SELECT p.id, p.reservation_id FROM reservation_payments p
   LEFT JOIN reservations r ON r.id = p.reservation_id WHERE r.id IS NULL`,
)
console.log('Orphan reservation_payments:', orphanPayments.length ? orphanPayments : 'none')
