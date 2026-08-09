import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

let storageRoot = ''

export const IMAGE_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico',
  'tif', 'tiff', 'heic', 'heif', 'avif', 'jfif', 'pjpeg', 'pjp',
]

export function isImageExtension(filePath: string) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (!ext) return true
  const blocked = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip', 'rar']
  if (blocked.includes(ext)) return false
  if (IMAGE_EXTENSIONS.includes(ext)) return true
  // Allow other extensions when user picks via file dialog (e.g. rare camera formats)
  return true
}

export function initStorage(userDataPath: string) {
  storageRoot = path.join(userDataPath, 'storage', 'cars')
  fs.mkdirSync(storageRoot, { recursive: true })
}

export function getStorageRoot() {
  return storageRoot
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

function extFromName(name: string, fallback: string) {
  const ext = path.extname(name).toLowerCase()
  return ext || fallback
}

export function carDir(carId: number) {
  return path.join(storageRoot, String(carId))
}

export function pendingDir() {
  const dir = path.join(storageRoot, '_pending')
  ensureDir(dir)
  return dir
}

export function copyToCarStorage(
  sourcePath: string,
  carId: number,
  kind: 'photos' | 'documents',
  originalName?: string,
) {
  const ext = extFromName(originalName ?? sourcePath, kind === 'photos' ? '.jpg' : '.pdf')
  const dir = path.join(carDir(carId), kind)
  ensureDir(dir)
  const filename = `${randomUUID()}${ext}`
  const dest = path.join(dir, filename)
  fs.copyFileSync(sourcePath, dest)
  return dest
}

export function copyToPending(sourcePath: string, kind: 'photos' | 'documents', originalName?: string) {
  const ext = extFromName(originalName ?? sourcePath, kind === 'photos' ? '.jpg' : '.pdf')
  const dir = path.join(pendingDir(), kind)
  ensureDir(dir)
  const filename = `${randomUUID()}${ext}`
  const dest = path.join(dir, filename)
  fs.copyFileSync(sourcePath, dest)
  return dest
}

export function moveToCarStorage(filePath: string, carId: number, kind: 'photos' | 'documents') {
  if (!filePath) return filePath

  const normalizedFile = path.normalize(filePath)
  if (!fs.existsSync(normalizedFile)) return normalizedFile

  const carRoot = path.normalize(path.join(storageRoot, String(carId)))
  if (normalizedFile.startsWith(`${carRoot}${path.sep}`)) {
    return normalizedFile
  }

  const ext = path.extname(normalizedFile) || (kind === 'photos' ? '.jpg' : '.pdf')
  const dir = path.join(carRoot, kind)
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

export function fileExists(filePath: string | null | undefined) {
  if (!filePath) return false
  return fs.existsSync(path.normalize(filePath))
}

export function deleteFileIfExists(filePath: string | null | undefined) {
  if (!filePath) return
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // ignore missing files
  }
}

export function deleteCarStorage(carId: number) {
  const dir = carDir(carId)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
}

export function toAppFileUrl(filePath: string) {
  if (!filePath) return ''
  const fileUrl = pathToFileURL(filePath).href
  return fileUrl.replace(/^file:/, 'app-file:')
}

const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  jfif: 'image/jpeg',
}

export function readFileAsDataUrl(filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) return ''
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const mime = IMAGE_MIME[ext] || 'image/jpeg'
  const buf = fs.readFileSync(filePath)
  return `data:${mime};base64,${buf.toString('base64')}`
}

export function getPreviewUrl(filePath: string) {
  if (!filePath) return ''
  if (isImageExtension(filePath)) return readFileAsDataUrl(filePath)
  return toAppFileUrl(filePath)
}
