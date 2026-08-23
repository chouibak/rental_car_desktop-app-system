export function fileBasename(filePath: string | undefined | null) {
  if (!filePath?.trim()) return ''
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}

/** Hide ugly storage UUIDs — show a friendly label instead. */
export function formatDocumentFileLabel(filePath: string, labels?: { pdf: string; image: string; file: string }) {
  const base = fileBasename(filePath)
  if (!base) return ''
  const fallback = labels ?? { pdf: 'Document PDF', image: 'Document image', file: 'Fichier joint' }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\./i.test(base)) {
    const ext = base.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') return fallback.pdf
    if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return fallback.image
    return fallback.file
  }

  return base
}
