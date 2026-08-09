import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { deleteFileIfExists } from './storage'

let contractStorageRoot = ''

export function initContractStorage(userDataPath: string) {
  contractStorageRoot = path.join(userDataPath, 'storage', 'contracts')
  fs.mkdirSync(path.join(contractStorageRoot, 'damages', 'departure'), { recursive: true })
  fs.mkdirSync(path.join(contractStorageRoot, 'damages', 'return'), { recursive: true })
  fs.mkdirSync(path.join(contractStorageRoot, 'pdf'), { recursive: true })
}

export function getContractStorageRoot() {
  return contractStorageRoot
}

export function copyDamagePhoto(sourcePath: string, kind: 'departure' | 'return') {
  const ext = path.extname(sourcePath) || '.jpg'
  const dir = path.join(contractStorageRoot, 'damages', kind)
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `${randomUUID()}${ext}`)
  fs.copyFileSync(sourcePath, dest)
  return dest
}

export function pdfPathForContract(contractNumber: string) {
  const safe = contractNumber.replace(/[^\w-]+/g, '_')
  return path.join(contractStorageRoot, 'pdf', `contrat-${safe}.pdf`)
}

export function deleteDamagePhoto(filePath: string | undefined) {
  if (!filePath) return
  if (filePath.includes(path.join('storage', 'contracts', 'damages'))) {
    deleteFileIfExists(filePath)
  }
}
