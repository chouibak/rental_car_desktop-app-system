export type Lang = 'fr' | 'ar'

export type CarCategory = 'economique' | 'compacte' | 'suv' | '4x4' | 'monospace'
export type CarTransmission = 'manuelle' | 'automatique'
export type CarFuel = 'Essence' | 'Diesel' | 'Hybride' | 'Électrique'
export type CarComputedStatus = 'disponible' | 'louee' | 'hors_service'

export type CarImage = {
  id?: number
  car_id?: number
  path: string
  position: number
  url?: string
}

export type Car = {
  id: number
  name: string
  brand: string
  model: string
  plate_number: string
  year: number | null
  color: string
  category: CarCategory
  price_per_day: number
  transmission: CarTransmission
  seats: number
  fuel: CarFuel
  bags: number
  badge: string
  status?: CarComputedStatus
  is_available: number | boolean
  mileage: number
  fuel_level: string
  condition_notes: string
  doc_carte_grise_path: string
  doc_carte_grise_expiry: string
  doc_assurance_path: string
  doc_assurance_expiry: string
  doc_controle_technique_path: string
  doc_controle_technique_expiry: string
  doc_vignette_path: string
  doc_vignette_expiry: string
  doc_autorisation_path: string
  doc_autorisation_expiry: string
  created_at?: string
  updated_at?: string
  computed_status?: CarComputedStatus
  thumbnail?: string | null
  return_date?: string | null
  images?: CarImage[]
}

export type CarInput = Omit<Car, 'id' | 'computed_status' | 'thumbnail' | 'return_date' | 'created_at' | 'updated_at'> & {
  images?: CarImage[]
}

export type CarStats = {
  total: number
  disponible: number
  louee: number
  hors_service: number
}

export type Customer = {
  id: number
  name: string
  phone: string
  email: string
  birth_date: string
  birth_place: string
  nationality: string
  address: string
  cin_number: string
  cin_pdf_path: string
  cin_issue_date: string
  cin_expiry_date: string
  passport_number: string
  passport_pdf_path: string
  passport_issue_date: string
  passport_expiry_date: string
  license_number: string
  license_pdf_path: string
  license_issue_date: string
  license_expiry_date: string
  created_at?: string
  updated_at?: string
}

export type CustomerInput = Omit<Customer, 'id' | 'created_at' | 'updated_at'>

export type Chauffeur = {
  id: number
  name: string
  phone: string
  birth_date: string
  birth_place: string
  nationality: string
  address: string
  cin_number: string
  cin_pdf_path: string
  cin_issue_date: string
  cin_expiry_date: string
  passport_number: string
  passport_pdf_path: string
  passport_issue_date: string
  passport_expiry_date: string
  license_number: string
  license_pdf_path: string
  license_issue_date: string
  license_expiry_date: string
  is_active: number | boolean
  notes: string
  created_at?: string
  updated_at?: string
}

export type ChauffeurInput = Omit<Chauffeur, 'id' | 'created_at' | 'updated_at'>

export type Client = {
  id: number
  full_name: string
  phone: string
  email: string
  cin: string
  address: string
  license_number: string
  notes: string
}

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed'
export type PaymentStatus = 'unpaid' | 'partial' | 'paid'
export type DepositStatus = 'pending' | 'received' | 'refunded'

export type Reservation = {
  id: number
  reference: string
  car_id: number
  customer_id: number
  chauffeur_id: number | null
  pickup_date: string
  return_date: string
  delivery_location: string
  message: string
  days: number
  daily_rate: number
  total_amount: number
  deposit_amount: number
  deposit_status: DepositStatus
  status: ReservationStatus
  payment_status: PaymentStatus
  created_at?: string
  updated_at?: string
  customer_name?: string
  chauffeur_name?: string
  car_name?: string
  car_plate?: string
  paid_amount?: number
  contract_count?: number
}

export type ReservationInput = {
  car_id: number
  customer_id: number
  chauffeur_id?: number | null
  pickup_date: string
  return_date: string
  delivery_location?: string
  message?: string
  daily_rate?: number
  deposit_amount?: number
  deposit_status?: DepositStatus
  status?: ReservationStatus
  payment_status?: PaymentStatus
}

export type ContractStatus = 'draft' | 'active' | 'closed' | 'cancelled'

export type Contract = {
  id: number
  contract_number: string
  reservation_id?: number | null
  client_id: number
  car_id: number
  status: ContractStatus | string
  contract_date?: string
  contract_city?: string
  driver1_name?: string
  driver1_birth_date?: string
  driver1_birth_place?: string
  driver1_nationality?: string
  driver1_address?: string
  driver1_phone?: string
  driver1_passport_number?: string
  driver1_passport_issued_at?: string
  driver1_passport_expires_at?: string
  driver1_cin_number?: string
  driver1_cin_issued_at?: string
  driver1_cin_expires_at?: string
  driver1_license_number?: string
  driver1_license_issued_at?: string
  driver1_license_expires_at?: string
  driver2_name?: string
  driver2_birth_date?: string
  driver2_birth_place?: string
  driver2_nationality?: string
  driver2_address?: string
  driver2_phone?: string
  driver2_passport_number?: string
  driver2_passport_issued_at?: string
  driver2_passport_expires_at?: string
  driver2_cin_number?: string
  driver2_cin_issued_at?: string
  driver2_cin_expires_at?: string
  driver2_license_number?: string
  driver2_license_issued_at?: string
  driver2_license_expires_at?: string
  vehicle_brand?: string
  vehicle_model?: string
  vehicle_plate?: string
  departure_at?: string
  departure_place?: string
  departure_mileage?: number
  departure_fuel_level?: string
  return_at?: string
  return_place?: string
  return_mileage?: number
  return_fuel_level?: string
  billed_days?: number
  extension_until?: string
  extension_days?: number
  departure_notes?: string
  return_notes?: string
  equipment?: string
  equipment_other?: string
  departure_damages?: string
  return_damages?: string
  include_damage_photos_in_pdf?: number
  daily_rate?: number
  deposit_amount?: number
  franchise_applies?: number
  franchise_amount?: number
  extra_charges?: number
  extra_charges_note?: string
  vat_applies?: number
  vat_rate?: number
  delivered_at?: string
  closed_at?: string
  customer_signed_at?: string
  agency_signed_at?: string
  deleted_at?: string | null
  is_overdue?: boolean
  reservation_reference?: string
  start_date: string
  end_date: string
  daily_price: number
  total_days: number
  discount: number
  deposit: number
  total_amount: number
  notes: string
  client_name?: string
  client_phone?: string
  brand?: string
  model?: string
  plate_number?: string
  paid_amount?: number
  payments?: Payment[]
  returnInfo?: ReturnInfo | null
  reservation_contract_count?: number
}

export type ContractInput = Partial<Contract> & {
  client_id?: number
  car_id?: number
}

export type ContractStats = {
  active: number
  overdue: number
}

export type Payment = {
  id: number
  contract_id: number
  amount: number
  method: string
  paid_at: string
  note: string
  contract_number?: string
  client_name?: string
  source?: 'contract' | 'reservation'
}

export type ReservationPaymentType = 'rental' | 'deposit' | 'deposit_return'
export type ReservationPaymentMethod = 'cash' | 'card' | 'bank_transfer'
export type ReservationPaymentRecordStatus = 'completed' | 'pending' | 'cancelled'

export type ReservationPayment = {
  id: number
  reservation_id: number
  type: ReservationPaymentType
  amount: number
  method: ReservationPaymentMethod
  status: ReservationPaymentRecordStatus
  reference: string
  notes: string
  paid_at: string
  created_at?: string
  updated_at?: string
  reservation_reference?: string
  customer_name?: string
  car_name?: string
  reservation_payment_status?: string
}

export type ReservationPaymentInput = {
  reservation_id: number
  type: ReservationPaymentType
  amount: number
  method?: ReservationPaymentMethod
  status?: ReservationPaymentRecordStatus
  reference?: string
  notes?: string
  paid_at?: string
}

export type PaymentStats = {
  today_revenue: number
  today_payments_count: number
  month_revenue: number
  unpaid_total: number
}

export type ReturnInfo = {
  id: number
  contract_id: number
  returned_at: string
  mileage: number | null
  fuel_level: string
  damages: string
  extra_fees: number
  notes: string
}

export type DashboardCarUsage = {
  car_id: number
  name: string
  brand: string
  model: string
  plate_number: string
  rentals: number
}

export type DashboardCarInUse = {
  car_id: number
  car_name: string
  plate_number: string
  client_name: string
  return_at: string
  contract_id: number | null
  contract_number: string | null
  contract_status: string | null
  reservation_id: number | null
  reservation_reference: string | null
  reservation_status: string | null
}

export type DashboardUpcomingReturn = {
  id: number
  kind: 'contract' | 'reservation'
  reference: string
  client_name: string
  car_name: string
  plate_number: string
  return_at: string
  status: string
  is_overdue: number | boolean
  contract_id: number | null
  reservation_id: number | null
  car_id: number
}

export type DashboardChartData = {
  monthly_trend: RevenueMonthPoint[]
  unpaid_total: number
  fleet_utilization_pct: number
  top_cars_usage: DashboardCarUsage[]
  cars_in_use: DashboardCarInUse[]
}

export type DashboardStats = {
  cars: number
  available: number
  rented: number
  maintenance: number
  clients: number
  activeContracts: number
  overdueContracts: number
  monthRevenue: number
  upcomingReturns: DashboardUpcomingReturn[]
  charts: DashboardChartData
}

export type Settings = Record<string, string>

export type ExpenseCategory =
  | 'fuel'
  | 'maintenance'
  | 'insurance'
  | 'rent'
  | 'salaries'
  | 'utilities'
  | 'marketing'
  | 'office'
  | 'other'

export type ExpensePaymentMethod = 'cash' | 'card' | 'bank_transfer'

export type Expense = {
  id: number
  title: string
  category: ExpenseCategory
  amount: number
  expense_date: string
  payment_method: ExpensePaymentMethod
  receipt_path: string
  notes: string
  car_id: number | null
  car_name?: string
  car_plate?: string
  created_at: string
}

export type ExpenseInput = {
  title: string
  category?: ExpenseCategory
  amount: number
  expense_date?: string
  payment_method?: ExpensePaymentMethod
  receipt_path?: string
  notes?: string
  car_id?: number | null | ''
}

export type ExpenseStats = {
  month_total: number
  month_count: number
  total: number
  count: number
  by_category: { category: string; amount: number }[]
}

export type RevenueMonthPoint = {
  month: string
  revenue: number
  expenses: number
  net: number
}

export type RevenueMethodPoint = {
  method: string
  amount: number
}

export type RevenueStats = {
  today_revenue: number
  month_revenue: number
  last_month_revenue: number
  year_revenue: number
  month_expenses: number
  month_net: number
  unpaid_total: number
  month_payments_count: number
  month_growth_pct: number | null
  monthly_trend: RevenueMonthPoint[]
  revenue_by_source: { contracts: number; reservations: number }
  by_payment_method: RevenueMethodPoint[]
}

export type NotificationSeverity = 'critical' | 'high' | 'medium' | 'low'

export type NotificationKind =
  | 'contract_return_overdue'
  | 'contract_return_today'
  | 'contract_return_soon'
  | 'reservation_return_overdue'
  | 'reservation_return_today'
  | 'reservation_return_soon'
  | 'car_doc_expired'
  | 'car_doc_expiring'
  | 'customer_doc_expired'
  | 'customer_doc_expiring'
  | 'chauffeur_doc_expired'
  | 'chauffeur_doc_expiring'

export type Notification = {
  id: string
  kind: NotificationKind
  severity: NotificationSeverity
  link: string
  due_date: string
  days_until: number
  title_label: string
  subtitle: string
  doc_type?: string
  entity_id: number
}

export type NotificationCounts = {
  total: number
  critical: number
  high: number
  medium: number
  low: number
}

export type PickedFile = {
  path: string
  url: string
  name?: string
}

export type LicenseStatus = {
  valid: boolean
  activated: boolean
  type: 'trial_7d' | 'trial_5min' | 'lifetime' | null
  activatedAt: string | null
  expiresAt: string | null
  daysRemaining: number | null
  minutesRemaining: number | null
  expired: boolean
  isTrial: boolean
}

declare global {
  interface Window {
    api: {
      getDashboardStats: () => Promise<DashboardStats>
      getCarStats: () => Promise<CarStats>
      listCars: (filters?: { q?: string; status?: CarComputedStatus | ''; category?: CarCategory | '' }) => Promise<Car[]>
      getCar: (id: number) => Promise<Car | null>
      createCar: (data: Partial<CarInput>) => Promise<Car>
      updateCar: (id: number, data: Partial<CarInput>) => Promise<Car>
      updateCarStatus: (id: number, status: CarComputedStatus) => Promise<Car | null>
      deleteCar: (id: number) => Promise<{ ok: boolean }>
      deleteCarImage: (id: number) => Promise<{ ok: boolean }>
      pickCarPhoto: (carId?: number) => Promise<PickedFile | null>
      pickCarPhotos: (carId?: number) => Promise<PickedFile[]>
      pickCarDocument: (carId?: number) => Promise<PickedFile | null>
      deleteCarFile: (filePath: string) => Promise<{ ok: boolean }>
      getCarFileUrl: (filePath: string) => Promise<string>
      openCarFile: (filePath: string) => Promise<{ ok: boolean }>
      exportCarsExcel: (filters?: { q?: string; status?: string; category?: string }) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string }>
      listCustomers: (q?: string) => Promise<Customer[]>
      getCustomer: (id: number) => Promise<Customer | null>
      createCustomer: (data: Partial<CustomerInput>) => Promise<Customer>
      updateCustomer: (id: number, data: Partial<CustomerInput>) => Promise<Customer>
      deleteCustomer: (id: number) => Promise<{ ok: boolean }>
      pickCustomerDocument: (customerId?: number) => Promise<PickedFile | null>
      deleteCustomerFile: (filePath: string) => Promise<{ ok: boolean }>
      openCustomerFile: (filePath: string) => Promise<{ ok: boolean }>
      listChauffeurs: (filters?: { q?: string; activeOnly?: boolean }) => Promise<Chauffeur[]>
      getChauffeur: (id: number) => Promise<Chauffeur | null>
      createChauffeur: (data: Partial<ChauffeurInput>) => Promise<Chauffeur>
      updateChauffeur: (id: number, data: Partial<ChauffeurInput>) => Promise<Chauffeur>
      deleteChauffeur: (id: number) => Promise<{ ok: boolean }>
      pickChauffeurDocument: (chauffeurId?: number) => Promise<PickedFile | null>
      deleteChauffeurFile: (filePath: string) => Promise<{ ok: boolean }>
      openChauffeurFile: (filePath: string) => Promise<{ ok: boolean }>
      listReservations: (filters?: {
        q?: string
        status?: ReservationStatus | ''
        car_id?: number | ''
        customer_id?: number | ''
        date_from?: string
        date_to?: string
      }) => Promise<Reservation[]>
      getReservation: (id: number) => Promise<Reservation | null>
      createReservation: (data: Partial<ReservationInput>) => Promise<Reservation>
      updateReservation: (id: number, data: Partial<ReservationInput>) => Promise<Reservation>
      applyReservationPaymentStatus: (
        id: number,
        data: { payment_status: PaymentStatus; paid_amount?: number },
      ) => Promise<Reservation | null>
      deleteReservation: (id: number) => Promise<{ ok: boolean }>
      listReservationPayments: (filters?: {
        q?: string
        reservation_id?: number | ''
        type?: ReservationPaymentType | ''
        status?: ReservationPaymentRecordStatus | ''
      }) => Promise<ReservationPayment[]>
      getReservationPayment: (id: number) => Promise<ReservationPayment | null>
      createReservationPayment: (data: ReservationPaymentInput) => Promise<ReservationPayment>
      updateReservationPayment: (id: number, data: Partial<ReservationPaymentInput>) => Promise<ReservationPayment>
      deleteReservationPayment: (id: number) => Promise<{ ok: boolean }>
      getPaymentStats: () => Promise<PaymentStats>
      listClients: (q?: string) => Promise<Client[]>
      getClient: (id: number) => Promise<Client | null>
      createClient: (data: Partial<Client>) => Promise<Client>
      updateClient: (id: number, data: Partial<Client>) => Promise<Client>
      deleteClient: (id: number) => Promise<{ ok: boolean }>
      listContracts: (filters?: {
        q?: string
        status?: ContractStatus | ''
        car_id?: number | ''
        client_id?: number | ''
        overdue?: boolean
        archived?: boolean
      }) => Promise<Contract[]>
      getContract: (id: number) => Promise<Contract | null>
      createContract: (data: ContractInput) => Promise<Contract>
      updateContract: (id: number, data: ContractInput) => Promise<Contract>
      deleteContract: (id: number) => Promise<{ ok: boolean }>
      restoreContract: (id: number) => Promise<Contract | null>
      createContractFromReservation: (reservationId: number) => Promise<Contract>
      markContractDelivered: (id: number) => Promise<Contract>
      closeContract: (id: number, data: Record<string, unknown>) => Promise<Contract>
      cancelContract: (id: number) => Promise<Contract>
      getContractStats: () => Promise<ContractStats>
      generateContractPdf: (id: number) => Promise<{ ok: boolean; path: string }>
      openContractPdf: (id: number) => Promise<{ ok: boolean; path: string }>
      pickContractDamagePhoto: (kind: 'departure' | 'return') => Promise<{ path: string; url: string } | null>
      returnContract: (id: number, data: Record<string, unknown>) => Promise<Contract>
      listPayments: (contractId?: number) => Promise<Payment[]>
      createPayment: (data: Record<string, unknown>) => Promise<Payment>
      updatePayment: (id: number, data: Record<string, unknown>) => Promise<Payment>
      deletePayment: (id: number) => Promise<{ ok: boolean }>
      listExpenses: (filters?: {
        q?: string
        category?: ExpenseCategory | ''
        car_id?: number | ''
        date_from?: string
        date_to?: string
      }) => Promise<Expense[]>
      getExpense: (id: number) => Promise<Expense | null>
      createExpense: (data: ExpenseInput) => Promise<Expense>
      updateExpense: (id: number, data: ExpenseInput) => Promise<Expense>
      deleteExpense: (id: number) => Promise<{ ok: boolean }>
      getExpenseStats: (filters?: {
        q?: string
        category?: ExpenseCategory | ''
        car_id?: number | ''
        date_from?: string
        date_to?: string
      }) => Promise<ExpenseStats>
      pickExpenseReceipt: (expenseId?: number) => Promise<PickedFile | null>
      deleteExpenseFile: (filePath: string) => Promise<{ ok: boolean }>
      getExpenseFileUrl: (filePath: string) => Promise<string>
      openExpenseFile: (filePath: string) => Promise<{ ok: boolean }>
      exportExpensesExcel: (filters?: {
        q?: string
        category?: ExpenseCategory | ''
        car_id?: number | ''
        date_from?: string
        date_to?: string
      }) => Promise<{ ok: boolean; canceled?: boolean; filePath?: string }>
      getRevenueStats: () => Promise<RevenueStats>
      getNotifications: () => Promise<Notification[]>
      getNotificationCounts: () => Promise<NotificationCounts>
      getSettings: () => Promise<Settings>
      saveSettings: (data: Settings) => Promise<Settings>
      pickCompanyLogo: () => Promise<{ path: string; url: string } | null>
      getCompanyLogoUrl: (filePath: string) => Promise<string>
      removeCompanyLogo: (filePath: string) => Promise<{ ok: boolean }>
      getLicenseStatus: () => Promise<LicenseStatus>
      activateLicense: (
        key: string,
      ) => Promise<{ ok: true; status: LicenseStatus } | { ok: false; error: string }>
      sendWhatsAppContract: (contractId: number) => Promise<{ ok: true } | { ok: false; error: string }>
      sendWhatsAppPaymentReminder: (
        reservationId: number,
      ) => Promise<{ ok: true } | { ok: false; error: string }>
      sendWhatsAppReturnReminder: (input: {
        contractId?: number
        reservationId?: number
      }) => Promise<{ ok: true } | { ok: false; error: string }>
    }
  }
}

export {}
