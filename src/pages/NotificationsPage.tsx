import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { Notification } from '../types'
import {
  formatNotificationDate,
  isReturnNotification,
  notificationActionLabel,
  notificationDetail,
  notificationEntityTag,
  notificationSeverityLabel,
  notificationTimingLabel,
  notificationTitle,
} from '../utils/notifications'

type Filter = 'all' | 'returns' | 'docs'

export default function NotificationsPage() {
  const { t, lang } = useLang()
  const [items, setItems] = useState<Notification[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.getNotifications().then((list) => {
      setItems(list)
      setLoading(false)
    })
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'returns') return items.filter((item) => isReturnNotification(item.kind))
    if (filter === 'docs') return items.filter((item) => !isReturnNotification(item.kind))
    return items
  }, [filter, items])

  const counts = useMemo(
    () => ({
      returns: items.filter((item) => isReturnNotification(item.kind)).length,
      docs: items.filter((item) => !isReturnNotification(item.kind)).length,
    }),
    [items],
  )

  if (loading) return <div className="empty">{t.loading}</div>

  return (
    <div className="notifications-page">
      <PageHeader title={t.notifications} subtitle={t.notificationsSubtitle}>
        <Link className="btn secondary btn-sm" to="/">
          {t.back}
        </Link>
      </PageHeader>

      <div className="notification-filters">
        <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          {t.all} ({items.length})
        </button>
        <button type="button" className={filter === 'returns' ? 'active' : ''} onClick={() => setFilter('returns')}>
          {t.notificationGroupReturns} ({counts.returns})
        </button>
        <button type="button" className={filter === 'docs' ? 'active' : ''} onClick={() => setFilter('docs')}>
          {t.notificationGroupDocs} ({counts.docs})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="panel">
          <div className="panel-body empty">{t.noNotifications}</div>
        </div>
      ) : (
        <div className="notification-list">
          {filtered.map((item) => (
            <NotificationCard key={item.id} item={item} lang={lang} />
          ))}
        </div>
      )}
    </div>
  )
}

function NotificationCard({ item, lang }: { item: Notification; lang: 'fr' | 'ar' }) {
  const { t } = useLang()

  return (
    <div className={`notification-card notification-card--${item.severity}`}>
      <div className="notification-card-head">
        <span className="notification-entity-tag">{notificationEntityTag(t, item.kind)}</span>
        <span className={`notification-severity notification-severity--${item.severity}`}>
          {notificationSeverityLabel(t, item.severity)}
        </span>
        <span className="notification-date">{formatNotificationDate(item.due_date, lang)}</span>
      </div>
      <h3>{notificationTitle(t, item.kind)}</h3>
      <p className="muted-text">{notificationDetail(t, item)}</p>
      <div className="notification-card-footer">
        <span className="notification-card-meta">{notificationTimingLabel(t, item)}</span>
        <Link className="btn btn-sm" to={item.link}>
          {notificationActionLabel(t, item.kind)}
        </Link>
      </div>
    </div>
  )
}
