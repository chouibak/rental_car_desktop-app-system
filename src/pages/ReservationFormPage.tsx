import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CarSearchSelect } from '../components/CarSearchSelect'
import { OptionSelect } from '../components/OptionSelect'
import { PageHeader } from '../components/ui'
import { deliveryLocationOptions, normalizeDeliveryLocation } from '../utils/reservation'
import { mapReservationSaveError } from '../utils/reservationErrors'
import { useLang } from '../context/LangContext'
import type {
  Car,
  Chauffeur,
  Customer,
  PaymentStatus,
  ReservationStatus,
} from '../types'

const STATUSES: ReservationStatus[] = ['pending', 'confirmed', 'cancelled', 'completed']
const PAYMENT_STATUSES: PaymentStatus[] = ['unpaid', 'partial', 'paid']

function toLocalDatetimeValue(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultPickup() {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return toLocalDatetimeValue(d.toISOString())
}

function defaultReturn() {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  d.setHours(10, 0, 0, 0)
  return toLocalDatetimeValue(d.toISOString())
}

function calcPreview(pickup: string, returnDate: string, dailyRate: number) {
  const start = new Date(pickup)
  const end = new Date(returnDate)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return { days: 0, total: 0 }
  }
  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
  return { days, total: days * dailyRate }
}

const emptyForm = () => ({
  car_id: '' as number | '',
  customer_id: '' as number | '',
  chauffeur_id: '' as number | '',
  pickup_date: defaultPickup(),
  return_date: defaultReturn(),
  delivery_location: 'agency',
  message: '',
  daily_rate: 0,
  deposit_amount: 0,
  deposit_status: 'pending' as const,
  status: 'confirmed' as ReservationStatus,
  payment_status: 'unpaid' as PaymentStatus,
  paid_amount: 0,
})

export default function ReservationFormPage() {
  const { t, money } = useLang()
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEdit = Boolean(id)
  const reservationId = id ? Number(id) : undefined
  const presetCustomerId = searchParams.get('customer')

  const [form, setForm] = useState(emptyForm())
  const [cars, setCars] = useState<Car[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([])
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loadedTotal, setLoadedTotal] = useState(0)

  useEffect(() => {
    Promise.all([
      window.api.listCars(),
      window.api.listCustomers(),
      window.api.listChauffeurs({ activeOnly: true }),
    ]).then(([carList, customerList, chauffeurList]) => {
      setCars(carList)
      setCustomers(customerList)
      setChauffeurs(chauffeurList)

      if (!isEdit && presetCustomerId) {
        const customerId = Number(presetCustomerId)
        if (customerList.some((customer) => customer.id === customerId)) {
          setForm((current) => ({ ...current, customer_id: customerId }))
        }
      }
    })
  }, [isEdit, presetCustomerId])

  useEffect(() => {
    if (!isEdit || !reservationId) return
    setLoading(true)
    window.api.getReservation(reservationId).then(async (data) => {
      if (!data) {
        navigate('/reservations')
        return
      }
      const paid = data.paid_amount ?? 0
      const paymentStatus: PaymentStatus =
        data.total_amount > 0 && paid >= data.total_amount
          ? 'paid'
          : paid > 0
            ? 'partial'
            : 'unpaid'

      setForm({
        car_id: data.car_id,
        customer_id: data.customer_id,
        chauffeur_id: data.chauffeur_id ?? '',
        pickup_date: toLocalDatetimeValue(data.pickup_date),
        return_date: toLocalDatetimeValue(data.return_date),
        delivery_location: normalizeDeliveryLocation(data.delivery_location) || data.delivery_location,
        message: data.message,
        daily_rate: data.daily_rate,
        deposit_amount: data.deposit_amount,
        deposit_status: data.deposit_status,
        status: data.status,
        payment_status: paymentStatus,
        paid_amount: paid,
      })
      setLoadedTotal(Number(data.total_amount) || 0)
      setLoading(false)

      if (data.chauffeur_id) {
        window.api.getChauffeur(data.chauffeur_id).then((assigned) => {
          if (!assigned) return
          setChauffeurs((current) =>
            current.some((row) => row.id === assigned.id) ? current : [...current, assigned],
          )
        })
      }
    })
  }, [isEdit, reservationId, navigate])

  const preview = useMemo(
    () => calcPreview(form.pickup_date, form.return_date, form.daily_rate),
    [form.pickup_date, form.return_date, form.daily_rate],
  )

  const onCarChange = (carId: number) => {
    const car = cars.find((c) => c.id === carId)
    setForm((f) => ({ ...f, car_id: carId, daily_rate: car?.price_per_day ?? 0 }))
  }

  const billedTotal = Math.max(preview.total, loadedTotal)

  const onPaymentStatusChange = (payment_status: PaymentStatus) => {
    setForm((f) => ({
      ...f,
      payment_status,
      paid_amount:
        payment_status === 'paid'
          ? billedTotal
          : payment_status === 'partial'
            ? f.paid_amount || 0
            : 0,
    }))
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!form.car_id) {
      setError(t.selectCar)
      return
    }
    if (!form.customer_id) {
      setError(t.selectCustomer)
      return
    }

    if (form.payment_status === 'partial') {
      if (form.paid_amount <= 0 || form.paid_amount >= billedTotal) {
        setError(t.invalidPartialAmount)
        return
      }
    }

    setSaving(true)

    const payload = {
      car_id: Number(form.car_id),
      customer_id: Number(form.customer_id),
      chauffeur_id: form.chauffeur_id ? Number(form.chauffeur_id) : null,
      pickup_date: new Date(form.pickup_date).toISOString(),
      return_date: new Date(form.return_date).toISOString(),
      delivery_location: form.delivery_location,
      message: form.message,
      daily_rate: form.daily_rate,
      deposit_amount: form.deposit_amount,
      deposit_status: form.deposit_status,
      status: form.status,
    }

    try {
      let savedId = reservationId

      if (isEdit && reservationId) {
        const updated = await window.api.updateReservation(reservationId, payload)
        if (!updated?.id) throw new Error('RESERVATION_UPDATE_FAILED')
        savedId = updated.id
      } else {
        const created = await window.api.createReservation(payload)
        if (!created?.id) throw new Error('RESERVATION_CREATE_FAILED')
        savedId = created.id
      }

      if (savedId) {
        await window.api.applyReservationPaymentStatus(savedId, {
          payment_status: form.payment_status,
          paid_amount: form.payment_status === 'partial' ? form.paid_amount : undefined,
        })
      }

      navigate(`/reservations/${savedId}`)
    } catch (err) {
      setError(mapReservationSaveError(err, t))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="empty">{t.loading}</div>

  return (
    <div>
      <PageHeader title={isEdit ? t.editReservation : t.newReservation} subtitle={t.reservationsSubtitle}>
        <button className="btn secondary" onClick={() => navigate('/reservations')}>
          {t.back}
        </button>
      </PageHeader>

      <form className="car-form panel panel-body" onSubmit={onSubmit}>
        <div className="form-grid">
          <div className="field">
            <label>{t.customer}</label>
            <select
              className="select"
              required
              value={form.customer_id}
              onChange={(e) => setForm((f) => ({ ...f, customer_id: Number(e.target.value) }))}
            >
              <option value="">{t.selectCustomer}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t.chauffeur}</label>
            <select
              className="select"
              value={form.chauffeur_id}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  chauffeur_id: e.target.value ? Number(e.target.value) : '',
                }))
              }
            >
              <option value="">{t.noChauffeur}</option>
              {chauffeurs.map((chauffeur) => (
                <option key={chauffeur.id} value={chauffeur.id}>
                  {chauffeur.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t.car}</label>
            <CarSearchSelect
              cars={cars}
              value={form.car_id}
              selectedCarId={form.car_id}
              onChange={(carId) => onCarChange(carId)}
            />
          </div>
          <div className="field">
            <label>{t.pickupDate}</label>
            <input
              className="input"
              type="datetime-local"
              required
              value={form.pickup_date}
              onChange={(e) => setForm((f) => ({ ...f, pickup_date: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>{t.returnDateTime}</label>
            <input
              className="input"
              type="datetime-local"
              required
              value={form.return_date}
              onChange={(e) => setForm((f) => ({ ...f, return_date: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>{t.dailyPrice}</label>
            <input
              className="input"
              type="number"
              min={0}
              required
              value={form.daily_rate}
              onChange={(e) => setForm((f) => ({ ...f, daily_rate: Number(e.target.value) }))}
            />
          </div>
          <div className="field">
            <label>{t.deposit}</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.deposit_amount}
              onChange={(e) => setForm((f) => ({ ...f, deposit_amount: Number(e.target.value) }))}
            />
          </div>
          <div className="field">
            <label>{t.status}</label>
            <select
              className="select"
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ReservationStatus }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t.paymentStatus}</label>
            <select
              className="select"
              value={form.payment_status}
              onChange={(e) => onPaymentStatusChange(e.target.value as PaymentStatus)}
            >
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t[s]}
                </option>
              ))}
            </select>
          </div>
          {form.payment_status === 'partial' && (
            <div className="field">
              <label>{t.amountPaid}</label>
              <input
                className="input"
                type="number"
                min={0.01}
                step="0.01"
                max={Math.max(billedTotal - 0.01, 0.01)}
                required
                value={form.paid_amount || ''}
                onChange={(e) => setForm((f) => ({ ...f, paid_amount: Number(e.target.value) }))}
              />
              <span className="muted-text">
                {t.remaining}: {money(Math.max(0, billedTotal - (form.paid_amount || 0)))}
              </span>
            </div>
          )}
          {form.payment_status === 'paid' && (
            <div className="field">
              <label>{t.amountPaid}</label>
              <input className="input" value={money(billedTotal)} readOnly />
            </div>
          )}
          <div className="field full">
            <label>{t.deliveryLocation}</label>
            <OptionSelect
              value={form.delivery_location}
              onChange={(delivery_location) => setForm((f) => ({ ...f, delivery_location }))}
              placeholder={t.selectOption}
              options={deliveryLocationOptions(t)}
            />
          </div>
          <div className="field full">
            <label>{t.message}</label>
            <textarea
              className="textarea"
              value={form.message}
              onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            />
          </div>
          <div className="field full reservation-summary">
            <strong>{t.days}:</strong> {preview.days} · <strong>{t.total}:</strong> {money(preview.total)}
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="form-actions form-actions--sticky">
          <button type="button" className="btn secondary" onClick={() => navigate('/reservations')}>
            {t.cancel}
          </button>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? t.loading : t.save}
          </button>
        </div>
      </form>
    </div>
  )
}
