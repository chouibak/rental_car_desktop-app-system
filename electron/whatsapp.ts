import { shell } from 'electron'
import { getDbApi } from './db'
import { ensureContractPdf } from './contract-files'

export type WhatsAppResult = { ok: true } | { ok: false; error: 'NO_PHONE' | 'NOT_FOUND' }

export function normalizeWhatsAppPhone(raw: string) {
  let digits = raw.replace(/\D/g, '')
  if (!digits) return ''

  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('212')) return digits
  if (digits.startsWith('0')) return `212${digits.slice(1)}`
  if (digits.length === 9 && /^[67]/.test(digits)) return `212${digits}`

  return digits
}

function formatDate(value: string, lang: string) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString(lang === 'ar' ? 'ar-MA' : 'fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function formatMoney(amount: number) {
  return `${Number(amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DH`
}

function openWhatsApp(phone: string, message: string): WhatsAppResult {
  const normalized = normalizeWhatsAppPhone(phone)
  if (!normalized) return { ok: false, error: 'NO_PHONE' }

  const url = `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
  shell.openExternal(url)
  return { ok: true }
}

function getLang(settings: Record<string, string>) {
  return settings.language === 'ar' ? 'ar' : 'fr'
}

function getPhoneForCustomer(customerId: number) {
  const api = getDbApi()
  const customer = api.getCustomer(customerId)
  return customer?.phone?.trim() || ''
}

function contractMessage(
  lang: string,
  company: string,
  clientName: string,
  contractNumber: string,
  carLabel: string,
  departure: string,
  returnAt: string,
  total: number,
) {
  if (lang === 'ar') {
    return [
      `السلام عليكم ${clientName}،`,
      '',
      `عقد الإيجار ${contractNumber} جاهز.`,
      `السيارة: ${carLabel}`,
      `من ${formatDate(departure, lang)} إلى ${formatDate(returnAt, lang)}`,
      `المبلغ: ${formatMoney(total)}`,
      '',
      company,
    ].join('\n')
  }

  return [
    `Bonjour ${clientName},`,
    '',
    `Votre contrat de location ${contractNumber} est prêt.`,
    `Véhicule : ${carLabel}`,
    `Du ${formatDate(departure, lang)} au ${formatDate(returnAt, lang)}`,
    `Montant : ${formatMoney(total)}`,
    '',
    company,
  ].join('\n')
}

function paymentReminderMessage(
  lang: string,
  company: string,
  clientName: string,
  reference: string,
  carLabel: string,
  remaining: number,
  total: number,
) {
  if (lang === 'ar') {
    return [
      `السلام عليكم ${clientName}،`,
      '',
      `تذكير بخصوص الحجز ${reference}.`,
      `السيارة: ${carLabel}`,
      `المبلغ الإجمالي: ${formatMoney(total)}`,
      `المتبقي: ${formatMoney(remaining)}`,
      '',
      'نرجو تسوية المبلغ في أقرب وقت. شكراً.',
      '',
      company,
    ].join('\n')
  }

  return [
    `Bonjour ${clientName},`,
    '',
    `Rappel concernant votre réservation ${reference}.`,
    `Véhicule : ${carLabel}`,
    `Montant total : ${formatMoney(total)}`,
    `Reste à payer : ${formatMoney(remaining)}`,
    '',
    'Merci de régulariser dès que possible.',
    '',
    company,
  ].join('\n')
}

function returnReminderMessage(
  lang: string,
  company: string,
  clientName: string,
  reference: string,
  carLabel: string,
  returnAt: string,
) {
  if (lang === 'ar') {
    return [
      `السلام عليكم ${clientName}،`,
      '',
      `تذكير بإرجاع السيارة ${carLabel}.`,
      `المرجع: ${reference}`,
      `موعد الإرجاع: ${formatDate(returnAt, lang)}`,
      '',
      'شكراً لتعاونكم.',
      '',
      company,
    ].join('\n')
  }

  return [
    `Bonjour ${clientName},`,
    '',
    `Rappel : retour du véhicule ${carLabel}.`,
    `Référence : ${reference}`,
    `Date de retour : ${formatDate(returnAt, lang)}`,
    '',
    'Merci de votre collaboration.',
    '',
    company,
  ].join('\n')
}

export async function sendWhatsAppContract(contractId: number): Promise<WhatsAppResult> {
  const api = getDbApi()
  const contract = api.getContract(contractId)
  if (!contract) return { ok: false, error: 'NOT_FOUND' }

  const phone = contract.client_phone?.trim() || getPhoneForCustomer(Number(contract.client_id))
  if (!phone) return { ok: false, error: 'NO_PHONE' }

  const settings = api.getSettings()
  const lang = getLang(settings)
  const company = settings.company_name?.trim() || 'LocAgence Pro'
  const carLabel = [
    contract.vehicle_brand || contract.brand,
    contract.vehicle_model || contract.model,
    contract.vehicle_plate || contract.plate_number,
  ]
    .filter(Boolean)
    .join(' ')

  const pdfPath = await ensureContractPdf(contractId)
  await shell.openPath(pdfPath)

  const message = contractMessage(
    lang,
    company,
    contract.client_name || '',
    contract.contract_number,
    carLabel,
    contract.departure_at || contract.start_date,
    contract.return_at || contract.end_date,
    contract.total_amount,
  )

  return openWhatsApp(phone, message)
}

export async function sendWhatsAppPaymentReminder(reservationId: number): Promise<WhatsAppResult> {
  const api = getDbApi()
  const reservation = api.getReservation(reservationId)
  if (!reservation) return { ok: false, error: 'NOT_FOUND' }

  const phone = getPhoneForCustomer(reservation.customer_id)
  if (!phone) return { ok: false, error: 'NO_PHONE' }

  const settings = api.getSettings()
  const lang = getLang(settings)
  const company = settings.company_name?.trim() || 'LocAgence Pro'
  const paid = reservation.paid_amount ?? 0
  const remaining = Math.max(0, reservation.total_amount - paid)
  const carLabel = [reservation.car_name, reservation.car_plate].filter(Boolean).join(' · ')

  const message = paymentReminderMessage(
    lang,
    company,
    reservation.customer_name || '',
    reservation.reference,
    carLabel,
    remaining,
    reservation.total_amount,
  )

  return openWhatsApp(phone, message)
}

export async function sendWhatsAppReturnReminder(input: {
  contractId?: number
  reservationId?: number
}): Promise<WhatsAppResult> {
  const api = getDbApi()
  const settings = api.getSettings()
  const lang = getLang(settings)
  const company = settings.company_name?.trim() || 'LocAgence Pro'

  if (input.contractId) {
    const contract = api.getContract(input.contractId)
    if (!contract) return { ok: false, error: 'NOT_FOUND' }

    const phone = contract.client_phone?.trim() || getPhoneForCustomer(Number(contract.client_id))
    if (!phone) return { ok: false, error: 'NO_PHONE' }

    const carLabel = [
      contract.vehicle_brand || contract.brand,
      contract.vehicle_model || contract.model,
      contract.vehicle_plate || contract.plate_number,
    ]
      .filter(Boolean)
      .join(' ')

    const message = returnReminderMessage(
      lang,
      company,
      contract.client_name || '',
      contract.contract_number,
      carLabel,
      contract.return_at || contract.end_date,
    )

    return openWhatsApp(phone, message)
  }

  if (input.reservationId) {
    const reservation = api.getReservation(input.reservationId)
    if (!reservation) return { ok: false, error: 'NOT_FOUND' }

    const phone = getPhoneForCustomer(reservation.customer_id)
    if (!phone) return { ok: false, error: 'NO_PHONE' }

    const carLabel = [reservation.car_name, reservation.car_plate].filter(Boolean).join(' · ')
    const message = returnReminderMessage(
      lang,
      company,
      reservation.customer_name || '',
      reservation.reference,
      carLabel,
      reservation.return_date,
    )

    return openWhatsApp(phone, message)
  }

  return { ok: false, error: 'NOT_FOUND' }
}
