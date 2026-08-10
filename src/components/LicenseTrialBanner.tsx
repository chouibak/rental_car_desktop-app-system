import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLang } from '../context/LangContext'
import type { Dict } from '../i18n'
import type { LicenseStatus } from '../types'

const LicenseTrialContext = createContext<LicenseStatus | null>(null)

function formatTrialRemaining(status: LicenseStatus, t: Dict) {
  if (!status.isTrial || !status.expiresAt) return ''

  if (status.type === 'trial_5min') {
    const mins = status.minutesRemaining ?? 0
    if (mins <= 1) return t.licenseMinutesLeftOne
    return t.licenseMinutesLeft.replace('{n}', String(mins))
  }

  const days = status.daysRemaining ?? 0
  if (days <= 0) return t.licenseExpiredTitle
  if (days === 1) return t.licenseDaysLeftOne
  return t.licenseDaysLeft.replace('{n}', String(days))
}

export function LicenseTrialProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<LicenseStatus | null>(null)

  useEffect(() => {
    let active = true

    const refresh = async () => {
      const next = await window.api.getLicenseStatus()
      if (!active) return
      setStatus(next)
      if (next.expired || (next.isTrial && !next.valid)) {
        window.location.reload()
      }
    }

    refresh()
    const intervalMs = status?.type === 'trial_5min' ? 5000 : 30000
    const timer = window.setInterval(refresh, intervalMs)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [status?.type])

  return <LicenseTrialContext.Provider value={status}>{children}</LicenseTrialContext.Provider>
}

function useTrialStatus() {
  return useContext(LicenseTrialContext)
}

function isUrgent(status: LicenseStatus) {
  if (status.type === 'trial_5min') return (status.minutesRemaining ?? 0) <= 2
  return (status.daysRemaining ?? 0) <= 2
}

export function LicenseTrialDashboard() {
  const { t } = useLang()
  const status = useTrialStatus()

  if (!status?.isTrial || !status.valid) return null

  const label = formatTrialRemaining(status, t)

  return (
    <div className={`license-trial-dashboard${isUrgent(status) ? ' license-trial-dashboard--urgent' : ''}`}>
      <div className="license-trial-dashboard-main">
        <span className="license-trial-label">{t.licenseTrialBadge}</span>
        <strong>{label}</strong>
      </div>
      {status.expiresAt ? (
        <span className="license-trial-date muted-text">
          {t.licenseExpiresOn}{' '}
          {new Date(status.expiresAt).toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: status.type === 'trial_5min' ? 'short' : undefined,
          })}
        </span>
      ) : null}
    </div>
  )
}
