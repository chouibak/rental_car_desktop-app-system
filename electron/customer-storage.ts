import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { deleteFileIfExists } from './storage'

let customerStorageRoot = ''

export function initCustomerStorage(userDataPath: string) {
  customerStorageRoot = path.join(userDataPath, 'storage', 'customers')
  fs.mkdirSync(customerStorageRoot, { recursive: true })
}

export function getCustomerStorageRoot() {
  return customerStorageRoot
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

function extFromName(name: string) {
  const ext = path.extname(name).toLowerCase()
  return ext || '.pdf'
}

export function customerDir(customerId: number) {
  return path.join(customerStorageRoot, String(customerId))
}

export function customerPendingDir() {
  const dir = path.join(customerStorageRoot, '_pending', 'documents')
  ensureDir(dir)
  return dir
}

export function copyToCustomerStorage(sourcePath: string, customerId: number, originalName?: string) {
  const ext = extFromName(originalName ?? sourcePath)
  const dir = path.join(customerDir(customerId), 'documents')
  ensureDir(dir)
  const dest = path.join(dir, `${randomUUID()}${ext}`)
  fs.copyFileSync(sourcePath, dest)
  return dest
}

export function copyToCustomerPending(sourcePath: string, originalName?: string) {
  const ext = extFromName(originalName ?? sourcePath)
  const dir = customerPendingDir()
  const dest = path.join(dir, `${randomUUID()}${ext}`)
  fs.copyFileSync(sourcePath, dest)
  return dest
}

export function moveToCustomerStorage(filePath: string, customerId: number) {
  if (!filePath) return filePath

  const normalizedFile = path.normalize(filePath)
  if (!fs.existsSync(normalizedFile)) return normalizedFile

  const customerRoot = path.normalize(customerDir(customerId))
  if (normalizedFile.startsWith(`${customerRoot}${path.sep}`)) {
    return normalizedFile
  }

  const ext = path.extname(normalizedFile) || '.pdf'
  const dir = path.join(customerRoot, 'documents')
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

export function deleteCustomerStorage(customerId: number) {
  const dir = customerDir(customerId)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}
