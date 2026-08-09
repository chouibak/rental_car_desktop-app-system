import { useEffect, useMemo, useRef, useState } from 'react'
import { IconChevronDown, IconSearch } from './icons'
import { useLang } from '../context/LangContext'
import type { Car, CarComputedStatus } from '../types'
import type { Dict } from '../i18n'

function getCarStatus(car: Car): CarComputedStatus {
  return car.computed_status ?? car.status ?? 'disponible'
}

function carMatchesQuery(car: Car, query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [car.name, car.plate_number, car.brand, car.model].some((v) => v?.toLowerCase().includes(q))
}

function CarOptionLine({ car }: { car: Car }) {
  const { t, money } = useLang()
  const status = getCarStatus(car)
  const label = (t as Dict)[status as keyof Dict] ?? status

  return (
    <span className="car-select-line">
      <span className="car-select-name">{car.name}</span>
      <span className="car-select-sep">—</span>
      <span className="car-select-price">
        {money(car.price_per_day)}
        {t.perDaySuffix}
      </span>
      <span className="car-select-sep">—</span>
      <span className={`car-select-status status-${status}`}>
        <span className="status-dot" aria-hidden />
        {label}
      </span>
    </span>
  )
}

type CarSearchSelectProps = {
  cars: Car[]
  value: number | ''
  onChange: (carId: number, car: Car) => void
  selectedCarId?: number | ''
}

export function CarSearchSelect({ cars, value, onChange, selectedCarId }: CarSearchSelectProps) {
  const { t } = useLang()
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = cars.find((c) => c.id === value) ?? null
  const keepSelectedId = selectedCarId ?? value

  const filtered = useMemo(() => cars.filter((c) => carMatchesQuery(c, query)), [cars, query])

  const isSelectable = (car: Car) => {
    const status = getCarStatus(car)
    if (car.id === keepSelectedId) return true
    return status !== 'hors_service'
  }

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open])

  const pick = (car: Car) => {
    if (!isSelectable(car)) return
    onChange(car.id, car)
    setOpen(false)
  }

  return (
    <div className={`car-search-select ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="car-search-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selected ? (
          <CarOptionLine car={selected} />
        ) : (
          <span className="car-search-placeholder">{t.selectOption}</span>
        )}
        <IconChevronDown size={16} className="car-search-chevron" />
      </button>

      {open && (
        <div className="car-search-menu">
          <div className="car-search-field">
            <IconSearch size={15} />
            <input
              ref={searchRef}
              className="input input-sm"
              placeholder={t.searchToFind}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul className="car-search-list" role="listbox">
            {filtered.length === 0 && <li className="car-search-empty">{t.noData}</li>}
            {filtered.map((car) => {
              const disabled = !isSelectable(car)
              const active = car.id === value
              return (
                <li key={car.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`car-search-option ${active ? 'active' : ''} ${disabled ? 'disabled' : ''}`}
                    disabled={disabled}
                    onClick={() => pick(car)}
                  >
                    <CarOptionLine car={car} />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
