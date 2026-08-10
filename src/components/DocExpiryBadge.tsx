import { useLang } from '../context/LangContext'
import { formatDocExpiryLabel, getDocExpiryInfo } from '../utils/docExpiry'

type DocExpiryBadgeProps = {
  expiry: string
}

export function DocExpiryBadge({ expiry }: DocExpiryBadgeProps) {
  const { t } = useLang()
  const info = getDocExpiryInfo(expiry)

  if (!info) return <span className="muted-text">—</span>

  const label =
    info.severity === 'ok'
      ? t.docValid
      : formatDocExpiryLabel(info, {
          expiresToday: t.expiresToday,
          dayRemaining: t.dayRemaining,
          daysRemaining: t.daysRemaining,
          expiredYesterday: t.expiredYesterday,
          expiredDaysAgo: t.expiredDaysAgo,
        })

  return (
    <span className={`doc-expiry-badge doc-expiry-badge--${info.severity}`} title={info.date}>
      {label}
    </span>
  )
}
