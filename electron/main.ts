import { app, BrowserWindow, dialog, ipcMain, protocol, net } from 'electron'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { initDb, getDbApi } from './db'
import {
  deleteStoredFile,
  exportCarsExcel,
  getFileUrl,
  openStoredFile,
  pickCarDocument,
  pickCarPhoto,
  pickCarPhotos,
} from './cars-files'
import {
  deleteCustomerFile,
  openCustomerFile,
  pickCustomerDocument,
} from './customers-files'
import { generateContractPdf, openContractPdf, pickContractDamagePhoto } from './contract-files'
import {
  deleteExpenseFile,
  exportExpensesExcel,
  getExpenseFileUrl,
  openExpenseFile,
  pickExpenseReceipt,
} from './expenses-files'
import {
  deleteChauffeurFile,
  openChauffeurFile,
  pickChauffeurDocument,
} from './chauffeurs-files'
import { getCompanyLogoUrl, pickCompanyLogo, removeCompanyLogo } from './settings-files'
import {
  activateLicense,
  assertLicenseValid,
  getLicenseStatus,
  initLicense,
  isLicenseChannel,
} from './license'
import {
  sendWhatsAppContract,
  sendWhatsAppPaymentReminder,
  sendWhatsAppReturnReminder,
} from './whatsapp'

process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null = null
let ipcRegistered = false
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app-file',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
])

function resolveWindowIcon() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'icon.ico')
  }
  return path.join(__dirname, '../build/icon.ico')
}

async function createWindow() {
  const userDataPath = app.getPath('userData')
  initLicense(userDataPath)

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    show: false,
    title: 'LocAgence Pro',
    icon: resolveWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => {
    win?.show()
    win?.focus()
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    dialog.showErrorBox(
      'LocAgence Pro',
      `Impossible de charger l'interface.\n\n${errorCode}: ${errorDescription}`,
    )
  })

  await initDb(userDataPath)
  registerIpc()

  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    await win.loadFile(path.join(process.env.DIST!, 'index.html'))
  }
}

function registerIpc() {
  if (ipcRegistered) return
  ipcRegistered = true

  const api = getDbApi()

  const originalHandle = ipcMain.handle.bind(ipcMain)
  ipcMain.handle = ((channel: string, handler: Parameters<typeof ipcMain.handle>[1]) => {
    if (isLicenseChannel(channel)) {
      return originalHandle(channel, handler)
    }
    return originalHandle(channel, async (event, ...args) => {
      assertLicenseValid()
      return handler(event, ...args)
    })
  }) as typeof ipcMain.handle

  ipcMain.handle('license:status', () => getLicenseStatus())
  ipcMain.handle('license:activate', (_e, key: string) => activateLicense(key))

  ipcMain.handle('whatsapp:contract', (_e, contractId: number) => sendWhatsAppContract(contractId))
  ipcMain.handle('whatsapp:paymentReminder', (_e, reservationId: number) =>
    sendWhatsAppPaymentReminder(reservationId),
  )
  ipcMain.handle('whatsapp:returnReminder', (_e, input: { contractId?: number; reservationId?: number }) =>
    sendWhatsAppReturnReminder(input),
  )

  ipcMain.handle('dashboard:stats', () => api.getDashboardStats())
  ipcMain.handle('cars:stats', () => api.getCarStats())
  ipcMain.handle('cars:list', (_e, filters) => api.listCars(filters))
  ipcMain.handle('cars:get', (_e, id) => api.getCar(id))
  ipcMain.handle('cars:create', (_e, data) => api.createCar(data))
  ipcMain.handle('cars:update', (_e, id, data) => api.updateCar(id, data))
  ipcMain.handle('cars:updateStatus', (_e, id, status) => api.updateCarStatus(id, status))
  ipcMain.handle('cars:delete', (_e, id) => api.deleteCar(id))
  ipcMain.handle('cars:deleteImage', (_e, id) => api.deleteCarImage(id))
  ipcMain.handle('cars:pickPhoto', (_e, carId?: number) => pickCarPhoto(win, carId))
  ipcMain.handle('cars:pickPhotos', (_e, carId?: number) => pickCarPhotos(win, carId))
  ipcMain.handle('cars:pickDocument', (_e, carId?: number) => pickCarDocument(win, carId))
  ipcMain.handle('cars:deleteFile', (_e, filePath: string) => deleteStoredFile(filePath))
  ipcMain.handle('cars:getFileUrl', (_e, filePath: string) => getFileUrl(filePath))
  ipcMain.handle('cars:openFile', (_e, filePath: string) => openStoredFile(filePath))
  ipcMain.handle('cars:exportExcel', (_e, filters) => exportCarsExcel(filters))

  ipcMain.handle('customers:list', (_e, q) => api.listCustomers(q))
  ipcMain.handle('customers:get', (_e, id) => api.getCustomer(id))
  ipcMain.handle('customers:create', (_e, data) => api.createCustomer(data))
  ipcMain.handle('customers:update', (_e, id, data) => api.updateCustomer(id, data))
  ipcMain.handle('customers:delete', (_e, id) => api.deleteCustomer(id))
  ipcMain.handle('customers:pickDocument', (_e, customerId?: number) => pickCustomerDocument(win, customerId))
  ipcMain.handle('customers:deleteFile', (_e, filePath: string) => deleteCustomerFile(filePath))
  ipcMain.handle('customers:openFile', (_e, filePath: string) => openCustomerFile(filePath))

  ipcMain.handle('clients:list', (_e, q) => api.listClients(q))
  ipcMain.handle('clients:get', (_e, id) => api.getClient(id))
  ipcMain.handle('clients:create', (_e, data) => api.createClient(data))
  ipcMain.handle('clients:update', (_e, id, data) => api.updateClient(id, data))
  ipcMain.handle('clients:delete', (_e, id) => api.deleteClient(id))

  ipcMain.handle('reservations:list', (_e, filters) => api.listReservations(filters))
  ipcMain.handle('reservations:get', (_e, id) => api.getReservation(id))
  ipcMain.handle('reservations:create', (_e, data) => api.createReservation(data))
  ipcMain.handle('reservations:update', (_e, id, data) => api.updateReservation(id, data))
  ipcMain.handle('reservations:applyPaymentStatus', (_e, id, data) => api.applyReservationPaymentStatus(id, data))
  ipcMain.handle('reservations:delete', (_e, id) => api.deleteReservation(id))

  ipcMain.handle('reservation-payments:list', (_e, filters) => api.listReservationPayments(filters))
  ipcMain.handle('reservation-payments:get', (_e, id) => api.getReservationPayment(id))
  ipcMain.handle('reservation-payments:create', (_e, data) => api.createReservationPayment(data))
  ipcMain.handle('reservation-payments:update', (_e, id, data) => api.updateReservationPayment(id, data))
  ipcMain.handle('reservation-payments:delete', (_e, id) => api.deleteReservationPayment(id))
  ipcMain.handle('reservation-payments:stats', () => api.getPaymentStats())

  ipcMain.handle('contracts:list', (_e, filters) => api.listContracts(filters))
  ipcMain.handle('contracts:get', (_e, id) => api.getContract(id))
  ipcMain.handle('contracts:create', (_e, data) => api.createContract(data))
  ipcMain.handle('contracts:update', (_e, id, data) => api.updateContract(id, data))
  ipcMain.handle('contracts:delete', (_e, id) => api.deleteContract(id))
  ipcMain.handle('contracts:return', (_e, id, data) => api.returnContract(id, data))
  ipcMain.handle('contracts:restore', (_e, id) => api.restoreContract(id))
  ipcMain.handle('contracts:createFromReservation', (_e, reservationId) => api.createContractFromReservation(reservationId))
  ipcMain.handle('contracts:markDelivered', (_e, id) => api.markContractDelivered(id))
  ipcMain.handle('contracts:close', (_e, id, data) => api.closeContract(id, data))
  ipcMain.handle('contracts:cancel', (_e, id) => api.cancelContract(id))
  ipcMain.handle('contracts:stats', () => api.getContractStats())
  ipcMain.handle('contracts:generatePdf', (_e, id) => generateContractPdf(id))
  ipcMain.handle('contracts:openPdf', (_e, id) => openContractPdf(id))
  ipcMain.handle('contracts:pickDamagePhoto', (_e, kind: 'departure' | 'return') =>
    pickContractDamagePhoto(win, kind),
  )

  ipcMain.handle('payments:list', (_e, contractId) => api.listPayments(contractId))
  ipcMain.handle('payments:create', (_e, data) => api.createPayment(data))
  ipcMain.handle('payments:update', (_e, id, data) => api.updatePayment(id, data))
  ipcMain.handle('payments:delete', (_e, id) => api.deletePayment(id))

  ipcMain.handle('expenses:list', (_e, filters) => api.listExpenses(filters))
  ipcMain.handle('expenses:get', (_e, id) => api.getExpense(id))
  ipcMain.handle('expenses:create', (_e, data) => api.createExpense(data))
  ipcMain.handle('expenses:update', (_e, id, data) => api.updateExpense(id, data))
  ipcMain.handle('expenses:delete', (_e, id) => api.deleteExpense(id))
  ipcMain.handle('expenses:stats', (_e, filters) => api.getExpenseStats(filters))
  ipcMain.handle('expenses:pickReceipt', (_e, expenseId?: number) => pickExpenseReceipt(win, expenseId))
  ipcMain.handle('expenses:deleteFile', (_e, filePath: string) => deleteExpenseFile(filePath))
  ipcMain.handle('expenses:getFileUrl', (_e, filePath: string) => getExpenseFileUrl(filePath))
  ipcMain.handle('expenses:openFile', (_e, filePath: string) => openExpenseFile(filePath))
  ipcMain.handle('expenses:exportExcel', (_e, filters) => exportExpensesExcel(filters))

  ipcMain.handle('chauffeurs:list', (_e, filters) => api.listChauffeurs(filters))
  ipcMain.handle('chauffeurs:get', (_e, id) => api.getChauffeur(id))
  ipcMain.handle('chauffeurs:create', (_e, data) => api.createChauffeur(data))
  ipcMain.handle('chauffeurs:update', (_e, id, data) => api.updateChauffeur(id, data))
  ipcMain.handle('chauffeurs:delete', (_e, id) => api.deleteChauffeur(id))
  ipcMain.handle('chauffeurs:pickDocument', (_e, chauffeurId?: number) =>
    pickChauffeurDocument(win, chauffeurId),
  )
  ipcMain.handle('chauffeurs:deleteFile', (_e, filePath: string) => deleteChauffeurFile(filePath))
  ipcMain.handle('chauffeurs:openFile', (_e, filePath: string) => openChauffeurFile(filePath))

  ipcMain.handle('revenue:stats', () => api.getRevenueStats())

  ipcMain.handle('notifications:list', () => api.getNotifications())
  ipcMain.handle('notifications:counts', () => api.getNotificationCounts())

  ipcMain.handle('settings:get', () => api.getSettings())
  ipcMain.handle('settings:save', (_e, data) => api.saveSettings(data))
  ipcMain.handle('settings:pickLogo', () => pickCompanyLogo(win))
  ipcMain.handle('settings:getLogoUrl', (_e, filePath: string) => getCompanyLogoUrl(filePath))
  ipcMain.handle('settings:removeLogo', (_e, filePath: string) => {
    removeCompanyLogo(filePath)
    return { ok: true }
  })
}

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
})

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return

  protocol.handle('app-file', (request) => {
    const raw = request.url.replace(/^app-file:/i, '')
    const parsed = new URL(raw.startsWith('//') ? `file:${raw}` : `file://${raw}`)
    let filePath = decodeURIComponent(parsed.pathname)
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.slice(1)
    }
    return net.fetch(pathToFileURL(filePath).href)
  })

  try {
    await createWindow()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    dialog.showErrorBox(
      'LocAgence Pro',
      `Impossible de démarrer l'application.\n\n${message}\n\nRéinstallez ou contactez le support.`,
    )
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      dialog.showErrorBox('LocAgence Pro', `Impossible de démarrer l'application.\n\n${message}`)
      app.quit()
    })
  }
})
