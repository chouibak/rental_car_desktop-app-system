import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  IconChevronLeft,
  IconEdit,
  IconFile,
  IconPlus,
  IconTrash,
  IconUsers,
  IconWallet,
} from '../components/icons'
import { PageHeader } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Dict } from '../i18n'
import type { Employee, EmployeeDocument, SalaryPayment } from '../types'
import { formatDisplayDate } from '../utils/customer'

type EmpTab = 'info' | 'documents' | 'salary'

const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]
const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

function display(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string' && !value.trim()) return '—'
  return String(value)
}

function isActiveEmployee(employee: Employee) {
  return employee.is_active === true || employee.is_active === 1
}

function roleLabel(role: string, t: Dict) {
  const key = `employeeRole_${role}` as keyof Dict
  return (t[key] as string | undefined) ?? role
}

function paymentMethodLabel(method: string, t: Dict) {
  if (method === 'cash') return t.cash
  if (method === 'card') return t.card
  if (method === 'bank_transfer') return t.bank_transfer
  return method
}

function monthLabel(year: number, month: number, lang: string) {
  const names = lang === 'ar' ? MONTH_NAMES_AR : MONTH_NAMES_FR
  return `${names[(month - 1) % 12]} ${year}`
}

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

const EMPLOYEE_DOC_TYPES = ['cin', 'contract', 'diploma', 'certificate', 'payslip', 'other'] as const
type EmployeeDocTypeKey = (typeof EMPLOYEE_DOC_TYPES)[number]

function docTypeLabel(type: string, t: Dict) {
  if (!type.trim()) return '—'
  const key = `employeeDocType_${type}` as keyof Dict
  return (t[key] as string | undefined) ?? type
}

export default function EmployeeDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, money, lang } = useLang()

  const [employee, setEmployee] = useState<Employee | null>(null)
  const [activeTab, setActiveTab] = useState<EmpTab>('info')

  const [documents, setDocuments] = useState<EmployeeDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [showDocForm, setShowDocForm] = useState(false)
  const [docSaving, setDocSaving] = useState(false)
  const [docError, setDocError] = useState('')
  const [docForm, setDocForm] = useState({
    doc_type: 'cin' as EmployeeDocTypeKey,
    custom_type: '',
    pickedPath: '',
    pickedName: '',
  })

  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([])
  const [salaryLoading, setSalaryLoading] = useState(false)

  const [showPayForm, setShowPayForm] = useState(false)
  const [payForm, setPayForm] = useState({
    amount: 0,
    period_year: CURRENT_YEAR,
    period_month: CURRENT_MONTH,
    payment_date: new Date().toISOString().slice(0, 10),
    payment_method: 'cash',
    notes: '',
    create_expense: true,
  })
  const [paySaving, setPaySaving] = useState(false)
  const [payError, setPayError] = useState('')

  const employeeId = Number(id)

  useEffect(() => {
    if (!Number.isFinite(employeeId) || employeeId <= 0) {
      navigate('/employees')
      return
    }
    window.api
      .getEmployee(employeeId)
      .then((data) => {
        if (!data) { navigate('/employees'); return }
        setEmployee(data)
        setPayForm((f) => ({ ...f, amount: data.salary || 0 }))
      })
      .catch(() => navigate('/employees'))
  }, [employeeId, navigate])

  useEffect(() => {
    if (!employee || activeTab !== 'documents') return
    setDocsLoading(true)
    window.api.listEmployeeDocuments(employee.id)
      .then(setDocuments)
      .catch(() => setDocuments([]))
      .finally(() => setDocsLoading(false))
  }, [employee, activeTab])

  useEffect(() => {
    if (!employee || activeTab !== 'salary') return
    setSalaryLoading(true)
    window.api.listSalaryPayments(employee.id)
      .then(setSalaryPayments)
      .catch(() => setSalaryPayments([]))
      .finally(() => setSalaryLoading(false))
  }, [employee, activeTab])

  const resetDocForm = () => {
    setDocForm({ doc_type: 'cin', custom_type: '', pickedPath: '', pickedName: '' })
    setDocError('')
  }

  const onPickDocumentFile = async () => {
    if (!employee) return
    try {
      const picked = await window.api.pickEmployeeDocument(employee.id)
      if (!picked) return
      setDocForm((f) => ({ ...f, pickedPath: picked.path, pickedName: picked.name || '' }))
    } catch {
      alert(t.cannotUploadDocument)
    }
  }

  const onSaveDocument = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!employee) return
    setDocError('')

    if (!docForm.pickedPath) {
      setDocError(t.noFileSelected)
      return
    }

    const docType =
      docForm.doc_type === 'other'
        ? docForm.custom_type.trim()
        : docForm.doc_type

    if (!docType) {
      setDocError(t.customDocumentType)
      return
    }

    setDocSaving(true)
    try {
      const doc = await window.api.addEmployeeDocument({
        employee_id: employee.id,
        name: docForm.pickedName || docTypeLabel(docType, t),
        doc_type: docType,
        path: docForm.pickedPath,
      })
      setDocuments((prev) => [doc, ...prev])
      setShowDocForm(false)
      resetDocForm()
    } catch {
      setDocError(t.cannotUploadDocument)
    } finally {
      setDocSaving(false)
    }
  }

  const onDeleteDocument = async (doc: EmployeeDocument) => {
    if (!confirm(t.confirmDelete)) return
    try {
      await window.api.deleteEmployeeDocument(doc.id)
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id))
    } catch {
      alert(t.cannotDeleteDocument)
    }
  }

  const onOpenDocument = async (path: string) => {
    try {
      await window.api.openEmployeeFile(path)
    } catch {
      alert(t.cannotOpenEmployeeFile)
    }
  }

  const onAddSalaryPayment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!employee) return
    setPayError('')
    const amount = Number(payForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setPayError(t.invalidAmount ?? 'Montant invalide')
      return
    }
    setPaySaving(true)
    try {
      const payment = await window.api.createSalaryPayment({
        employee_id: employee.id,
        amount,
        payment_date: payForm.payment_date,
        period_year: payForm.period_year,
        period_month: payForm.period_month,
        payment_method: payForm.payment_method,
        notes: payForm.notes,
        create_expense: payForm.create_expense,
      })
      setSalaryPayments((prev) => [payment, ...prev])
      setShowPayForm(false)
      setPayForm((f) => ({ ...f, notes: '', create_expense: true }))
    } catch {
      setPayError('Erreur lors de l\'enregistrement')
    } finally {
      setPaySaving(false)
    }
  }

  const onDeleteSalaryPayment = async (sp: SalaryPayment) => {
    if (!confirm(t.confirmDelete)) return
    try {
      await window.api.deleteSalaryPayment(sp.id)
      setSalaryPayments((prev) => prev.filter((p) => p.id !== sp.id))
    } catch {
      alert(t.cannotDeleteSalaryPayment)
    }
  }

  if (!employee) return <div className="empty">{t.loading}</div>

  const infoItems = [
    { label: t.phone, value: display(employee.phone) },
    { label: t.email, value: display(employee.email) },
    { label: t.cin, value: display(employee.cin_number) },
    { label: t.birthDate, value: formatDisplayDate(employee.birth_date) },
    { label: t.birthPlace, value: display(employee.birth_place) },
    { label: t.nationality, value: display(employee.nationality) },
    { label: t.address, value: display(employee.address) },
    { label: t.employeeRole, value: roleLabel(employee.role, t) },
    { label: t.monthlySalary, value: money(employee.salary) },
    { label: t.hireDate, value: formatDisplayDate(employee.hire_date) },
    { label: t.status, value: isActiveEmployee(employee) ? t.isActive : t.inactive },
  ]

  const tabs: { id: EmpTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'info', label: t.details, icon: <IconUsers size={15} /> },
    { id: 'documents', label: t.employeeDocuments, icon: <IconFile size={15} /> },
    { id: 'salary', label: t.salaryPayments, icon: <IconWallet size={15} /> },
  ]

  return (
    <div>
      <PageHeader title={employee.name} subtitle={roleLabel(employee.role, t)}>
        <div className="toolbar-nav">
          <Link className="btn btn-back" to="/employees">
            <IconChevronLeft size={16} />
            {t.back}
          </Link>
        </div>
        <div className="toolbar-manage">
          <Link className="btn secondary" to={`/employees/${employee.id}/edit`}>
            <IconEdit size={16} />
            {t.edit}
          </Link>
          <button type="button" className="btn danger outline" onClick={onDeleteEmployee}>
            <IconTrash size={15} />
            {t.delete}
          </button>
        </div>
      </PageHeader>

      <div className="car-detail-meta">
        <span className={`badge ${isActiveEmployee(employee) ? 'paid' : 'cancelled'}`}>
          {isActiveEmployee(employee) ? t.isActive : t.inactive}
        </span>
        <span className="muted-text">
          {money(employee.salary)} / {t.month?.toLowerCase() ?? 'mois'}
        </span>
      </div>

      <div className="car-detail-tabs" style={{ marginBottom: 20 }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`car-detail-tab${activeTab === tab.id ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="car-detail-tab-icon">{tab.icon}</span>
            <span className="car-detail-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'info' && (
        <div className="panel car-detail-panel">
          <div className="panel-header">
            <h3>{t.details}</h3>
          </div>
          <div className="panel-body">
            <div className="info-grid">
              {infoItems.map((item) => (
                <div className="info-item" key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
            {employee.notes?.trim() ? (
              <div className="detail-notes">
                <h4>{t.notes}</h4>
                <p>{employee.notes}</p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="panel car-detail-panel employee-docs-panel">
          <div className="panel-header employee-docs-header">
            <h3>{t.employeeDocuments}</h3>
            {!showDocForm && (
              <button type="button" className="btn sm" onClick={() => setShowDocForm(true)}>
                <IconPlus size={14} />
                {t.uploadDocument}
              </button>
            )}
          </div>

          {showDocForm && (
            <form onSubmit={onSaveDocument} className="employee-inline-form">
              <div className="form-grid">
                <div className="field">
                  <label>{t.documentType}</label>
                  <select
                    className="select"
                    value={docForm.doc_type}
                    onChange={(e) =>
                      setDocForm((f) => ({
                        ...f,
                        doc_type: e.target.value as EmployeeDocTypeKey,
                        custom_type: e.target.value === 'other' ? f.custom_type : '',
                      }))
                    }
                  >
                    {EMPLOYEE_DOC_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {docTypeLabel(type, t)}
                      </option>
                    ))}
                  </select>
                </div>

                {docForm.doc_type === 'other' ? (
                  <div className="field">
                    <label>{t.customDocumentType}</label>
                    <input
                      className="input"
                      type="text"
                      value={docForm.custom_type}
                      onChange={(e) => setDocForm((f) => ({ ...f, custom_type: e.target.value }))}
                      placeholder={t.documentTypeCustom}
                      required
                    />
                  </div>
                ) : (
                  <div className="field">
                    <label>{t.chooseFile}</label>
                    <button
                      type="button"
                      className="input employee-file-trigger"
                      onClick={onPickDocumentFile}
                    >
                      {docForm.pickedName || t.noFileSelected}
                    </button>
                  </div>
                )}

                {docForm.doc_type === 'other' && (
                  <div className="field full">
                    <label>{t.chooseFile}</label>
                    <button
                      type="button"
                      className="input employee-file-trigger"
                      onClick={onPickDocumentFile}
                    >
                      {docForm.pickedName || t.noFileSelected}
                    </button>
                  </div>
                )}

                {docError ? <p className="field full settings-error">{docError}</p> : null}
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => { setShowDocForm(false); resetDocForm() }}
                >
                  {t.cancel}
                </button>
                <button type="submit" className="btn" disabled={docSaving}>
                  {docSaving ? '...' : t.save}
                </button>
              </div>
            </form>
          )}

          <div className="panel-body employee-docs-body">
            {docsLoading ? (
              <div className="empty">{t.loading}</div>
            ) : documents.length === 0 ? (
              <div className="empty">{t.employeeDocumentsEmpty}</div>
            ) : (
              <div className="employee-doc-list">
                {documents.map((doc) => {
                  const typeLabel = doc.doc_type?.trim() ? docTypeLabel(doc.doc_type, t) : ''
                  return (
                    <div className="employee-doc-row" key={doc.id}>
                      {typeLabel ? (
                        <span className="employee-doc-type-badge">{typeLabel}</span>
                      ) : (
                        <span className="employee-doc-type-badge employee-doc-type-badge--muted">Doc</span>
                      )}
                      <div className="employee-doc-main">
                        <span className="employee-doc-filename">{doc.name}</span>
                        <span className="employee-doc-date">
                          {formatDisplayDate(doc.created_at?.slice(0, 10) ?? '')}
                        </span>
                      </div>
                      <div className="employee-doc-actions">
                        <button
                          type="button"
                          className="btn secondary sm"
                          onClick={() => onOpenDocument(doc.path)}
                        >
                          {t.viewDocument}
                        </button>
                        <button
                          type="button"
                          className="btn danger outline sm"
                          onClick={() => onDeleteDocument(doc)}
                        >
                          {t.delete}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'salary' && (
        <div className="panel car-detail-panel employee-docs-panel">
          <div className="panel-header employee-docs-header">
            <h3>{t.salaryPayments}</h3>
            {!showPayForm && (
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setPayError('')
                  setPayForm((f) => ({
                    ...f,
                    amount: employee.salary || f.amount,
                    period_year: CURRENT_YEAR,
                    period_month: CURRENT_MONTH,
                    payment_date: new Date().toISOString().slice(0, 10),
                    payment_method: 'cash',
                    notes: '',
                    create_expense: true,
                  }))
                  setShowPayForm(true)
                }}
              >
                <IconPlus size={14} />
                {t.addSalaryPayment}
              </button>
            )}
          </div>

          {showPayForm && (
            <form onSubmit={onAddSalaryPayment} className="employee-inline-form">
              <div className="form-grid">
                <div className="field">
                  <label>{t.monthlySalary} *</label>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.01"
                    value={payForm.amount}
                    onChange={(e) => setPayForm((f) => ({ ...f, amount: Number(e.target.value) }))}
                    required
                  />
                </div>
                <div className="field">
                  <label>{t.paymentDate}</label>
                  <input
                    className="input"
                    type="date"
                    value={payForm.payment_date}
                    onChange={(e) => setPayForm((f) => ({ ...f, payment_date: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>{t.salaryPeriod}</label>
                  <div className="employee-period-row">
                    <select
                      className="select"
                      value={payForm.period_month}
                      onChange={(e) => setPayForm((f) => ({ ...f, period_month: Number(e.target.value) }))}
                    >
                      {(lang === 'ar' ? MONTH_NAMES_AR : MONTH_NAMES_FR).map((name, i) => (
                        <option key={i + 1} value={i + 1}>{name}</option>
                      ))}
                    </select>
                    <input
                      className="input"
                      type="number"
                      min={2000}
                      max={2100}
                      value={payForm.period_year}
                      onChange={(e) => setPayForm((f) => ({ ...f, period_year: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>{t.paymentMethod}</label>
                  <select
                    className="select"
                    value={payForm.payment_method}
                    onChange={(e) => setPayForm((f) => ({ ...f, payment_method: e.target.value }))}
                  >
                    <option value="cash">{t.cash}</option>
                    <option value="card">{t.card}</option>
                    <option value="bank_transfer">{t.bank_transfer}</option>
                  </select>
                </div>
                <div className="field full">
                  <label>{t.notes}</label>
                  <input
                    className="input"
                    type="text"
                    value={payForm.notes}
                    onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))}
                    placeholder={t.optional}
                  />
                </div>
                <div className="field full">
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={payForm.create_expense}
                      onChange={(e) => setPayForm((f) => ({ ...f, create_expense: e.target.checked }))}
                    />
                    <span>{t.syncWithExpenses}</span>
                  </label>
                </div>
                {payError ? <p className="field full settings-error">{payError}</p> : null}
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => { setShowPayForm(false); setPayError('') }}
                >
                  {t.cancel}
                </button>
                <button type="submit" className="btn" disabled={paySaving}>
                  {paySaving ? '...' : t.save}
                </button>
              </div>
            </form>
          )}

          <div className="panel-body employee-docs-body">
            {salaryLoading ? (
              <div className="empty">{t.loading}</div>
            ) : salaryPayments.length === 0 ? (
              <div className="empty">{t.salaryPaymentsEmpty}</div>
            ) : (
              <div className="employee-doc-list">
                {salaryPayments.map((sp) => (
                  <div className="employee-doc-row employee-salary-row" key={sp.id}>
                    <span className="employee-doc-type-badge">
                      {monthLabel(sp.period_year, sp.period_month, lang)}
                    </span>
                    <div className="employee-doc-main">
                      <span className="employee-doc-filename">{money(sp.amount)}</span>
                      <span className="employee-doc-date">
                        {formatDisplayDate(sp.payment_date)} · {paymentMethodLabel(sp.payment_method, t)}
                        {sp.expense_id ? ` · ${t.salaryPaymentLinkedToExpense}` : ''}
                      </span>
                    </div>
                    <div className="employee-doc-actions">
                      <button
                        type="button"
                        className="btn danger outline sm"
                        onClick={() => onDeleteSalaryPayment(sp)}
                      >
                        {t.delete}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  async function onDeleteEmployee() {
    if (!employee || !confirm(t.confirmDelete)) return
    try {
      await window.api.deleteEmployee(employee.id)
      navigate('/employees')
    } catch {
      alert(t.cannotDeleteEmployee)
    }
  }
}
