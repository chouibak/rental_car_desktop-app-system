import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconChevronRight, IconEdit, IconPlus, IconSearch, IconTrash } from '../components/icons'
import { EmptyState, PageHeader, StatCard } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Dict } from '../i18n'
import type { Employee, EmployeeStats } from '../types'
import { formatDisplayDate } from '../utils/customer'

function isActiveEmployee(employee: Employee) {
  return employee.is_active === true || employee.is_active === 1
}

function roleLabel(role: string, t: Dict) {
  const key = `employeeRole_${role}` as keyof Dict
  return (t[key] as string | undefined) ?? role
}

export default function EmployeesPage() {
  const { t, money } = useLang()
  const navigate = useNavigate()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [stats, setStats] = useState<EmployeeStats | null>(null)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [rows, employeeStats] = await Promise.all([
        window.api.listEmployees(q ? { q } : undefined),
        window.api.getEmployeeStats(),
      ])
      setEmployees(rows)
      setStats(employeeStats)
    } catch {
      setError(t.loadFailed)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [q])

  const onDelete = async (id: number) => {
    if (!confirm(t.confirmDelete)) return
    try {
      await window.api.deleteEmployee(id)
      await load()
    } catch {
      alert(t.cannotDeleteEmployee)
    }
  }

  return (
    <div>
      <PageHeader title={t.employees} subtitle={t.employeesSubtitle}>
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
          <button className="btn sm" onClick={() => navigate('/employees/new')}>
            <IconPlus size={16} />
            {t.addEmployee}
          </button>
        </div>
      </PageHeader>

      {stats ? (
        <div className="cards">
          <StatCard label={t.totalEmployees} value={stats.total} />
          <StatCard label={t.activeEmployees} value={stats.active} tone="success" />
          <StatCard label={t.monthlyPayroll} value={money(stats.monthly_payroll)} tone="info" />
        </div>
      ) : null}

      <div className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.fullName}</th>
                <th>{t.phone}</th>
                <th>{t.employeeRole}</th>
                <th>{t.monthlySalary}</th>
                <th>{t.hireDate}</th>
                <th>{t.isActive}</th>
                <th>{t.actions}</th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <EmptyState message={loading ? t.loading : error || t.noData} />
                  </td>
                </tr>
              )}
              {employees.map((employee) => (
                <tr
                  key={employee.id}
                  className="clickable-row"
                  onClick={() => navigate(`/employees/${employee.id}`)}
                >
                  <td>
                    <strong>{employee.name}</strong>
                    {employee.notes ? <div className="muted text-sm">{employee.notes}</div> : null}
                  </td>
                  <td>{employee.phone || '—'}</td>
                  <td>{roleLabel(employee.role, t)}</td>
                  <td>{money(employee.salary)}</td>
                  <td>{formatDisplayDate(employee.hire_date)}</td>
                  <td>
                    <span className={`badge ${isActiveEmployee(employee) ? 'paid' : 'cancelled'}`}>
                      {isActiveEmployee(employee) ? t.isActive : t.inactive}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <Link
                        className="btn secondary sm icon-only"
                        to={`/employees/${employee.id}/edit`}
                        title={t.edit}
                      >
                        <IconEdit size={15} />
                      </Link>
                      <button
                        className="btn danger sm icon-only"
                        title={t.delete}
                        onClick={() => onDelete(employee.id)}
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
