import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import initSqlJs from 'sql.js'

const require = createRequire(import.meta.url)
const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm')
const dbPath = path.join(process.env.APPDATA || '', 'rental-car-crm', 'rentalcar.sqlite')

const queriesPath = path.join(import.meta.dirname, '..', 'electron', 'dashboard-queries.ts')
const queriesSrc = fs.readFileSync(queriesPath, 'utf8')

function extractSql(exportName) {
  const re = new RegExp(`export const ${exportName} = \`([\\s\\S]*?)\``)
  const match = queriesSrc.match(re)
  if (!match) throw new Error(`Missing SQL export: ${exportName}`)
  return match[1]
}

const CARS_IN_USE_SQL = extractSql('CARS_IN_USE_SQL')
const UPCOMING_RETURNS_SQL = extractSql('UPCOMING_RETURNS_SQL')
const OVERDUE_RENTALS_COUNT_SQL = extractSql('OVERDUE_RENTALS_COUNT_SQL')

function q(db, sql) {
  try {
    const result = db.exec(sql)[0]
    if (!result) return []
    const cols = result.columns
    return result.values.map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])))
  } catch (err) {
    return { error: String(err) }
  }
}

const SQL = await initSqlJs({ locateFile: () => wasmPath })
const db = new SQL.Database(fs.readFileSync(dbPath))

console.log('=== CARS STATUS ===')
console.log(q(db, `SELECT id, name, plate_number, status FROM cars`))

console.log('\n=== CONTRACTS (not deleted) ===')
console.log(
  q(db, `SELECT id, contract_number, status, car_id FROM contracts WHERE deleted_at IS NULL`),
)

console.log('\n=== ACTIVE RESERVATIONS ===')
console.log(
  q(db, `SELECT id, reference, status, car_id FROM reservations WHERE status IN ('pending','confirmed')`),
)

console.log('\n=== cars_in_use (NEW — louee cars) ===')
console.log(q(db, CARS_IN_USE_SQL))

console.log('\n=== upcomingReturns (NEW) ===')
console.log(q(db, UPCOMING_RETURNS_SQL))

console.log('\n=== overdue count (NEW) ===')
console.log(q(db, OVERDUE_RENTALS_COUNT_SQL))
