import type { Database } from 'sql.js'
import { deleteChauffeurStorage, moveToChauffeurStorage } from './chauffeur-storage'
import { deleteFileIfExists } from './storage'
import { mergeDefined } from './input-utils'

export type ChauffeurRecord = {
  id: number
  name: string
  phone: string
  birth_date: string
  birth_place: string
  nationality: string
  address: string
  cin_number: string
  cin_pdf_path: string
  cin_issue_date: string
  cin_expiry_date: string
  passport_number: string
  passport_pdf_path: string
  passport_issue_date: string
  passport_expiry_date: string
  license_number: string
  license_pdf_path: string
  license_issue_date: string
  license_expiry_date: string
  is_active: number
  notes: string
  created_at: string
  updated_at: string
}

export type ChauffeurInput = {
  name: string
  phone?: string
  birth_date?: string
  birth_place?: string
  nationality?: string
  address?: string
  cin_number?: string
  cin_pdf_path?: string
  cin_issue_date?: string
  cin_expiry_date?: string
  passport_number?: string
  passport_pdf_path?: string
  passport_issue_date?: string
  passport_expiry_date?: string
  license_number?: string
  license_pdf_path?: string
  license_issue_date?: string
  license_expiry_date?: string
  is_active?: boolean | number
  notes?: string
}

export type ChauffeurFilters = {
  q?: string
  activeOnly?: boolean
}

type DbHelpers = {
  queryAll: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[]
  queryOne: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null
  run: (sql: string, params?: unknown[]) => void
  runInsert: (sql: string, params?: unknown[]) => number
  now: () => string
}

const PDF_COLUMNS = ['cin_pdf_path', 'passport_pdf_path', 'license_pdf_path'] as const

export function createChauffeursSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS chauffeurs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      birth_date TEXT DEFAULT '',
      birth_place TEXT DEFAULT '',
      nationality TEXT DEFAULT '',
      address TEXT DEFAULT '',
      cin_number TEXT DEFAULT '',
      cin_pdf_path TEXT DEFAULT '',
      cin_issue_date TEXT DEFAULT '',
      cin_expiry_date TEXT DEFAULT '',
      passport_number TEXT DEFAULT '',
      passport_pdf_path TEXT DEFAULT '',
      passport_issue_date TEXT DEFAULT '',
      passport_expiry_date TEXT DEFAULT '',
      license_number TEXT DEFAULT '',
      license_pdf_path TEXT DEFAULT '',
      license_issue_date TEXT DEFAULT '',
      license_expiry_date TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT DEFAULT '',
      created_at TEXT,
      updated_at TEXT
    );
  `)
}

function normalizeChauffeurInput(data: ChauffeurInput) {
  const name = data.name?.trim() || ''
  if (!name) throw new Error('NAME_REQUIRED')

  return {
    name,
    phone: data.phone?.trim() ?? '',
    birth_date: data.birth_date ?? '',
    birth_place: data.birth_place?.trim() ?? '',
    nationality: data.nationality?.trim() ?? '',
    address: data.address?.trim() ?? '',
    cin_number: data.cin_number?.trim() ?? '',
    cin_pdf_path: data.cin_pdf_path ?? '',
    cin_issue_date: data.cin_issue_date ?? '',
    cin_expiry_date: data.cin_expiry_date ?? '',
    passport_number: data.passport_number?.trim() ?? '',
    passport_pdf_path: data.passport_pdf_path ?? '',
    passport_issue_date: data.passport_issue_date ?? '',
    passport_expiry_date: data.passport_expiry_date ?? '',
    license_number: data.license_number?.trim() ?? '',
    license_pdf_path: data.license_pdf_path ?? '',
    license_issue_date: data.license_issue_date ?? '',
    license_expiry_date: data.license_expiry_date ?? '',
    is_active: data.is_active === false || data.is_active === 0 ? 0 : 1,
    notes: data.notes?.trim() ?? '',
  }
}

function finalizePdfPaths(chauffeurId: number, data: ReturnType<typeof normalizeChauffeurInput>) {
  const result = { ...data }
  for (const col of PDF_COLUMNS) {
    const current = result[col]
    if (current) {
      result[col] = moveToChauffeurStorage(current, chauffeurId)
    }
  }
  return result
}

function deleteRemovedPdfs(previous: ChauffeurRecord | null, next: ReturnType<typeof normalizeChauffeurInput>) {
  if (!previous) return
  for (const col of PDF_COLUMNS) {
    const oldPath = previous[col]
    const newPath = next[col]
    if (oldPath && oldPath !== newPath) deleteFileIfExists(oldPath)
  }
}

export function createChauffeursApi(helpers: DbHelpers) {
  return {
    listChauffeurs(filters?: ChauffeurFilters): ChauffeurRecord[] {
      const clauses: string[] = []
      const params: unknown[] = []

      if (filters?.activeOnly) {
        clauses.push('is_active = 1')
      }
      if (filters?.q?.trim()) {
        clauses.push('(name LIKE ? OR phone LIKE ? OR cin_number LIKE ? OR license_number LIKE ?)')
        const like = `%${filters.q.trim()}%`
        params.push(like, like, like, like)
      }

      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      return helpers.queryAll<ChauffeurRecord>(
        `SELECT * FROM chauffeurs ${where} ORDER BY name ASC, id DESC`,
        params,
      )
    },

    getChauffeur(id: number): ChauffeurRecord | null {
      return helpers.queryOne<ChauffeurRecord>('SELECT * FROM chauffeurs WHERE id = ?', [id])
    },

    createChauffeur(data: ChauffeurInput) {
      const normalized = normalizeChauffeurInput(data)
      const t = helpers.now()

      const id = helpers.runInsert(
        `INSERT INTO chauffeurs (
          name, phone, birth_date, birth_place, nationality, address,
          cin_number, cin_pdf_path, cin_issue_date, cin_expiry_date,
          passport_number, passport_pdf_path, passport_issue_date, passport_expiry_date,
          license_number, license_pdf_path, license_issue_date, license_expiry_date,
          is_active, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          normalized.name,
          normalized.phone,
          normalized.birth_date,
          normalized.birth_place,
          normalized.nationality,
          normalized.address,
          normalized.cin_number,
          '',
          normalized.cin_issue_date,
          normalized.cin_expiry_date,
          normalized.passport_number,
          '',
          normalized.passport_issue_date,
          normalized.passport_expiry_date,
          normalized.license_number,
          '',
          normalized.license_issue_date,
          normalized.license_expiry_date,
          normalized.is_active,
          normalized.notes,
          t,
          t,
        ],
      )

      const withPdfs = finalizePdfPaths(id, normalized)
      helpers.run(
        `UPDATE chauffeurs SET
          cin_pdf_path = ?, passport_pdf_path = ?, license_pdf_path = ?, updated_at = ?
         WHERE id = ?`,
        [withPdfs.cin_pdf_path, withPdfs.passport_pdf_path, withPdfs.license_pdf_path, t, id],
      )

      const created = this.getChauffeur(id)
      if (!created) throw new Error('CHAUFFEUR_CREATE_FAILED')
      return created
    },

    updateChauffeur(id: number, data: Partial<ChauffeurInput>) {
      const existing = helpers.queryOne<ChauffeurRecord>('SELECT * FROM chauffeurs WHERE id = ?', [id])
      if (!existing) throw new Error('CHAUFFEUR_NOT_FOUND')

      const normalized = normalizeChauffeurInput(mergeDefined(existing as ChauffeurInput, data))
      deleteRemovedPdfs(existing, normalized)
      const withPdfs = finalizePdfPaths(id, normalized)
      const t = helpers.now()

      helpers.run(
        `UPDATE chauffeurs SET
          name = ?, phone = ?, birth_date = ?, birth_place = ?, nationality = ?, address = ?,
          cin_number = ?, cin_pdf_path = ?, cin_issue_date = ?, cin_expiry_date = ?,
          passport_number = ?, passport_pdf_path = ?, passport_issue_date = ?, passport_expiry_date = ?,
          license_number = ?, license_pdf_path = ?, license_issue_date = ?, license_expiry_date = ?,
          is_active = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
        [
          withPdfs.name,
          withPdfs.phone,
          withPdfs.birth_date,
          withPdfs.birth_place,
          withPdfs.nationality,
          withPdfs.address,
          withPdfs.cin_number,
          withPdfs.cin_pdf_path,
          withPdfs.cin_issue_date,
          withPdfs.cin_expiry_date,
          withPdfs.passport_number,
          withPdfs.passport_pdf_path,
          withPdfs.passport_issue_date,
          withPdfs.passport_expiry_date,
          withPdfs.license_number,
          withPdfs.license_pdf_path,
          withPdfs.license_issue_date,
          withPdfs.license_expiry_date,
          withPdfs.is_active,
          withPdfs.notes,
          t,
          id,
        ],
      )

      const updated = this.getChauffeur(id)
      if (!updated) throw new Error('CHAUFFEUR_NOT_FOUND')
      return updated
    },

    deleteChauffeur(id: number) {
      const reserved = helpers.queryOne(
        `SELECT id FROM reservations WHERE chauffeur_id = ? AND status IN ('pending', 'confirmed') LIMIT 1`,
        [id],
      )
      if (reserved) throw new Error('CHAUFFEUR_HAS_RESERVATIONS')

      const chauffeur = helpers.queryOne<ChauffeurRecord>('SELECT * FROM chauffeurs WHERE id = ?', [id])
      if (!chauffeur) throw new Error('CHAUFFEUR_NOT_FOUND')

      for (const col of PDF_COLUMNS) {
        deleteFileIfExists(chauffeur[col])
      }

      helpers.run('DELETE FROM chauffeurs WHERE id = ?', [id])
      deleteChauffeurStorage(id)
      return { ok: true }
    },
  }
}

export function driverSnapshotFromChauffeur(chauffeur: Record<string, string>) {
  return {
    driver1_name: chauffeur.name ?? '',
    driver1_birth_date: chauffeur.birth_date ?? '',
    driver1_birth_place: chauffeur.birth_place ?? '',
    driver1_nationality: chauffeur.nationality ?? '',
    driver1_address: chauffeur.address ?? '',
    driver1_phone: chauffeur.phone ?? '',
    driver1_passport_number: chauffeur.passport_number ?? '',
    driver1_passport_issued_at: chauffeur.passport_issue_date ?? '',
    driver1_passport_expires_at: chauffeur.passport_expiry_date ?? '',
    driver1_cin_number: chauffeur.cin_number ?? '',
    driver1_cin_issued_at: chauffeur.cin_issue_date ?? '',
    driver1_cin_expires_at: chauffeur.cin_expiry_date ?? '',
    driver1_license_number: chauffeur.license_number ?? '',
    driver1_license_issued_at: chauffeur.license_issue_date ?? '',
    driver1_license_expires_at: chauffeur.license_expiry_date ?? '',
  }
}
