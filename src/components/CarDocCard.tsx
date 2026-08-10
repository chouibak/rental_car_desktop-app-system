import { IconFile } from './icons'
import { DocExpiryBadge } from './DocExpiryBadge'
import { fileBasename } from '../utils/file'

type CarDocCardProps = {
  label: string
  filePath?: string
  expiry?: string
  onOpen?: () => void
  viewLabel: string
  noDataLabel: string
  expiryDateLabel: string
}

export function CarDocCard({
  label,
  filePath,
  expiry,
  onOpen,
  viewLabel,
  noDataLabel,
  expiryDateLabel,
}: CarDocCardProps) {
  const hasFile = Boolean(filePath?.trim())
  const hasExpiry = Boolean(expiry?.trim())

  return (
    <article className="car-doc-card">
      <div className="car-doc-card-icon" aria-hidden>
        <IconFile size={18} />
      </div>

      <div className="car-doc-card-content">
        <div className="car-doc-card-head">
          <strong>{label}</strong>
          {hasExpiry ? <DocExpiryBadge expiry={expiry!} /> : null}
        </div>

        {hasFile ? (
          <div className="car-doc-card-meta">
            <span className="car-doc-card-filename" title={fileBasename(filePath!)}>
              {fileBasename(filePath!)}
            </span>
            <button type="button" className="link-btn" onClick={onOpen}>
              {viewLabel}
            </button>
          </div>
        ) : (
          <span className="car-doc-card-empty">{noDataLabel}</span>
        )}

        {hasExpiry ? (
          <span className="car-doc-card-date">
            {expiryDateLabel}: <time dateTime={expiry!.slice(0, 10)}>{expiry!.slice(0, 10)}</time>
          </span>
        ) : null}
      </div>
    </article>
  )
}
