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
  const key = DELIVERY_LABEL_KEYS[value as DeliveryLocation]
  return key ? t[key] : value
}

export function normalizeDeliveryLocation(value: string | null | undefined): DeliveryLocation | '' {
  if (!value) return ''
  if (DELIVERY_LOCATIONS.includes(value as DeliveryLocation)) return value as DeliveryLocation
  const legacy: Record<string, DeliveryLocation> = {
    "à l'agence": 'agency',
    'aeroport': 'airport',
    'aéroport': 'airport',
    'hotel': 'hotel',
    'hôtel': 'hotel',
  }
  return legacy[value.trim().toLowerCase()] ?? ''
}
