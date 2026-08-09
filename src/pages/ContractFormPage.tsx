import { FormEvent, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ContractVehicleStateSection, DriverFields } from '../components/ContractFormSections'
import { IconChevronDown } from '../components/icons'
import { PageHeader } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Car, Contract, Customer, Chauffeur, Reservation } from '../types'
import {
  CONTRACT_STATUSES,
  EQUIPMENT_KEYS,
  calcBilledDays,
  calcContractTotal,
  chauffeurToDriver1Fields,
  chauffeurToDriver2Fields,
  customerToDriver1Fields,
  customerToDriver2Fields,
  parseDamages,
  parseEquipment,
  toLocalDatetimeValue,
  type ContractDamage,
} from '../utils/contracts'

function ContractSection({ title, subtitle, children, grid = 'form-grid' }: { title: string; subtitle?: string; children: ReactNode; grid?: string }) {
  return (
    <details className="contract-section panel" open>
      <summary className="contract-section-title">
        <div className="contract-section-heading">
          <div>
            <strong>{title}</strong>
            {subtitle && <p className="contract-section-subtitle">{subtitle}</p>}
          </div>
          <IconChevronDown size={18} className="contract-section-chevron" />
        </div>
      </summary>
      <div className={`panel-body ${grid}`}>{children}</div>
    </details>
  )
}

function InputWithSuffix({
  suffix,
  value,
  onChange,
  type = 'text',
  min,
}: {
  suffix: string
  value: string | number
  onChange: (value: number) => void
  type?: string
  min?: number
}) {
  return (
    <div className="input-suffix-wrap">
      <input
        className="input input-with-suffix"
        type={type}
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="input-suffix">{suffix}</span>
    </div>
  )
}

const today = () => new Date().toISOString().slice(0, 10)

type FormState = {
  reservation_id: number | ''
  client_id: number | ''
  car_id: number | ''
  status: string
  contract_date: string
  contract_city: string
  driver1_name: string
  driver1_birth_date: string
  driver1_birth_place: string
  driver1_nationality: string
  driver1_address: string
  driver1_phone: string
  driver1_passport_number: string
  driver1_passport_issued_at: string
  driver1_passport_expires_at: string
  driver1_cin_number: string
  driver1_cin_issued_at: string
  driver1_cin_expires_at: string
  driver1_license_number: string
  driver1_license_issued_at: string
  driver1_license_expires_at: string
  driver2_name: string
  driver2_birth_date: string
  driver2_birth_place: string
  driver2_nationality: string
  driver2_address: string
  driver2_phone: string
  driver2_passport_number: string
  driver2_passport_issued_at: string
  driver2_passport_expires_at: string
  driver2_cin_number: string
  driver2_cin_issued_at: string
  driver2_cin_expires_at: string
  driver2_license_number: string
  driver2_license_issued_at: string
  driver2_license_expires_at: string
  vehicle_brand: string
  vehicle_model: string
  vehicle_plate: string
  departure_at: string
  departure_place: string
  departure_mileage: number
  departure_fuel_level: string
  return_at: string
  return_place: string
  return_mileage: number
  return_fuel_level: string
  billed_days: number
  extension_until: string
  extension_days: number
  departure_notes: string
  return_notes: string
  equipment: string[]
  equipment_other: string
  departure_damages: ContractDamage[]
  return_damages: ContractDamage[]
  include_damage_photos_in_pdf: boolean
  daily_rate: number
  discount: number
  deposit_amount: number
  franchise_applies: boolean
  franchise_amount: number
  extra_charges: number
  extra_charges_note: string
  vat_applies: boolean
  vat_rate: number
  total_amount: number
  notes: string
  customer_signed_at: string
  agency_signed_at: string
}

function emptyForm(): FormState {
  return {
    reservation_id: '',
    client_id: '',
    car_id: '',
    status: 'draft',
    contract_date: today(),
    contract_city: '',
    driver1_name: '',
    driver1_birth_date: '',
    driver1_birth_place: '',
    driver1_nationality: '',
    driver1_address: '',
    driver1_phone: '',
    driver1_passport_number: '',
    driver1_passport_issued_at: '',
    driver1_passport_expires_at: '',
    driver1_cin_number: '',
    driver1_cin_issued_at: '',
    driver1_cin_expires_at: '',
    driver1_license_number: '',
    driver1_license_issued_at: '',
    driver1_license_expires_at: '',
    driver2_name: '',
    driver2_birth_date: '',
    driver2_birth_place: '',
    driver2_nationality: '',
    driver2_address: '',
    driver2_phone: '',
    driver2_passport_number: '',
    driver2_passport_issued_at: '',
    driver2_passport_expires_at: '',
    driver2_cin_number: '',
    driver2_cin_issued_at: '',
    driver2_cin_expires_at: '',
    driver2_license_number: '',
    driver2_license_issued_at: '',
    driver2_license_expires_at: '',
    vehicle_brand: '',
    vehicle_model: '',
    vehicle_plate: '',
    departure_at: '',
    departure_place: '',
    departure_mileage: 0,
    departure_fuel_level: 'plein',
    return_at: '',
    return_place: '',
    return_mileage: 0,
    return_fuel_level: '',
    billed_days: 1,
    extension_until: '',
    extension_days: 0,
    departure_notes: '',
    return_notes: '',
    equipment: ['radio', 'spare_wheel', 'jack', 'documents', 'vest', 'extinguisher', 'warning_triangle'],
    equipment_other: '',
    departure_damages: [],
    return_damages: [],
    include_damage_photos_in_pdf: true,
    daily_rate: 0,
    discount: 0,
    deposit_amount: 0,
    franchise_applies: false,
    franchise_amount: 0,
    extra_charges: 0,
    extra_charges_note: '',
    vat_applies: true,
    vat_rate: 20,
    total_amount: 0,
    notes: '',
    customer_signed_at: '',
    agency_signed_at: '',
  }
}

function contractToForm(contract: Contract): FormState {
  return {
    reservation_id: contract.reservation_id ?? '',
    client_id: contract.client_id,
    car_id: contract.car_id,
    status: contract.status === 'completed' ? 'closed' : contract.status,
    contract_date: contract.contract_date || contract.start_date || today(),
    contract_city: contract.contract_city || '',
    driver1_name: contract.driver1_name || contract.client_name || '',
    driver1_birth_date: contract.driver1_birth_date || '',
    driver1_birth_place: contract.driver1_birth_place || '',
    driver1_nationality: contract.driver1_nationality || '',
    driver1_address: contract.driver1_address || '',
    driver1_phone: contract.driver1_phone || contract.client_phone || '',
    driver1_passport_number: contract.driver1_passport_number || '',
    driver1_passport_issued_at: contract.driver1_passport_issued_at || '',
    driver1_passport_expires_at: contract.driver1_passport_expires_at || '',
    driver1_cin_number: contract.driver1_cin_number || '',
    driver1_cin_issued_at: contract.driver1_cin_issued_at || '',
    driver1_cin_expires_at: contract.driver1_cin_expires_at || '',
    driver1_license_number: contract.driver1_license_number || '',
    driver1_license_issued_at: contract.driver1_license_issued_at || '',
    driver1_license_expires_at: contract.driver1_license_expires_at || '',
    driver2_name: contract.driver2_name || '',
    driver2_birth_date: contract.driver2_birth_date || '',
    driver2_birth_place: contract.driver2_birth_place || '',
    driver2_nationality: contract.driver2_nationality || '',
    driver2_address: contract.driver2_address || '',
    driver2_phone: contract.driver2_phone || '',
    driver2_passport_number: contract.driver2_passport_number || '',
    driver2_passport_issued_at: contract.driver2_passport_issued_at || '',
    driver2_passport_expires_at: contract.driver2_passport_expires_at || '',
    driver2_cin_number: contract.driver2_cin_number || '',
    driver2_cin_issued_at: contract.driver2_cin_issued_at || '',
    driver2_cin_expires_at: contract.driver2_cin_expires_at || '',
    driver2_license_number: contract.driver2_license_number || '',
    driver2_license_issued_at: contract.driver2_license_issued_at || '',
    driver2_license_expires_at: contract.driver2_license_expires_at || '',
    vehicle_brand: contract.vehicle_brand || contract.brand || '',
    vehicle_model: contract.vehicle_model || contract.model || '',
    vehicle_plate: contract.vehicle_plate || contract.plate_number || '',
    departure_at: toLocalDatetimeValue(contract.departure_at || contract.start_date),
    departure_place: contract.departure_place || '',
    departure_mileage: contract.departure_mileage ?? 0,
    departure_fuel_level: contract.departure_fuel_level || 'plein',
    return_at: toLocalDatetimeValue(contract.return_at || contract.end_date),
    return_place: contract.return_place || '',
    return_mileage: contract.return_mileage ?? 0,
    return_fuel_level: contract.return_fuel_level || '',
    billed_days: contract.billed_days ?? contract.total_days ?? 1,
    extension_until: contract.extension_until || '',
    extension_days: contract.extension_days ?? 0,
    departure_notes: contract.departure_notes || '',
    return_notes: contract.return_notes || '',
    equipment: parseEquipment(contract.equipment),
    equipment_other: contract.equipment_other || '',
    departure_damages: parseDamages(contract.departure_damages),
    return_damages: parseDamages(contract.return_damages),
    include_damage_photos_in_pdf: contract.include_damage_photos_in_pdf !== 0,
    daily_rate: contract.daily_rate ?? contract.daily_price ?? 0,
    discount: contract.discount ?? 0,
    deposit_amount: contract.deposit_amount ?? contract.deposit ?? 0,
    franchise_applies: Boolean(contract.franchise_applies) || (contract.franchise_amount ?? 0) > 0,
    franchise_amount: contract.franchise_amount ?? 0,
    extra_charges: contract.extra_charges ?? 0,
    extra_charges_note: contract.extra_charges_note || '',
    vat_applies: contract.vat_applies !== 0,
    vat_rate: contract.vat_rate ?? 20,
    total_amount: contract.total_amount ?? 0,
    notes: contract.notes || '',
    customer_signed_at: contract.customer_signed_at || '',
    agency_signed_at: contract.agency_signed_at || '',
  }
}

export default function ContractFormPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t, money } = useLang()
  const isEdit = Boolean(id)
  const [contractNumber, setContractNumber] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm())
  const [customers, setCustomers] = useState<Customer[]>([])
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([])
  const [cars, setCars] = useState<Car[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [pinnedReservation, setPinnedReservation] = useState<Reservation | null>(null)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      window.api.listCustomers(),
      window.api.listChauffeurs({ activeOnly: true }),
      window.api.listCars(),
      window.api.listReservations(),
      window.api.listContracts(),
    ]).then(([customerRows, chauffeurRows, carRows, reservationRows, contractRows]) => {
      setCustomers(customerRows)
      setChauffeurs(chauffeurRows)
      setCars(carRows)

      const editingContract = isEdit ? contractRows.find((contract) => contract.id === Number(id)) : null
      const editingReservationId = editingContract?.reservation_id ?? null
      const usedReservationIds = new Set(
        contractRows
          .filter((contract) => contract.reservation_id && contract.reservation_id !== editingReservationId)
          .map((contract) => contract.reservation_id) as number[],
      )

      setReservations(
        reservationRows.filter(
          (reservation) =>
            (reservation.status === 'pending' || reservation.status === 'confirmed') &&
            !usedReservationIds.has(reservation.id),
        ),
      )
    })
  }, [id, isEdit])

  const reservationOptions = useMemo(() => {
    const byId = new Map<number, Reservation>()
    for (const row of reservations) byId.set(row.id, row)
    if (pinnedReservation) byId.set(pinnedReservation.id, pinnedReservation)
    return Array.from(byId.values())
  }, [reservations, pinnedReservation])

  const reservationLinked = Boolean(form.reservation_id)

  const applyReservation = async (reservationId: number) => {
    const reservation = await window.api.getReservation(reservationId)
    if (!reservation) return

    setPinnedReservation(reservation)

    const car = cars.find((row) => row.id === reservation.car_id)
    const customer = customers.find((row) => row.id === reservation.customer_id)

    const basePatch = {
      reservation_id: reservationId,
      client_id: reservation.customer_id,
      car_id: reservation.car_id,
      departure_at: toLocalDatetimeValue(reservation.pickup_date),
      return_at: toLocalDatetimeValue(reservation.return_date),
      billed_days: reservation.days,
      daily_rate: reservation.daily_rate,
      deposit_amount: reservation.deposit_amount,
      total_amount: reservation.total_amount,
      vehicle_brand: car?.brand || '',
      vehicle_model: car?.model || '',
      vehicle_plate: car?.plate_number || '',
      departure_mileage: car?.mileage ?? 0,
      departure_fuel_level: car?.fuel_level || 'plein',
      departure_notes: car?.condition_notes || '',
    }

    if (reservation.chauffeur_id) {
      let chauffeur = chauffeurs.find((row) => row.id === reservation.chauffeur_id)
      if (!chauffeur) {
        const loaded = await window.api.getChauffeur(reservation.chauffeur_id)
        if (loaded) {
          chauffeur = loaded
          setChauffeurs((current) =>
            current.some((row) => row.id === loaded.id) ? current : [...current, loaded],
          )
        }
      }
      setForm((current) => ({
        ...current,
        ...basePatch,
        ...(chauffeur
          ? chauffeurToDriver1Fields(chauffeur)
          : customer
            ? customerToDriver1Fields(customer)
            : {}),
      }))
      return
    }

    setForm((current) => ({
      ...current,
      ...basePatch,
      ...(customer ? customerToDriver1Fields(customer) : {}),
    }))
  }

  useEffect(() => {
    if (isEdit) return
    const reservationParam = searchParams.get('reservation')
    if (!reservationParam || customers.length === 0 || cars.length === 0) return
    const reservationId = Number(reservationParam)
    if (!reservationId || form.reservation_id === reservationId) return
    applyReservation(reservationId)
  }, [searchParams, customers, cars, isEdit, form.reservation_id])

  useEffect(() => {
    if (!isEdit || !id) return
    window.api.getContract(Number(id)).then(async (data) => {
      if (!data) {
        navigate('/contracts')
        return
      }
      setContractNumber(data.contract_number)
      setForm(contractToForm(data))
      if (data.reservation_id) {
        const linked = await window.api.getReservation(data.reservation_id)
        if (linked) setPinnedReservation(linked)
      }
      setLoading(false)
    })
  }, [id, isEdit, navigate])

  useEffect(() => {
    window.api.getSettings().then((settings) => {
      const defaultFranchise = Number(settings.default_franchise_amount || 0)
      setForm((current) => ({
        ...current,
        contract_city: current.contract_city || settings.company_address || '',
        franchise_amount: current.franchise_amount || defaultFranchise,
        franchise_applies: current.franchise_applies || defaultFranchise > 0,
      }))
    })
  }, [])

  const previewTotal = useMemo(
    () => calcContractTotal(form.billed_days, form.daily_rate, form.discount, form.extra_charges),
    [form.billed_days, form.daily_rate, form.discount, form.extra_charges],
  )

  const copyFromCustomer = () => {
    const customer = customers.find((row) => row.id === form.client_id)
    if (!customer) return
    setForm((current) => ({
      ...current,
      ...customerToDriver1Fields(customer),
    }))
  }

  const copyFromChauffeur = (chauffeurId: number) => {
    const chauffeur = chauffeurs.find((row) => row.id === chauffeurId)
    if (!chauffeur) return
    setForm((current) => ({
      ...current,
      ...chauffeurToDriver1Fields(chauffeur),
    }))
  }

  const copyDriver2FromCustomer = (customerId: number) => {
    const customer = customers.find((row) => row.id === customerId)
    if (!customer) return
    setForm((current) => ({
      ...current,
      ...customerToDriver2Fields(customer),
    }))
  }

  const copyDriver2FromChauffeur = (chauffeurId: number) => {
    const chauffeur = chauffeurs.find((row) => row.id === chauffeurId)
    if (!chauffeur) return
    setForm((current) => ({
      ...current,
      ...chauffeurToDriver2Fields(chauffeur),
    }))
  }

  const onReservationChange = (value: string) => {
    if (!value) {
      setForm((current) => ({ ...current, reservation_id: '' }))
      return
    }
    applyReservation(Number(value))
  }

  const onCarChange = (carId: number) => {
    const car = cars.find((row) => row.id === carId)
    if (!car) return
    setForm((current) => ({
      ...current,
      car_id: carId,
      vehicle_brand: car.brand,
      vehicle_model: car.model,
      vehicle_plate: car.plate_number,
      departure_mileage: car.mileage,
      departure_fuel_level: car.fuel_level || 'plein',
      departure_notes: car.condition_notes,
      daily_rate: current.daily_rate || car.price_per_day,
    }))
  }

  const recalcDays = (departure: string, returnDate: string) => {
    const billed_days = calcBilledDays(departure, returnDate)
    setForm((current) => ({
      ...current,
      billed_days,
      total_amount: calcContractTotal(billed_days, current.daily_rate, current.discount, current.extra_charges),
    }))
  }

  const buildPayload = () => ({
    ...form,
    reservation_id: form.reservation_id || null,
    client_id: Number(form.client_id),
    car_id: Number(form.car_id),
    equipment: JSON.stringify(form.equipment),
    departure_damages: JSON.stringify(form.departure_damages),
    return_damages: JSON.stringify(form.return_damages),
    include_damage_photos_in_pdf: form.include_damage_photos_in_pdf ? 1 : 0,
    franchise_applies: form.franchise_applies || form.franchise_amount > 0 ? 1 : 0,
    vat_applies: form.vat_applies ? 1 : 0,
    total_amount: previewTotal,
  })

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.driver1_name.trim()) {
      setError(t.driverRequired)
      return
    }
    setSaving(true)
    try {
      if (isEdit && id) {
        await window.api.updateContract(Number(id), buildPayload())
        navigate(`/contracts/${id}`)
      } else {
        const created = await window.api.createContract(buildPayload())
        navigate(`/contracts/${created.id}/edit`)
      }
    } catch (err) {
      const msg = String(err)
      setError(
        msg.includes('DRIVER1_REQUIRED')
          ? t.driverRequired
          : msg.includes('CAR_NOT_AVAILABLE')
            ? t.carNotAvailable
            : msg.includes('CONTRACT_ALREADY_EXISTS')
              ? t.contractAlreadyExists
              : msg.includes('CONTRACT_RESERVATION_CLIENT_MISMATCH') ||
                  msg.includes('CONTRACT_RESERVATION_CAR_MISMATCH')
                ? t.contractReservationMismatch
                : msg,
      )
    } finally {
      setSaving(false)
    }
  }

  const onGeneratePdf = async () => {
    if (!id) return
    setPdfLoading(true)
    setError('')
    try {
      await window.api.generateContractPdf(Number(id))
    } catch (err) {
      setError(String(err))
    } finally {
      setPdfLoading(false)
    }
  }

  const runAction = async (action: () => Promise<unknown>) => {
    try {
      await action()
      if (id) {
        const refreshed = await window.api.getContract(Number(id))
        if (refreshed) setForm(contractToForm(refreshed))
      }
    } catch (err) {
      setError(String(err))
    }
  }

  if (loading) return <div className="empty">{t.loading}</div>

  return (
    <div className="contract-form-page">
      <PageHeader title={isEdit ? `${t.editContract} — ${contractNumber}` : t.newContract} subtitle={t.contractsSubtitle}>
        <button type="button" className="btn secondary" onClick={() => navigate('/contracts')}>
          {t.back}
        </button>
        {isEdit && (
          <button type="button" className="btn secondary" onClick={onGeneratePdf} disabled={pdfLoading}>
            {pdfLoading ? t.loading : t.downloadPdf}
          </button>
        )}
        {isEdit && form.status === 'draft' && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              setSaving(true)
              setError('')
              try {
                await window.api.updateContract(Number(id), buildPayload())
                await window.api.markContractDelivered(Number(id))
                const refreshed = await window.api.getContract(Number(id))
                if (refreshed) setForm(contractToForm(refreshed))
              } catch (err) {
                setError(String(err))
              } finally {
                setSaving(false)
              }
            }}
          >
            {t.markDelivered}
          </button>
        )}
        {isEdit && form.status === 'active' && (
          <button
            type="button"
            className="btn"
            onClick={() =>
              runAction(() =>
                window.api.closeContract(Number(id), {
                  return_at: form.return_at,
                  return_mileage: form.return_mileage,
                  return_fuel_level: form.return_fuel_level,
                  return_notes: form.return_notes,
                }),
              )
            }
          >
            {t.closeContract}
          </button>
        )}
        {isEdit && form.status !== 'closed' && form.status !== 'cancelled' && (
          <button type="button" className="btn danger" onClick={() => runAction(() => window.api.cancelContract(Number(id)))}>
            {t.cancelled}
          </button>
        )}
      </PageHeader>

      <form className="contract-form" onSubmit={onSubmit}>
        {!isEdit && (
          <section className="panel contract-reservation-link">
            <div className="panel-body form-grid">
              <div className="field full">
                <label>{t.reservationRef}</label>
                <p className="field-hint">{t.linkReservationHint}</p>
                <select
                  className="select"
                  value={form.reservation_id}
                  onChange={(e) => onReservationChange(e.target.value)}
                >
                  <option value="">{t.selectReservation}</option>
                  {reservationOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.reference} — {row.customer_name} — {row.car_name}
                    </option>
                  ))}
                </select>
                {reservations.length === 0 && !pinnedReservation && (
                  <span className="field-hint">{t.noReservationForContract}</span>
                )}
              </div>
            </div>
          </section>
        )}

        <ContractSection title="Identité">
          {isEdit && (
            <div className="field">
              <label>{t.contractNumber}</label>
              <input className="input" value={contractNumber} readOnly />
            </div>
          )}
          <div className="field">
            <label>{t.contractDate}</label>
            <input className="input" type="date" value={form.contract_date} onChange={(e) => setForm({ ...form, contract_date: e.target.value })} />
          </div>
          <div className="field">
            <label>{t.contractCity}</label>
            <input className="input" value={form.contract_city} onChange={(e) => setForm({ ...form, contract_city: e.target.value })} />
          </div>
          <div className="field">
            <label>{t.status}</label>
            <select className="select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {CONTRACT_STATUSES.map((item) => (
                <option key={item} value={item}>
                  {t[item as keyof typeof t] || item}
                </option>
              ))}
            </select>
          </div>
          {isEdit && (
            <div className="field">
              <label>{t.reservationRef}</label>
              <select
                className="select"
                value={form.reservation_id}
                onChange={(e) => onReservationChange(e.target.value)}
              >
                <option value="">{t.selectReservation}</option>
                {reservationOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.reference} — {row.customer_name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>{t.customer}</label>
            {reservationLinked && <p className="field-hint">{t.reservationLinkedFieldsLocked}</p>}
            <select
              className="select"
              required
              disabled={reservationLinked}
              value={form.client_id}
              onChange={(e) => setForm({ ...form, client_id: Number(e.target.value) })}
            >
              <option value="">{t.selectClient}</option>
              {customers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t.car}</label>
            <select
              className="select"
              required
              disabled={reservationLinked}
              value={form.car_id}
              onChange={(e) => onCarChange(Number(e.target.value))}
            >
              <option value="">{t.selectCar}</option>
              {cars.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} — {row.plate_number}
                </option>
              ))}
            </select>
          </div>
        </ContractSection>

        <ContractSection title={t.driver1}>
          <div className="field full">
            <label>{t.chauffeur}</label>
            <select
              className="select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) copyFromChauffeur(Number(e.target.value))
              }}
            >
              <option value="">{t.selectChauffeur}</option>
              {chauffeurs.map((chauffeur) => (
                <option key={chauffeur.id} value={chauffeur.id}>
                  {chauffeur.name}
                </option>
              ))}
            </select>
          </div>
          <DriverFields
            prefix="driver1"
            form={form}
            setForm={setForm as Dispatch<SetStateAction<Record<string, unknown>>>}
            t={t}
            required
            onCopyFromCustomer={copyFromCustomer}
          />
        </ContractSection>

        <ContractSection title={t.driver2}>
          <div className="field full">
            <label>{t.chauffeur}</label>
            <select
              className="select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) copyDriver2FromChauffeur(Number(e.target.value))
              }}
            >
              <option value="">{t.selectChauffeur}</option>
              {chauffeurs.map((chauffeur) => (
                <option key={chauffeur.id} value={chauffeur.id}>
                  {chauffeur.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field full">
            <label>{t.customer}</label>
            <select
              className="select"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) copyDriver2FromCustomer(Number(e.target.value))
              }}
            >
              <option value="">{t.selectClient}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <DriverFields
            prefix="driver2"
            form={form}
            setForm={setForm as Dispatch<SetStateAction<Record<string, unknown>>>}
            t={t}
          />
        </ContractSection>

        <ContractSection title={t.vehicleDescription} grid="form-grid-3">
          <div className="field">
            <label>{t.brand}</label>
            <input className="input" value={form.vehicle_brand} onChange={(e) => setForm({ ...form, vehicle_brand: e.target.value })} />
          </div>
          <div className="field">
            <label>{t.model}</label>
            <input className="input" value={form.vehicle_model} onChange={(e) => setForm({ ...form, vehicle_model: e.target.value })} />
          </div>
          <div className="field">
            <label>{t.plateNumber}</label>
            <input className="input" value={form.vehicle_plate} onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })} />
          </div>
          <div className="field">
            <label>{t.departureAt}</label>
            <input
              className="input"
              type="datetime-local"
              value={form.departure_at}
              onChange={(e) => {
                setForm({ ...form, departure_at: e.target.value })
                recalcDays(e.target.value, form.return_at)
              }}
            />
          </div>
          <div className="field">
            <label>{t.departurePlace}</label>
            <input className="input" value={form.departure_place} onChange={(e) => setForm({ ...form, departure_place: e.target.value })} />
          </div>
          <div className="field">
            <label>{t.departureMileage}</label>
            <InputWithSuffix suffix="km" value={form.departure_mileage} min={0} onChange={(departure_mileage) => setForm({ ...form, departure_mileage })} />
          </div>
          <div className="field">
            <label>{t.returnAt}</label>
            <input
              className="input"
              type="datetime-local"
              value={form.return_at}
              onChange={(e) => {
                setForm({ ...form, return_at: e.target.value })
                recalcDays(form.departure_at, e.target.value)
              }}
            />
          </div>
          <div className="field">
            <label>{t.returnPlace}</label>
            <input className="input" value={form.return_place} onChange={(e) => setForm({ ...form, return_place: e.target.value })} />
          </div>
          <div className="field">
            <label>{t.returnMileage}</label>
            <InputWithSuffix suffix="km" value={form.return_mileage} min={0} onChange={(return_mileage) => setForm({ ...form, return_mileage })} />
          </div>
          <div className="field">
            <label>{t.billedDaysLabel}</label>
            <input className="input" type="number" min={1} value={form.billed_days} onChange={(e) => setForm({ ...form, billed_days: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>{t.extensionUntil}</label>
            <input className="input" type="date" value={form.extension_until} onChange={(e) => setForm({ ...form, extension_until: e.target.value })} />
          </div>
          <div className="field">
            <label>{t.extensionDaysLabel}</label>
            <input className="input" type="number" min={0} value={form.extension_days} onChange={(e) => setForm({ ...form, extension_days: Number(e.target.value) })} />
          </div>
        </ContractSection>

        <ContractSection title={t.equipmentSection}>
          <div className="field full equipment-grid">
            {EQUIPMENT_KEYS.map((key) => (
              <label key={key} className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.equipment.includes(key)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      equipment: e.target.checked
                        ? [...form.equipment, key]
                        : form.equipment.filter((item) => item !== key),
                    })
                  }
                />
                {t[`equip_${key}` as keyof typeof t] || key}
              </label>
            ))}
          </div>
          <div className="field full">
            <label>{t.equipmentOther}</label>
            <input className="input" value={form.equipment_other} onChange={(e) => setForm({ ...form, equipment_other: e.target.value })} />
          </div>
        </ContractSection>

        <ContractSection title={t.deliveryStateTitle} subtitle={t.vehicleStateSubtitle} grid="vehicle-state-section">
          <ContractVehicleStateSection
            kind="departure"
            fuelLevel={form.departure_fuel_level}
            notes={form.departure_notes}
            damages={form.departure_damages}
            onFuelChange={(departure_fuel_level) => setForm({ ...form, departure_fuel_level })}
            onNotesChange={(departure_notes) => setForm({ ...form, departure_notes })}
            onDamagesChange={(departure_damages) => setForm({ ...form, departure_damages })}
            t={t}
          />
        </ContractSection>

        <ContractSection title={t.returnStateTitle} subtitle={t.vehicleStateSubtitle} grid="vehicle-state-section">
          <ContractVehicleStateSection
            kind="return"
            fuelLevel={form.return_fuel_level}
            notes={form.return_notes}
            damages={form.return_damages}
            onFuelChange={(return_fuel_level) => setForm({ ...form, return_fuel_level })}
            onNotesChange={(return_notes) => setForm({ ...form, return_notes })}
            onDamagesChange={(return_damages) => setForm({ ...form, return_damages })}
            t={t}
          />
        </ContractSection>

        <ContractSection title={t.pdfOptions}>
          <div className="field full">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.include_damage_photos_in_pdf}
                onChange={(e) => setForm({ ...form, include_damage_photos_in_pdf: e.target.checked })}
              />
              {t.includeDamagePhotos}
            </label>
            <p className="field-hint">{t.includeDamagePhotosHint}</p>
          </div>
        </ContractSection>

        <ContractSection title={t.billingSection}>
          <div className="field">
            <label>{t.dailyRate}</label>
            <input
              className="input"
              type="number"
              value={form.daily_rate}
              onChange={(e) => setForm({ ...form, daily_rate: Number(e.target.value) })}
            />
          </div>
          <div className="field">
            <label>{t.discount}</label>
            <input className="input" type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>{t.deposit}</label>
            <input className="input" type="number" value={form.deposit_amount} onChange={(e) => setForm({ ...form, deposit_amount: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>{t.extraCharges}</label>
            <input className="input" type="number" value={form.extra_charges} onChange={(e) => setForm({ ...form, extra_charges: Number(e.target.value) })} />
          </div>
          <div className="field full">
            <label>{t.extraChargesNote}</label>
            <input
              className="input"
              value={form.extra_charges_note}
              onChange={(e) => setForm({ ...form, extra_charges_note: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="checkbox-row">
              <input type="checkbox" checked={form.vat_applies} onChange={(e) => setForm({ ...form, vat_applies: e.target.checked })} />
              {t.vatApplies}
            </label>
          </div>
          <div className="field">
            <label>{t.vatRate}</label>
            <input className="input" type="number" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.franchise_applies}
                onChange={(e) =>
                  setForm({
                    ...form,
                    franchise_applies: e.target.checked,
                    franchise_amount: e.target.checked ? form.franchise_amount : 0,
                  })
                }
              />
              {t.franchiseApplies}
            </label>
          </div>
          <div className="field">
            <label>{t.franchiseAmount}</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.franchise_amount}
              disabled={!form.franchise_applies}
              onChange={(e) => {
                const franchise_amount = Number(e.target.value)
                setForm({
                  ...form,
                  franchise_amount,
                  franchise_applies: franchise_amount > 0 ? true : form.franchise_applies,
                })
              }}
            />
          </div>
          <div className="field">
            <label>{t.total}</label>
            <strong>{money(previewTotal)}</strong>
          </div>
        </ContractSection>

        <ContractSection title={t.notes}>
          <div className="field full">
            <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </ContractSection>

        {error && <div className="error panel panel-body">{error}</div>}

        <div className="form-actions">
          <button type="submit" className="btn" disabled={saving}>
            {saving ? t.loading : t.save}
          </button>
        </div>
      </form>
    </div>
  )
}
