import type { CarDocType, CarDocumentHistoryItem } from '../types'

export type CarDocSlot = {
  docType: CarDocType
  pathKey: keyof import('../types').Car
  expiryKey?: keyof import('../types').Car
  labelKey: keyof import('../i18n').Dict
  hasExpiry: boolean
  group?: 'carte_grise'
}

export const CAR_DOC_SLOTS: CarDocSlot[] = [
  { docType: 'carte_grise_recto', pathKey: 'doc_carte_grise_path', labelKey: 'carteGriseDoc1', hasExpiry: false, group: 'carte_grise' },
  { docType: 'carte_grise_verso', pathKey: 'doc_carte_grise_path_2', labelKey: 'carteGriseDoc2', hasExpiry: false, group: 'carte_grise' },
  { docType: 'assurance', pathKey: 'doc_assurance_path', expiryKey: 'doc_assurance_expiry', labelKey: 'assurance', hasExpiry: true },
  { docType: 'controle_technique', pathKey: 'doc_controle_technique_path', expiryKey: 'doc_controle_technique_expiry', labelKey: 'controleTechnique', hasExpiry: true },
  { docType: 'vignette', pathKey: 'doc_vignette_path', expiryKey: 'doc_vignette_expiry', labelKey: 'vignette', hasExpiry: true },
  { docType: 'autorisation', pathKey: 'doc_autorisation_path', expiryKey: 'doc_autorisation_expiry', labelKey: 'autorisation', hasExpiry: true },
]

export function carDocumentTitle(label: string, expiry?: string) {
  const trimmed = expiry?.trim()
  if (!trimmed) return label
  const year = trimmed.slice(0, 4)
  return year ? `${label} ${year}` : label
}

export function historyForDocType(history: CarDocumentHistoryItem[] | undefined, docType: CarDocType) {
  return (history ?? []).filter((item) => item.doc_type === docType)
}
