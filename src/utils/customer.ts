export function formatDisplayDate(value: string | undefined | null) {
  if (!value?.trim()) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('fr-FR')
}
