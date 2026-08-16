/**
 * Exercises the real payment ledger against a COPY of the live database.
 * Run with: node scripts/payment-flow-check.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import initSqlJs from 'sql.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const livePath = path.join(process.env.APPDATA, 'rental-car-crm', 'rentalcar.sqlite')
const workPath = path.join(os.tmpdir(), `crm-payment-check-${Date.now()}.sqlite`)

const entry = path.join(os.tmpdir(), `crm-payment-entry-${Date.now()}.ts`)
fs.writeFileSync(
  entry,
  `export * from '${path.join(root, 'electron', 'payment-ledger.ts').replace(/\\/g, '/')}'
export * from '${path.join(root, 'electron', 'payment-sync.ts').replace(/\\/g, '/')}'
export { createContractsApi } from '${path.join(root, 'electron', 'contracts-db.ts').replace(/\\/g, '/')}'
`,
)

const bundlePath = path.join(os.tmpdir(), `crm-payment-bundle-${Date.now()}.mjs`)
await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundlePath,
  external: ['sql.js', 'electron'],
  logLevel: 'silent',
})
const api = await import(`file://${bundlePath}`)

fs.copyFileSync(livePath, workPath)
const SQL = await initSqlJs({ locateFile: () => path.join(root, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm') })
const db = new SQL.Database(fs.readFileSync(workPath))

const queryAll = (sql, params = []) => {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}
const queryOne = (sql, params = []) => queryAll(sql, params)[0] ?? null
const run = (sql, params = []) => db.run(sql, params)
const runInsert = (sql, params = []) => {
  db.run(sql, params)
  return Number(db.exec('SELECT last_insert_rowid() AS id')[0].values[0][0])
}
const helpers = { queryAll, queryOne, run, runInsert, lastId: () => 0, now: () => new Date().toISOString() }

api.migratePaymentsTable(db, helpers)

const contracts = api.createContractsApi(helpers, { isCarRentable: () => true, getCar: () => null }, () => ({}))

let failures = 0
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`)
}
const expectThrow = (label, code, fn) => {
  try {
    fn()
    failures += 1
    console.log(`FAIL  ${label}  expected ${code}, nothing thrown`)
  } catch (error) {
    const ok = String(error).includes(code)
    if (!ok) failures += 1
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${String(error)}`)
  }
}

const contract = queryOne(
  `SELECT id, reservation_id, total_amount FROM contracts
   WHERE deleted_at IS NULL AND status IN ('active','draft') AND reservation_id IS NOT NULL
   ORDER BY id DESC LIMIT 1`,
)
if (!contract) {
  console.log('No linked active contract in the database, nothing to check.')
  process.exit(0)
}
const { id: contractId, reservation_id: reservationId } = contract
const paid = () => api.getContractPaidAmount(helpers, contractId)
const total = () => api.getContractTotal(helpers, contractId)
const resStatus = () => queryOne('SELECT payment_status FROM reservations WHERE id = ?', [reservationId]).payment_status

console.log(`\nContract #${contractId} / reservation #${reservationId}\n`)

// Start from a clean balance and no prolongation.
run(`UPDATE reservation_payments SET status = 'cancelled' WHERE reservation_id = ? AND type = 'rental'`, [reservationId])
run('DELETE FROM payments WHERE contract_id = ?', [contractId])
contracts.removeContractExtension(contractId)
api.syncReservationPaymentStatus(helpers, reservationId)
check('empty balance', paid(), 0)
check('reservation unpaid', resStatus(), 'unpaid')

const baseTotal = total()

// 1. Contract payment, partial then full.
const half = Math.round((baseTotal / 2) * 100) / 100
const firstId = api.createContractPayment(helpers, { contract_id: contractId, amount: half, method: 'cash' })
check('contract payment counted', paid(), half)
check('reservation partial', resStatus(), 'partial')

// 2. Reservation payment closes the same balance.
const resPayId = api.createReservationPaymentRow(helpers, {
  reservation_id: reservationId,
  type: 'rental',
  amount: baseTotal - half,
})
check('shared balance settled', paid(), baseTotal)
check('reservation paid', resStatus(), 'paid')

// 3. Overpayment is refused from both ledgers.
expectThrow('contract overpay refused', 'PAYMENT_EXCEEDS_TOTAL', () =>
  api.createContractPayment(helpers, { contract_id: contractId, amount: 10 }),
)
expectThrow('reservation overpay refused', 'PAYMENT_EXCEEDS_TOTAL', () =>
  api.createReservationPaymentRow(helpers, { reservation_id: reservationId, type: 'rental', amount: 10 }),
)
expectThrow('update overpay refused', 'PAYMENT_EXCEEDS_TOTAL', () =>
  api.updateContractPayment(helpers, firstId, { amount: half + 10 }),
)
expectThrow('zero amount refused', 'INVALID_AMOUNT', () =>
  api.createContractPayment(helpers, { contract_id: contractId, amount: 0 }),
)

// 4. Editing down frees room again.
api.updateContractPayment(helpers, firstId, { amount: half - 100 })
check('edit lowers paid', paid(), Math.round((baseTotal - 100) * 100) / 100)
check('reservation back to partial', resStatus(), 'partial')

// 5. Deleting a reservation payment from the contract balance.
api.deleteReservationPaymentRow(helpers, resPayId)
check('delete reservation payment', paid(), Math.round((half - 100) * 100) / 100)

// 6. Prolongation: total grows, extra payment allowed, removal claws it back.
const dailyRate = queryOne('SELECT COALESCE(daily_rate, daily_price) as rate FROM contracts WHERE id = ?', [contractId]).rate
contracts.setContractExtension(contractId, { extension_days: 2 })
const extendedTotal = total()
check('extension raises total', extendedTotal, Math.round((baseTotal + 2 * dailyRate) * 100) / 100)

api.createContractPayment(helpers, {
  contract_id: contractId,
  amount: 2 * dailyRate,
  note: api.EXTENSION_PAYMENT_NOTE,
})
const paidWithExtension = paid()
check('extension payment accepted', paidWithExtension, Math.round((half - 100 + 2 * dailyRate) * 100) / 100)

contracts.removeContractExtension(contractId)
check('removal restores total', total(), baseTotal)
// The base rental is still only partially paid here, so the tagged prolongation cash stays on the
// ledger and simply counts toward the (still unpaid) base — nothing is clawed back because paid
// never exceeded the total. Only genuine overpayment triggers a clawback.
check('prolongation cash kept (base still underpaid)', paid(), paidWithExtension)

// 6b. Prolongation: reduce (not remove) an extension, paid in full — total & paid must both drop by the same delta.
// Top up the base rental to fully paid first so "remaining" reflects only the extension math below.
api.createContractPayment(helpers, { contract_id: contractId, amount: baseTotal - paid(), method: 'cash' })
check('base topped up to fully paid', paid(), baseTotal)

contracts.setContractExtension(contractId, { extension_days: 5 })
api.createContractPayment(helpers, {
  contract_id: contractId,
  amount: 5 * dailyRate,
  note: api.EXTENSION_PAYMENT_NOTE,
})
const totalAt5 = total()
const paidAt5 = paid()
check('extend to 5 days total', totalAt5, Math.round((baseTotal + 5 * dailyRate) * 100) / 100)
check('extend to 5 days paid', paidAt5, Math.round((baseTotal + 5 * dailyRate) * 100) / 100)

contracts.setContractExtension(contractId, { extension_days: 2 })
const totalAt2 = total()
const paidAt2 = paid()
check('reduce 5->2 total', totalAt2, Math.round((baseTotal + 2 * dailyRate) * 100) / 100)
check('reduce 5->2 paid drops by exact delta', paidAt2, Math.round((paidAt5 - 3 * dailyRate) * 100) / 100)
check('reduce 5->2 remaining is zero', Math.max(0, totalAt2 - paidAt2), 0)

// 6c. Increase again from 2 -> 6, pay only the increment (4 days), then reduce 6 -> 4.
contracts.setContractExtension(contractId, { extension_days: 6 })
api.createContractPayment(helpers, {
  contract_id: contractId,
  amount: 4 * dailyRate,
  note: api.EXTENSION_PAYMENT_NOTE,
})
const totalAt6 = total()
const paidAt6 = paid()
check('increase 2->6 total', totalAt6, Math.round((baseTotal + 6 * dailyRate) * 100) / 100)
check('increase 2->6 paid', paidAt6, Math.round((paidAt2 + 4 * dailyRate) * 100) / 100)

contracts.setContractExtension(contractId, { extension_days: 4 })
const totalAt4 = total()
const paidAt4 = paid()
check('reduce 6->4 total', totalAt4, Math.round((baseTotal + 4 * dailyRate) * 100) / 100)
check('reduce 6->4 paid drops by exact delta', paidAt4, Math.round((paidAt6 - 2 * dailyRate) * 100) / 100)
check('reduce 6->4 remaining stays zero', Math.max(0, totalAt4 - paidAt4), 0)

// 6d. Reduce again while UNDERPAID (extension only partially settled) — remaining must never go negative
// and paid must never exceed the new total.
contracts.setContractExtension(contractId, { extension_days: 10 })
// No payment made for this jump: contract is now underpaid relative to its total.
const totalAt10 = total()
const paidAt10 = paid()
check('increase 4->10 total', totalAt10, Math.round((baseTotal + 10 * dailyRate) * 100) / 100)
check('increase 4->10 paid unchanged (no payment made)', paidAt10, paidAt4)

contracts.setContractExtension(contractId, { extension_days: 7 })
const totalAt7 = total()
const paidAt7 = paid()
check('reduce 10->7 total', totalAt7, Math.round((baseTotal + 7 * dailyRate) * 100) / 100)
check('reduce 10->7 paid unchanged (was already under new total)', paidAt7, paidAt10)
check('reduce 10->7 remaining non-negative', totalAt7 - paidAt7 >= -0.001, true)

// cleanup this scenario before the wizard section
contracts.removeContractExtension(contractId)
check('cleanup: removal restores base total', total(), baseTotal)
check('cleanup: no lingering overpay', paid() <= baseTotal + 0.001, true)

// 7. Payment status wizard forces an exact amount.
api.setReservationRentalPaid(helpers, reservationId, baseTotal)
check('wizard set paid', paid(), baseTotal)
check('wizard status paid', resStatus(), 'paid')
api.setReservationRentalPaid(helpers, reservationId, 0)
check('wizard set unpaid', paid(), 0)
check('wizard status unpaid', resStatus(), 'unpaid')

// 8. Global heal leaves a balanced database untouched.
api.reconcileAllOverpayments(helpers)
check('reconcile keeps zero', paid(), 0)

fs.rmSync(workPath, { force: true })
fs.rmSync(bundlePath, { force: true })
fs.rmSync(entry, { force: true })

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
