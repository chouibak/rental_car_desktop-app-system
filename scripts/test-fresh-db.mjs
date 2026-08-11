/**
 * Simulates a brand-new client install (empty SQLite file).
 * Run: node scripts/test-fresh-db.mjs
 */
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'
import path from 'node:path'

const require = createRequire(import.meta.url)
const wasmPath = path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.js')), 'sql-wasm.wasm')

function q(db, sql) {
  const result = db.exec(sql)[0]
  if (!result) return []
  return result.values.map((row) => Object.fromEntries(result.columns.map((c, i) => [c, row[i]])))
}

const SQL = await initSqlJs({ locateFile: () => wasmPath })
const db = new SQL.Database()

db.run(`
  CREATE TABLE IF NOT EXISTS cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disponible',
    is_available INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    total_amount REAL DEFAULT 0,
    deposit_amount REAL DEFAULT 0,
    deposit_status TEXT DEFAULT 'pending',
    payment_status TEXT DEFAULT 'unpaid'
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL DEFAULT 'cash',
    paid_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_number TEXT NOT NULL UNIQUE,
    car_id INTEGER,
    status TEXT NOT NULL DEFAULT 'draft',
    deleted_at TEXT
  );
`)

q(db, 'SELECT id FROM reservations')
q(db, "SELECT id FROM cars WHERE status != 'hors_service'")
q(db, "SELECT id FROM contracts WHERE status = 'active' AND deleted_at IS NULL LIMIT 1")
db.run("INSERT INTO settings (key, value) VALUES ('notification_return_days', '1')")
q(db, "SELECT value FROM settings WHERE key = 'company_name'")

console.log('PASS: fresh database startup queries')
