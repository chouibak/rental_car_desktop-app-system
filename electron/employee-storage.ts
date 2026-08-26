import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { deleteFileIfExists } from './storage'

let employeeStorageRoot = ''

export function initEmployeeStorage(userDataPath: string) {
  employeeStorageRoot = path.join(userDataPath, 'storage', 'employees')
  fs.mkdirSync(employeeStorageRoot, { recursive: true })
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

function extFromName(name: string) {
  const ext = path.extname(name).toLowerCase()
  return ext || '.pdf'
}

export function employeeDir(employeeId: number) {
  return path.join(employeeStorageRoot, String(employeeId))
}

function employeePendingDir() {
  const dir = path.join(employeeStorageRoot, '_pending', 'documents')
  ensureDir(dir)
  return dir
}

export function copyToEmployeeStorage(sourcePath: string, employeeId: number, originalName?: string) {
  const ext = extFromName(originalName ?? sourcePath)
  const dir = path.join(employeeDir(employeeId), 'documents')
  ensureDir(dir)
  const dest = path.join(dir, `${randomUUID()}${ext}`)
  fs.copyFileSync(sourcePath, dest)
  return dest
}

function copyToEmployeePending(sourcePath: string, originalName?: string) {
  const ext = extFromName(originalName ?? sourcePath)
  const dir = employeePendingDir()
  const dest = path.join(dir, `${randomUUID()}${ext}`)
  fs.copyFileSync(sourcePath, dest)
  return dest
}

export function moveToEmployeeStorage(filePath: string, employeeId: number) {
  if (!filePath) return filePath

  const normalizedFile = path.normalize(filePath)
  if (!fs.existsSync(normalizedFile)) return normalizedFile

  const empRoot = path.normalize(employeeDir(employeeId))
  if (normalizedFile.startsWith(`${empRoot}${path.sep}`)) {
    return normalizedFile
  }

  const ext = path.extname(normalizedFile) || '.pdf'
  const dir = path.join(empRoot, 'documents')
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

export function deleteEmployeeStorage(employeeId: number) {
  const dir = employeeDir(employeeId)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

export { copyToEmployeePending }
