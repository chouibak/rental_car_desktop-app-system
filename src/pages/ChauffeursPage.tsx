import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { IconChevronRight, IconEdit, IconPlus, IconSearch, IconTrash } from '../components/icons'
import { EmptyState, PageHeader } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Chauffeur } from '../types'
import { formatDisplayDate } from '../utils/customer'

function isActiveChauffeur(chauffeur: Chauffeur) {
  return chauffeur.is_active === true || chauffeur.is_active === 1
}

export default function ChauffeursPage() {
  const { t } = useLang()
  const navigate = useNavigate()
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setChauffeurs(await window.api.listChauffeurs(q ? { q } : undefined))
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
      await window.api.deleteChauffeur(id)
      await load()
    } catch {
      alert(t.cannotDeleteChauffeur)
    }
  }

  return (
    <div>
      <PageHeader title={t.chauffeurs} subtitle={t.chauffeursSubtitle}>
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
          <button className="btn sm" onClick={() => navigate('/chauffeurs/new')}>
            <IconPlus size={16} />
            {t.addChauffeur}
          </button>
        </div>
      </PageHeader>

      <div className="panel">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t.fullName}</th>
                <th>{t.phone}</th>
                <th>{t.cin}</th>
                <th>{t.licenseExpiry}</th>
                <th>{t.isActive}</th>
                <th>{t.actions}</th>
                <th aria-hidden />
              </tr>
            </thead>
            <tbody>
              {chauffeurs.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <EmptyState message={loading ? t.loading : error || t.noData} />
                  </td>
                </tr>
              )}
              {chauffeurs.map((chauffeur) => (
                <tr
                  key={chauffeur.id}
                  className="clickable-row"
                  onClick={() => navigate(`/chauffeurs/${chauffeur.id}`)}
                >
                  <td>
                    <strong>{chauffeur.name}</strong>
                    {chauffeur.notes ? <div className="muted text-sm">{chauffeur.notes}</div> : null}
                  </td>
                  <td>{chauffeur.phone || '—'}</td>
                  <td>{chauffeur.cin_number || '—'}</td>
                  <td>{formatDisplayDate(chauffeur.license_expiry_date)}</td>
                  <td>
                    <span className={`badge ${isActiveChauffeur(chauffeur) ? 'paid' : 'cancelled'}`}>
                      {isActiveChauffeur(chauffeur) ? t.isActive : t.inactive}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <Link
                        className="btn secondary sm icon-only"
                        to={`/chauffeurs/${chauffeur.id}/edit`}
                        title={t.edit}
                      >
                        <IconEdit size={15} />
                      </Link>
                      <button
                        className="btn danger sm icon-only"
                        title={t.delete}
                        onClick={() => onDelete(chauffeur.id)}
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
