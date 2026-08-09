import { dialog, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  deleteFileIfExists,
  fileExists,
  getPreviewUrl,
  IMAGE_EXTENSIONS,
  isImageExtension,
  readFileAsDataUrl,
} from './storage'

let settingsStorageRoot = ''

const IMAGE_FILTERS = [
  { name: 'Images', extensions: IMAGE_EXTENSIONS },
  { name: 'All files', extensions: ['*'] as string[] },
]

export function initSettingsStorage(userDataPath: string) {
  settingsStorageRoot = path.join(userDataPath, 'storage', 'settings')
  fs.mkdirSync(path.join(settingsStorageRoot, 'logo'), { recursive: true })
}

export async function pickCompanyLogo(win: BrowserWindow | null) {
  const options = {
    title: 'Choisir le logo de l’agence',
    properties: ['openFile'] as ('openFile')[],
    filters: IMAGE_FILTERS,
  }
  const { canceled, filePaths } = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)

  if (canceled || !filePaths[0]) return null
  if (!isImageExtension(filePaths[0])) throw new Error('NOT_AN_IMAGE')
  if (!fs.existsSync(filePaths[0])) throw new Error('FILE_NOT_FOUND')

  const ext = path.extname(filePaths[0]) || '.png'
  const dest = path.join(settingsStorageRoot, 'logo', `${randomUUID()}${ext}`)
  fs.copyFileSync(filePaths[0], dest)
  return { path: dest, url: readFileAsDataUrl(dest) }
}

export function removeCompanyLogo(filePath: string | null | undefined) {
  if (!filePath) return
  if (filePath.includes(path.join('storage', 'settings', 'logo'))) {
    deleteFileIfExists(filePath)
  }
}

export function getCompanyLogoUrl(filePath: string | null | undefined) {
  if (!filePath || !fileExists(filePath)) return ''
  return getPreviewUrl(filePath)
}
