import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { deleteFileIfExists } from './storage'

let chauffeurStorageRoot = ''

export function initChauffeurStorage(userDataPath: string) {
  chauffeurStorageRoot = path.join(userDataPath, 'storage', 'chauffeurs')
  fs.mkdirSync(chauffeurStorageRoot, { recursive: true })
}

export function getChauffeurStorageRoot() {
  return chauffeurStorageRoot
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

function extFromName(name: string) {
  const ext = path.extname(name).toLowerCase()
  return ext || '.pdf'
}

export function chauffeurDir(chauffeurId: number) {
  return path.join(chauffeurStorageRoot, String(chauffeurId))
}

export function chauffeurPendingDir() {
  const dir = path.join(chauffeurStorageRoot, '_pending', 'documents')
  ensureDir(dir)
  return dir
}

export function copyToChauffeurStorage(sourcePath: string, chauffeurId: number, originalName?: string) {
  const ext = extFromName(originalName ?? sourcePath)
  const dir = path.join(chauffeurDir(chauffeurId), 'documents')
  ensureDir(dir)
  const dest = path.join(dir, `${randomUUID()}${ext}`)
  fs.copyFileSync(sourcePath, dest)
  return dest
}

export function copyToChauffeurPending(sourcePath: string, originalName?: string) {
  const ext = extFromName(originalName ?? sourcePath)
  const dir = chauffeurPendingDir()
  const dest = path.join(dir, `${randomUUID()}${ext}`)
  fs.copyFileSync(sourcePath, dest)
  return dest
}

export function moveToChauffeurStorage(filePath: string, chauffeurId: number) {
  if (!filePath) return filePath

  const normalizedFile = path.normalize(filePath)
  if (!fs.existsSync(normalizedFile)) return normalizedFile

  const chauffeurRoot = path.normalize(chauffeurDir(chauffeurId))
  if (normalizedFile.startsWith(`${chauffeurRoot}${path.sep}`)) {
    return normalizedFile
  }

  const ext = path.extname(normalizedFile) || '.pdf'
  const dir = path.join(chauffeurRoot, 'documents')
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

export function deleteChauffeurStorage(chauffeurId: number) {
  const dir = chauffeurDir(chauffeurId)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}
