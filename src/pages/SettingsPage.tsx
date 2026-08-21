import { FormEvent, useEffect, useState, type ReactNode } from 'react'

import { PageHeader, PasswordInput } from '../components/ui'

import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext'

import type { Lang, LicenseStatus } from '../types'



const DEFAULT_LEGAL_FR =

  'Chaque dommage touche la société pendant la période de location ; le locataire sera exposé à la responsabilité administrative et judiciaire jusqu\'à la décision finale, ainsi qu\'au paiement de tous les frais résultants.'



type SettingsForm = {

  company_name: string

  company_logo: string

  contract_conditions_image: string

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

  contract_conditions_image: '',

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



function isPdfFile(filePath: string) {
  return /\.pdf$/i.test(filePath || '')
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
  const { username } = useAuth()

  const [form, setForm] = useState<SettingsForm>(EMPTY_FORM)
  const [logoPreview, setLogoPreview] = useState('')
  const [conditionsPreview, setConditionsPreview] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [accountCurrentPassword, setAccountCurrentPassword] = useState('')
  const [accountNewUsername, setAccountNewUsername] = useState('')
  const [accountNewPassword, setAccountNewPassword] = useState('')
  const [accountConfirmPassword, setAccountConfirmPassword] = useState('')
  const [accountSaved, setAccountSaved] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [accountLoading, setAccountLoading] = useState(false)
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null)
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseLoading, setLicenseLoading] = useState(false)
  const [licenseSaved, setLicenseSaved] = useState(false)
  const [licenseError, setLicenseError] = useState('')



  useEffect(() => {
    setAccountNewUsername(username)
  }, [username])

  useEffect(() => {
    window.api.getLicenseStatus().then(setLicenseStatus).catch(() => setLicenseStatus(null))
  }, [])

  useEffect(() => {
    const loadSettings = async () => {
      const s = await window.api.getSettings()
      setForm({
        company_name: s.company_name || '',
        company_logo: s.company_logo || '',
        contract_conditions_image: s.contract_conditions_image || '',
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

      if (s.contract_conditions_image) {
        const url = await window.api.getContractConditionsUrl(s.contract_conditions_image)
        setConditionsPreview(url)
      } else {
        setConditionsPreview('')
      }
    }

    // Saving before this resolves would push the empty defaults over the stored settings.
    loadSettings()
      .then(() => setLoaded(true))
      .catch(() => setError(t.loadFailed))
  }, [t])



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



  const onPickConditions = async () => {

    try {

      const picked = await window.api.pickContractConditionsImage()

      if (!picked) return

      if (form.contract_conditions_image && form.contract_conditions_image !== picked.path) {

        await window.api.removeContractConditionsImage(form.contract_conditions_image)

      }

      update('contract_conditions_image', picked.path)

      setConditionsPreview(picked.url)

    } catch (err) {

      setError(String(err).includes('INVALID_CONDITIONS_FILE') ? t.contractConditionsInvalid : t.requiredField)

    }

  }



  const onRemoveConditions = async () => {

    if (form.contract_conditions_image) {

      await window.api.removeContractConditionsImage(form.contract_conditions_image)

    }

    update('contract_conditions_image', '')

    setConditionsPreview('')

  }



  const onAccountSubmit = async (e: FormEvent) => {

    e.preventDefault()

    setAccountError('')

    setAccountLoading(true)

    try {

      if (accountNewPassword && accountNewPassword !== accountConfirmPassword) {

        setAccountError(t.authPasswordMismatch)

        return

      }

      const result = await window.api.changeCredentials({

        currentPassword: accountCurrentPassword,

        newUsername: accountNewUsername.trim() !== username ? accountNewUsername.trim() : undefined,

        newPassword: accountNewPassword || undefined,

      })

      if (result.ok) {

        window.dispatchEvent(new CustomEvent('auth-updated', { detail: result.session }))

        setAccountCurrentPassword('')

        setAccountNewPassword('')

        setAccountConfirmPassword('')

        setAccountSaved(true)

        setTimeout(() => setAccountSaved(false), 2000)

      } else {

        const messages: Record<string, string> = {

          INVALID_PASSWORD: t.authInvalidPassword,

          WEAK_PASSWORD: t.authWeakPassword,

          NO_CHANGES: t.authNoChanges,

          INVALID_USERNAME: t.requiredField,

        }

        setAccountError(messages[result.error] || t.authError)

      }

    } catch {

      setAccountError(t.authError)

    } finally {

      setAccountLoading(false)

    }

  }



  const onLicenseActivate = async () => {
    setLicenseError('')
    setLicenseSaved(false)
    setLicenseLoading(true)
    try {
      const result = await window.api.activateLicense(licenseKey)
      if (result.ok) {
        setLicenseStatus(result.status)
        setLicenseKey('')
        setLicenseSaved(true)
        window.dispatchEvent(new Event('license-updated'))
        setTimeout(() => setLicenseSaved(false), 2000)
      } else {
        const messages: Record<string, string> = {
          INVALID_KEY: t.licenseInvalidKey,
          LIFETIME_ACTIVE: t.licenseLifetimeActive,
        }
        setLicenseError(messages[result.error] || t.licenseError)
      }
    } catch {
      setLicenseError(t.licenseError)
    } finally {
      setLicenseLoading(false)
    }
  }

  const licenseCurrentLabel = (() => {
    if (!licenseStatus?.activated) return t.licenseNotActivated
    if (licenseStatus.type === 'lifetime') return t.licenseTypeLifetime
    if (licenseStatus.expired) return t.licenseExpiredTitle
    if (licenseStatus.type === 'trial_5min') {
      const mins = licenseStatus.minutesRemaining ?? 0
      const remaining = mins <= 1 ? t.licenseMinutesLeftOne : t.licenseMinutesLeft.replace('{n}', String(mins))
      return `${t.licenseTypeTrial5min} — ${remaining}`
    }
    const days = licenseStatus.daysRemaining ?? 0
    const remaining = days <= 1 ? t.licenseDaysLeftOne : t.licenseDaysLeft.replace('{n}', String(days))
    return `${t.licenseTypeTrial} — ${remaining}`
  })()

  const onSubmit = async (e: FormEvent) => {

    e.preventDefault()

    setError('')

    if (!loaded || saving) return

    if (!form.company_phone.trim() || !form.company_whatsapp.trim() || !form.company_email.trim()) {

      setError(t.requiredField)

      return

    }

    const returnDays = Number(form.notification_return_days)
    const docDays = Number(form.notification_doc_days)
    if (!Number.isInteger(returnDays) || returnDays < 0 || returnDays > 30) {
      setError(t.notificationSettingsHint)
      return
    }
    if (!Number.isInteger(docDays) || docDays < 0 || docDays > 90) {
      setError(t.notificationSettingsHint)
      return
    }

    setSaving(true)
    try {
      await window.api.saveSettings({ ...form, language: lang })
      window.dispatchEvent(new Event('agency-settings-updated'))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      setError(t.saveFailed)
    } finally {
      setSaving(false)
    }

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



        <SettingsSection title={t.contractConditions} hint={t.contractConditionsHint}>

          <div className="field full">

            <label>{t.contractConditionsImage}</label>

            <div className="settings-logo-row">

              <div className="settings-conditions-preview">

                {isPdfFile(form.contract_conditions_image) ? (
                  <span className="settings-conditions-pdf">{t.contractConditionsPdf}</span>
                ) : conditionsPreview ? (
                  <img src={conditionsPreview} alt={t.contractConditionsImage} />
                ) : (
                  <span>{t.contractConditionsEmpty}</span>
                )}

              </div>

              <div className="settings-logo-actions">

                <button type="button" className="btn secondary" onClick={onPickConditions}>

                  {t.chooseConditionsImage}

                </button>

                {form.contract_conditions_image ? (

                  <button type="button" className="btn ghost" onClick={onRemoveConditions}>

                    {t.removeConditionsImage}

                  </button>

                ) : null}

              </div>

            </div>

            <span className="field-hint">{t.contractConditionsTypes}</span>

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



        <SettingsSection title={t.licenseSettings} hint={t.licenseSettingsHint}>
          <div className="field full">
            <label>{t.licenseCurrent}</label>
            <div className="settings-license-status">
              <span className={`settings-license-badge${licenseStatus?.type === 'lifetime' ? ' settings-license-badge--life' : licenseStatus?.isTrial ? ' settings-license-badge--trial' : ''}`}>
                {licenseCurrentLabel}
              </span>
            </div>
          </div>
          <div className="field full">
            <label htmlFor="settings-license-key">{t.licenseKeyLabel}</label>
            <input
              id="settings-license-key"
              className="input"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (licenseKey.trim() && !licenseLoading) void onLicenseActivate()
                }
              }}
              placeholder={t.licenseKeyPlaceholder}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="field-hint">{t.licenseKeyHint}</span>
          </div>
          <div className="field full settings-account-actions">
            <button
              type="button"
              className="btn secondary"
              disabled={licenseLoading || !licenseKey.trim()}
              onClick={onLicenseActivate}
            >
              {licenseLoading ? t.loading : t.licenseActivate}
            </button>
            {licenseSaved ? <span className="settings-saved">{t.licenseActivateSuccess}</span> : null}
            {licenseError ? <span className="settings-error">{licenseError}</span> : null}
          </div>
        </SettingsSection>

        <SettingsSection title={t.authAccount} hint={t.authAccountHint}>

          <div className="field">

            <label>{t.authUsernameLabel}</label>

            <input

              className="input"

              value={accountNewUsername}

              onChange={(e) => setAccountNewUsername(e.target.value)}

              autoComplete="username"

            />

          </div>

          <div className="field">

            <label>{t.authCurrentPassword}</label>

            <PasswordInput

              value={accountCurrentPassword}

              onChange={(e) => setAccountCurrentPassword(e.target.value)}

              autoComplete="current-password"

            />

          </div>

          <div className="field">

            <label>{t.authNewPassword}</label>

            <PasswordInput

              value={accountNewPassword}

              onChange={(e) => setAccountNewPassword(e.target.value)}

              autoComplete="new-password"

            />

          </div>

          <div className="field">

            <label>{t.authConfirmPassword}</label>

            <PasswordInput

              value={accountConfirmPassword}

              onChange={(e) => setAccountConfirmPassword(e.target.value)}

              autoComplete="new-password"

            />

          </div>

          <div className="field full settings-account-actions">

            <button

              type="button"

              className="btn secondary"

              disabled={accountLoading || !accountCurrentPassword}

              onClick={onAccountSubmit}

            >

              {accountLoading ? t.loading : t.authChangeCredentials}

            </button>

            {accountSaved ? <span className="settings-saved">{t.authCredentialsUpdated}</span> : null}

            {accountError ? <span className="settings-error">{accountError}</span> : null}

          </div>

        </SettingsSection>



        <div className="settings-form-footer panel form-actions--sticky">

          <div className="panel-body" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>

            <button className="btn" type="submit" disabled={!loaded || saving}>

              {saving ? t.loading : t.save}

            </button>

            {saved ? <span className="settings-saved">{t.saved}</span> : null}

            {error ? <span className="settings-error">{error}</span> : null}

          </div>

        </div>

      </form>

    </div>

  )

}


