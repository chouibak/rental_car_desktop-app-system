import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export type AuthSession = {
  authenticated: boolean
  username: string | null
  remember: boolean
}

type DbHelpers = {
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
  run: (sql: string, params?: unknown[]) => void
  now: () => string
}

type StoredSession = {
  token: string
  username: string
  expiresAt: string
  remember: boolean
  signature: string
}

type AppUserRow = {
  id: number
  username: string
  password_salt: string
  password_hash: string
}

const SESSION_SECRET = 'RCRM-AUTH-v1|chouibak|rental-car-crm|2026'
const DEFAULT_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'admin123'
const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000

let db: DbHelpers | null = null
let sessionFilePath = ''
let activeToken: string | null = null
let activeUsername: string | null = null
let activeRemember = false

function requireDb() {
  if (!db) throw new Error('AUTH_NOT_INITIALIZED')
  return db
}

function hashPassword(password: string, saltHex?: string) {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return {
    salt: salt.toString('hex'),
    hash: hash.toString('hex'),
  }
}

function verifyPassword(password: string, saltHex: string, hashHex: string) {
  const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64)
  try {
    return crypto.timingSafeEqual(derived, Buffer.from(hashHex, 'hex'))
  } catch {
    return false
  }
}

function signSession(token: string, username: string, expiresAt: string) {
  const payload = `${token}|${username}|${expiresAt}`
  return crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex')
}

function createAuthSchema() {
  requireDb().run(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
}

function seedDefaultUser() {
  const helpers = requireDb()
  const existing = helpers.queryOne<{ id: number }>('SELECT id FROM app_users WHERE id = 1')
  if (existing) return

  const { salt, hash } = hashPassword(DEFAULT_PASSWORD)
  helpers.run(
    'INSERT INTO app_users (id, username, password_salt, password_hash, updated_at) VALUES (1, ?, ?, ?, ?)',
    [DEFAULT_USERNAME, salt, hash, helpers.now()],
  )
}

function getUserRow(): AppUserRow | null {
  return requireDb().queryOne<AppUserRow>(
    'SELECT id, username, password_salt, password_hash FROM app_users WHERE id = 1',
  )
}

function clearActiveSession() {
  activeToken = null
  activeUsername = null
  activeRemember = false
  if (sessionFilePath && fs.existsSync(sessionFilePath)) {
    fs.unlinkSync(sessionFilePath)
  }
}

function writePersistedSession(token: string, username: string, remember: boolean) {
  if (!remember || !sessionFilePath) return
  const expiresAt = new Date(Date.now() + REMEMBER_MS).toISOString()
  const signature = signSession(token, username, expiresAt)
  const payload: StoredSession = { token, username, expiresAt, remember, signature }
  fs.writeFileSync(sessionFilePath, JSON.stringify(payload), 'utf8')
}

function readPersistedSession(): StoredSession | null {
  if (!sessionFilePath || !fs.existsSync(sessionFilePath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionFilePath, 'utf8')) as StoredSession
    if (!parsed?.token || !parsed.username || !parsed.expiresAt || !parsed.signature) return null
    const expected = signSession(parsed.token, parsed.username, parsed.expiresAt)
    if (!crypto.timingSafeEqual(Buffer.from(parsed.signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return null
    }
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) return null
    const user = getUserRow()
    if (!user || user.username.toLowerCase() !== parsed.username.toLowerCase()) return null
    return parsed
  } catch {
    return null
  }
}

function setActiveSession(token: string, username: string, remember: boolean) {
  activeToken = token
  activeUsername = username
  activeRemember = remember
  if (remember) {
    writePersistedSession(token, username, true)
  } else if (sessionFilePath && fs.existsSync(sessionFilePath)) {
    fs.unlinkSync(sessionFilePath)
  }
}

function restorePersistedSession() {
  const stored = readPersistedSession()
  if (!stored) return
  activeToken = stored.token
  activeUsername = stored.username
  activeRemember = stored.remember
}

export function initAuth(userDataPath: string, helpers: DbHelpers) {
  db = helpers
  sessionFilePath = path.join(userDataPath, 'auth-session.dat')
  createAuthSchema()
  seedDefaultUser()
  restorePersistedSession()
}

export function getSession(): AuthSession {
  if (activeToken && activeUsername) {
    const user = getUserRow()
    if (user && user.username.toLowerCase() === activeUsername.toLowerCase()) {
      return { authenticated: true, username: user.username, remember: activeRemember }
    }
    clearActiveSession()
  }

  const stored = readPersistedSession()
  if (stored) {
    activeToken = stored.token
    activeUsername = stored.username
    activeRemember = stored.remember
    return { authenticated: true, username: stored.username, remember: stored.remember }
  }

  return { authenticated: false, username: null, remember: false }
}

export function assertAuthenticated() {
  const session = getSession()
  if (!session.authenticated) {
    const err = new Error('AUTH_REQUIRED')
    ;(err as Error & { code: string }).code = 'AUTH_REQUIRED'
    throw err
  }
}

export function login(
  username: string,
  password: string,
  remember = false,
): { ok: true; session: AuthSession } | { ok: false; error: string } {
  const normalizedUsername = username.trim()
  if (!normalizedUsername || !password) {
    return { ok: false, error: 'INVALID_CREDENTIALS' }
  }

  const user = getUserRow()
  if (!user || user.username.toLowerCase() !== normalizedUsername.toLowerCase()) {
    return { ok: false, error: 'INVALID_CREDENTIALS' }
  }

  if (!verifyPassword(password, user.password_salt, user.password_hash)) {
    return { ok: false, error: 'INVALID_CREDENTIALS' }
  }

  const token = crypto.randomBytes(32).toString('hex')
  setActiveSession(token, user.username, remember)
  return { ok: true, session: getSession() }
}

export function logout(): AuthSession {
  clearActiveSession()
  return getSession()
}

export function changeCredentials(input: {
  currentPassword: string
  newUsername?: string
  newPassword?: string
}):
  | { ok: true; session: AuthSession }
  | { ok: false; error: string } {
  assertAuthenticated()

  const user = getUserRow()
  if (!user) return { ok: false, error: 'USER_NOT_FOUND' }

  if (!verifyPassword(input.currentPassword, user.password_salt, user.password_hash)) {
    return { ok: false, error: 'INVALID_PASSWORD' }
  }

  const nextUsername = input.newUsername?.trim() || user.username
  const nextPassword = input.newPassword?.trim() || ''

  if (!nextUsername) return { ok: false, error: 'INVALID_USERNAME' }
  if (nextPassword && nextPassword.length < 6) return { ok: false, error: 'WEAK_PASSWORD' }
  if (nextUsername.toLowerCase() === user.username.toLowerCase() && !nextPassword) {
    return { ok: false, error: 'NO_CHANGES' }
  }

  const passwordData = nextPassword
    ? hashPassword(nextPassword)
    : { salt: user.password_salt, hash: user.password_hash }

  requireDb().run(
    'UPDATE app_users SET username = ?, password_salt = ?, password_hash = ?, updated_at = ? WHERE id = 1',
    [nextUsername, passwordData.salt, passwordData.hash, requireDb().now()],
  )

  if (activeToken && activeUsername) {
    setActiveSession(activeToken, nextUsername, activeRemember)
  }

  return { ok: true, session: getSession() }
}

export function isAuthExemptChannel(channel: string) {
  return channel === 'auth:login' || channel === 'auth:session' || channel === 'auth:logout'
}

export function isAuthChannel(channel: string) {
  return channel.startsWith('auth:')
}

export function getDefaultCredentialsHint() {
  return { username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD }
}
