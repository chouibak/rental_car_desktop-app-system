import type { Dict } from '../i18n'

export const DELIVERY_LOCATIONS = ['agency', 'airport', 'hotel'] as const
export type DeliveryLocation = (typeof DELIVERY_LOCATIONS)[number]

const DELIVERY_LABEL_KEYS: Record<DeliveryLocation, keyof Dict> = {
  agency: 'deliveryAgency',
  airport: 'deliveryAirport',
  hotel: 'deliveryHotel',
}

export function deliveryLocationOptions(t: Dict) {
  return DELIVERY_LOCATIONS.map((value) => ({
    value,
    label: t[DELIVERY_LABEL_KEYS[value]],
  }))
}

export function deliveryLocationLabel(value: string | null | undefined, t: Dict) {
  if (!value?.trim()) return '—'
  return deliveryPlaceForDisplay(value, t) || '—'
}

export function deliveryPlaceForDisplay(value: string | null | undefined, t: Dict) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const normalized = normalizeDeliveryLocation(raw)
  return normalized ? t[DELIVERY_LABEL_KEYS[normalized]] : raw
}

const PLACE_FR: Record<DeliveryLocation, string> = {
  agency: "À l'agence",
  airport: 'Aéroport',
  hotel: 'Hôtel',
}

/** Store a PDF-safe French label for known pickup/return places. */
export function deliveryPlaceForStorage(value: string | null | undefined) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const normalized = normalizeDeliveryLocation(raw)
  return normalized ? PLACE_FR[normalized] : raw
}

export function normalizeDeliveryLocation(value: string | null | undefined): DeliveryLocation | '' {
  if (!value) return ''
  const raw = value.trim()
  if (DELIVERY_LOCATIONS.includes(raw as DeliveryLocation)) return raw as DeliveryLocation

  const folded = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, "'")

  const legacy: Record<string, DeliveryLocation> = {
    agency: 'agency',
    airport: 'airport',
    hotel: 'hotel',
    "a l'agence": 'agency',
    agence: 'agency',
    aeroport: 'airport',
    'في الوكالة': 'agency',
    'الوكالة': 'agency',
    'المطار': 'airport',
    'الفندق': 'hotel',
  }
  return legacy[folded] ?? legacy[raw] ?? ''
}
