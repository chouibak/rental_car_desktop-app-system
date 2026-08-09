export function fileBasename(filePath: string | undefined | null) {
  if (!filePath?.trim()) return ''
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}
