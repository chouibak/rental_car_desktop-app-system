import type { Dict } from '../i18n'

/**
 * Backend throws short codes (`PLATE_EXISTS`, `INVALID_AMOUNT`, …).
 * Every form should map them here so the user never sees the raw code.
 */
export function mapAppError(err: unknown, t: Dict): string {
  const msg = String(err)

  if (msg.includes('PLATE_EXISTS')) return t.plateExists
  if (msg.includes('NAME_REQUIRED')) return t.nameRequired
  if (msg.includes('PLATE_REQUIRED')) return t.plateRequired
  if (msg.includes('TITLE_REQUIRED')) return t.titleRequired
  if (msg.includes('DRIVER1_REQUIRED')) return t.driverRequired
  if (msg.includes('INVALID_AMOUNT')) return t.invalidAmount
  if (msg.includes('INVALID_VIDANGE_DATE')) return t.invalidVidangeDate
  if (msg.includes('INVALID_VIDANGE_MILEAGE')) return t.invalidVidangeMileage
  if (msg.includes('INVALID_VIDANGE_COST')) return t.invalidVidangeCost
  if (msg.includes('RETURN_MILEAGE_INVALID')) return t.returnMileageInvalid
  if (msg.includes('NOT_AN_IMAGE')) return t.notAnImage
  if (msg.includes('INVALID_PARTIAL_AMOUNT')) return t.invalidPartialAmount
  if (msg.includes('CONTRACT_CANCELLED')) return t.saveFailed
  if (msg.includes('PAYMENT_EXCEEDS_TOTAL')) return t.paymentExceedsTotal
  if (msg.includes('INVALID_DATES')) return t.invalidDates
  if (msg.includes('INVALID_CONTRACT_STATUS')) return t.invalidContractStatus
  if (msg.includes('INVALID_EXTENSION_DAYS')) return t.invalidExtensionDays
  if (msg.includes('EXTENSION_MUST_BE_LATER')) return t.extensionMustBeLater
  if (msg.includes('CAR_NOT_AVAILABLE')) return t.carNotAvailable
  if (msg.includes('CAR_NOT_FOUND')) return t.carNotFound
  if (msg.includes('CONTRACT_ALREADY_EXISTS')) return t.contractAlreadyExists
  if (msg.includes('CONTRACT_RESERVATION_CLIENT_MISMATCH') || msg.includes('CONTRACT_RESERVATION_CAR_MISMATCH')) {
    return t.contractReservationMismatch
  }
  if (msg.includes('CUSTOMER_HAS_CONTRACTS') || msg.includes('CUSTOMER_HAS_RESERVATIONS')) return t.cannotDeleteCustomer
  if (msg.includes('CHAUFFEUR_HAS_RESERVATIONS')) return t.cannotDeleteChauffeur
  if (msg.includes('CAR_HAS_CONTRACTS') || msg.includes('CAR_HAS_RESERVATIONS')) return t.cannotDeleteCar
  if (msg.includes('PAYMENT_NOT_FOUND')) return t.cannotDeletePayment
  if (msg.includes('CONTRACT_NOT_FOUND') || msg.includes('RESERVATION_NOT_FOUND') || msg.includes('EXPENSE_NOT_FOUND')) {
    return t.loadFailed
  }
  if (msg.includes('RESERVATION_CREATE_FAILED') || msg.includes('RESERVATION_UPDATE_FAILED')) return t.saveReservationFailed
  if (msg.includes('PAYMENT_CREATE_FAILED')) return t.savePaymentFailed
  if (msg.includes('INSERT_FAILED') || msg.includes('TypeError') || msg.includes("reading 'id'")) return t.saveFailed

  if (/^[A-Z][A-Z0-9_]+$/.test(msg.trim()) || /Error:\s*[A-Z][A-Z0-9_]+/.test(msg)) return t.saveFailed
  return t.saveFailed
}
