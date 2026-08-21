import { useEffect, useState } from 'react'
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

function DamageVideo({ path, t }: { path: string; t: Dict }) {
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

  const openVideo = async () => {
    try {
      await window.api.openCarFile(path)
    } catch {
      alert(t.cannotOpenDocument)
    }
  }

  return (
    <div className="contract-damage-video">
      {url ? <video className="contract-damage-video-player" src={url} controls preload="metadata" /> : null}
      <button type="button" className="btn sm secondary" onClick={openVideo}>
        {t.openVideo}
      </button>
    </div>
  )
}

type ContractDamagesViewProps = {
  damages: ContractDamage[]
  t: Dict
  compact?: boolean
}

export function ContractDamagesView({ damages, t, compact = false }: ContractDamagesViewProps) {
  if (damages.length === 0) {
    return (
      <div className={`handover-no-damage${compact ? ' is-compact' : ''}`}>
        {t.noDamagesRecorded}
      </div>
    )
  }

  return (
    <div className={`contract-damages-grid${compact ? ' is-compact' : ''}`}>
      {damages.map((damage, index) => (
        <div className="contract-damage-card" key={damage.id || `${damage.part}-${damage.type}-${index}`}>
          <div className="contract-damage-card-head">
            <strong>
              {index + 1}. {t[`part_${damage.part}` as keyof Dict] || damage.part}
            </strong>
            <span className="contract-damage-type">{t[`damage_${damage.type}` as keyof Dict] || damage.type}</span>
          </div>
          {damage.note?.trim() ? <p className="muted-text">{damage.note}</p> : null}
          {damage.photo ? <DamagePhoto path={damage.photo} /> : null}
          {damage.video ? <DamageVideo path={damage.video} t={t} /> : null}
        </div>
      ))}
    </div>
  )
}
