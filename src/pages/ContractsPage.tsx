import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconEdit, IconPlus, IconSearch, IconTrash } from '../components/icons'
import { EmptyState, PageHeader, StatCard, StatusBadge } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Contract, ContractStats, Reservation } from '../types'
import { formatContractDatetime } from '../utils/contracts'

export default function ContractsPage() {
  const { t, money } = useLang()
  const navigate = useNavigate()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [stats, setStats] = useState<ContractStats | null>(null)
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const [reservationModalOpen, setReservationModalOpen] = useState(false)
  const [selectedReservationId, setSelectedReservationId] = useState<number | ''>('')
  const [error, setError] = useState('')

  const createFromReservation = () => {
    if (!selectedReservationId) return
    setReservationModalOpen(false)
    navigate(`/contracts/new?reservation=${selectedReservationId}`)
  }

  const load = async () => {
    const [rows, contractStats, reservationRows, existingContracts] = await Promise.all([
      window.api.listContracts({
        q: q || undefined,
        status: status || undefined,
      }),
      window.api.getContractStats(),
      window.api.listReservations(),
      window.api.listContracts(),
    ])

    const usedReservationIds = new Set(
      existingContracts.map((contract) => contract.reservation_id).filter(Boolean) as number[],
    )

    setContracts(rows)
    setStats(contractStats)
    setReservations(
      reservationRows.filter(
        (reservation) =>
          (reservation.status === 'pending' || reservation.status === 'confirmed') &&
          !usedReservationIds.has(reservation.id),
      ),
    )
  }

  useEffect(() => {
    load()
  }, [q, status])

  const onDelete = async (contract: Contract) => {
    const message = t.confirmDeleteContract.replace('{number}', contract.contract_number)
    if (!confirm(message)) return
    try {
      await window.api.deleteContract(contract.id)
      await load()
    } catch {
      alert(t.cannotDeleteContract)
    }
  }

  return (
    <div className="contracts-page">
      <PageHeader title={t.contracts} subtitle={t.contractsSubtitle}>
        <div className="toolbar-filters">
          <div className="search-field search-field-sm">
            <IconSearch size={15} />
            <input
              className="input input-sm"
              placeholder={t.search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="select select-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t.all}</option>
            <option value="draft">{t.draft}</option>
            <option value="active">{t.active}</option>
            <option value="closed">{t.closed}</option>
            <option value="cancelled">{t.cancelled}</option>
          </select>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="btn secondary sm" onClick={() => setReservationModalOpen(true)}>
            {t.contractFromReservation}
          </button>
          <Link className="btn sm" to="/contracts/new">
            <IconPlus size={15} />
            {t.newContract}
          </Link>
        </div>
      </PageHeader>

      {stats && (
        <div className="cards cards--4">
          <StatCard label={t.activeContractsCount} value={stats.active} tone="info" />
          <StatCard
            label={t.unpaidStats}
            value={money(stats.unpaid_amount)}
            hint={
              stats.unpaid_count > 0
                ? `${stats.unpaid_count} ${t.unpaidContractsCount.toLowerCase()}`
                : t.fullyPaid
            }
            tone={stats.unpaid_amount > 0 ? 'warn' : 'success'}
          />
          <StatCard label={t.totalPaidAmount} value={money(stats.paid_amount)} tone="success" />
          <StatCard label={t.totalContractsCount} value={stats.total} />
        </div>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.contractNumber}</th>
                <th>{t.client}</th>
                <th>{t.car}</th>
                <th>{t.departureAt}</th>
                <th>{t.returnAt}</th>
                <th>{t.billedDays}</th>
                <th>{t.total}</th>
                <th>{t.amountPaid}</th>
                <th>{t.remainingUnpaid}</th>
                <th>{t.status}</th>
                <th>{t.actions}</th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {contracts.length === 0 && (
                <tr>
                  <td colSpan={12}>
                    <EmptyState message={t.noData} />
                  </td>
                </tr>
              )}
              {contracts.map((contract) => (
                <tr
                  key={contract.id}
                  className="clickable-row"
                  onClick={() => navigate(`/contracts/${contract.id}`)}
                >
                  <td>
                    <strong>{contract.contract_number}</strong>
                  </td>
                  <td>
                    {contract.client_name}
                    {contract.client_phone && <div className="muted-text">{contract.client_phone}</div>}
                  </td>
                  <td>
                    {contract.vehicle_brand || contract.brand} {contract.vehicle_model || contract.model}
                    <div className="muted-text">{contract.vehicle_plate || contract.plate_number}</div>
                  </td>
                  <td>{formatContractDatetime(contract.departure_at || contract.start_date)}</td>
                  <td className={contract.is_overdue ? 'text-danger' : ''}>
                    {formatContractDatetime(contract.return_at || contract.end_date)}
                  </td>
                  <td>{contract.billed_days ?? contract.total_days}</td>
                  <td>{money(contract.total_amount)}</td>
                  <td>{money(contract.paid_amount ?? 0)}</td>
                  <td className={Math.max(0, contract.total_amount - (contract.paid_amount ?? 0)) > 0 ? 'text-danger' : ''}>
                    {money(Math.max(0, contract.total_amount - (contract.paid_amount ?? 0)))}
                  </td>
                  <td>
                    <StatusBadge status={contract.status === 'completed' ? 'closed' : contract.status} />
                  </td>
                  <td>
                    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <Link className="btn secondary sm icon-only" to={`/contracts/${contract.id}/edit`} title={t.edit}>
                        <IconEdit size={15} />
                      </Link>
                      <button
                        type="button"
                        className="btn danger sm icon-only"
                        title={t.delete}
                        onClick={() => onDelete(contract)}
                      >
                        <IconTrash size={15} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <span className="row-chevron" aria-hidden />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {reservationModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <header>
              <strong>{t.contractFromReservation}</strong>
            </header>
            <div className="panel-body form-grid">
              <div className="field full">
                <label>{t.selectReservation}</label>
                <select
                  className="select"
                  value={selectedReservationId}
                  onChange={(e) => setSelectedReservationId(Number(e.target.value) || '')}
                >
                  <option value="">{t.selectReservation}</option>
                  {reservations.map((reservation) => (
                    <option key={reservation.id} value={reservation.id}>
                      {reservation.reference} — {reservation.customer_name} — {reservation.car_name}
                    </option>
                  ))}
                </select>
              </div>
              {reservations.length === 0 && <div className="muted-text full">{t.noReservationForContract}</div>}
              {error && <div className="error full">{error}</div>}
            </div>
            <footer>
              <button type="button" className="btn secondary" onClick={() => setReservationModalOpen(false)}>
                {t.cancel}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!selectedReservationId}
                onClick={createFromReservation}
              >
                {t.continueAction}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
