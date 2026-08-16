import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

let storageRoot = ''
/** Parent of every per-entity storage folder (cars, customers, contracts, ...). */
let appStorageRoot = ''

export const IMAGE_EXTENSIONS = [
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico',
  'tif', 'tiff', 'heic', 'heif', 'avif', 'jfif', 'pjpeg', 'pjp',
]

export const VIDEO_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv', '3gp']

export function isVideoExtension(filePath: string) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return VIDEO_EXTENSIONS.includes(ext)
}

export function isImageExtension(filePath: string) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (!ext) return true
  if (isVideoExtension(filePath)) return false
  const blocked = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'zip', 'rar']
  if (blocked.includes(ext)) return false
  if (IMAGE_EXTENSIONS.includes(ext)) return true
  // Allow other extensions when user picks via file dialog (e.g. rare camera formats)
  return true
}

export function initStorage(userDataPath: string) {
  appStorageRoot = path.normalize(path.join(userDataPath, 'storage'))
  storageRoot = path.join(appStorageRoot, 'cars')
  fs.mkdirSync(storageRoot, { recursive: true })
}

/** Guard against a renderer-supplied path pointing outside the app's own files. */
export function isManagedFile(filePath: string) {
  if (!appStorageRoot) return true
  const normalized = path.normalize(filePath)
  return normalized.startsWith(`${appStorageRoot}${path.sep}`)
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
  if (!filePath || !isManagedFile(filePath)) return
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch {
    // ignore missing files
  }
}

/** Write through a temp file so a crash mid-write cannot leave a truncated file. */
export function writeJsonFileAtomic(filePath: string, data: unknown) {
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(data), 'utf8')
  fs.renameSync(tempPath, filePath)
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
  if (isVideoExtension(filePath)) return toAppFileUrl(filePath)
  if (isImageExtension(filePath)) return readFileAsDataUrl(filePath)
  return toAppFileUrl(filePath)
}

const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  mkv: 'video/x-matroska',
  m4v: 'video/mp4',
  wmv: 'video/x-msvideo',
  '3gp': 'video/3gpp',
}

export function getMediaMime(filePath: string) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return VIDEO_MIME[ext] || IMAGE_MIME[ext] || 'application/octet-stream'
}

/** Resolve app-file:// URL to a local filesystem path. */
export function resolveAppFilePath(url: string) {
  const raw = url.replace(/^app-file:/i, '')
  const fileUrl = raw.startsWith('//') ? `file:${raw}` : raw.startsWith('file:') ? raw : `file://${raw}`
  const parsed = new URL(fileUrl)
  let filePath = decodeURIComponent(parsed.pathname)
  if (process.platform === 'win32' && filePath.startsWith('/')) {
    filePath = filePath.slice(1)
  }
  return path.normalize(filePath)
}

/** Serve local files for the app-file protocol (images + videos with Range support). */
export function serveAppFileRequest(request: Request): Response {
  const filePath = resolveAppFilePath(request.url)
  if (!filePath || !fs.existsSync(filePath)) {
    return new Response('Not Found', { status: 404 })
  }

  const stat = fs.statSync(filePath)
  const mime = getMediaMime(filePath)
  const range = request.headers.get('Range')

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0
      const end = match[2] ? parseInt(match[2], 10) : stat.size - 1
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}` },
        })
      }
      const safeEnd = Math.min(end, stat.size - 1)
      const length = safeEnd - start + 1
      const chunk = Buffer.alloc(length)
      const fd = fs.openSync(filePath, 'r')
      try {
        fs.readSync(fd, chunk, 0, length, start)
      } finally {
        fs.closeSync(fd)
      }
      return new Response(chunk, {
        status: 206,
        headers: {
          'Content-Type': mime,
          'Content-Range': `bytes ${start}-${safeEnd}/${stat.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(length),
        },
      })
    }
  }

  const buffer = fs.readFileSync(filePath)
  return new Response(buffer, {
    headers: {
      'Content-Type': mime,
      'Content-Length': String(stat.size),
      'Accept-Ranges': 'bytes',
    },
  })
}
