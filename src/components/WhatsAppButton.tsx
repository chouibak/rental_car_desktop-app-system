import { useState, type MouseEvent } from 'react'
import { IconWhatsApp } from './icons'
import { useLang } from '../context/LangContext'

type WhatsAppResult = { ok: true } | { ok: false; error: string }

type WhatsAppButtonProps = {
  label?: string
  title?: string
  className?: string
  size?: 'sm' | 'md'
  onSend: () => Promise<WhatsAppResult>
}

export function WhatsAppButton({ label, title, className = '', size = 'md', onSend }: WhatsAppButtonProps) {
  const { t } = useLang()
  const [loading, setLoading] = useState(false)

  async function handleClick(e: MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (loading) return

    setLoading(true)
    try {
      const result = await onSend()
      if (!result.ok) {
        if (result.error === 'NO_PHONE') alert(t.whatsappNoPhone)
        else if (result.error === 'NOT_FOUND') alert(t.whatsappNotFound)
        else alert(t.whatsappError)
      }
    } catch {
      alert(t.whatsappError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      className={`btn whatsapp-btn whatsapp-btn--${size}${className ? ` ${className}` : ''}`}
      onClick={handleClick}
      disabled={loading}
      title={title || t.whatsapp}
    >
      <IconWhatsApp size={size === 'sm' ? 15 : 16} />
      {label ? <span>{loading ? t.loading : label}</span> : null}
    </button>
  )
}
