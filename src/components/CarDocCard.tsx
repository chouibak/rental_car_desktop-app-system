import { IconEye, IconFile } from './icons'
import { DocExpiryBadge } from './DocExpiryBadge'
import { carDocumentTitle } from '../utils/carDocuments'
import { formatDocumentFileLabel } from '../utils/file'
import { getDocExpiryInfo } from '../utils/docExpiry'
import { useLang } from '../context/LangContext'

type CarDocCardProps = {
  label: string
  filePath?: string
  expiry?: string
  viewLabel: string
  renewLabel: string
  historyLabel: string
  noDataLabel: string
  expiryDateLabel: string
  historyCount?: number
  onOpen?: () => void
  onRenew?: () => void
  onHistory?: () => void
}

export function CarDocCard({
  label,
  filePath,
  expiry,
  viewLabel,
  renewLabel,
  historyLabel,
  noDataLabel,
  expiryDateLabel,
  historyCount = 0,
  onOpen,
  onRenew,
  onHistory,
}: CarDocCardProps) {
  const { t } = useLang()
  const hasFile = Boolean(filePath?.trim())
  const hasExpiry = Boolean(expiry?.trim())
  const expiryInfo = hasExpiry ? getDocExpiryInfo(expiry!) : null
  const severity = expiryInfo?.severity ?? 'none'
  const title = carDocumentTitle(label, expiry)
  const yearMatch = title.match(/\s(\d{4})$/)
  const displayLabel = yearMatch ? title.replace(/\s\d{4}$/, '') : title
  const displayYear = yearMatch?.[1]

  const fileLabel = hasFile
    ? formatDocumentFileLabel(filePath!, {
        pdf: t.documentFilePdf,
        image: t.documentFileImage,
        file: t.documentFileAttached,
      })
    : ''

  return (
    <article className={`car-doc-card car-doc-card--${severity}`}>
      <div className="car-doc-card-accent" aria-hidden />

      <div className="car-doc-card-main">
        <div className="car-doc-card-top">
          <div className="car-doc-card-icon" aria-hidden>
            <IconFile size={20} />
          </div>
          <div className="car-doc-card-head">
            <div className="car-doc-card-titles">
              <strong className="car-doc-card-type">{displayLabel}</strong>
              {displayYear ? <span className="car-doc-card-year">{displayYear}</span> : null}
            </div>
            {hasExpiry ? <DocExpiryBadge expiry={expiry!} /> : null}
          </div>
        </div>

        {hasFile ? (
          <div className="car-doc-card-file" title={filePath}>
            <span className="car-doc-card-file-dot" aria-hidden />
            <span className="car-doc-card-filename">{fileLabel}</span>
          </div>
        ) : (
          <div className="car-doc-card-empty">
            <span>{noDataLabel}</span>
          </div>
        )}

        {hasExpiry && expiryInfo ? (
          <div className="car-doc-card-meta">
            <span className="car-doc-card-date">
              {expiryDateLabel}
            </span>
            <time className="car-doc-card-date-value" dateTime={expiryInfo.date}>
              {expiryInfo.date}
            </time>
          </div>
        ) : null}

        <div className="car-doc-card-actions">
          <button type="button" className="btn secondary sm car-doc-action-btn" disabled={!hasFile} onClick={onOpen}>
            <IconEye size={14} />
            {viewLabel}
          </button>
          <button type="button" className="btn sm car-doc-action-btn car-doc-action-btn--renew" onClick={onRenew}>
            {renewLabel}
          </button>
          <button type="button" className="btn ghost sm car-doc-action-btn" onClick={onHistory}>
            {historyLabel}
            {historyCount > 0 ? <span className="car-doc-history-count">{historyCount}</span> : null}
          </button>
        </div>
      </div>
    </article>
  )
}
