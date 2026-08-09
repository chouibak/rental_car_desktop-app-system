import { useState } from 'react'
import { IconSearch } from '../components/icons'
import { PaymentStatsCards } from '../components/PaymentStatsCards'
import { ReservationPaymentsPanel } from '../components/ReservationPaymentsPanel'
import { UnpaidReservationsTable } from '../components/UnpaidReservationsTable'
import { PageHeader } from '../components/ui'
import { useLang } from '../context/LangContext'
import type { ReservationPaymentRecordStatus, ReservationPaymentType } from '../types'

const PAYMENT_TYPES: ReservationPaymentType[] = ['rental', 'deposit', 'deposit_return']
const PAYMENT_STATUSES: ReservationPaymentRecordStatus[] = ['completed', 'pending', 'cancelled']

export default function PaymentsPage() {
  const { t } = useLang()
  const [q, setQ] = useState('')
  const [type, setType] = useState<ReservationPaymentType | ''>('')
  const [status, setStatus] = useState<ReservationPaymentRecordStatus | ''>('')
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="payments-page">
      <PageHeader title={t.payments} subtitle={t.paymentsSubtitle}>
        <div className="toolbar-filters">
          <div className="search-field search-field-sm">
            <IconSearch size={15} />
            <input
              className="input input-sm"
              placeholder={t.search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="select select-sm" value={type} onChange={(e) => setType(e.target.value as ReservationPaymentType | '')}>
            <option value="">{t.paymentType}</option>
            {PAYMENT_TYPES.map((item) => (
              <option key={item} value={item}>
                {t[item === 'rental' ? 'rentalPayment' : item === 'deposit' ? 'depositPayment' : 'depositReturnPayment']}
              </option>
            ))}
          </select>
          <select
            className="select select-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value as ReservationPaymentRecordStatus | '')}
          >
            <option value="">{t.paymentRecordStatus}</option>
            {PAYMENT_STATUSES.map((item) => (
              <option key={item} value={item}>
                {t[item === 'completed' ? 'paymentCompleted' : item]}
              </option>
            ))}
          </select>
        </div>
      </PageHeader>

      <PaymentStatsCards refreshKey={refreshKey} />

      <UnpaidReservationsTable search={q} refreshKey={refreshKey} />

      <div className="payments-history">
        <ReservationPaymentsPanel
          showReservationLink
          filters={{ q, type, status }}
          onPaymentsChange={() => setRefreshKey((value) => value + 1)}
        />
      </div>
    </div>
  )
}
