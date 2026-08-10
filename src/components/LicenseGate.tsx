import { FormEvent, useEffect, useState, type ReactNode } from 'react'
import { useLang } from '../context/LangContext'
import type { LicenseStatus } from '../types'

type Props = {
  children: ReactNode
}

export function LicenseGate({ children }: Props) {
  const { t } = useLang()
  const [status, setStatus] = useState<LicenseStatus | null>(null)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.api.getLicenseStatus().then(setStatus)
  }, [])

  if (!status) {
    return (
      <div className="license-screen">
        <div className="license-card">
          <p className="muted-text">{t.loading}</p>
        </div>
      </div>
    )
  }

  if (status.valid) {
    return <>{children}</>
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await window.api.activateLicense(key)
      if (result.ok) {
        setStatus(result.status)
        setKey('')
      } else {
        setError(result.error === 'INVALID_KEY' ? t.licenseInvalidKey : t.licenseError)
      }
    } catch {
      setError(t.licenseError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="license-screen">
      <div className="license-card">
        <div className="license-brand">
          <div className="license-brand-mark">RC</div>
          <div>
            <h1>{t.appName}</h1>
            <p className="muted-text">{t.licenseSubtitle}</p>
          </div>
        </div>

        {status.expired ? (
          <div className="license-alert license-alert--warn">
            <strong>{t.licenseExpiredTitle}</strong>
            <p>{t.licenseExpiredHint}</p>
          </div>
        ) : (
          <div className="license-alert">
            <strong>{t.licenseRequiredTitle}</strong>
            <p>{t.licenseRequiredHint}</p>
          </div>
        )}

        <form className="license-form" onSubmit={onSubmit}>
          <label htmlFor="license-key">{t.licenseKeyLabel}</label>
          <input
            id="license-key"
            className="input license-input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t.licenseKeyPlaceholder}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          {error ? <p className="license-error">{error}</p> : null}
          <button type="submit" className="btn primary license-submit" disabled={loading || !key.trim()}>
            {loading ? t.loading : t.licenseActivate}
          </button>
        </form>

        <p className="license-footer muted-text">{t.licenseContactHint}</p>
      </div>
    </div>
  )
}
