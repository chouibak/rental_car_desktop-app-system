/**
 * Simulates fresh-install DB init paths (including duplicate settings guard).
 * Run: node scripts/test-fresh-db.mjs
 */
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'
import path from 'node:path'

const require = createRequire(import.meta.url)
const wasmPath = path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.js')), 'sql-wasm.wasm')

function q(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

function ensureSetting(db, key, value) {
  db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO NOTHING`,
    [key, value],
  )
}

const DEFAULT_SETTINGS = {
  company_name: 'Rental Car Agency',
  notification_return_days: '1',
  notification_doc_days: '30',
  currency: 'MAD',
  language: 'fr',
}

function applyDefaultSettings(db) {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    ensureSetting(db, key, value)
  }
}

const SQL = await initSqlJs({ locateFile: () => wasmPath })
const db = new SQL.Database()

db.run(`
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS cars (id INTEGER PRIMARY KEY AUTOINCREMENT, status TEXT NOT NULL DEFAULT 'disponible');
  CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS reservations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payment_status TEXT DEFAULT 'unpaid'
  );
  CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft',
    deleted_at TEXT
  );
`)

// Startup sync queries must not throw on empty DB
q(db, 'SELECT id FROM reservations')
q(db, "SELECT id FROM cars WHERE status != 'hors_service'")
q(db, "SELECT id FROM contracts WHERE status = 'active' AND deleted_at IS NULL LIMIT 1")

// Old bug: notification keys inserted before full seed
ensureSetting(db, 'notification_return_days', '1')
ensureSetting(db, 'notification_doc_days', '30')

const isFirstRun = !q(db, "SELECT key FROM settings WHERE key = 'company_name' LIMIT 1")[0]
applyDefaultSettings(db)

if (!isFirstRun) throw new Error('Expected first run on empty DB')

const settingsCount = q(db, 'SELECT COUNT(*) AS c FROM settings')[0].c
if (settingsCount !== Object.keys(DEFAULT_SETTINGS).length) {
  throw new Error(`Expected ${Object.keys(DEFAULT_SETTINGS).length} settings, got ${settingsCount}`)
}

// Second init pass must not throw (duplicate key regression)
applyDefaultSettings(db)
applyDefaultSettings(db)

const settingsCount2 = q(db, 'SELECT COUNT(*) AS c FROM settings')[0].c
if (settingsCount2 !== settingsCount) {
  throw new Error('Settings count changed after duplicate applyDefaultSettings')
}

console.log('PASS: fresh database init (no settings.key constraint failure)')
