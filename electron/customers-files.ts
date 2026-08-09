import { dialog, shell, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IMAGE_EXTENSIONS, deleteFileIfExists } from './storage'
import {
  copyToCustomerPending,
  copyToCustomerStorage,
} from './customer-storage'

const DOC_EXTENSIONS = ['pdf', ...IMAGE_EXTENSIONS]

const DOC_FILTERS = [
  { name: 'Documents', extensions: DOC_EXTENSIONS },
  { name: 'PDF', extensions: ['pdf'] },
  { name: 'Images', extensions: IMAGE_EXTENSIONS },
  { name: 'All files', extensions: ['*'] as string[] },
]

export async function pickCustomerDocument(win: BrowserWindow | null, customerId?: number) {
  const options = {
    title: 'Choisir un document',
    properties: ['openFile'] as ('openFile')[],
    filters: DOC_FILTERS,
  }
  const { canceled, filePaths } = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (canceled || !filePaths[0]) return null
  if (!fs.existsSync(filePaths[0])) throw new Error('FILE_NOT_FOUND')

  const storedPath =
    customerId && customerId > 0
      ? copyToCustomerStorage(filePaths[0], customerId, filePaths[0])
      : copyToCustomerPending(filePaths[0], filePaths[0])

  return {
    path: storedPath,
    name: path.basename(filePaths[0]),
  }
}

export function deleteCustomerFile(filePath: string) {
  deleteFileIfExists(filePath)
  return { ok: true }
}

export async function openCustomerFile(filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('FILE_NOT_FOUND')
  }
  const err = await shell.openPath(filePath)
  if (err) throw new Error(err)
  return { ok: true }
}
