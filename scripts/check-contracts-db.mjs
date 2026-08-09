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
console.log('=== CONTRACTS DB AUDIT ===\n')

const allContracts = q(db, `
  SELECT c.id, c.contract_number, c.status, c.reservation_id, c.client_id, c.car_id,
    c.total_amount, c.daily_rate, c.daily_price, c.billed_days, c.total_days,
    c.departure_at, c.start_date, c.return_at, c.end_date,
    c.vehicle_brand, c.vehicle_plate, c.deleted_at
  FROM contracts c WHERE c.deleted_at IS NULL ORDER BY c.id
`)
const deletedCount = q(db, `SELECT COUNT(*) FROM contracts WHERE deleted_at IS NOT NULL`)[0]?.[0] ?? 0
console.log('Active contracts:', allContracts.length, deletedCount ? `(+ ${deletedCount} archived/deleted)` : '')

let issues = 0
const contracts = allContracts

for (const row of contracts) {
  const [id, num, status, resId, clientId, carId, total, dailyRate, dailyPrice, billedDays, totalDays, depAt, startDate, retAt, endDate, vBrand, vPlate] = row
  console.log(`\n--- ${num} (id=${id}, status=${status}) ---`)

  const customer = q(db, `SELECT id, name, phone FROM customers WHERE id = ${clientId}`)
  if (!customer.length) {
    console.log('  ERROR: missing customer id=', clientId)
    issues++
  } else console.log('  client:', customer[0][1], customer[0][2] || '')

  const car = q(db, `SELECT id, brand, model, plate_number FROM cars WHERE id = ${carId}`)
  if (!car.length) {
    console.log('  ERROR: missing car id=', carId)
    issues++
  } else console.log('  car:', car[0][1], car[0][2], car[0][3])

  if (resId) {
    const res = q(db, `SELECT id, reference, customer_id, car_id, total_amount FROM reservations WHERE id = ${resId}`)
    if (!res.length) {
      console.log('  ERROR: missing reservation id=', resId)
      issues++
    } else {
      console.log('  reservation:', res[0][1], 'total=', res[0][4])
      if (Number(res[0][2]) !== Number(clientId)) {
        console.log('  MISMATCH: reservation.customer_id != contract.client_id')
        issues++
      }
      if (Number(res[0][3]) !== Number(carId)) {
        console.log('  MISMATCH: reservation.car_id != contract.car_id')
        issues++
      }
    }
  }

  const contractPaid = q(db, `SELECT COALESCE(SUM(amount),0) FROM payments WHERE contract_id = ${id}`)[0]?.[0]
  console.log('  contract payments (payments table):', contractPaid)

  if (resId) {
    const resPaid = q(db, `
      SELECT COALESCE(SUM(amount),0) FROM reservation_payments
      WHERE reservation_id = ${resId} AND type='rental' AND status='completed'
    `)[0]?.[0]
    console.log('  reservation payments (reservation_payments):', resPaid)
    if (Number(resPaid) > 0 && Number(contractPaid) === 0) {
      console.log('  NOTE: reservation has payments but contract payments table is empty')
    }
  }

  if (!depAt && startDate) console.log('  WARN: departure_at empty, using start_date only')
  if (!dailyRate && dailyPrice) console.log('  WARN: daily_rate empty, daily_price=', dailyPrice)
  if (!billedDays && totalDays) console.log('  WARN: billed_days empty, total_days=', totalDays)
  if (!vBrand) console.log('  WARN: vehicle_brand empty on contract snapshot')
}

const orphanClient = q(db, `
  SELECT c.id, c.contract_number FROM contracts c
  LEFT JOIN customers cu ON cu.id = c.client_id WHERE cu.id IS NULL AND c.deleted_at IS NULL
`)
console.log('\nOrphan client refs:', orphanClient.length ? orphanClient : 'none')

const orphanCar = q(db, `
  SELECT c.id, c.contract_number FROM contracts c
  LEFT JOIN cars ca ON ca.id = c.car_id WHERE ca.id IS NULL AND c.deleted_at IS NULL
`)
console.log('Orphan car refs:', orphanCar.length ? orphanCar : 'none')

const orphanRes = q(db, `
  SELECT c.id, c.contract_number, c.reservation_id FROM contracts c
  LEFT JOIN reservations r ON r.id = c.reservation_id
  WHERE c.reservation_id IS NOT NULL AND r.id IS NULL AND c.deleted_at IS NULL
`)
console.log('Orphan reservation refs:', orphanRes.length ? orphanRes : 'none')

const dupRes = q(db, `
  SELECT reservation_id, COUNT(*) as c FROM contracts
  WHERE reservation_id IS NOT NULL AND deleted_at IS NULL
  GROUP BY reservation_id HAVING c > 1
`)
console.log('Duplicate reservation links:', dupRes.length ? dupRes : 'none')

const listJoin = q(db, `
  SELECT c.contract_number, cu.name, ca.brand, ca.model, ca.plate_number, r.reference,
    (
      (SELECT COALESCE(SUM(amount),0) FROM payments p WHERE p.contract_id = c.id)
      + CASE WHEN c.reservation_id IS NOT NULL THEN COALESCE((
          SELECT SUM(amount) FROM reservation_payments rp
          WHERE rp.reservation_id = c.reservation_id AND rp.type = 'rental' AND rp.status = 'completed'
        ), 0) ELSE 0 END
    ) as paid,
    c.total_amount
  FROM contracts c
  LEFT JOIN customers cu ON cu.id = c.client_id
  LEFT JOIN cars ca ON ca.id = c.car_id
  LEFT JOIN reservations r ON r.id = c.reservation_id
  WHERE c.deleted_at IS NULL
`)
console.log('\nList query rows:', listJoin.length)
for (const row of listJoin) {
  const [num, client, brand, model, plate, resRef, paid, total] = row
  const remaining = Math.max(0, Number(total) - Number(paid))
  console.log(`  ${num} | ${client || 'NO CLIENT'} | ${brand || '?'} ${model || ''} ${plate || ''} | res=${resRef || '-'} | paid=${paid}/${total} | remaining=${remaining}`)
}

console.log('\n=== SUMMARY ===')
console.log('Integrity issues on active contracts:', issues === 0 ? 'NONE ✓' : issues)
process.exit(issues > 0 ? 1 : 0)
