import { dialog, shell, type BrowserWindow } from 'electron'
import fs from 'node:fs'
import { getDbApi } from './db'
import { buildContractPdf } from './contract-pdf'
import { copyDamagePhoto, pdfPathForContract } from './contract-storage'
import { IMAGE_EXTENSIONS, isImageExtension, readFileAsDataUrl } from './storage'

const IMAGE_FILTERS = [
  { name: 'Images', extensions: IMAGE_EXTENSIONS },
  { name: 'All files', extensions: ['*'] as string[] },
]

export async function pickContractDamagePhoto(
  win: BrowserWindow | null,
  kind: 'departure' | 'return',
) {
  const options = {
    title: 'Choisir une photo de dommage',
    properties: ['openFile'] as ('openFile')[],
    filters: IMAGE_FILTERS,
  }
  const { canceled, filePaths } = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)

  if (canceled || !filePaths[0]) return null
  if (!isImageExtension(filePaths[0])) throw new Error('NOT_AN_IMAGE')
  if (!fs.existsSync(filePaths[0])) throw new Error('FILE_NOT_FOUND')

  const storedPath = copyDamagePhoto(filePaths[0], kind)
  return { path: storedPath, url: readFileAsDataUrl(storedPath) }
}

export async function ensureContractPdf(contractId: number) {
  const api = getDbApi()
  const contract = api.getContract(contractId)
  if (!contract) throw new Error('CONTRACT_NOT_FOUND')

  const outputPath = pdfPathForContract(contract.contract_number)
  if (!fs.existsSync(outputPath)) {
    const settings = api.getSettings()
    const breakdown = api.getContractInvoiceBreakdown(contractId)
    await buildContractPdf(outputPath, contract, settings, breakdown)
  }

  return outputPath
}

export async function generateContractPdf(contractId: number) {
  const outputPath = await ensureContractPdf(contractId)
  await shell.openPath(outputPath)
  return { ok: true, path: outputPath }
}

export async function openContractPdf(contractId: number) {
  const api = getDbApi()
  const contract = api.getContract(contractId)
  if (!contract) throw new Error('CONTRACT_NOT_FOUND')
  const pdfPath = pdfPathForContract(contract.contract_number)
  if (!fs.existsSync(pdfPath)) {
    return generateContractPdf(contractId)
  }
  await shell.openPath(pdfPath)
  return { ok: true, path: pdfPath }
}
