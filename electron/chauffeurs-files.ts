import { dialog, shell, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IMAGE_EXTENSIONS, deleteFileIfExists } from './storage'
import { copyToChauffeurPending, copyToChauffeurStorage } from './chauffeur-storage'

const DOC_EXTENSIONS = ['pdf', ...IMAGE_EXTENSIONS]

const DOC_FILTERS = [
  { name: 'Documents', extensions: DOC_EXTENSIONS },
  { name: 'PDF', extensions: ['pdf'] },
  { name: 'Images', extensions: IMAGE_EXTENSIONS },
  { name: 'All files', extensions: ['*'] as string[] },
]

export async function pickChauffeurDocument(win: BrowserWindow | null, chauffeurId?: number) {
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
    chauffeurId && chauffeurId > 0
      ? copyToChauffeurStorage(filePaths[0], chauffeurId, filePaths[0])
      : copyToChauffeurPending(filePaths[0], filePaths[0])

  return {
    path: storedPath,
    name: path.basename(filePaths[0]),
  }
}

export function deleteChauffeurFile(filePath: string) {
  deleteFileIfExists(filePath)
  return { ok: true }
}

export async function openChauffeurFile(filePath: string) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('FILE_NOT_FOUND')
  }
  const err = await shell.openPath(filePath)
  if (err) throw new Error(err)
  return { ok: true }
}
