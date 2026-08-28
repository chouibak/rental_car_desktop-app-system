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
  activeKeyHash?: string
  usedKeyHashes?: string[]
  signature: string
}

const TRIAL_MS: Record<'trial_7d' | 'trial_5min', number> = {
  trial_7d: 7 * 24 * 60 * 60 * 1000,
  trial_5min: 5 * 60 * 1000,
}

/** SHA-256 hashes of valid keys — plain keys never stored in source. */
const KEY_HASHES: Record<LicenseType, string[]> = {
  trial_7d: [
    '6a0ee89b146acaa6eb0a557f47e0c0aab4280423808a32ec7f4ad862f71df1ac',
    '6622aef0440bf4608541d8e0fb8d48a9bfe86c1155f6c39b2b422c4e9e0a3899',
    '54b85fa8a1c172a26a0db22910ec25c76701b333c9729587d28bddc996c389bc',
    'b7d13bdeb3cf3c8399b3ed432f23403459b393ecd16c821dcc578787a29f8483',
    '86cbb6f445bd848688d9559a08a1de339068372542dd56dc75f3d9db4d822db1',
    '0c971d968c7cb15694ca5758933903bd46e5b1abe2a671ff555f6f17d872721d',
  ],
  trial_5min: [
    'cdaa62a68cebea66f3c486260cee21730db10b6709f0927236aa4aeda6175ac8',
  ],
  lifetime: [
    'd8a0cb4c47ed83255b82224e6ac56a9c9d5b5b0e69345220a2b6ce46b32339f9',
    'a08bb07dcc6743d11b732557f23560ad811e1d9933d51859866e94c55d8ce007',
    '9c88fe92f27cf54845a19b177c756c18342a9b63c854c81db892ccd653d7a19d',
  ],
}

const SIGN_SECRET = 'RCRM-LIC-v1|chouibak|rental-car-crm|2026'

let licenseFilePath = ''

export function initLicense(userDataPath: string) {
  licenseFilePath = path.join(userDataPath, 'license.dat')
}

function normalizeKey(raw: string) {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '')
}

function hashKey(key: string) {
  return crypto.createHash('sha256').update(normalizeKey(key)).digest('hex')
}

function matchKeyType(key: string): LicenseType | null {
  const hash = hashKey(key)
  if (KEY_HASHES.trial_7d.includes(hash)) return 'trial_7d'
  if (KEY_HASHES.trial_5min.includes(hash)) return 'trial_5min'
  if (KEY_HASHES.lifetime.includes(hash)) return 'lifetime'
  return null
}

function normalizeStoredType(type: StoredLicense['type']): LicenseType {
  if (type === 'trial') return 'trial_7d'
  return type
}

function signPayload(
  type: LicenseType,
  activatedAt: string,
  expiresAt: string | null,
  activeKeyHash: string = '',
  usedKeyHashes: string[] = []
) {
  const sortedUsed = [...usedKeyHashes].sort().join(',')
  const payload = `${type}|${activatedAt}|${expiresAt ?? ''}|${activeKeyHash}|${sortedUsed}`
  return crypto.createHmac('sha256', SIGN_SECRET).update(payload).digest('hex')
}

function verifyStoredLicense(data: StoredLicense): boolean {
  const type = normalizeStoredType(data.type)
  const active = data.activeKeyHash ?? ''
  const used = data.usedKeyHashes ?? []

  // Check new signature format
  const expectedNew = signPayload(type, data.activatedAt, data.expiresAt, active, used)
  try {
    if (crypto.timingSafeEqual(Buffer.from(data.signature, 'hex'), Buffer.from(expectedNew, 'hex'))) {
      return true
    }
  } catch {}

  // Fallback check legacy signature format
  const legacyPayload = `${type}|${data.activatedAt}|${data.expiresAt ?? ''}`
  const expectedLegacy = crypto.createHmac('sha256', SIGN_SECRET).update(legacyPayload).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(data.signature, 'hex'), Buffer.from(expectedLegacy, 'hex'))
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

function writeStoredLicense(type: LicenseType, activeKeyHash: string, usedKeyHashes: string[]) {
  const activatedAt = new Date().toISOString()
  const expiresAt =
    type === 'lifetime'
      ? null
      : new Date(Date.now() + TRIAL_MS[type]).toISOString()
  const signature = signPayload(type, activatedAt, expiresAt, activeKeyHash, usedKeyHashes)
  const payload: StoredLicense = {
    type,
    activatedAt,
    expiresAt,
    activeKeyHash,
    usedKeyHashes,
    signature,
  }
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

  const hash = hashKey(key)
  const type = matchKeyType(key)
  if (!type) return { ok: false, error: 'INVALID_KEY' }

  const stored = readStoredLicense()
  const usedList = stored?.usedKeyHashes ?? (stored?.activeKeyHash ? [stored.activeKeyHash] : [])
  const usedSet = new Set(usedList)

  if (usedSet.has(hash)) {
    return { ok: false, error: 'KEY_ALREADY_USED' }
  }

  const current = getLicenseStatus()
  if (current.type === 'lifetime' && type !== 'lifetime') {
    return { ok: false, error: 'LIFETIME_ACTIVE' }
  }

  usedSet.add(hash)
  writeStoredLicense(type, hash, Array.from(usedSet))
  return { ok: true, status: getLicenseStatus() }
}

export function isLicenseChannel(channel: string) {
  return channel.startsWith('license:')
}
