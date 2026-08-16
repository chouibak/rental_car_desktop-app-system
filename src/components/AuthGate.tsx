import { FormEvent, useEffect, useState, type ReactNode } from 'react'
import { IconCar } from './icons'
import { useLang } from '../context/LangContext'
import { AuthProvider } from '../context/AuthContext'
import { PasswordInput } from './PasswordInput'
import type { AuthSession } from '../types'

const REMEMBER_USERNAME_KEY = 'auth-remember-username'
const REMEMBER_LOGIN_KEY = 'auth-remember-login'

type Props = {
  children: ReactNode
}

export function AuthGate({ children }: Props) {
  const { t } = useLang()
  const [session, setSession] = useState<AuthSession | null>(null)
  const [username, setUsername] = useState(() => localStorage.getItem(REMEMBER_USERNAME_KEY) || '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(() => localStorage.getItem(REMEMBER_LOGIN_KEY) === '1')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    window.api
      .getAuthSession()
      .then(setSession)
      .catch(() => setSession({ authenticated: false, username: null, remember: false }))
  }, [])

  if (!session) {
    return (
      <div className="license-screen">
        <div className="license-card">
          <p className="muted-text">{t.loading}</p>
        </div>
      </div>
    )
  }

  if (session.authenticated && session.username) {
    return (
      <AuthProvider
        initialUsername={session.username}
        logout={async () => {
          const next = await window.api.logout()
          setSession(next)
          setPassword('')
        }}
      >
        {children}
      </AuthProvider>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = await window.api.login({ username, password, remember })
      if (result.ok) {
        if (remember) {
          localStorage.setItem(REMEMBER_USERNAME_KEY, username.trim())
          localStorage.setItem(REMEMBER_LOGIN_KEY, '1')
        } else {
          localStorage.removeItem(REMEMBER_USERNAME_KEY)
          localStorage.removeItem(REMEMBER_LOGIN_KEY)
        }
        setSession(result.session)
        setPassword('')
      } else {
        setError(result.error === 'INVALID_CREDENTIALS' ? t.authInvalidCredentials : t.authError)
      }
    } catch {
      setError(t.authError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="license-screen">
      <div className="license-card">
        <div className="license-brand">
          <div className="license-brand-mark">
            <IconCar size={28} />
          </div>
          <div>
            <h1>{t.appName}</h1>
            <p className="muted-text">{t.authSubtitle}</p>
          </div>
        </div>

        <div className="license-alert">
          <strong>{t.authRequiredTitle}</strong>
          <p>{t.authRequiredHint}</p>
        </div>

        <form className="license-form" onSubmit={onSubmit}>
          <label htmlFor="auth-username">{t.authUsernameLabel}</label>
          <input
            id="auth-username"
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />

          <label htmlFor="auth-password">{t.authPasswordLabel}</label>
          <PasswordInput
            id="auth-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <label className="auth-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <span>{t.authRememberMe}</span>
          </label>

          {error ? <p className="license-error">{error}</p> : null}

          <button
            type="submit"
            className="btn primary license-submit"
            disabled={loading || !username.trim() || !password}
          >
            {loading ? t.loading : t.authLogin}
          </button>
        </form>
      </div>
    </div>
  )
}
