import { dialog, shell, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IMAGE_EXTENSIONS, deleteFileIfExists } from './storage'
import { copyToEmployeePending, copyToEmployeeStorage } from './employee-storage'

const DOC_EXTENSIONS = ['pdf', ...IMAGE_EXTENSIONS]

const DOC_FILTERS = [
  { name: 'Documents', extensions: DOC_EXTENSIONS },
  { name: 'PDF', extensions: ['pdf'] },
  { name: 'Images', extensions: IMAGE_EXTENSIONS },
  { name: 'All files', extensions: ['*'] as string[] },
]

export async function pickEmployeeDocument(win: BrowserWindow | null, employeeId?: number) {
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
    employeeId && employeeId > 0
      ? copyToEmployeeStorage(filePaths[0], employeeId, filePaths[0])
      : copyToEmployeePending(filePaths[0], filePaths[0])

  return {
    path: storedPath,
    name: path.basename(filePaths[0]),
  }
}

export function deleteEmployeeFile(filePath: string) {
  deleteFileIfExists(filePath)
  return { ok: true }
}

export async function openEmployeeFile(filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('FILE_NOT_FOUND')
  }
  const err = await shell.openPath(filePath)
  if (err) throw new Error(err)
  return { ok: true }
}
