import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthSession } from '../types'

type AuthContextValue = {
  username: string
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({
  initialUsername,
  logout,
  children,
}: {
  initialUsername: string
  logout: () => Promise<void>
  children: ReactNode
}) {
  const [username, setUsername] = useState(initialUsername)

  useEffect(() => {
    setUsername(initialUsername)
  }, [initialUsername])

  useEffect(() => {
    const onUpdated = (event: Event) => {
      const session = (event as CustomEvent<AuthSession>).detail
      if (session.username) setUsername(session.username)
    }
    window.addEventListener('auth-updated', onUpdated)
    return () => window.removeEventListener('auth-updated', onUpdated)
  }, [])

  return <AuthContext.Provider value={{ username, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
