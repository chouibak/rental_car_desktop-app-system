import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconChevronRight, IconEdit, IconPlus, IconSearch, IconTrash } from '../components/icons'
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
    <div>
      <PageHeader title={t.customers} subtitle={t.customersSubtitle}>
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
        </div>
        <div className="toolbar-actions">
          <button className="btn sm" onClick={() => navigate('/customers/new')}>
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
                <th>{t.actions}</th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 && (
                <tr>
                  <td colSpan={7}>
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
                  <td>
                    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <Link
                        className="btn secondary sm icon-only"
                        to={`/customers/${customer.id}/edit`}
                        title={t.edit}
                      >
                        <IconEdit size={15} />
                      </Link>
                      <button
                        className="btn danger sm icon-only"
                        onClick={() => onDelete(customer.id)}
                        title={t.delete}
                      >
                        <IconTrash size={15} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <span className="row-chevron">
                      <IconChevronRight size={18} />
                    </span>
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
