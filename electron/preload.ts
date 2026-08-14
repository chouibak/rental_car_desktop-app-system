import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getDashboardStats: () => ipcRenderer.invoke('dashboard:stats'),
  getCarStats: () => ipcRenderer.invoke('cars:stats'),
  listCars: (filters?: unknown) => ipcRenderer.invoke('cars:list', filters),
  getCar: (id: number) => ipcRenderer.invoke('cars:get', id),
  createCar: (data: unknown) => ipcRenderer.invoke('cars:create', data),
  updateCar: (id: number, data: unknown) => ipcRenderer.invoke('cars:update', id, data),
  updateCarStatus: (id: number, status: string) => ipcRenderer.invoke('cars:updateStatus', id, status),
  deleteCar: (id: number) => ipcRenderer.invoke('cars:delete', id),
  deleteCarImage: (id: number) => ipcRenderer.invoke('cars:deleteImage', id),
  pickCarPhoto: (carId?: number) => ipcRenderer.invoke('cars:pickPhoto', carId),
  pickCarPhotos: (carId?: number) => ipcRenderer.invoke('cars:pickPhotos', carId),
  pickCarDocument: (carId?: number) => ipcRenderer.invoke('cars:pickDocument', carId),
  deleteCarFile: (filePath: string) => ipcRenderer.invoke('cars:deleteFile', filePath),
  getCarFileUrl: (filePath: string) => ipcRenderer.invoke('cars:getFileUrl', filePath),
  openCarFile: (filePath: string) => ipcRenderer.invoke('cars:openFile', filePath),
  exportCarsExcel: (filters?: unknown) => ipcRenderer.invoke('cars:exportExcel', filters),

  listCustomers: (q?: string) => ipcRenderer.invoke('customers:list', q),
  getCustomer: (id: number) => ipcRenderer.invoke('customers:get', id),
  createCustomer: (data: unknown) => ipcRenderer.invoke('customers:create', data),
  updateCustomer: (id: number, data: unknown) => ipcRenderer.invoke('customers:update', id, data),
  deleteCustomer: (id: number) => ipcRenderer.invoke('customers:delete', id),
  pickCustomerDocument: (customerId?: number) => ipcRenderer.invoke('customers:pickDocument', customerId),
  deleteCustomerFile: (filePath: string) => ipcRenderer.invoke('customers:deleteFile', filePath),
  openCustomerFile: (filePath: string) => ipcRenderer.invoke('customers:openFile', filePath),

  listReservations: (filters?: unknown) => ipcRenderer.invoke('reservations:list', filters),
  getReservation: (id: number) => ipcRenderer.invoke('reservations:get', id),
  createReservation: (data: unknown) => ipcRenderer.invoke('reservations:create', data),
  updateReservation: (id: number, data: unknown) => ipcRenderer.invoke('reservations:update', id, data),
  applyReservationPaymentStatus: (id: number, data: unknown) =>
    ipcRenderer.invoke('reservations:applyPaymentStatus', id, data),
  deleteReservation: (id: number) => ipcRenderer.invoke('reservations:delete', id),

  listReservationPayments: (filters?: unknown) => ipcRenderer.invoke('reservation-payments:list', filters),
  getReservationPayment: (id: number) => ipcRenderer.invoke('reservation-payments:get', id),
  createReservationPayment: (data: unknown) => ipcRenderer.invoke('reservation-payments:create', data),
  updateReservationPayment: (id: number, data: unknown) => ipcRenderer.invoke('reservation-payments:update', id, data),
  deleteReservationPayment: (id: number) => ipcRenderer.invoke('reservation-payments:delete', id),
  getPaymentStats: () => ipcRenderer.invoke('reservation-payments:stats'),

  listClients: (q?: string) => ipcRenderer.invoke('clients:list', q),
  getClient: (id: number) => ipcRenderer.invoke('clients:get', id),
  createClient: (data: unknown) => ipcRenderer.invoke('clients:create', data),
  updateClient: (id: number, data: unknown) => ipcRenderer.invoke('clients:update', id, data),
  deleteClient: (id: number) => ipcRenderer.invoke('clients:delete', id),

  listContracts: (filters?: unknown) => ipcRenderer.invoke('contracts:list', filters),
  getContract: (id: number) => ipcRenderer.invoke('contracts:get', id),
  createContract: (data: unknown) => ipcRenderer.invoke('contracts:create', data),
  updateContract: (id: number, data: unknown) => ipcRenderer.invoke('contracts:update', id, data),
  deleteContract: (id: number) => ipcRenderer.invoke('contracts:delete', id),
  returnContract: (id: number, data: unknown) => ipcRenderer.invoke('contracts:return', id, data),
  restoreContract: (id: number) => ipcRenderer.invoke('contracts:restore', id),
  createContractFromReservation: (reservationId: number) => ipcRenderer.invoke('contracts:createFromReservation', reservationId),
  markContractDelivered: (id: number, data?: unknown) => ipcRenderer.invoke('contracts:markDelivered', id, data),
  closeContract: (id: number, data: unknown) => ipcRenderer.invoke('contracts:close', id, data),
  updateReturnHandover: (id: number, data: unknown) => ipcRenderer.invoke('contracts:updateReturnHandover', id, data),
  cancelContract: (id: number) => ipcRenderer.invoke('contracts:cancel', id),
  extendContract: (id: number, data: { extra_days?: number; new_return_at?: string; note?: string }) =>
    ipcRenderer.invoke('contracts:extend', id, data),
  setContractExtension: (id: number, data: { extension_days: number; note?: string }) =>
    ipcRenderer.invoke('contracts:setExtension', id, data),
  removeContractExtension: (id: number) => ipcRenderer.invoke('contracts:removeExtension', id),
  getContractStats: () => ipcRenderer.invoke('contracts:stats'),
  generateContractPdf: (id: number) => ipcRenderer.invoke('contracts:generatePdf', id),
  openContractPdf: (id: number) => ipcRenderer.invoke('contracts:openPdf', id),
  pickContractDamagePhoto: (kind: 'departure' | 'return') => ipcRenderer.invoke('contracts:pickDamagePhoto', kind),
  pickContractDamageVideo: (kind?: 'departure' | 'return') =>
    ipcRenderer.invoke('contracts:pickDamageVideo', kind ?? 'departure'),

  listPayments: (contractId?: number) => ipcRenderer.invoke('payments:list', contractId),
  createPayment: (data: unknown) => ipcRenderer.invoke('payments:create', data),
  updatePayment: (id: number, data: unknown) => ipcRenderer.invoke('payments:update', id, data),
  deletePayment: (id: number) => ipcRenderer.invoke('payments:delete', id),

  listExpenses: (filters?: unknown) => ipcRenderer.invoke('expenses:list', filters),
  getExpense: (id: number) => ipcRenderer.invoke('expenses:get', id),
  createExpense: (data: unknown) => ipcRenderer.invoke('expenses:create', data),
  updateExpense: (id: number, data: unknown) => ipcRenderer.invoke('expenses:update', id, data),
  deleteExpense: (id: number) => ipcRenderer.invoke('expenses:delete', id),
  getExpenseStats: (filters?: unknown) => ipcRenderer.invoke('expenses:stats', filters),
  pickExpenseReceipt: (expenseId?: number) => ipcRenderer.invoke('expenses:pickReceipt', expenseId),
  deleteExpenseFile: (filePath: string) => ipcRenderer.invoke('expenses:deleteFile', filePath),
  getExpenseFileUrl: (filePath: string) => ipcRenderer.invoke('expenses:getFileUrl', filePath),
  openExpenseFile: (filePath: string) => ipcRenderer.invoke('expenses:openFile', filePath),
  exportExpensesExcel: (filters?: unknown) => ipcRenderer.invoke('expenses:exportExcel', filters),

  listVidanges: (carId: number) => ipcRenderer.invoke('vidange:list', carId),
  getVidangeStatus: (carId: number) => ipcRenderer.invoke('vidange:status', carId),
  createVidange: (data: unknown) => ipcRenderer.invoke('vidange:create', data),
  updateVidange: (id: number, data: unknown) => ipcRenderer.invoke('vidange:update', id, data),
  deleteVidange: (id: number) => ipcRenderer.invoke('vidange:delete', id),
  updateVidangeIntervals: (carId: number, intervalKm: number, intervalMonths: number) =>
    ipcRenderer.invoke('vidange:updateIntervals', carId, intervalKm, intervalMonths),

  listChauffeurs: (filters?: unknown) => ipcRenderer.invoke('chauffeurs:list', filters),
  getChauffeur: (id: number) => ipcRenderer.invoke('chauffeurs:get', id),
  createChauffeur: (data: unknown) => ipcRenderer.invoke('chauffeurs:create', data),
  updateChauffeur: (id: number, data: unknown) => ipcRenderer.invoke('chauffeurs:update', id, data),
  deleteChauffeur: (id: number) => ipcRenderer.invoke('chauffeurs:delete', id),
  pickChauffeurDocument: (chauffeurId?: number) => ipcRenderer.invoke('chauffeurs:pickDocument', chauffeurId),
  deleteChauffeurFile: (filePath: string) => ipcRenderer.invoke('chauffeurs:deleteFile', filePath),
  openChauffeurFile: (filePath: string) => ipcRenderer.invoke('chauffeurs:openFile', filePath),

  getRevenueStats: () => ipcRenderer.invoke('revenue:stats'),

  getNotifications: () => ipcRenderer.invoke('notifications:list'),
  getNotificationCounts: () => ipcRenderer.invoke('notifications:counts'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (data: unknown) => ipcRenderer.invoke('settings:save', data),
  pickCompanyLogo: () => ipcRenderer.invoke('settings:pickLogo'),
  getCompanyLogoUrl: (filePath: string) => ipcRenderer.invoke('settings:getLogoUrl', filePath),
  removeCompanyLogo: (filePath: string) => ipcRenderer.invoke('settings:removeLogo', filePath),
  pickContractConditionsImage: () => ipcRenderer.invoke('settings:pickConditions'),
  getContractConditionsUrl: (filePath: string) => ipcRenderer.invoke('settings:getConditionsUrl', filePath),
  removeContractConditionsImage: (filePath: string) => ipcRenderer.invoke('settings:removeConditions', filePath),

  getLicenseStatus: () => ipcRenderer.invoke('license:status'),
  activateLicense: (key: string) => ipcRenderer.invoke('license:activate', key),

  getAuthSession: () => ipcRenderer.invoke('auth:session'),
  login: (input: { username: string; password: string; remember?: boolean }) =>
    ipcRenderer.invoke('auth:login', input),
  logout: () => ipcRenderer.invoke('auth:logout'),
  changeCredentials: (input: { currentPassword: string; newUsername?: string; newPassword?: string }) =>
    ipcRenderer.invoke('auth:changeCredentials', input),

  sendWhatsAppContract: (contractId: number) => ipcRenderer.invoke('whatsapp:contract', contractId),
  sendWhatsAppPaymentReminder: (reservationId: number) =>
    ipcRenderer.invoke('whatsapp:paymentReminder', reservationId),
  sendWhatsAppReturnReminder: (input: { contractId?: number; reservationId?: number }) =>
    ipcRenderer.invoke('whatsapp:returnReminder', input),
}

contextBridge.exposeInMainWorld('api', api)

export type DesktopApi = typeof api
