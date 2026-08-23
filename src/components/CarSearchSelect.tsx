import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
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
  disabled?: boolean
}

export function CarSearchSelect({ cars, value, onChange, selectedCarId, disabled = false }: CarSearchSelectProps) {
  const { t } = useLang()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({})

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
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return

    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return

      const rect = trigger.getBoundingClientRect()
      const menuHeight = 320
      const margin = 10
      const spaceBelow = window.innerHeight - rect.bottom - margin
      const spaceAbove = rect.top - margin
      const openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow

      setMenuStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        top: openUp ? rect.top - 6 : rect.bottom + 6,
        transform: openUp ? 'translateY(-100%)' : undefined,
        zIndex: 1200,
      })
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, filtered.length])

  useEffect(() => {
    if (open) {
      setQuery('')
      requestAnimationFrame(() => searchRef.current?.focus())
    }
  }, [open])

  const pick = (car: Car) => {
    if (disabled || !isSelectable(car)) return
    onChange(car.id, car)
    setOpen(false)
  }

  return (
    <div className={`car-search-select ${open ? 'open' : ''}${disabled ? ' is-disabled' : ''}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="car-search-trigger"
        onClick={() => {
          if (disabled) return
          setOpen((v) => !v)
        }}
        disabled={disabled}
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

      {open
        ? createPortal(
            <div ref={menuRef} className="car-search-menu car-search-menu--portal" style={menuStyle}>
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
                  const optionDisabled = !isSelectable(car)
                  const active = car.id === value
                  return (
                    <li key={car.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`car-search-option ${active ? 'active' : ''} ${optionDisabled ? 'disabled' : ''}`}
                        disabled={optionDisabled}
                        onClick={() => pick(car)}
                      >
                        <CarOptionLine car={car} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
