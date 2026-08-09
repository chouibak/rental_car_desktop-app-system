import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IconTrash } from '../components/icons'
import { ContractDamagesView } from '../components/ContractDamagesView'
import { CarStatusBadge, EmptyState, PageHeader, PaymentBadge, StatCard, StatusBadge } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Car, Contract } from '../types'
import { FUEL_FRACTION, formatContractDatetime, parseDamages, parseEquipment } from '../utils/contracts'

function display(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string' && !value.trim()) return '—'
  return String(value)
}

function contractPaymentStatus(paid: number, total: number) {
  if (total <= 0 || paid >= total) return 'paid'
  if (paid > 0) return 'partial'
  return 'unpaid'
}

function fuelLabel(level?: string) {
  if (!level) return '—'
  return FUEL_FRACTION[level as keyof typeof FUEL_FRACTION] ?? level
}

export default function ContractDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, money } = useLang()
  const [contract, setContract] = useState<Contract | null>(null)
  const [car, setCar] = useState<Car | null>(null)
  const [carThumbUrl, setCarThumbUrl] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)
  const [payForm, setPayForm] = useState({
    amount: 0,
    method: 'cash',
    paid_at: new Date().toISOString().slice(0, 10),
    note: '',
  })
  const [returnForm, setReturnForm] = useState({
    returned_at: new Date().toISOString().slice(0, 10),
    mileage: 0,
    fuel_level: '',
    damages: '',
    extra_fees: 0,
    notes: '',
  })

  const load = async () => {
    if (!id) return
    const data = await window.api.getContract(Number(id))
    setContract(data)

    if (data?.car_id) {
      const carData = await window.api.getCar(data.car_id)
      setCar(carData)
      if (carData?.thumbnail) {
        setCarThumbUrl(await window.api.getCarFileUrl(carData.thumbnail))
      } else {
        setCarThumbUrl('')
      }
    } else {
      setCar(null)
      setCarThumbUrl('')
    }
  }

  useEffect(() => {
    load()
  }, [id])

  const summary = useMemo(() => {
    if (!contract) return null
    const total = contract.total_amount || 0
    const paid = contract.paid_amount || 0
    const remaining = Math.max(0, total - paid)
    const dailyRate = contract.daily_rate ?? contract.daily_price ?? 0
    const days = contract.billed_days ?? contract.total_days ?? 0
    const deposit = contract.deposit_amount ?? contract.deposit ?? 0
    const brand = contract.vehicle_brand || contract.brand || ''
    const model = contract.vehicle_model || contract.model || ''
    const plate = contract.vehicle_plate || contract.plate_number || ''
    const departure = contract.departure_at || contract.start_date
    const returnAt = contract.return_at || contract.end_date
    const paymentStatus = contractPaymentStatus(paid, total)
    const progress = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0

    return {
      total,
      paid,
      remaining,
      dailyRate,
      days,
      deposit,
      brand,
      model,
      plate,
      departure,
      returnAt,
      paymentStatus,
      progress,
    }
  }, [contract])

  const departureDamages = useMemo(
    () => (contract ? parseDamages(contract.departure_damages) : []),
    [contract],
  )
  const returnDamages = useMemo(() => (contract ? parseDamages(contract.return_damages) : []), [contract])
  const equipment = useMemo(() => (contract ? parseEquipment(contract.equipment) : []), [contract])
  const carStatus = car?.computed_status || car?.status || ''

  if (!contract || !summary) return <div className="empty">{t.loading}</div>

  const payments = contract.payments || []
  const canManage = contract.status === 'active' || contract.status === 'draft'

  const addPayment = async (e: FormEvent) => {
    e.preventDefault()
    await window.api.createPayment({ contract_id: contract.id, ...payForm })
    setPayOpen(false)
    setPayForm({
      amount: 0,
      method: 'cash',
      paid_at: new Date().toISOString().slice(0, 10),
      note: '',
    })
    await load()
  }

  const doReturn = async (e: FormEvent) => {
    e.preventDefault()
    await window.api.returnContract(contract.id, returnForm)
    setReturnOpen(false)
    await load()
  }

  const cancelContract = async () => {
    if (!confirm(t.confirmDelete)) return
    await window.api.cancelContract(contract.id)
    await load()
  }

  const deleteContract = async () => {
    const message = t.confirmDeleteContract.replace('{number}', contract.contract_number)
    if (!confirm(message)) return
    try {
      await window.api.deleteContract(contract.id)
      navigate('/contracts')
    } catch {
      alert(t.cannotDeleteContract)
    }
  }

  const openPdf = async () => {
    try {
      await window.api.generateContractPdf(contract.id)
    } catch (err) {
      alert(String(err))
    }
  }

  const toggleDamagePhotosInPdf = async (checked: boolean) => {
    const updated = await window.api.updateContract(contract.id, {
      include_damage_photos_in_pdf: checked ? 1 : 0,
    })
    if (updated) setContract(updated)
  }

  return (
    <div className="contract-detail-page">
      <PageHeader
        title={contract.contract_number}
        subtitle={[contract.client_name, `${summary.brand} ${summary.model}`.trim(), summary.plate].filter(Boolean).join(' · ')}
      >
        <Link className="btn secondary" to="/contracts">
          {t.back}
        </Link>
        <Link className="btn" to={`/contracts/${contract.id}/edit`}>
          {t.editContract}
        </Link>
        <label className="checkbox-row contract-pdf-toggle">
          <input
            type="checkbox"
            checked={contract.include_damage_photos_in_pdf !== 0}
            onChange={(e) => toggleDamagePhotosInPdf(e.target.checked)}
          />
          {t.includeDamagePhotos}
        </label>
        <button type="button" className="btn secondary" onClick={openPdf}>
          {t.downloadPdf}
        </button>
        {canManage && (
          <>
            <button type="button" className="btn secondary" onClick={() => setPayOpen(true)}>
              {t.addPayment}
            </button>
            {contract.status === 'active' && (
              <>
                <button type="button" className="btn secondary" onClick={() => setReturnOpen(true)}>
                  {t.returnCar}
                </button>
                <button type="button" className="btn danger" onClick={cancelContract}>
                  {t.cancelled}
                </button>
              </>
            )}
          </>
        )}
        <button type="button" className="btn danger" onClick={deleteContract}>
          <IconTrash size={15} />
          {t.delete}
        </button>
      </PageHeader>

      <div className="cards cards--4 contract-detail-stats">
        <StatCard label={t.total} value={money(summary.total)} tone="info" />
        <StatCard label={t.paid} value={money(summary.paid)} tone="success" />
        <StatCard
          label={t.remaining}
          value={money(summary.remaining)}
          tone={summary.remaining > 0 ? 'warn' : 'success'}
        />
        <StatCard label={t.days} value={summary.days} hint={`${money(summary.dailyRate)} / ${t.days.toLowerCase()}`} />
      </div>

      <div className="detail-grid contract-detail-grid">
        <div className="contract-detail-main">
          <div className="panel">
            <div className="panel-header">
              <h3>{t.contractOverview}</h3>
              <div className="row-actions">
                <StatusBadge status={contract.status === 'completed' ? 'closed' : contract.status} />
                <PaymentBadge status={summary.paymentStatus} />
              </div>
            </div>
            <div className="panel-body">
              <div className="info-grid">
                <div className="info-item">
                  <span>{t.contractNumber}</span>
                  <strong>{contract.contract_number}</strong>
                </div>
                <div className="info-item">
                  <span>{t.contractDate}</span>
                  <strong>{display(contract.contract_date || contract.start_date)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.contractCity}</span>
                  <strong>{display(contract.contract_city)}</strong>
                </div>
                {contract.reservation_id ? (
                  <div className="info-item">
                    <span>{t.reservationLinked}</span>
                    <strong>
                      {contract.reservation_reference ? (
                        <Link className="link-btn" to={`/reservations/${contract.reservation_id}`}>
                          {contract.reservation_reference}
                        </Link>
                      ) : (
                        <Link className="link-btn" to={`/reservations/${contract.reservation_id}`}>
                          #{contract.reservation_id}
                        </Link>
                      )}
                    </strong>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>{t.clientAndDriver}</h3>
            </div>
            <div className="panel-body">
              <div className="info-grid">
                <div className="info-item">
                  <span>{t.client}</span>
                  <strong>
                    <Link className="link-btn" to={`/customers/${contract.client_id}`}>
                      {contract.client_name}
                    </Link>
                  </strong>
                  {contract.client_phone ? <div className="muted-text">{contract.client_phone}</div> : null}
                </div>
                <div className="info-item">
                  <span>{t.driver1}</span>
                  <strong>{display(contract.driver1_name || contract.client_name)}</strong>
                  {contract.driver1_phone ? <div className="muted-text">{contract.driver1_phone}</div> : null}
                </div>
                <div className="info-item">
                  <span>{t.phone}</span>
                  <strong>{display(contract.driver1_phone || contract.client_phone)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.cin}</span>
                  <strong>{display(contract.driver1_cin_number)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.license}</span>
                  <strong>{display(contract.driver1_license_number)}</strong>
                </div>
                {contract.driver2_name ? (
                  <>
                    <div className="info-item">
                      <span>{t.driver2}</span>
                      <strong>{contract.driver2_name}</strong>
                      {contract.driver2_phone ? <div className="muted-text">{contract.driver2_phone}</div> : null}
                    </div>
                    <div className="info-item">
                      <span>{t.cin}</span>
                      <strong>{display(contract.driver2_cin_number)}</strong>
                    </div>
                    <div className="info-item">
                      <span>{t.license}</span>
                      <strong>{display(contract.driver2_license_number)}</strong>
                    </div>
                    {contract.driver2_address ? (
                      <div className="info-item">
                        <span>{t.address}</span>
                        <strong>{display(contract.driver2_address)}</strong>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {contract.driver1_address ? (
                  <div className="info-item">
                    <span>{t.address}</span>
                    <strong>{display(contract.driver1_address)}</strong>
                  </div>
                ) : null}
                {contract.driver1_nationality ? (
                  <div className="info-item">
                    <span>{t.nationality}</span>
                    <strong>{display(contract.driver1_nationality)}</strong>
                  </div>
                ) : null}
                {contract.driver1_birth_date ? (
                  <div className="info-item">
                    <span>{t.birthDate}</span>
                    <strong>{display(contract.driver1_birth_date)}</strong>
                  </div>
                ) : null}
                {contract.driver1_passport_number ? (
                  <div className="info-item">
                    <span>{t.passport}</span>
                    <strong>{display(contract.driver1_passport_number)}</strong>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-header">
              <h3>{t.vehicleAndDates}</h3>
              {carStatus ? <CarStatusBadge status={carStatus} /> : null}
            </div>
            <div className="panel-body">
              <div className="contract-car-overview">
                {carThumbUrl ? (
                  <img className="contract-car-thumb" src={carThumbUrl} alt="" />
                ) : null}
                <div className="info-grid contract-car-info">
                <div className="info-item">
                  <span>{t.car}</span>
                  <strong>
                    <Link className="link-btn" to={`/cars/${contract.car_id}`}>
                      {summary.brand} {summary.model}
                    </Link>
                  </strong>
                  <div className="muted-text">{summary.plate || '—'}</div>
                </div>
                {carStatus ? (
                  <div className="info-item">
                    <span>{t.carCurrentStatus}</span>
                    <strong>
                      <CarStatusBadge status={carStatus} />
                    </strong>
                  </div>
                ) : null}
                {car?.category ? (
                  <div className="info-item">
                    <span>{t.category}</span>
                    <strong>{t[car.category as keyof typeof t] || car.category}</strong>
                  </div>
                ) : null}
                {car?.year ? (
                  <div className="info-item">
                    <span>{t.year}</span>
                    <strong>{car.year}</strong>
                  </div>
                ) : null}
                {car?.color ? (
                  <div className="info-item">
                    <span>{t.color}</span>
                    <strong>{car.color}</strong>
                  </div>
                ) : null}
                <div className="info-item">
                  <span>{t.departureAt}</span>
                  <strong>{formatContractDatetime(summary.departure)}</strong>
                  {contract.departure_place ? <div className="muted-text">{contract.departure_place}</div> : null}
                </div>
                <div className="info-item">
                  <span>{t.returnAt}</span>
                  <strong className={contract.is_overdue ? 'text-danger' : ''}>
                    {formatContractDatetime(summary.returnAt)}
                  </strong>
                  {contract.return_place ? <div className="muted-text">{contract.return_place}</div> : null}
                </div>
                <div className="info-item">
                  <span>{t.departureMileage}</span>
                  <strong>{display(contract.departure_mileage)} km</strong>
                </div>
                <div className="info-item">
                  <span>{t.fuelLevel}</span>
                  <strong>{fuelLabel(contract.departure_fuel_level)}</strong>
                  <div className="muted-text">{t.departureState}</div>
                </div>
                {contract.return_mileage ? (
                  <div className="info-item">
                    <span>{t.returnMileage}</span>
                    <strong>{display(contract.return_mileage)} km</strong>
                  </div>
                ) : null}
                {contract.return_fuel_level ? (
                  <div className="info-item">
                    <span>{t.fuelLevel}</span>
                    <strong>{fuelLabel(contract.return_fuel_level)}</strong>
                    <div className="muted-text">{t.returnState}</div>
                  </div>
                ) : null}
                {contract.extension_until || contract.extension_days ? (
                  <>
                    <div className="info-item">
                      <span>{t.extensionUntil}</span>
                      <strong>{display(contract.extension_until)}</strong>
                    </div>
                    <div className="info-item">
                      <span>{t.extensionDaysLabel}</span>
                      <strong>{display(contract.extension_days)}</strong>
                    </div>
                  </>
                ) : null}
                {car?.mileage != null && car.mileage !== contract.departure_mileage ? (
                  <div className="info-item">
                    <span>{t.mileage}</span>
                    <strong>{car.mileage} km</strong>
                    <div className="muted-text">{t.carSnapshot}</div>
                  </div>
                ) : null}
                </div>
              </div>
            </div>
          </div>

          {equipment.length > 0 || contract.equipment_other?.trim() ? (
            <div className="panel">
              <div className="panel-header">
                <h3>{t.equipmentIncluded}</h3>
              </div>
              <div className="panel-body">
                {equipment.length > 0 ? (
                  <div className="equipment-tags">
                    {equipment.map((item) => (
                      <span className="equipment-tag" key={item}>
                        {t[`equip_${item}` as keyof typeof t] || item}
                      </span>
                    ))}
                  </div>
                ) : null}
                {contract.equipment_other?.trim() ? (
                  <p className="muted-text equipment-other">{contract.equipment_other}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-header">
              <h3>{t.departureState}</h3>
            </div>
            <div className="panel-body">
              {contract.departure_notes?.trim() ? (
                <p className="contract-state-notes">{contract.departure_notes}</p>
              ) : null}
              <ContractDamagesView damages={departureDamages} t={t} />
            </div>
          </div>

          {returnDamages.length > 0 ||
          contract.return_notes?.trim() ||
          contract.return_fuel_level ||
          contract.return_mileage ? (
            <div className="panel">
              <div className="panel-header">
                <h3>{t.returnState}</h3>
              </div>
              <div className="panel-body">
                {contract.return_notes?.trim() ? (
                  <p className="contract-state-notes">{contract.return_notes}</p>
                ) : null}
                <ContractDamagesView damages={returnDamages} t={t} />
              </div>
            </div>
          ) : null}

          <div className="panel">
            <div className="panel-header">
              <h3>{t.financialSummary}</h3>
            </div>
            <div className="panel-body">
              <div className="info-grid">
                <div className="info-item">
                  <span>{t.dailyPrice}</span>
                  <strong>{money(summary.dailyRate)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.days}</span>
                  <strong>{summary.days}</strong>
                </div>
                <div className="info-item">
                  <span>{t.discount}</span>
                  <strong>{money(contract.discount ?? 0)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.deposit}</span>
                  <strong>{money(summary.deposit)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.vatApplies}</span>
                  <strong>{contract.vat_applies !== 0 ? t.yes : t.no}</strong>
                </div>
                <div className="info-item">
                  <span>{t.vatRate}</span>
                  <strong>{display(contract.vat_rate)}%</strong>
                </div>
                <div className="info-item">
                  <span>{t.franchise}</span>
                  <strong>
                    {contract.franchise_applies !== 0 && (contract.franchise_amount ?? 0) > 0
                      ? money(contract.franchise_amount ?? 0)
                      : t.no}
                  </strong>
                </div>
                <div className="info-item">
                  <span>{t.extraCharges}</span>
                  <strong>{money(contract.extra_charges ?? 0)}</strong>
                  {contract.extra_charges_note?.trim() ? (
                    <div className="muted-text">{contract.extra_charges_note}</div>
                  ) : null}
                </div>
                <div className="info-item info-item--highlight">
                  <span>{t.total}</span>
                  <strong>{money(summary.total)}</strong>
                </div>
              </div>
            </div>
          </div>

          {contract.notes?.trim() ? (
            <div className="panel">
              <div className="panel-header">
                <h3>{t.notes}</h3>
              </div>
              <div className="panel-body detail-notes">
                <p>{contract.notes}</p>
              </div>
            </div>
          ) : null}

          {contract.returnInfo ? (
            <div className="panel">
              <div className="panel-header">
                <h3>{t.returnCar}</h3>
              </div>
              <div className="panel-body">
                <div className="info-grid">
                  <div className="info-item">
                    <span>{t.returnDate}</span>
                    <strong>{display(contract.returnInfo.returned_at)}</strong>
                  </div>
                  <div className="info-item">
                    <span>{t.mileage}</span>
                    <strong>{display(contract.returnInfo.mileage)} km</strong>
                  </div>
                  <div className="info-item">
                    <span>{t.extraFees}</span>
                    <strong>{money(contract.returnInfo.extra_fees)}</strong>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="contract-detail-side">
          <div className="panel contract-payments-panel">
            <div className="panel-header">
              <h3>{t.payments}</h3>
              {canManage ? (
                <button type="button" className="btn sm" onClick={() => setPayOpen(true)}>
                  {t.addPayment}
                </button>
              ) : null}
            </div>

            <div className="panel-body contract-payment-summary">
              {(contract.reservation_contract_count ?? 0) > 1 ? (
                <div className="alert alert-warn contract-duplicate-reservation">
                  {t.duplicateReservationWarning}
                </div>
              ) : null}
              <div className="contract-payment-progress">
                <div className="contract-payment-progress-head">
                  <span>{t.paymentProgress}</span>
                  <strong>{summary.progress}%</strong>
                </div>
                <div className="contract-payment-progress-bar">
                  <div className="contract-payment-progress-fill" style={{ width: `${summary.progress}%` }} />
                </div>
              </div>
              <div className="info-grid payment-summary-inline">
                <div className="info-item">
                  <span>{t.paid}</span>
                  <strong>{money(summary.paid)}</strong>
                </div>
                <div className="info-item">
                  <span>{t.remaining}</span>
                  <strong className={summary.remaining > 0 ? 'text-danger' : ''}>{money(summary.remaining)}</strong>
                </div>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.amount}</th>
                    <th>{t.method}</th>
                    <th>{t.paidAt}</th>
                    <th>{t.source}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <EmptyState message={t.noData} />
                      </td>
                    </tr>
                  ) : (
                    payments.map((payment) => (
                      <tr key={payment.id}>
                        <td>
                          <strong>{money(payment.amount)}</strong>
                        </td>
                        <td>{t[payment.method as 'cash' | 'card' | 'transfer' | 'bank_transfer'] || payment.method}</td>
                        <td>{display(payment.paid_at)}</td>
                        <td>
                          {payment.source === 'reservation' ? (
                            contract.reservation_id ? (
                              <Link className="link-btn muted-text" to={`/reservations/${contract.reservation_id}`}>
                                {t.paymentFromReservation}
                              </Link>
                            ) : (
                              t.paymentFromReservation
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </aside>
      </div>

      {payOpen && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={addPayment}>
            <header>
              <strong>{t.addPayment}</strong>
            </header>
            <div className="panel-body form-grid">
              <div className="field">
                <label>{t.amount}</label>
                <input
                  className="input"
                  type="number"
                  required
                  min={0}
                  step={0.01}
                  value={payForm.amount || ''}
                  onChange={(e) => setPayForm({ ...payForm, amount: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>{t.method}</label>
                <select className="select" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                  <option value="cash">{t.cash}</option>
                  <option value="card">{t.card}</option>
                  <option value="transfer">{t.transfer}</option>
                </select>
              </div>
              <div className="field">
                <label>{t.paidAt}</label>
                <input
                  className="input"
                  type="date"
                  value={payForm.paid_at}
                  onChange={(e) => setPayForm({ ...payForm, paid_at: e.target.value })}
                />
              </div>
              <div className="field full">
                <label>{t.notes}</label>
                <textarea className="textarea" value={payForm.note} onChange={(e) => setPayForm({ ...payForm, note: e.target.value })} />
              </div>
            </div>
            <footer>
              <button type="button" className="btn secondary" onClick={() => setPayOpen(false)}>
                {t.cancel}
              </button>
              <button className="btn" type="submit">
                {t.save}
              </button>
            </footer>
          </form>
        </div>
      )}

      {returnOpen && (
        <div className="modal-backdrop">
          <form className="modal" onSubmit={doReturn}>
            <header>
              <strong>{t.confirmReturn}</strong>
            </header>
            <div className="panel-body form-grid">
              <div className="field">
                <label>{t.returnDate}</label>
                <input
                  className="input"
                  type="date"
                  value={returnForm.returned_at}
                  onChange={(e) => setReturnForm({ ...returnForm, returned_at: e.target.value })}
                />
              </div>
              <div className="field">
                <label>{t.mileage}</label>
                <input
                  className="input"
                  type="number"
                  value={returnForm.mileage}
                  onChange={(e) => setReturnForm({ ...returnForm, mileage: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label>{t.fuelLevel}</label>
                <input
                  className="input"
                  value={returnForm.fuel_level}
                  onChange={(e) => setReturnForm({ ...returnForm, fuel_level: e.target.value })}
                />
              </div>
              <div className="field">
                <label>{t.extraFees}</label>
                <input
                  className="input"
                  type="number"
                  value={returnForm.extra_fees}
                  onChange={(e) => setReturnForm({ ...returnForm, extra_fees: Number(e.target.value) })}
                />
              </div>
              <div className="field full">
                <label>{t.damages}</label>
                <textarea
                  className="textarea"
                  value={returnForm.damages}
                  onChange={(e) => setReturnForm({ ...returnForm, damages: e.target.value })}
                />
              </div>
            </div>
            <footer>
              <button type="button" className="btn secondary" onClick={() => setReturnOpen(false)}>
                {t.cancel}
              </button>
              <button className="btn" type="submit">
                {t.confirmReturn}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  )
}
