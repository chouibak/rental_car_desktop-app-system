import { dialog, shell, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { getDbApi } from './db'
import { exportCarsRows, type CarFilters } from './cars-db'
import {
  copyToCarStorage,
  copyToPending,
  deleteFileIfExists,
  getPreviewUrl,
  IMAGE_EXTENSIONS,
  isImageExtension,
  readFileAsDataUrl,
} from './storage'

const IMAGE_FILTERS = [
  { name: 'Images', extensions: IMAGE_EXTENSIONS },
  { name: 'All files', extensions: ['*'] as string[] },
]

function savePickedPhoto(sourcePath: string, carId?: number) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error('FILE_NOT_FOUND')
  }
  if (!isImageExtension(sourcePath)) {
    throw new Error('NOT_AN_IMAGE')
  }
  return carId && carId > 0
    ? copyToCarStorage(sourcePath, carId, 'photos', sourcePath)
    : copyToPending(sourcePath, 'photos', sourcePath)
}

export async function pickCarPhotos(win: BrowserWindow | null, carId?: number) {
  const options = {
    title: 'Choisir des photos',
    properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
    filters: IMAGE_FILTERS,
  }
  const { canceled, filePaths } = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (canceled || filePaths.length === 0) return []

  const saved: { path: string; url: string }[] = []
  for (const sourcePath of filePaths) {
    const storedPath = savePickedPhoto(sourcePath, carId)
    saved.push({ path: storedPath, url: readFileAsDataUrl(storedPath) })
  }
  return saved
}

export async function pickCarPhoto(win: BrowserWindow | null, carId?: number) {
  const photos = await pickCarPhotos(win, carId)
  return photos[0] ?? null
}

const DOC_FILTERS = [
  { name: 'Documents', extensions: ['pdf', ...IMAGE_EXTENSIONS] },
  { name: 'PDF', extensions: ['pdf'] },
  { name: 'Images', extensions: IMAGE_EXTENSIONS },
  { name: 'All files', extensions: ['*'] as string[] },
]

export async function pickCarDocument(win: BrowserWindow | null, carId?: number) {
  const options = {
    title: 'Choisir un document',
    properties: ['openFile'] as ('openFile')[],
    filters: DOC_FILTERS,
  }
  const { canceled, filePaths } = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (canceled || !filePaths[0]) return null

  const storedPath =
    carId && carId > 0
      ? copyToCarStorage(filePaths[0], carId, 'documents', filePaths[0])
      : copyToPending(filePaths[0], 'documents', filePaths[0])

  return {
    path: storedPath,
    url: getPreviewUrl(storedPath),
    name: path.basename(filePaths[0]),
  }
}

export function deleteStoredFile(filePath: string) {
  deleteFileIfExists(filePath)
  return { ok: true }
}

export function getFileUrl(filePath: string) {
  return getPreviewUrl(filePath)
}

export async function openStoredFile(filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('FILE_NOT_FOUND')
  }
  const err = await shell.openPath(filePath)
  if (err) throw new Error(err)
  return { ok: true }
}

export async function exportCarsExcel(filters?: CarFilters) {
  const api = getDbApi()
  const cars = api.listCars(filters)
  const rows = exportCarsRows(cars)
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Voitures')

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exporter les voitures',
    defaultPath: `voitures-${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  })

  if (canceled || !filePath) return { ok: false, canceled: true }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  fs.writeFileSync(filePath, buffer)
  return { ok: true, filePath }
}
