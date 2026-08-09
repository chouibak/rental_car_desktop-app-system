import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { IconChevronDown, IconX } from './icons'

export type OptionSelectItem = {
  value: string
  label: string
}

type OptionSelectProps = {
  value: string
  onChange: (value: string) => void
  options: OptionSelectItem[]
  placeholder: string
  clearable?: boolean
}

export function OptionSelect({ value, onChange, options, placeholder, clearable = true }: OptionSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const selected = options.find((o) => o.value === value) ?? null

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent | globalThis.MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const pick = (next: string) => {
    onChange(next)
    setOpen(false)
  }

  const clear = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    onChange('')
    setOpen(false)
  }

  return (
    <div className={`option-select ${open ? 'open' : ''}`} ref={rootRef}>
      <div className="option-select-trigger">
        <button
          type="button"
          className="option-select-main"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className={selected ? 'option-select-value' : 'option-select-placeholder'}>
            {selected ? selected.label : placeholder}
          </span>
        </button>
        <span className="option-select-actions">
          {clearable && value && (
            <button type="button" className="option-select-clear" onClick={clear} aria-label="Clear">
              <IconX size={14} />
            </button>
          )}
          <button type="button" className="option-select-toggle" onClick={() => setOpen((v) => !v)}>
            <IconChevronDown size={16} className="option-select-chevron" />
          </button>
        </span>
      </div>

      {open && (
        <ul className="option-select-menu" role="listbox">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`option-select-option ${option.value === value ? 'active' : ''}`}
                onClick={() => pick(option.value)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
