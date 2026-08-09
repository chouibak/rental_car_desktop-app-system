/**
 * Pre-sale audit — backend + database integrity check.
 * Run: node scripts/pre-sale-audit.mjs
 */
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm')
const dbPath = path.join(process.env.APPDATA || '', 'rental-car-crm', 'rentalcar.sqlite')

const results = { pass: [], warn: [], fail: [] }

function pass(msg) {
  results.pass.push(msg)
}
function warn(msg) {
  results.warn.push(msg)
}
function fail(msg) {
  results.fail.push(msg)
}

function q(db, sql) {
  try {
    const result = db.exec(sql)[0]
    if (!result) return []
    const cols = result.columns
    return result.values.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])))
  } catch (err) {
    fail(`SQL error: ${String(err)}`)
    return []
  }
}

if (!fs.existsSync(dbPath)) {
  fail(`Database not found: ${dbPath}`)
  printReport()
  process.exit(1)
}

const SQL = await initSqlJs({ locateFile: () => wasmPath })
const db = new SQL.Database(fs.readFileSync(dbPath))

console.log('=== PRE-SALE AUDIT ===')
console.log('Database:', dbPath)
console.log('Date:', new Date().toISOString(), '\n')

// --- Schema ---
const tables = q(db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name)
const requiredTables = [
  'cars',
  'customers',
  'reservations',
  'reservation_payments',
  'contracts',
  'payments',
  'expenses',
  'settings',
]
for (const t of requiredTables) {
  if (tables.includes(t)) pass(`Table exists: ${t}`)
  else fail(`Missing table: ${t}`)
}

// --- Foreign keys / orphans ---
const orphanContractClient = q(
  db,
  `SELECT COUNT(*) as c FROM contracts c LEFT JOIN customers cu ON cu.id=c.client_id WHERE cu.id IS NULL AND c.deleted_at IS NULL`,
)[0]?.c
if (orphanContractClient === 0) pass('No orphan client on active contracts')
else fail(`${orphanContractClient} contracts with missing client`)

const orphanContractCar = q(
  db,
  `SELECT COUNT(*) as c FROM contracts c LEFT JOIN cars ca ON ca.id=c.car_id WHERE ca.id IS NULL AND c.deleted_at IS NULL`,
)[0]?.c
if (orphanContractCar === 0) pass('No orphan car on active contracts')
else fail(`${orphanContractCar} contracts with missing car`)

const orphanResClient = q(
  db,
  `SELECT COUNT(*) as c FROM reservations r LEFT JOIN customers cu ON cu.id=r.customer_id WHERE cu.id IS NULL`,
)[0]?.c
if (orphanResClient === 0) pass('No orphan customer on reservations')
else fail(`${orphanResClient} reservations with missing customer`)

const orphanResCar = q(
  db,
  `SELECT COUNT(*) as c FROM reservations r LEFT JOIN cars ca ON ca.id=r.car_id WHERE ca.id IS NULL`,
)[0]?.c
if (orphanResCar === 0) pass('No orphan car on reservations')
else fail(`${orphanResCar} reservations with missing car`)

const orphanPayments = q(
  db,
  `SELECT COUNT(*) as c FROM reservation_payments p LEFT JOIN reservations r ON r.id=p.reservation_id WHERE r.id IS NULL`,
)[0]?.c
if (orphanPayments === 0) pass('No orphan reservation_payments')
else fail(`${orphanPayments} orphan reservation_payments`)

const dupResLink = q(
  db,
  `SELECT reservation_id, COUNT(*) c FROM contracts WHERE reservation_id IS NOT NULL AND deleted_at IS NULL GROUP BY reservation_id HAVING c > 1`,
)
if (dupResLink.length === 0) pass('No duplicate contract per reservation')
else fail(`Duplicate reservation links: ${dupResLink.length}`)

// --- Payment sync (combined sources) ---
const reservations = q(
  db,
  `SELECT r.id, r.reference, r.payment_status, r.total_amount,
    COALESCE((SELECT SUM(amount) FROM reservation_payments rp WHERE rp.reservation_id=r.id AND rp.type='rental' AND rp.status='completed'),0)
    + COALESCE((SELECT SUM(p.amount) FROM payments p JOIN contracts c ON c.id=p.contract_id AND c.deleted_at IS NULL WHERE c.reservation_id=r.id),0) as paid
   FROM reservations r WHERE r.status != 'cancelled'`,
)
let paymentMismatches = 0
for (const r of reservations) {
  const paid = Number(r.paid)
  const total = Number(r.total_amount)
  let expected = 'unpaid'
  if (paid <= 0) expected = 'unpaid'
  else if (paid >= total) expected = 'paid'
  else expected = 'partial'
  if (r.payment_status !== expected) paymentMismatches++
}
if (paymentMismatches === 0) pass(`Payment status sync OK (${reservations.length} reservations)`)
else fail(`${paymentMismatches} reservation(s) with wrong payment_status`)

// --- Car status sync ---
const cars = q(db, `SELECT id, name, plate_number, status FROM cars ORDER BY id`)
let carStatusIssues = 0
for (const car of cars) {
  const hasActiveContract = q(
    db,
    `SELECT 1 FROM contracts WHERE car_id=${car.id} AND deleted_at IS NULL AND status IN ('active','draft') LIMIT 1`,
  ).length
  const hasActiveRes = q(
    db,
    `SELECT 1 FROM reservations WHERE car_id=${car.id} AND status IN ('pending','confirmed') AND datetime(return_date) > datetime('now') LIMIT 1`,
  ).length
  const shouldBeLouee = hasActiveContract || hasActiveRes
  if (shouldBeLouee && car.status !== 'louee') carStatusIssues++
  if (!shouldBeLouee && car.status === 'louee') carStatusIssues++
}
if (carStatusIssues === 0) pass(`Car status sync OK (${cars.length} cars)`)
else warn(`${carStatusIssues} car(s) with possible status mismatch`)

// --- Revenue consistency ---
const month = new Date().toISOString().slice(0, 7)
const contractRev = q(db, `SELECT COALESCE(SUM(amount),0) as s FROM payments WHERE paid_at LIKE '${month}%'`)[0]?.s ?? 0
const resRev = q(
  db,
  `SELECT COALESCE(SUM(amount),0) as s FROM reservation_payments WHERE type='rental' AND status='completed' AND paid_at LIKE '${month}%'`,
)[0]?.s ?? 0
pass(`Month revenue (${month}): ${Number(contractRev) + Number(resRev)} MAD (contracts ${contractRev} + reservations ${resRev})`)

// --- Settings ---
const settings = q(db, `SELECT key, value FROM settings`)
const companyName = settings.find((s) => s.key === 'company_name')?.value?.trim()
if (companyName) pass(`Company configured: ${companyName}`)
else warn('Company name not set in settings')

const logo = settings.find((s) => s.key === 'company_logo')?.value?.trim()
if (logo) pass('Company logo configured')
else warn('Company logo not configured')

// --- Minor issues ---
const orphanImages = q(
  db,
  `SELECT id, car_id FROM car_images WHERE car_id IS NULL OR car_id = 0 OR car_id NOT IN (SELECT id FROM cars)`,
)
if (orphanImages.length === 0) pass('No orphan car images')
else warn(`${orphanImages.length} orphan car image(s) (car_id=0 or missing car)`)

const softDeleted = q(db, `SELECT COUNT(*) as c FROM contracts WHERE deleted_at IS NOT NULL`)[0]?.c ?? 0
if (softDeleted > 0) warn(`${softDeleted} soft-deleted contract(s) in archive (normal)`)

const draftWhileRented = q(
  db,
  `SELECT contract_number FROM contracts WHERE deleted_at IS NULL AND status='draft' AND car_id IN (SELECT id FROM cars WHERE status='louee')`,
)
if (draftWhileRented.length > 0)
  warn(`${draftWhileRented.length} draft contract(s) on rented cars — activate when delivered`)

const overlapping = q(
  db,
  `SELECT COUNT(*) as c FROM reservations r1
   JOIN reservations r2 ON r1.car_id=r2.car_id AND r1.id<r2.id
   WHERE r1.status IN ('pending','confirmed') AND r2.status IN ('pending','confirmed')
     AND NOT (r1.return_date <= r2.pickup_date OR r1.pickup_date >= r2.return_date)`,
)[0]?.c ?? 0
if (overlapping === 0) pass('No overlapping active reservations')
else fail(`${overlapping} overlapping reservation conflict(s)`)

// --- Backend files ---
const backendFiles = [
  'electron/db.ts',
  'electron/main.ts',
  'electron/payment-sync.ts',
  'electron/contracts-db.ts',
  'electron/reservations-db.ts',
  'electron/revenue-db.ts',
]
for (const f of backendFiles) {
  if (fs.existsSync(path.join(import.meta.dirname, '..', f))) pass(`Backend module: ${f}`)
  else fail(`Missing backend file: ${f}`)
}

function printReport() {
  console.log('\n=== RESULTS ===')
  console.log(`PASS: ${results.pass.length}`)
  for (const m of results.pass) console.log(`  ✓ ${m}`)
  if (results.warn.length) {
    console.log(`\nWARN: ${results.warn.length}`)
    for (const m of results.warn) console.log(`  ⚠ ${m}`)
  }
  if (results.fail.length) {
    console.log(`\nFAIL: ${results.fail.length}`)
    for (const m of results.fail) console.log(`  ✗ ${m}`)
  }
  console.log('\n=== VERDICT ===')
  if (results.fail.length === 0) {
    console.log(results.warn.length === 0 ? 'READY TO SELL ✓' : 'READY WITH MINOR WARNINGS ✓')
  } else {
    console.log('NOT READY — fix failures above')
  }
}

printReport()
try {
  db.close()
} catch {
  /* ignore */
}
process.exitCode = results.fail.length > 0 ? 1 : 0
