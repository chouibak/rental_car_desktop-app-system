const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')

const dbPath = path.join(process.env.APPDATA, 'rental-car-crm', 'rentalcar.sqlite')

async function main() {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(path.dirname(require.resolve('sql.js')), file),
  })
  const db = new SQL.Database(fs.readFileSync(dbPath))

  function readLastInsertId() {
    const result = db.exec('SELECT last_insert_rowid() AS id')
    return Number(result[0]?.values[0]?.[0] ?? 0)
  }

  function save() {
    fs.writeFileSync(dbPath + '.testbak', Buffer.from(db.export()))
  }

  function run(sql, params) {
    db.run(sql, params)
    save()
  }

  run(
    `INSERT INTO expenses (title, category, amount, expense_date, payment_method, receipt_path, notes, created_at)
     VALUES (?, ?, ?, ?, ?, '', ?, ?)`,
    ['Test run pattern', 'fuel', 25, '2026-08-08', 'cash', 'n', new Date().toISOString()],
  )
  const id = readLastInsertId()
  console.log('id after run()+save():', id)

  if (id) db.run('DELETE FROM expenses WHERE id = ?', [id])
  try { fs.unlinkSync(dbPath + '.testbak') } catch {}
}

main().catch(console.error)
