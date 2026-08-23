import { IconCalendar } from './icons'
import { CarStatusBadge } from './ui'
import { useLang } from '../context/LangContext'
import { formatContractDatetime } from '../utils/contracts'
import { formatNumber } from '../utils/money'
import { computeVidangeStatus, getVidangeTrafficLevel } from '../utils/vidange'
import type { Car } from '../types'

function vidangeLevelLabel(
  level: ReturnType<typeof getVidangeTrafficLevel>,
  t: ReturnType<typeof useLang>['t'],
) {
  if (level === 'never') return t.vidangeNeverDone
  if (level === 'due') return t.vidangeStatusDue
  if (level === 'soon') return t.vidangeStatusSoon
  return t.vidangeStatusOk
}

export function CarListStatusCell({ car }: { car: Car }) {
  const { t } = useLang()
  const status = car.computed_status ?? car.status ?? 'disponible'
  const isRented = status === 'louee'
  const vidange = computeVidangeStatus(car)
  const vidangeLevel = vidange.enabled ? getVidangeTrafficLevel(vidange) : null

  let vidangeRemaining = ''
  if (vidange.enabled && !vidange.never_done && vidange.km_remaining != null) {
    const n = formatNumber(Math.abs(vidange.km_remaining))
    vidangeRemaining =
      vidange.km_remaining <= 0
        ? t.vidangeKmOverdue.replace('{n}', n)
        : t.vidangeKmRemaining.replace('{n}', n)
  }

  return (
    <div className={`car-list-status${isRented ? ' car-list-status--rented' : ''}`}>
      <CarStatusBadge status={status} />

      {isRented && car.return_date ? (
        <div className="car-list-status-return">
          <IconCalendar size={13} aria-hidden />
          <span>
            {t.returnOn} <strong>{formatContractDatetime(car.return_date)}</strong>
          </span>
        </div>
      ) : null}

      {vidangeLevel ? (
        <div className={`car-list-status-vidange car-list-status-vidange--${vidangeLevel}`}>
          <span className="car-list-status-vidange-dot" aria-hidden />
          <span className="car-list-status-vidange-label">{t.vidange}</span>
          <span className="car-list-status-vidange-state">{vidangeLevelLabel(vidangeLevel, t)}</span>
          {vidangeRemaining ? (
            <>
              <span className="car-list-status-vidange-sep" aria-hidden>
                ·
              </span>
              <span className="car-list-status-vidange-km">{vidangeRemaining}</span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
