import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { writeJsonFileAtomic } from './storage'

export type LicenseType = 'trial_7d' | 'trial_5min' | 'lifetime'

export type LicenseStatus = {
  valid: boolean
  activated: boolean
  type: LicenseType | null
  activatedAt: string | null
  expiresAt: string | null
  daysRemaining: number | null
  minutesRemaining: number | null
  expired: boolean
  isTrial: boolean
}

type StoredLicense = {
  type: LicenseType | 'trial'
  activatedAt: string
  expiresAt: string | null
  signature: string
}

const TRIAL_MS: Record<'trial_7d' | 'trial_5min', number> = {
  trial_7d: 7 * 24 * 60 * 60 * 1000,
  trial_5min: 5 * 60 * 1000,
}

/** SHA-256 hashes of valid keys — plain keys never stored in source. */
const KEY_HASHES: Record<LicenseType, string> = {
  trial_7d: '0c971d968c7cb15694ca5758933903bd46e5b1abe2a671ff555f6f17d872721d',
  trial_5min: 'cdaa62a68cebea66f3c486260cee21730db10b6709f0927236aa4aeda6175ac8',
  lifetime: '9c88fe92f27cf54845a19b177c756c18342a9b63c854c81db892ccd653d7a19d',
}

const SIGN_SECRET = 'RCRM-LIC-v1|chouibak|rental-car-crm|2026'

let licenseFilePath = ''

export function initLicense(userDataPath: string) {
  licenseFilePath = path.join(userDataPath, 'license.dat')
}

function normalizeKey(raw: string) {
  return raw.trim().toUpperCase().replace(/\s+/g, '')
}

function hashKey(key: string) {
  return crypto.createHash('sha256').update(normalizeKey(key)).digest('hex')
}

function matchKeyType(key: string): LicenseType | null {
  const hash = hashKey(key)
  if (hash === KEY_HASHES.trial_7d) return 'trial_7d'
  if (hash === KEY_HASHES.trial_5min) return 'trial_5min'
  if (hash === KEY_HASHES.lifetime) return 'lifetime'
  return null
}

function normalizeStoredType(type: StoredLicense['type']): LicenseType {
  if (type === 'trial') return 'trial_7d'
  return type
}

function signPayload(type: LicenseType, activatedAt: string, expiresAt: string | null) {
  const payload = `${type}|${activatedAt}|${expiresAt ?? ''}`
  return crypto.createHmac('sha256', SIGN_SECRET).update(payload).digest('hex')
}

function verifyStoredLicense(data: StoredLicense): boolean {
  const type = normalizeStoredType(data.type)
  const expected = signPayload(type, data.activatedAt, data.expiresAt)
  try {
    return crypto.timingSafeEqual(Buffer.from(data.signature, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

function readStoredLicense(): (StoredLicense & { type: LicenseType }) | null {
  if (!licenseFilePath || !fs.existsSync(licenseFilePath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(licenseFilePath, 'utf8')) as StoredLicense
    if (!parsed?.type || !parsed.activatedAt || !parsed.signature) return null
    if (!verifyStoredLicense(parsed)) return null
    return { ...parsed, type: normalizeStoredType(parsed.type) }
  } catch {
    return null
  }
}

function writeStoredLicense(type: LicenseType) {
  const activatedAt = new Date().toISOString()
  const expiresAt =
    type === 'lifetime'
      ? null
      : new Date(Date.now() + TRIAL_MS[type]).toISOString()
  const signature = signPayload(type, activatedAt, expiresAt)
  const payload: StoredLicense = { type, activatedAt, expiresAt, signature }
  writeJsonFileAtomic(licenseFilePath, payload)
}

function buildStatus(stored: (StoredLicense & { type: LicenseType }) | null): LicenseStatus {
  if (!stored) {
    return {
      valid: false,
      activated: false,
      type: null,
      activatedAt: null,
      expiresAt: null,
      daysRemaining: null,
      minutesRemaining: null,
      expired: false,
      isTrial: false,
    }
  }

  const now = Date.now()
  if (stored.type === 'lifetime') {
    return {
      valid: true,
      activated: true,
      type: 'lifetime',
      activatedAt: stored.activatedAt,
      expiresAt: null,
      daysRemaining: null,
      minutesRemaining: null,
      expired: false,
      isTrial: false,
    }
  }

  const expiresMs = stored.expiresAt ? new Date(stored.expiresAt).getTime() : 0
  const expired = expiresMs <= now
  const msLeft = expired ? 0 : Math.max(0, expiresMs - now)
  const daysRemaining = Math.ceil(msLeft / (24 * 60 * 60 * 1000))
  const minutesRemaining = Math.ceil(msLeft / (60 * 1000))

  return {
    valid: !expired,
    activated: true,
    type: stored.type,
    activatedAt: stored.activatedAt,
    expiresAt: stored.expiresAt,
    daysRemaining: expired ? 0 : daysRemaining,
    minutesRemaining: expired ? 0 : minutesRemaining,
    expired,
    isTrial: true,
  }
}

export function getLicenseStatus(): LicenseStatus {
  return buildStatus(readStoredLicense())
}

export function assertLicenseValid() {
  const status = getLicenseStatus()
  if (!status.valid) {
    const err = new Error(status.expired ? 'LICENSE_EXPIRED' : 'LICENSE_REQUIRED')
    ;(err as Error & { code: string }).code = status.expired ? 'LICENSE_EXPIRED' : 'LICENSE_REQUIRED'
    throw err
  }
}

export function activateLicense(rawKey: string): { ok: true; status: LicenseStatus } | { ok: false; error: string } {
  const key = normalizeKey(rawKey)
  if (!key) return { ok: false, error: 'INVALID_KEY' }

  const type = matchKeyType(key)
  if (!type) return { ok: false, error: 'INVALID_KEY' }

  writeStoredLicense(type)
  return { ok: true, status: getLicenseStatus() }
}

export function isLicenseChannel(channel: string) {
  return channel.startsWith('license:')
}
