import { dialog, shell, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { getDbApi } from './db'
import { exportExpensesRows, type ExpenseFilters } from './expenses-db'
import { copyToExpensePending, copyToExpenseStorage } from './expense-storage'
import { deleteFileIfExists, getPreviewUrl, IMAGE_EXTENSIONS, readFileAsDataUrl } from './storage'

const RECEIPT_FILTERS = [
  { name: 'Reçus', extensions: [...IMAGE_EXTENSIONS, 'pdf'] },
  { name: 'All files', extensions: ['*'] as string[] },
]

export async function pickExpenseReceipt(win: BrowserWindow | null, expenseId?: number) {
  const options = {
    title: 'Choisir un reçu (photo ou PDF)',
    properties: ['openFile'] as ('openFile')[],
    filters: RECEIPT_FILTERS,
  }
  const { canceled, filePaths } = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (canceled || !filePaths[0]) return null

  const storedPath =
    expenseId && expenseId > 0
      ? copyToExpenseStorage(filePaths[0], expenseId, filePaths[0])
      : copyToExpensePending(filePaths[0], filePaths[0])

  const ext = path.extname(storedPath).toLowerCase()
  const isImage = IMAGE_EXTENSIONS.includes(ext.slice(1)) || !ext

  return {
    path: storedPath,
    url: isImage ? readFileAsDataUrl(storedPath) : getPreviewUrl(storedPath),
    name: path.basename(filePaths[0]),
  }
}

export function deleteExpenseFile(filePath: string) {
  deleteFileIfExists(filePath)
  return { ok: true }
}

export function getExpenseFileUrl(filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) return ''
  const ext = path.extname(filePath).toLowerCase()
  const isImage = IMAGE_EXTENSIONS.includes(ext.slice(1)) || !ext
  return isImage ? readFileAsDataUrl(filePath) : getPreviewUrl(filePath)
}

export async function openExpenseFile(filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('FILE_NOT_FOUND')
  }
  const err = await shell.openPath(filePath)
  if (err) throw new Error(err)
  return { ok: true }
}

export async function exportExpensesExcel(filters?: ExpenseFilters) {
  const api = getDbApi()
  const expenses = api.listExpenses(filters)
  const rows = exportExpensesRows(expenses)
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Dépenses')

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exporter les dépenses',
    defaultPath: `depenses-${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  })

  if (canceled || !filePath) return { ok: false, canceled: true }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  fs.writeFileSync(filePath, buffer)
  return { ok: true, filePath }
}
