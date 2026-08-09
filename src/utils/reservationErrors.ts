import type { Dict } from '../i18n'

export function mapReservationSaveError(err: unknown, t: Dict) {
  const msg = String(err)

  if (msg.includes('CAR_NOT_AVAILABLE')) return t.carNotAvailable
  if (msg.includes('INVALID_DATES')) return t.invalidDates
  if (msg.includes('INVALID_PARTIAL_AMOUNT')) return t.invalidPartialAmount
  if (msg.includes('RESERVATION_CREATE_FAILED')) return t.saveReservationFailed
  if (msg.includes('RESERVATION_UPDATE_FAILED')) return t.saveReservationFailed
  if (msg.includes('PAYMENT_CREATE_FAILED')) return t.savePaymentFailed
  if (msg.includes('CAR_NOT_FOUND')) return t.carNotFound
  if (msg.includes('INSERT_FAILED')) return t.saveFailed
  if (msg.includes("reading 'id'") || msg.includes('TypeError')) return t.saveReservationFailed

  return t.saveFailed
}
