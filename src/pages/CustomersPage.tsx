import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconEdit, IconPlus, IconSearch, IconTrash } from '../components/icons'
import { EmptyState, PageHeader } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Customer } from '../types'
import { formatDisplayDate } from '../utils/customer'

export default function CustomersPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [q, setQ] = useState('')

  const load = async () => {
    setCustomers(await window.api.listCustomers(q || undefined))
  }

  useEffect(() => {
    load()
  }, [q])

  const onDelete = async (id: number) => {
    if (!confirm(t.confirmDelete)) return
    try {
      await window.api.deleteCustomer(id)
      await load()
    } catch {
      alert(t.cannotDeleteCustomer)
    }
  }

  return (
    <div className="customers-page">
      <PageHeader title={t.customers} subtitle={t.customersSubtitle}>
        <div className="toolbar-filters">
          <div className="search-field">
            <IconSearch size={15} />
            <input
              className="input"
              placeholder={t.searchCustomer}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="btn" onClick={() => navigate('/customers/new')}>
            <IconPlus size={16} />
            {t.addCustomer}
          </button>
        </div>
      </PageHeader>

      <div className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.name}</th>
                <th>{t.phone}</th>
                <th>{t.email}</th>
                <th>{t.cin}</th>
                <th>{t.licenseExpiry}</th>
                <th className="col-actions">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState message={t.noData} />
                  </td>
                </tr>
              )}
              {customers.map((customer) => (
                <tr
                  key={customer.id}
                  className="clickable-row"
                  onClick={() => navigate(`/customers/${customer.id}`)}
                >
                  <td>
                    <strong>{customer.name}</strong>
                  </td>
                  <td>{customer.phone || '—'}</td>
                  <td>{customer.email || '—'}</td>
                  <td>{customer.cin_number || '—'}</td>
                  <td>{formatDisplayDate(customer.license_expiry_date)}</td>
                  <td className="col-actions">
                    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <Link
                        className="btn secondary sm icon-only"
                        to={`/customers/${customer.id}/edit`}
                        title={t.edit}
                        aria-label={t.edit}
                      >
                        <IconEdit size={15} />
                      </Link>
                      <button
                        type="button"
                        className="btn danger sm icon-only"
                        onClick={() => onDelete(customer.id)}
                        title={t.delete}
                        aria-label={t.delete}
                      >
                        <IconTrash size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
