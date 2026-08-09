import { useEffect, useState } from 'react'
import { EmptyState } from './ui'
import type { Dict } from '../i18n'
import type { ContractDamage } from '../utils/contracts'

function DamagePhoto({ path }: { path: string }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    let active = true
    window.api.getCarFileUrl(path).then((resolved) => {
      if (active) setUrl(resolved)
    })
    return () => {
      active = false
    }
  }, [path])

  if (!url) return null
  return <img className="contract-damage-photo" src={url} alt="" loading="lazy" />
}

type ContractDamagesViewProps = {
  damages: ContractDamage[]
  t: Dict
}

export function ContractDamagesView({ damages, t }: ContractDamagesViewProps) {
  if (damages.length === 0) {
    return <EmptyState message={t.noDamagesRecorded} />
  }

  return (
    <div className="contract-damages-grid">
      {damages.map((damage, index) => (
        <div className="contract-damage-card" key={`${damage.part}-${damage.type}-${index}`}>
          <div className="contract-damage-card-head">
            <strong>{t[`part_${damage.part}` as keyof Dict] || damage.part}</strong>
            <span className="contract-damage-type">{t[`damage_${damage.type}` as keyof Dict] || damage.type}</span>
          </div>
          {damage.note?.trim() ? <p className="muted-text">{damage.note}</p> : null}
          {damage.photo ? <DamagePhoto path={damage.photo} /> : null}
        </div>
      ))}
    </div>
  )
}
