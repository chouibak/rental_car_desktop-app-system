import { FormEvent, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type CarDocumentRenewModalProps = {
  open: boolean
  title: string
  expiryDateLabel: string
  cancelLabel: string
  saveLabel: string
  onClose: () => void
  onConfirm: (expiry: string) => void
}

export function CarDocumentRenewModal({
  open,
  title,
  expiryDateLabel,
  cancelLabel,
  saveLabel,
  onClose,
  onConfirm,
}: CarDocumentRenewModalProps) {
  const [expiry, setExpiry] = useState('')

  useEffect(() => {
    if (open) setExpiry('')
  }, [open])

  if (!open) return null

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    onConfirm(expiry)
  }

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal car-doc-renew-modal" onClick={(e) => e.stopPropagation()} onSubmit={onSubmit}>
        <header className="modal-header">
          <h3>{title}</h3>
        </header>
        <div className="modal-body">
          <div className="field">
            <label>{expiryDateLabel}</label>
            <input
              className="input"
              type="date"
              required
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </div>
        </div>
        <footer className="modal-footer">
          <button type="button" className="btn secondary" onClick={onClose}>
            {cancelLabel}
          </button>
          <button type="submit" className="btn">
            {saveLabel}
          </button>
        </footer>
      </form>
    </div>,
    document.body,
  )
}
