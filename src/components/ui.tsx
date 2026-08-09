import type { ReactNode } from 'react'
import { useLang } from '../context/LangContext'
import type { Dict } from '../i18n'

export function StatusBadge({ status }: { status: string }) {
  const { t } = useLang()
  const label = (t as Dict)[status as keyof Dict] ?? status
  const cls = status === 'louee' ? 'rented' : status === 'hors_service' ? 'out_of_service' : status
  return <span className={`badge ${cls}`}>{label}</span>
}

export function CarStatusBadge({ status }: { status: string }) {
  const { t } = useLang()
  const label = (t as Dict)[status as keyof Dict] ?? status
  const cls = status === 'louee' ? 'rented' : status === 'hors_service' ? 'out_of_service' : 'disponible'
  return <span className={`badge ${cls}`}>{label}</span>
}

export function PaymentBadge({ status }: { status: string }) {
  const { t } = useLang()
  const label = (t as Dict)[status as keyof Dict] ?? status
  return <span className={`badge payment-${status}`}>{label}</span>
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="toolbar">{children}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'default' | 'success' | 'info' | 'warn'
}) {
  return (
    <div className={`stat-card stat-card--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <p className="stat-card-hint">{hint}</p>}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">—</div>
      <p>{message}</p>
    </div>
  )
}
