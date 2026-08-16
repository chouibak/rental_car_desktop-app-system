import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { IconEdit, IconPlus, IconTrash } from './icons'
import { EmptyState, PaymentBadge } from './ui'
import { useLang } from '../context/LangContext'
import type {
  PaymentMethod,
  Reservation,
  ReservationPayment,
  ReservationPaymentInput,
  ReservationPaymentMethod,
  ReservationPaymentRecordStatus,
  ReservationPaymentType,
} from '../types'
import type { Dict } from '../i18n'
import { deletePayment, paymentErrorMessage, savePayment } from '../utils/payments'
import { todayYmd } from '../utils/calendar'

const PAYMENT_TYPES: ReservationPaymentType[] = ['rental', 'deposit', 'deposit_return']
const PAYMENT_METHODS: ReservationPaymentMethod[] = ['cash', 'card', 'bank_transfer']
const PAYMENT_STATUSES: ReservationPaymentRecordStatus[] = ['completed', 'pending', 'cancelled']

const STATUS_LABELS: Record<ReservationPaymentRecordStatus, keyof Dict> = {
  completed: 'paymentCompleted',
  pending: 'pending',
  cancelled: 'cancelled',
}

const TYPE_LABELS: Record<ReservationPaymentType, keyof Dict> = {
  rental: 'rentalPayment',
  deposit: 'depositPayment',
  deposit_return: 'depositReturnPayment',
}

const METHOD_LABELS: Record<string, keyof Dict> = {
  cash: 'cash',
  card: 'card',
  transfer: 'transfer',
  bank_transfer: 'bank_transfer',
}

type ReservationPaymentsPanelProps = {
  reservationId?: number
  reservation?: Reservation | null
  showReservationLink?: boolean
  onReservationChange?: (reservation: Reservation | null) => void
  filters?: {
    q?: string
    type?: ReservationPaymentType | ''
    status?: ReservationPaymentRecordStatus | ''
  }
  onPaymentsChange?: () => void
}

const emptyForm = (reservationId?: number): ReservationPaymentInput => ({
  reservation_id: reservationId ?? 0,
  type: 'rental',
  amount: 0,
  method: 'cash',
  status: 'completed',
  reference: '',
  notes: '',
  paid_at: todayYmd(),
})

export function ReservationPaymentsPanel({
  reservationId,
  reservation,
  showReservationLink = false,
  onReservationChange,
  filters,
  onPaymentsChange,
}: ReservationPaymentsPanelProps) {
  const { t, money } = useLang()
  const [payments, setPayments] = useState<ReservationPayment[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ReservationPayment | null>(null)
  const [form, setForm] = useState<ReservationPaymentInput>(emptyForm(reservationId))
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(reservation ?? null)
  const [modalRentalPaid, setModalRentalPaid] = useState(0)
  const [livePaid, setLivePaid] = useState<number | null>(null)
  const [liveTotal, setLiveTotal] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const refreshReservationSummary = async (id: number) => {
    const res = await window.api.getReservation(id)
    if (!res) return null
    setLivePaid(res.paid_amount ?? 0)
    setLiveTotal(res.total_amount)
    onReservationChange?.(res)
    return res
  }

  const loadPayments = async (notify = false) => {
    const list = await window.api.listReservationPayments({
      reservation_id: reservationId || undefined,
      q: filters?.q || undefined,
      type: filters?.type || undefined,
      status: filters?.status || undefined,
    })
    setPayments(
      [...list].sort((a, b) => {
        const paidDiff = new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
        if (Number.isFinite(paidDiff) && paidDiff !== 0) return paidDiff
        const createdDiff = new Date(b.created_at || b.paid_at).getTime() - new Date(a.created_at || a.paid_at).getTime()
        if (Number.isFinite(createdDiff) && createdDiff !== 0) return createdDiff
        return (b.id || 0) - (a.id || 0)
      }),
    )
    if (reservationId) await refreshReservationSummary(reservationId)
    if (notify) onPaymentsChange?.()
  }

  useEffect(() => {
    if (reservationId) {
      refreshReservationSummary(reservationId)
    } else {
      setLivePaid(null)
      setLiveTotal(null)
    }
  }, [reservationId])

  useEffect(() => {
    if (!reservationId && open && reservations.length === 0) {
      window.api.listReservations().then(setReservations)
    }
  }, [reservationId, open, reservations.length])

  useEffect(() => {
    if (!reservationId && form.reservation_id) {
      window.api.getReservation(form.reservation_id).then((res) => {
        setSelectedReservation(res)
        setModalRentalPaid(res?.paid_amount ?? 0)
      })
    } else if (!form.reservation_id) {
      setSelectedReservation(null)
      setModalRentalPaid(0)
    }
  }, [form.reservation_id, reservationId])

  useEffect(() => {
    loadPayments(false)
  }, [reservationId, filters?.q, filters?.type, filters?.status])

  const rentalPaid = reservationId ? (livePaid ?? reservation?.paid_amount ?? 0) : modalRentalPaid

  const modalRentalPaidValue = reservationId ? rentalPaid : modalRentalPaid

  const activeReservation = reservation ?? selectedReservation
  const activeTotal = activeReservation?.total_amount ?? 0
  const activePaid = modalRentalPaidValue
  const activeRemaining = Math.max(0, activeTotal - activePaid)

  const rentalTotal = liveTotal ?? reservation?.total_amount ?? 0
  const rentalRemaining = Math.max(0, rentalTotal - rentalPaid)

  const openCreate = () => {
    setEditing(null)
    setForm({
      ...emptyForm(reservationId),
      amount: activeRemaining > 0 ? activeRemaining : 0,
    })
    setError('')
    setOpen(true)
  }

  const openEdit = (payment: ReservationPayment) => {
    setEditing(payment)
    setForm({
      reservation_id: payment.reservation_id,
      type: payment.type,
      amount: payment.amount,
      method: payment.method === 'transfer' ? 'bank_transfer' : payment.method,
      status: payment.status,
      reference: payment.reference,
      notes: payment.notes,
      paid_at: payment.paid_at?.slice(0, 10),
    })
    setError('')
    setOpen(true)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const targetReservationId = reservationId ?? Number(form.reservation_id)
    if (editing?.source !== 'contract' && !targetReservationId) {
      setError(t.selectReservation)
      return
    }

    setSaving(true)
    try {
      await savePayment({
        source: editing?.source ?? 'reservation',
        id: editing?.id,
        contract_id: editing?.contract_id,
        reservation_id: targetReservationId,
        type: form.type,
        amount: form.amount,
        method: form.method as PaymentMethod,
        status: editing ? form.status : 'completed',
        paid_at: form.paid_at ?? '',
        note: form.notes || '',
      })
      setOpen(false)
      await loadPayments(true)
    } catch (err) {
      setError(paymentErrorMessage(err, t))
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async (payment: ReservationPayment) => {
    if (!confirm(t.confirmDelete)) return
    try {
      await deletePayment({ source: payment.source ?? 'reservation', id: payment.id })
      await loadPayments(true)
    } catch (err) {
      alert(paymentErrorMessage(err, t))
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <h3>{t.payments}</h3>
        <button type="button" className="btn sm" onClick={openCreate}>
          <IconPlus size={15} />
          {t.addPayment}
        </button>
      </div>

      {reservation && (
        <div className="panel-body payment-summary">
          <div className="info-grid">
            <div className="info-item">
              <span>{t.total}</span>
              <strong>{money(rentalTotal)}</strong>
            </div>
            <div className="info-item">
              <span>{t.paidRental}</span>
              <strong>{money(rentalPaid)}</strong>
            </div>
            <div className="info-item">
              <span>{t.remaining}</span>
              <strong>{money(rentalRemaining)}</strong>
            </div>
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t.paymentReference}</th>
              <th>{t.source}</th>
              {showReservationLink && <th>{t.reservationRef}</th>}
              {showReservationLink && <th>{t.paymentStatus}</th>}
              {!reservationId && <th>{t.customer}</th>}
              <th>{t.paymentType}</th>
              <th>{t.amount}</th>
              <th>{t.method}</th>
              <th>{t.paymentRecordStatus}</th>
              <th>{t.paidAt}</th>
              <th>{t.actions}</th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={showReservationLink ? 11 : reservationId ? 8 : 9}>
                  <EmptyState message={t.noData} />
                </td>
              </tr>
            )}
            {payments.map((payment) => (
              <tr key={`${payment.source || 'reservation'}-${payment.id}`}>
                <td>
                  <strong>{payment.reference}</strong>
                </td>
                <td>
                  {payment.source === 'contract' ? t.paymentFromContract : t.paymentFromReservation}
                </td>
                {showReservationLink && (
                  <td>
                    {payment.source === 'contract' && payment.contract_id ? (
                      <Link className="link-btn" to={`/contracts/${payment.contract_id}`}>
                        {payment.contract_number || payment.reference}
                      </Link>
                    ) : payment.reservation_id ? (
                      <Link className="link-btn" to={`/reservations/${payment.reservation_id}`}>
                        {payment.reservation_reference}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                {showReservationLink && (
                  <td>
                    {payment.reservation_payment_status ? (
                      <PaymentBadge status={payment.reservation_payment_status} />
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                {!reservationId && <td>{payment.customer_name}</td>}
                <td>{t[TYPE_LABELS[payment.type]]}</td>
                <td>{money(payment.amount)}</td>
                <td>{t[METHOD_LABELS[payment.method] || 'cash']}</td>
                <td>{t[STATUS_LABELS[payment.status]]}</td>
                <td>{payment.paid_at?.slice(0, 10)}</td>
                <td>
                  <div className="row-actions">
                    <button className="btn secondary sm icon-only" onClick={() => openEdit(payment)} title={t.edit}>
                      <IconEdit size={15} />
                    </button>
                    <button className="btn danger sm icon-only" onClick={() => onDelete(payment)} title={t.delete}>
                      <IconTrash size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {open &&
        createPortal(
          <div className="modal-backdrop" onClick={() => setOpen(false)}>
            <form
              className="modal payment-modal"
              onSubmit={onSubmit}
              onClick={(e) => e.stopPropagation()}
            >
              <header>
                <strong>{editing ? t.edit : t.addPayment}</strong>
              </header>

              <div className="payment-modal-body">
                {!reservationId && editing?.source !== 'contract' && (
                  <div className="field">
                    <label>{t.reservationRef}</label>
                    <select
                      className="select"
                      required
                      value={form.reservation_id || ''}
                      onChange={async (e) => {
                        const nextId = Number(e.target.value)
                        if (!nextId) {
                          setForm((f) => ({ ...f, reservation_id: 0, amount: 0 }))
                          return
                        }
                        const [res] = await Promise.all([
                          window.api.getReservation(nextId),
                        ])
                        const paid = res?.paid_amount ?? 0
                        const remaining = Math.max(0, (res?.total_amount ?? 0) - paid)
                        setForm((f) => ({ ...f, reservation_id: nextId, amount: remaining }))
                      }}
                    >
                      <option value="">{t.selectReservation}</option>
                      {reservations.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.reference} — {item.customer_name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {editing && (
                  <div className="field">
                    <label>{t.paymentRecordStatus}</label>
                    <select
                      className="select"
                      value={form.status}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, status: e.target.value as ReservationPaymentRecordStatus }))
                      }
                    >
                      {PAYMENT_STATUSES.map((item) => (
                        <option key={item} value={item}>
                          {t[STATUS_LABELS[item]]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {editing?.source !== 'contract' && (
                  <div className="field">
                    <label>{t.paymentType}</label>
                    <select
                      className="select"
                      value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ReservationPaymentType }))}
                    >
                      {PAYMENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t[TYPE_LABELS[type]]}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {activeReservation && form.type === 'rental' && (
                  <p className="payment-modal-hint">
                    {t.remaining}: <strong>{money(activeRemaining)}</strong>
                    <span className="muted-text"> / {money(activeTotal)}</span>
                  </p>
                )}

                <div className="field">
                  <label>{t.amountPaid}</label>
                  <input
                    className="input"
                    type="number"
                    min={0.01}
                    step="0.01"
                    max={form.type === 'rental' && activeTotal > 0 ? activeTotal : undefined}
                    required
                    value={form.amount || ''}
                    onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
                  />
                </div>

                <div className="field">
                  <label>{t.method}</label>
                  <select
                    className="select"
                    value={form.method}
                    onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as ReservationPaymentMethod }))}
                  >
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>
                        {t[METHOD_LABELS[method]]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>{t.paidAt}</label>
                  <input
                    className="input"
                    type="date"
                    required
                    value={form.paid_at}
                    onChange={(e) => setForm((f) => ({ ...f, paid_at: e.target.value }))}
                  />
                </div>
              </div>

              {error && <div className="error payment-modal-error">{error}</div>}

              <footer className="form-actions">
                <button type="button" className="btn secondary" onClick={() => setOpen(false)}>
                  {t.cancel}
                </button>
                <button className="btn" type="submit" disabled={saving}>
                  {saving ? t.loading : t.save}
                </button>
              </footer>
            </form>
          </div>,
          document.body,
        )}
    </div>
  )
}
