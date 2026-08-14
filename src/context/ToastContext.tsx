import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type ToastTone = 'success' | 'error'

type ToastState = {
  id: number
  message: string
  tone: ToastTone
}

type ToastContextValue = {
  showSuccess: (message?: string) => void
  showError: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

function ToastViewport({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 3200)
    return () => window.clearTimeout(timer)
  }, [toast.id, onClose])

  return createPortal(
    <div className={`app-toast app-toast--${toast.tone}`} role="status" aria-live="polite">
      <span className="app-toast-icon" aria-hidden>
        {toast.tone === 'success' ? '✓' : '!'}
      </span>
      <span className="app-toast-message">{toast.message}</span>
      <button type="button" className="app-toast-close" onClick={onClose} aria-label="Close">
        ×
      </button>
    </div>,
    document.body,
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)

  const show = useCallback((message: string, tone: ToastTone) => {
    const text = message.trim()
    if (!text) return
    setToast({ id: Date.now(), message: text, tone })
  }, [])

  const value = useMemo<ToastContextValue>(
    () => ({
      showSuccess: (message = '') => show(message, 'success'),
      showError: (message) => show(message, 'error'),
    }),
    [show],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? <ToastViewport toast={toast} onClose={() => setToast(null)} /> : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
