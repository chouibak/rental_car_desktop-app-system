import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { IconBell } from './icons'
import { useLang } from '../context/LangContext'
import type { Notification, NotificationCounts } from '../types'
import {
  formatNotificationDate,
  notificationDetail,
  notificationEntityTag,
  notificationTimingLabel,
  notificationTitle,
} from '../utils/notifications'

const POLL_MS = 60_000
const PANEL_WIDTH = 380

export function NotificationBell({ tone = 'default' }: { tone?: 'default' | 'sidebar' }) {
  const { t, lang, dir } = useLang()
  const [open, setOpen] = useState(false)
  const [counts, setCounts] = useState<NotificationCounts | null>(null)
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const refresh = async () => {
    const [nextCounts, nextItems] = await Promise.all([
      window.api.getNotificationCounts(),
      window.api.getNotifications(),
    ])
    setCounts(nextCounts)
    setItems(nextItems.slice(0, 8))
  }

  const updatePanelPosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const margin = 12
    let left = dir === 'rtl' ? rect.left : rect.right - PANEL_WIDTH
    left = Math.max(margin, Math.min(left, window.innerWidth - PANEL_WIDTH - margin))
    setPanelStyle({ top: rect.bottom + 10, left })
  }

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    updatePanelPosition()
    window.api.getNotifications().then((list) => {
      setItems(list.slice(0, 8))
      setLoading(false)
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onLayout = () => updatePanelPosition()
    window.addEventListener('resize', onLayout)
    window.addEventListener('scroll', onLayout, true)
    return () => {
      window.removeEventListener('resize', onLayout)
      window.removeEventListener('scroll', onLayout, true)
    }
  }, [open, dir])

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onEscape)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onEscape)
    }
  }, [])

  const badge = counts?.total ?? 0
  const critical = counts?.critical ?? 0

  const panel =
    open && panelStyle
      ? createPortal(
          <div
            ref={panelRef}
            className="notification-panel"
            style={{ top: panelStyle.top, left: panelStyle.left, width: PANEL_WIDTH }}
            role="dialog"
            aria-label={t.notifications}
          >
            <div className="notification-panel-header">
              <div>
                <strong>{t.notifications}</strong>
                {counts ? <span className="notification-panel-count">{counts.total}</span> : null}
              </div>
              {critical > 0 ? (
                <span className="notification-panel-urgent">
                  {t.notificationUrgent.replace('{count}', String(critical))}
                </span>
              ) : null}
            </div>

            <div className="notification-panel-body">
              {loading ? <div className="notification-empty">{t.loading}</div> : null}
              {!loading && items.length === 0 ? <div className="notification-empty">{t.noNotifications}</div> : null}
              {!loading
                ? items.map((item) => (
                    <Link
                      key={item.id}
                      to={item.link}
                      className={`notification-row notification-row--${item.severity}`}
                      onClick={() => setOpen(false)}
                    >
                      <span className={`notification-dot notification-dot--${item.severity}`} aria-hidden />
                      <div className="notification-row-content">
                        <div className="notification-row-tags">
                          <span className="notification-entity-tag">{notificationEntityTag(t, item.kind)}</span>
                          <span>{formatNotificationDate(item.due_date, lang)}</span>
                        </div>
                        <strong className="notification-row-title">{notificationTitle(t, item.kind)}</strong>
                        <p>{notificationDetail(t, item)}</p>
                        <span className="notification-row-meta">{notificationTimingLabel(t, item)}</span>
                      </div>
                    </Link>
                  ))
                : null}
            </div>

            <div className="notification-panel-footer">
              <Link className="btn secondary btn-sm" to="/notifications" onClick={() => setOpen(false)}>
                {t.viewAllNotifications}
              </Link>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <div className={`notification-bell${tone === 'sidebar' ? ' notification-bell--sidebar' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`notification-bell-trigger${open ? ' active' : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-label={t.notifications}
        aria-expanded={open}
        title={t.notifications}
      >
        <IconBell size={20} />
        {badge > 0 ? (
          <span className={`notification-badge${critical > 0 ? ' notification-badge--critical' : ''}`}>
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </button>
      {panel}
    </div>
  )
}
