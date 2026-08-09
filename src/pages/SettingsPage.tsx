import { FormEvent, useEffect, useState, type ReactNode } from 'react'

import { PageHeader } from '../components/ui'

import { useLang } from '../context/LangContext'

import type { Lang } from '../types'



const DEFAULT_LEGAL_FR =

  'Chaque dommage touche la société pendant la période de location ; le locataire sera exposé à la responsabilité administrative et judiciaire jusqu\'à la décision finale, ainsi qu\'au paiement de tous les frais résultants.'



type SettingsForm = {

  company_name: string

  company_logo: string

  company_phone: string

  company_whatsapp: string

  company_email: string

  company_address: string

  company_city: string

  company_hours: string

  company_about: string

  company_fax: string

  company_tagline: string

  company_ice: string

  company_rc: string

  company_if: string

  company_tp: string

  company_cnss: string

  default_franchise_amount: string

  legal_mention_fr: string

  legal_mention_ar: string

  currency: string

  notification_return_days: string

  notification_doc_days: string

}



const EMPTY_FORM: SettingsForm = {

  company_name: '',

  company_logo: '',

  company_phone: '',

  company_whatsapp: '',

  company_email: '',

  company_address: '',

  company_city: '',

  company_hours: '',

  company_about: '',

  company_fax: '',

  company_tagline: 'Location de voitures',

  company_ice: '',

  company_rc: '',

  company_if: '',

  company_tp: '',

  company_cnss: '',

  default_franchise_amount: '0',

  legal_mention_fr: DEFAULT_LEGAL_FR,

  legal_mention_ar: '',

  currency: 'MAD',

  notification_return_days: '1',

  notification_doc_days: '30',

}



function SettingsSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {

  return (

    <section className="settings-section panel">

      <div className="settings-section-header">

        <h3>{title}</h3>

        {hint ? <p>{hint}</p> : null}

      </div>

      <div className="panel-body form-grid">{children}</div>

    </section>

  )

}



export default function SettingsPage() {

  const { t, lang, setLang } = useLang()

  const [form, setForm] = useState<SettingsForm>(EMPTY_FORM)

  const [logoPreview, setLogoPreview] = useState('')

  const [saved, setSaved] = useState(false)

  const [error, setError] = useState('')



  useEffect(() => {
    window.api.getSettings().then(async (s) => {
      setForm({
        company_name: s.company_name || '',
        company_logo: s.company_logo || '',
        company_phone: s.company_phone || '',
        company_whatsapp: s.company_whatsapp || '',
        company_email: s.company_email || '',
        company_address: s.company_address || '',
        company_city: s.company_city || '',
        company_hours: s.company_hours || '',
        company_about: s.company_about || '',
        company_fax: s.company_fax || '',
        company_tagline: s.company_tagline || 'Location de voitures',
        company_ice: s.company_ice || '',
        company_rc: s.company_rc || '',
        company_if: s.company_if || '',
        company_tp: s.company_tp || '',
        company_cnss: s.company_cnss || '',
        default_franchise_amount: s.default_franchise_amount || '0',
        legal_mention_fr: s.legal_mention_fr || DEFAULT_LEGAL_FR,
        legal_mention_ar: s.legal_mention_ar || '',
        currency: s.currency || 'MAD',
        notification_return_days: s.notification_return_days || '1',
        notification_doc_days: s.notification_doc_days || '30',
      })

      if (s.company_logo) {
        const url = await window.api.getCompanyLogoUrl(s.company_logo)
        setLogoPreview(url)
      } else {
        setLogoPreview('')
      }
    })
  }, [])



  const update = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {

    setForm((current) => ({ ...current, [key]: value }))

  }



  const onPickLogo = async () => {

    try {

      const picked = await window.api.pickCompanyLogo()

      if (!picked) return

      if (form.company_logo && form.company_logo !== picked.path) {

        await window.api.removeCompanyLogo(form.company_logo)

      }

      update('company_logo', picked.path)

      setLogoPreview(picked.url)

    } catch {

      setError(t.requiredField)

    }

  }



  const onRemoveLogo = async () => {

    if (form.company_logo) {

      await window.api.removeCompanyLogo(form.company_logo)

    }

    update('company_logo', '')

    setLogoPreview('')

  }



  const onSubmit = async (e: FormEvent) => {

    e.preventDefault()

    setError('')

    if (!form.company_phone.trim() || !form.company_whatsapp.trim() || !form.company_email.trim()) {

      setError(t.requiredField)

      return

    }

    await window.api.saveSettings({ ...form, language: lang })
    window.dispatchEvent(new Event('agency-settings-updated'))
    setSaved(true)

    setTimeout(() => setSaved(false), 2000)

  }



  return (

    <div className="settings-page">

      <PageHeader title={t.settings} subtitle={t.settingsSubtitle} />



      <form className="settings-form" onSubmit={onSubmit}>

        <SettingsSection title={t.visualIdentity} hint={t.visualIdentityHint}>

          <div className="field full">

            <label>{t.agencyLogo}</label>

            <div className="settings-logo-row">

              <div className="settings-logo-preview">

                {logoPreview ? <img src={logoPreview} alt={t.agencyLogo} /> : <span>{t.agencyLogo}</span>}

              </div>

              <div className="settings-logo-actions">

                <button type="button" className="btn secondary" onClick={onPickLogo}>

                  {t.chooseLogo}

                </button>

                {logoPreview ? (

                  <button type="button" className="btn ghost" onClick={onRemoveLogo}>

                    {t.removeLogo}

                  </button>

                ) : null}

              </div>

            </div>

          </div>

          <div className="field full">

            <label>{t.companyName}</label>

            <input className="input" value={form.company_name} onChange={(e) => update('company_name', e.target.value)} />

          </div>

        </SettingsSection>



        <SettingsSection title={t.contactInfo}>

          <div className="field">

            <label>{t.companyPhone} *</label>

            <input className="input" required value={form.company_phone} onChange={(e) => update('company_phone', e.target.value)} />

          </div>

          <div className="field">

            <label>{t.companyWhatsapp} *</label>

            <input className="input" required value={form.company_whatsapp} onChange={(e) => update('company_whatsapp', e.target.value)} />

            <span className="field-hint">{t.whatsappHint}</span>

          </div>

          <div className="field">

            <label>{t.companyEmail} *</label>

            <input className="input" type="email" required value={form.company_email} onChange={(e) => update('company_email', e.target.value)} />

          </div>

          <div className="field">

            <label>{t.language}</label>

            <select className="select" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>

              <option value="fr">{t.french}</option>

              <option value="ar">{t.arabic}</option>

            </select>

          </div>

          <div className="field full">

            <label>{t.companyAddress}</label>

            <input className="input" value={form.company_address} onChange={(e) => update('company_address', e.target.value)} />

          </div>

          <div className="field">

            <label>{t.companyCity}</label>

            <input className="input" value={form.company_city} onChange={(e) => update('company_city', e.target.value)} />

          </div>

          <div className="field">

            <label>{t.companyHours}</label>

            <input className="input" value={form.company_hours} onChange={(e) => update('company_hours', e.target.value)} />

          </div>

          <div className="field full">

            <label>{t.companyAbout}</label>

            <textarea className="textarea" rows={3} value={form.company_about} onChange={(e) => update('company_about', e.target.value)} />

          </div>

          <div className="field">

            <label>{t.companyFax}</label>

            <input className="input" value={form.company_fax} onChange={(e) => update('company_fax', e.target.value)} />

          </div>

        </SettingsSection>



        <SettingsSection title={t.legalIds} hint={t.legalIdsHint}>

          <div className="field">

            <label>{t.rcLabel}</label>

            <input className="input" value={form.company_rc} onChange={(e) => update('company_rc', e.target.value)} />

          </div>

          <div className="field">

            <label>{t.ifLabel}</label>

            <input className="input" value={form.company_if} onChange={(e) => update('company_if', e.target.value)} />

          </div>

          <div className="field">

            <label>{t.tpLabel}</label>

            <input className="input" value={form.company_tp} onChange={(e) => update('company_tp', e.target.value)} />

          </div>

          <div className="field">

            <label>{t.cnssLabel}</label>

            <input className="input" value={form.company_cnss} onChange={(e) => update('company_cnss', e.target.value)} />

          </div>

          <div className="field">

            <label>{t.iceLabel}</label>

            <input className="input" value={form.company_ice} onChange={(e) => update('company_ice', e.target.value)} />

          </div>

        </SettingsSection>



        <SettingsSection title={t.defaultFranchise}>

          <div className="field">

            <label>{t.defaultFranchise}</label>

            <div className="input-with-suffix">

              <input

                className="input"

                type="number"

                min={0}

                step={1}

                value={form.default_franchise_amount}

                onChange={(e) => update('default_franchise_amount', e.target.value)}

              />

              <span>DH</span>

            </div>

          </div>

          <div className="field full">

            <label>{t.legalMentionFr}</label>

            <textarea className="textarea" rows={4} value={form.legal_mention_fr} onChange={(e) => update('legal_mention_fr', e.target.value)} />

          </div>

          <div className="field full">

            <label>{t.legalMentionAr}</label>

            <textarea className="textarea textarea-rtl" rows={4} dir="rtl" value={form.legal_mention_ar} onChange={(e) => update('legal_mention_ar', e.target.value)} />

          </div>

        </SettingsSection>



        <SettingsSection title={t.notificationSettings} hint={t.notificationSettingsHint}>

          <div className="field">

            <label>{t.notificationReturnDays}</label>

            <input

              className="input"

              type="number"

              min={0}

              max={30}

              step={1}

              value={form.notification_return_days}

              onChange={(e) => update('notification_return_days', e.target.value)}

            />

          </div>

          <div className="field">

            <label>{t.notificationDocDays}</label>

            <input

              className="input"

              type="number"

              min={1}

              max={365}

              step={1}

              value={form.notification_doc_days}

              onChange={(e) => update('notification_doc_days', e.target.value)}

            />

          </div>

        </SettingsSection>



        <div className="settings-form-footer panel">

          <div className="panel-body" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>

            <button className="btn" type="submit">

              {t.save}

            </button>

            {saved ? <span className="settings-saved">{t.saved}</span> : null}

            {error ? <span className="settings-error">{error}</span> : null}

          </div>

        </div>

      </form>

    </div>

  )

}


