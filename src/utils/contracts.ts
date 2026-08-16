export const CONTRACT_STATUSES = ['active', 'draft', 'closed', 'cancelled'] as const

export function isLiveContract(contract: { status?: string | null; deleted_at?: string | null }) {
  return !contract.deleted_at && contract.status !== 'cancelled'
}

export const FUEL_LEVELS = ['vide', 'quart', 'moitie', 'trois_quarts', 'plein'] as const

export const FUEL_FRACTION: Record<(typeof FUEL_LEVELS)[number], string> = {
  vide: '0/4',
  quart: '1/4',
  moitie: '2/4',
  trois_quarts: '3/4',
  plein: '4/4',
}

export const EQUIPMENT_KEYS = [
  'radio',
  'spare_wheel',
  'jack',
  'documents',
  'vest',
  'extinguisher',
  'warning_triangle',
  'baby_seat',
] as const

export const DAMAGE_TYPES = ['R', 'B', 'E', 'C'] as const

export const DAMAGE_PARTS = [
  'front',
  'rear',
  'left_side',
  'right_side',
  'roof',
  'windshield',
  'wheels',
  'interior',
] as const

import type { ContractDamage } from '../types'

export type { ContractDamage }

export function parseEquipment(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

export function parseDamages(value: unknown): ContractDamage[] {
  if (Array.isArray(value)) return value as ContractDamage[]
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as ContractDamage[]) : []
    } catch {
      return []
    }
  }
  return []
}

export function toLocalDatetimeValue(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function toIsoDatetime(value?: string) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toISOString()
}

export function calcContractTotal(billedDays: number, dailyRate: number, discount = 0, extraCharges = 0) {
  return Math.max(0, billedDays * dailyRate - discount + extraCharges)
}

export function calcBilledDays(departure: string, returnDate: string) {
  const start = new Date(departure)
  const end = new Date(returnDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 1
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
}

/** Add (or subtract) whole calendar days; returns ISO string like backend addDaysIso. */
export function addDaysToIso(iso: string, days: number) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

/** Original return before prolongation. Prefers stored original_return_at. */
export function getBaseReturnAt(
  returnAt: string,
  extensionDays: number,
  originalReturnAt?: string | null,
) {
  if (originalReturnAt?.trim()) return originalReturnAt
  const days = Math.max(0, Math.floor(Number(extensionDays) || 0))
  if (!returnAt || days <= 0) return returnAt
  return addDaysToIso(returnAt, -days)
}

/** Rental total before prolongation (fees/discount already included). */
export function getOriginalRentalTotal(
  totalAmount: number,
  extensionDays: number,
  dailyRate: number,
  storedOriginalTotal?: number | null,
) {
  const ext = Math.max(0, Math.floor(Number(extensionDays) || 0))
  if (ext <= 0) return totalAmount
  if (dailyRate <= 0) return Number(storedOriginalTotal ?? 0) || totalAmount
  return Math.max(0, totalAmount - ext * dailyRate)
}

export function calcExtensionPreview(input: {
  originalReturnAt: string
  originalTotal: number
  extensionDays: number
  dailyRate: number
  departure?: string
  paid?: number
}) {
  const extensionDays = Math.max(0, Math.floor(Number(input.extensionDays) || 0))
  const extensionCost = extensionDays * input.dailyRate
  const newTotal = Math.max(0, input.originalTotal + extensionCost)
  const newReturnAt =
    extensionDays === 0 ? input.originalReturnAt : addDaysToIso(input.originalReturnAt, extensionDays)
  const newBilledDays =
    input.departure && newReturnAt ? calcBilledDays(input.departure, newReturnAt) : 0
  const paid = input.paid ?? 0
  return {
    extensionDays,
    extensionCost,
    newTotal,
    newReturnAt,
    newBilledDays,
    newRemaining: Math.max(0, newTotal - paid),
    originalTotal: input.originalTotal,
  }
}

export function formatContractDate(value: string | null | undefined) {
  if (!value) return '—'
  const raw = String(value).trim()
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    if (Number.isNaN(d.getTime())) return raw
    return d.toLocaleDateString('fr-FR')
  }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString('fr-FR')
}

export function formatContractDatetime(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export function personToDriverFields(
  prefix: 'driver1' | 'driver2',
  person: {
    name?: string
    birth_date?: string
    birth_place?: string
    nationality?: string
    address?: string
    phone?: string
    passport_number?: string
    passport_issue_date?: string
    passport_expiry_date?: string
    cin_number?: string
    cin_issue_date?: string
    cin_expiry_date?: string
    license_number?: string
    license_issue_date?: string
    license_expiry_date?: string
  },
) {
  return {
    [`${prefix}_name`]: person.name ?? '',
    [`${prefix}_birth_date`]: person.birth_date ?? '',
    [`${prefix}_birth_place`]: person.birth_place ?? '',
    [`${prefix}_nationality`]: person.nationality ?? '',
    [`${prefix}_address`]: person.address ?? '',
    [`${prefix}_phone`]: person.phone ?? '',
    [`${prefix}_passport_number`]: person.passport_number ?? '',
    [`${prefix}_passport_issued_at`]: person.passport_issue_date ?? '',
    [`${prefix}_passport_expires_at`]: person.passport_expiry_date ?? '',
    [`${prefix}_cin_number`]: person.cin_number ?? '',
    [`${prefix}_cin_issued_at`]: person.cin_issue_date ?? '',
    [`${prefix}_cin_expires_at`]: person.cin_expiry_date ?? '',
    [`${prefix}_license_number`]: person.license_number ?? '',
    [`${prefix}_license_issued_at`]: person.license_issue_date ?? '',
    [`${prefix}_license_expires_at`]: person.license_expiry_date ?? '',
  }
}

export function customerToDriver1Fields(customer: Parameters<typeof personToDriverFields>[1]) {
  return personToDriverFields('driver1', customer)
}

export function customerToDriver2Fields(customer: Parameters<typeof personToDriverFields>[1]) {
  return personToDriverFields('driver2', customer)
}

export function chauffeurToDriver1Fields(chauffeur: Parameters<typeof personToDriverFields>[1]) {
  return personToDriverFields('driver1', chauffeur)
}

export function chauffeurToDriver2Fields(chauffeur: Parameters<typeof personToDriverFields>[1]) {
  return personToDriverFields('driver2', chauffeur)
}

export function emptyDriver2Fields() {
  return personToDriverFields('driver2', {
    name: '',
    birth_date: '',
    birth_place: '',
    nationality: '',
    address: '',
    phone: '',
    passport_number: '',
    passport_issue_date: '',
    passport_expiry_date: '',
    cin_number: '',
    cin_issue_date: '',
    cin_expiry_date: '',
    license_number: '',
    license_issue_date: '',
    license_expiry_date: '',
  })
}
