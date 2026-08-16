import { IconDownload } from './icons'
import { useLang } from '../context/LangContext'

export function PeriodPdfModal({
  open,
  year,
  month,
  years,
  monthOptions,
  saving,
  onYearChange,
  onMonthChange,
  onCancel,
  onConfirm,
}: {
  open: boolean
  year: number
  month: number
  years: number[]
  monthOptions: Array<{ value: number; label: string }>
  saving: boolean
  onYearChange: (year: number) => void
  onMonthChange: (month: number) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useLang()
  if (!open) return null

  return (
    <div className="modal-backdrop" onClick={() => !saving && onCancel()}>
      <div className="modal payment-modal revenue-pdf-modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <strong>{t.downloadPdf}</strong>
        </header>
        <div className="payment-modal-body">
          <div className="revenue-pdf-fields">
            <div className="field">
              <label>{t.year}</label>
              <select className="select" value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
                {years.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>{t.month}</label>
              <select className="select" value={month} onChange={(e) => onMonthChange(Number(e.target.value))}>
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <footer>
          <button type="button" className="btn secondary" onClick={onCancel} disabled={saving}>
            {t.cancel}
          </button>
          <button type="button" className="btn" onClick={onConfirm} disabled={saving}>
            <IconDownload size={15} />
            {saving ? t.loading : t.downloadPdf}
          </button>
        </footer>
      </div>
    </div>
  )
}
