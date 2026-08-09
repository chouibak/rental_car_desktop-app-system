import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { deleteFileIfExists } from './storage'

let expenseStorageRoot = ''

export function initExpenseStorage(userDataPath: string) {
  expenseStorageRoot = path.join(userDataPath, 'storage', 'expenses')
  fs.mkdirSync(expenseStorageRoot, { recursive: true })
}

export function getExpenseStorageRoot() {
  return expenseStorageRoot
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

function extFromName(name: string) {
  const ext = path.extname(name).toLowerCase()
  return ext || '.pdf'
}

export function expenseDir(expenseId: number) {
  return path.join(expenseStorageRoot, String(expenseId))
}

export function expensePendingDir() {
  const dir = path.join(expenseStorageRoot, '_pending', 'receipts')
  ensureDir(dir)
  return dir
}

export function copyToExpenseStorage(sourcePath: string, expenseId: number, originalName?: string) {
  const ext = extFromName(originalName ?? sourcePath)
  const dir = path.join(expenseDir(expenseId), 'receipts')
  ensureDir(dir)
  const dest = path.join(dir, `${randomUUID()}${ext}`)
  fs.copyFileSync(sourcePath, dest)
  return dest
}

export function copyToExpensePending(sourcePath: string, originalName?: string) {
  const ext = extFromName(originalName ?? sourcePath)
  const dir = expensePendingDir()
  const dest = path.join(dir, `${randomUUID()}${ext}`)
  fs.copyFileSync(sourcePath, dest)
  return dest
}

export function moveToExpenseStorage(filePath: string, expenseId: number) {
  if (!filePath) return filePath

  const normalizedFile = path.normalize(filePath)
  if (!fs.existsSync(normalizedFile)) return normalizedFile

  const expenseRoot = path.normalize(expenseDir(expenseId))
  if (normalizedFile.startsWith(`${expenseRoot}${path.sep}`)) {
    return normalizedFile
  }

  const ext = path.extname(normalizedFile) || '.pdf'
  const dir = path.join(expenseRoot, 'receipts')
  ensureDir(dir)
  const dest = path.join(dir, `${randomUUID()}${ext}`)

  try {
    fs.renameSync(normalizedFile, dest)
  } catch {
    fs.copyFileSync(normalizedFile, dest)
    deleteFileIfExists(normalizedFile)
  }
  return dest
}

export function deleteExpenseStorage(expenseId: number) {
  const dir = expenseDir(expenseId)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}
