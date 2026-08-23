import { createPortal } from 'react-dom'
import type { CarDocumentHistoryItem } from '../types'
import { carDocumentTitle } from '../utils/carDocuments'
import { fileBasename } from '../utils/file'

type CarDocumentHistoryModalProps = {
  open: boolean
  title: string
  baseLabel: string
  items: CarDocumentHistoryItem[]
  viewLabel: string
  emptyLabel: string
  expiryDateLabel: string
  closeLabel: string
  onClose: () => void
  onOpen: (filePath: string) => void
}

export function CarDocumentHistoryModal({
  open,
  title,
  baseLabel,
  items,
  viewLabel,
  emptyLabel,
  expiryDateLabel,
  closeLabel,
  onClose,
  onOpen,
}: CarDocumentHistoryModalProps) {
  if (!open) return null

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal car-doc-history-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="btn ghost" onClick={onClose}>
            {closeLabel}
          </button>
        </header>
        <div className="modal-body">
          {items.length === 0 ? (
            <p className="muted-text">{emptyLabel}</p>
          ) : (
            <ul className="car-doc-history-list">
              {items.map((item) => (
                <li key={item.id} className="car-doc-history-item">
                  <div className="car-doc-history-item-main">
                    <strong>{carDocumentTitle(baseLabel, item.expiry_date)}</strong>
                    {item.expiry_date ? (
                      <span className="car-doc-history-expiry">
                        {expiryDateLabel}: {item.expiry_date.slice(0, 10)}
                      </span>
                    ) : null}
                    <span className="muted-text car-doc-history-file">{fileBasename(item.file_path)}</span>
                  </div>
                  <button type="button" className="btn secondary sm" onClick={() => onOpen(item.file_path)}>
                    {viewLabel}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
