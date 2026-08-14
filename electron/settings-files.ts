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

const CONDITIONS_IMAGE_EXTS = ['jpg', 'jpeg', 'png']
const CONDITIONS_FILTERS = [
  { name: 'Images et PDF', extensions: [...CONDITIONS_IMAGE_EXTS, 'pdf'] },
  { name: 'Images', extensions: CONDITIONS_IMAGE_EXTS },
  { name: 'PDF', extensions: ['pdf'] },
]

type SettingsImageFolder = 'logo' | 'conditions'

export function initSettingsStorage(userDataPath: string) {
  settingsStorageRoot = path.join(userDataPath, 'storage', 'settings')
  fs.mkdirSync(path.join(settingsStorageRoot, 'logo'), { recursive: true })
  fs.mkdirSync(path.join(settingsStorageRoot, 'conditions'), { recursive: true })
}

function fileExt(filePath: string) {
  return path.extname(filePath).slice(1).toLowerCase()
}

export function isConditionsPdf(filePath: string | null | undefined) {
  return fileExt(filePath || '') === 'pdf'
}

function isConditionsFile(filePath: string) {
  const ext = fileExt(filePath)
  return CONDITIONS_IMAGE_EXTS.includes(ext) || ext === 'pdf'
}

async function pickSettingsFile(
  win: BrowserWindow | null,
  folder: SettingsImageFolder,
  title: string,
  filters: typeof IMAGE_FILTERS,
  isAllowed: (filePath: string) => boolean,
  invalidError: string,
) {
  const options = {
    title,
    properties: ['openFile'] as ('openFile')[],
    filters,
  }
  const { canceled, filePaths } = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)

  if (canceled || !filePaths[0]) return null
  if (!isAllowed(filePaths[0])) throw new Error(invalidError)
  if (!fs.existsSync(filePaths[0])) throw new Error('FILE_NOT_FOUND')

  const ext = path.extname(filePaths[0]) || '.png'
  const dest = path.join(settingsStorageRoot, folder, `${randomUUID()}${ext}`)
  fs.copyFileSync(filePaths[0], dest)
  const url = isConditionsPdf(dest) ? '' : readFileAsDataUrl(dest)
  return { path: dest, url }
}

function isSettingsStoredFile(filePath: string) {
  return filePath.includes(path.join('storage', 'settings'))
}

export async function pickCompanyLogo(win: BrowserWindow | null) {
  return pickSettingsFile(
    win,
    'logo',
    'Choisir le logo de l’agence',
    IMAGE_FILTERS,
    isImageExtension,
    'NOT_AN_IMAGE',
  )
}

export async function pickContractConditionsImage(win: BrowserWindow | null) {
  return pickSettingsFile(
    win,
    'conditions',
    'Choisir le fichier des conditions (JPG, PNG ou PDF)',
    CONDITIONS_FILTERS,
    isConditionsFile,
    'INVALID_CONDITIONS_FILE',
  )
}

export function removeSettingsImage(filePath: string | null | undefined) {
  if (!filePath) return
  if (isSettingsStoredFile(filePath)) {
    deleteFileIfExists(filePath)
  }
}

export function removeCompanyLogo(filePath: string | null | undefined) {
  removeSettingsImage(filePath)
}

export function removeContractConditionsImage(filePath: string | null | undefined) {
  removeSettingsImage(filePath)
}

export function getSettingsImageUrl(filePath: string | null | undefined) {
  if (!filePath || !fileExists(filePath)) return ''
  if (isConditionsPdf(filePath)) return ''
  return getPreviewUrl(filePath)
}

export function getCompanyLogoUrl(filePath: string | null | undefined) {
  return getSettingsImageUrl(filePath)
}

export function getContractConditionsUrl(filePath: string | null | undefined) {
  return getSettingsImageUrl(filePath)
}
