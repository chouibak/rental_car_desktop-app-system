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
console.log('=== FULL CRM DATABASE AUDIT ===\n')
console.log('DB:', dbPath)

const tables = q(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
console.log('\nTables:', tables.map((r) => r[0]).join(', '))

console.log('\n--- COUNTS ---')
for (const [table] of [
  ['cars'],
  ['customers'],
  ['reservations'],
  ['reservation_payments'],
  ['contracts'],
  ['payments'],
  ['returns'],
  ['car_images'],
  ['settings'],
  ['clients'],
]) {
  console.log(`  ${table}:`, q(db, `SELECT COUNT(*) FROM ${table}`)[0]?.[0])
}

console.log('\n--- CARS ---')
const cars = q(db, `SELECT id, name, plate_number, status, is_available FROM cars ORDER BY id`)
for (const [id, name, plate, status, avail] of cars) {
  const activeContract = q(
    db,
    `SELECT contract_number FROM contracts WHERE car_id=${id} AND status='active' AND deleted_at IS NULL LIMIT 1`,
  )[0]?.[0]
  const activeRes = q(
    db,
    `SELECT reference FROM reservations WHERE car_id=${id} AND status IN ('pending','confirmed') LIMIT 1`,
  )[0]?.[0]
  const issues = []
  if (status === 'disponible' && (activeContract || activeRes)) issues.push('should be louee')
  if (status === 'louee' && !activeContract && !activeRes) issues.push('should be disponible?')
  console.log(`  #${id} ${name} ${plate} | status=${status} | contract=${activeContract || '-'} | res=${activeRes || '-'}${issues.length ? ' ⚠ ' + issues.join(',') : ''}`)
}

console.log('\n--- CUSTOMERS ---')
const orphanCustContracts = q(
  db,
  `SELECT c.id, c.contract_number FROM contracts c LEFT JOIN customers cu ON cu.id=c.client_id WHERE cu.id IS NULL AND c.deleted_at IS NULL`,
)
console.log('  Orphan client refs on contracts:', orphanCustContracts.length ? orphanCustContracts : 'none')

const customersNoPhone = q(db, `SELECT id, name FROM customers WHERE phone IS NULL OR trim(phone)=''`)
console.log('  Customers missing phone:', customersNoPhone.length || 'none')

console.log('\n--- DASHBOARD REVENUE CHECK ---')
const month = new Date().toISOString().slice(0, 7)
const contractPaymentsMonth = q(
  db,
  `SELECT COALESCE(SUM(amount),0) FROM payments WHERE paid_at LIKE '${month}%'`,
)[0]?.[0]
const reservationPaymentsMonth = q(
  db,
  `SELECT COALESCE(SUM(amount),0) FROM reservation_payments WHERE type='rental' AND status='completed' AND paid_at LIKE '${month}%'`,
)[0]?.[0]
console.log(`  Dashboard uses payments table only: ${contractPaymentsMonth} MAD`)
console.log(`  Reservation payments this month: ${reservationPaymentsMonth} MAD`)
console.log(`  Combined revenue should be: ${Number(contractPaymentsMonth) + Number(reservationPaymentsMonth)} MAD`)

console.log('\n--- RESERVATION PAYMENT SYNC ---')
const mismatched = q(
  db,
  `
  SELECT r.reference, r.payment_status,
    COALESCE((SELECT SUM(amount) FROM reservation_payments rp WHERE rp.reservation_id=r.id AND rp.type='rental' AND rp.status='completed'),0) as paid,
    r.total_amount
  FROM reservations r WHERE r.status != 'cancelled'
`,
)
for (const [ref, status, paid, total] of mismatched) {
  let expected = 'unpaid'
  if (paid <= 0) expected = 'unpaid'
  else if (paid >= total) expected = 'paid'
  else expected = 'partial'
  if (status !== expected) console.log(`  MISMATCH ${ref}: stored=${status} expected=${expected}`)
}
console.log('  (no lines = all OK)')

console.log('\n--- CONTRACT INTEGRITY ---')
const dupRes = q(
  db,
  `SELECT reservation_id, COUNT(*) c FROM contracts WHERE reservation_id IS NOT NULL AND deleted_at IS NULL GROUP BY reservation_id HAVING c > 1`,
)
console.log('  Duplicate reservation links:', dupRes.length ? dupRes : 'none')

const softDeleted = q(db, `SELECT contract_number FROM contracts WHERE deleted_at IS NOT NULL`)
console.log('  Soft-deleted contracts:', softDeleted.length ? softDeleted.map((r) => r[0]).join(', ') : 'none')

console.log('\n--- CAR IMAGES ---')
const orphanImages = q(
  db,
  `SELECT ci.id, ci.car_id FROM car_images ci LEFT JOIN cars c ON c.id=ci.car_id WHERE c.id IS NULL`,
)
console.log('  Orphan car_images:', orphanImages.length ? orphanImages : 'none')

console.log('\n--- SETTINGS ---')
const settings = q(db, `SELECT key, value FROM settings ORDER BY key`)
const required = ['company_name', 'company_address', 'company_city', 'currency']
for (const key of required) {
  const row = settings.find((r) => r[0] === key)
  if (!row?.[1]?.trim()) console.log(`  MISSING setting: ${key}`)
}
console.log('  Logo configured:', settings.find((r) => r[0] === 'company_logo')?.[1] ? 'yes' : 'no')

console.log('\n=== AUDIT COMPLETE ===')
