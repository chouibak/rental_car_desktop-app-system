import type { Dict } from '../i18n'
import type { PaymentMethod, PaymentRecordSource, PaymentRecordStatus, ReservationPaymentType } from '../types'
import { mapAppError } from './errors'

/**
 * Payments live in two ledgers (contract / reservation) but behave as one balance.
 * Every screen must save and delete through these helpers so the right API is called
 * and the backend can re-sync contracts, reservations, Paiements and Recettes.
 */

export type PaymentDraft = {
  source: PaymentRecordSource
  id?: number
  contract_id?: number | null
  reservation_id?: number | null
  type?: ReservationPaymentType
  amount: number
  method: PaymentMethod
  status?: PaymentRecordStatus
  paid_at: string
  note?: string
}

export async function savePayment(draft: PaymentDraft) {
  if (draft.source === 'contract') {
    const payload = {
      amount: draft.amount,
      method: draft.method,
      status: draft.status,
      paid_at: draft.paid_at,
      note: draft.note ?? '',
    }
    if (draft.id) return window.api.updatePayment(draft.id, payload)
    if (!draft.contract_id) throw new Error('CONTRACT_NOT_FOUND')
    return window.api.createPayment({ ...payload, contract_id: draft.contract_id })
  }

  if (!draft.reservation_id) throw new Error('RESERVATION_NOT_FOUND')
  const payload = {
    reservation_id: draft.reservation_id,
    type: draft.type ?? 'rental',
    amount: draft.amount,
    method: draft.method,
    status: draft.status ?? 'completed',
    notes: draft.note ?? '',
    paid_at: draft.paid_at,
  }
  return draft.id
    ? window.api.updateReservationPayment(draft.id, payload)
    : window.api.createReservationPayment(payload)
}

export async function deletePayment(payment: { source: PaymentRecordSource; id: number }) {
  return payment.source === 'contract'
    ? window.api.deletePayment(payment.id)
    : window.api.deleteReservationPayment(payment.id)
}

/** Turn backend payment errors into a message the user can act on. */
export function paymentErrorMessage(error: unknown, t: Dict) {
  return mapAppError(error, t)
}
