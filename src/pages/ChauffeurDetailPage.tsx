import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { IconChevronLeft, IconEdit, IconTrash } from '../components/icons'
import { PageHeader } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Chauffeur } from '../types'
import type { Dict } from '../i18n'
import { formatDisplayDate } from '../utils/customer'
import { fileBasename } from '../utils/file'

const DOC_FIELDS = [
  {
    labelKey: 'cinDoc' as const,
    numberKey: 'cin_number' as const,
    pathKey: 'cin_pdf_path' as const,
    issueKey: 'cin_issue_date' as const,
    expiryKey: 'cin_expiry_date' as const,
  },
  {
    labelKey: 'passport' as const,
    numberKey: 'passport_number' as const,
    pathKey: 'passport_pdf_path' as const,
    issueKey: 'passport_issue_date' as const,
    expiryKey: 'passport_expiry_date' as const,
  },
  {
    labelKey: 'licenseDoc' as const,
    numberKey: 'license_number' as const,
    pathKey: 'license_pdf_path' as const,
    issueKey: 'license_issue_date' as const,
    expiryKey: 'license_expiry_date' as const,
  },
] as const

function display(value: string | undefined | null) {
  return value?.trim() ? value : '—'
}

function isActiveChauffeur(chauffeur: Chauffeur) {
  return chauffeur.is_active === true || chauffeur.is_active === 1
}

export default function ChauffeurDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLang()
  const [chauffeur, setChauffeur] = useState<Chauffeur | null>(null)

  useEffect(() => {
    if (!id) return
    window.api.getChauffeur(Number(id)).then((data) => {
      if (!data) {
        navigate('/chauffeurs')
        return
      }
      setChauffeur(data)
    })
  }, [id, navigate])

  const onOpenDocument = async (filePath: string) => {
    try {
      await window.api.openChauffeurFile(filePath)
    } catch {
      alert(t.cannotOpenDocument)
    }
  }

  const onDelete = async () => {
    if (!chauffeur || !confirm(t.confirmDelete)) return
    try {
      await window.api.deleteChauffeur(chauffeur.id)
      navigate('/chauffeurs')
    } catch {
      alert(t.cannotDeleteChauffeur)
    }
  }

  if (!chauffeur) return <div className="empty">{t.loading}</div>

  const infoItems = [
    { label: t.phone, value: display(chauffeur.phone) },
    { label: t.cin, value: display(chauffeur.cin_number) },
    { label: t.birthDate, value: formatDisplayDate(chauffeur.birth_date) },
    { label: t.birthPlace, value: display(chauffeur.birth_place) },
    { label: t.nationality, value: display(chauffeur.nationality) },
    { label: t.address, value: display(chauffeur.address) },
    { label: t.license, value: display(chauffeur.license_number) },
    {
      label: t.isActive,
      value: isActiveChauffeur(chauffeur) ? t.isActive : t.inactive,
    },
  ]

  return (
    <div>
      <PageHeader title={chauffeur.name} subtitle={chauffeur.phone || undefined}>
        <div className="toolbar-nav">
          <Link className="btn btn-back" to="/chauffeurs">
            <IconChevronLeft size={16} />
            {t.back}
          </Link>
        </div>
        <div className="toolbar-manage">
          <Link className="btn btn-edit" to={`/chauffeurs/${chauffeur.id}/edit`}>
            <IconEdit size={16} />
            {t.edit}
          </Link>
          <button type="button" className="btn danger" onClick={onDelete}>
            <IconTrash size={15} />
            {t.delete}
          </button>
        </div>
      </PageHeader>

      <div className="car-detail-meta">
        <span className={`badge ${isActiveChauffeur(chauffeur) ? 'paid' : 'cancelled'}`}>
          {isActiveChauffeur(chauffeur) ? t.isActive : t.inactive}
        </span>
      </div>

      <div className="panel">
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

          {chauffeur.notes?.trim() && (
            <div className="detail-notes">
              <h4>{t.notes}</h4>
              <p>{chauffeur.notes}</p>
            </div>
          )}
        </div>

        <div className="panel-header panel-header-divider">
          <h3>{t.documents}</h3>
        </div>
        <div className="panel-body">
          <div className="doc-list">
            {DOC_FIELDS.map((doc) => {
              const path = chauffeur[doc.pathKey]
              const number = chauffeur[doc.numberKey]
              const issue = chauffeur[doc.issueKey]
              const expiry = chauffeur[doc.expiryKey]
              const label = t[doc.labelKey as keyof Dict]

              return (
                <div className="doc-row doc-row-readonly customer-doc-row-readonly" key={doc.pathKey}>
                  <div className="doc-info">
                    <strong>{label}</strong>
                    <span className="muted-text">{display(number)}</span>
                    {path ? (
                      <>
                        <span className="muted-text doc-file-name">{fileBasename(path)}</span>
                        <button type="button" className="link-btn" onClick={() => onOpenDocument(path)}>
                          {t.viewDocument}
                        </button>
                      </>
                    ) : (
                      <span className="muted-text">{t.noData}</span>
                    )}
                  </div>
                  <span className="muted-text">
                    {issue ? `${t.issueDate}: ${formatDisplayDate(issue)}` : '—'}
                  </span>
                  <span className="muted-text">
                    {expiry ? `${t.expiryDate}: ${formatDisplayDate(expiry)}` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
