import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(__filename)
const { ArabicShaper } = require('arabic-persian-reshaper') as {
  ArabicShaper: { convertArabic: (text: string) => string }
}

/**
 * PDFKit draws LTR and does not shape Arabic.
 * 1) Convert to presentation forms (joined glyphs) for the full line
 * 2) Reverse word order only (never reverse characters — that breaks joins)
 * 3) Draw with align:left so the line reads RTL visually
 */
export function prepareArabicForPdf(text: string) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return ''

  return trimmed
    .split('\n')
    .map((line) => {
      const shaped = ArabicShaper.convertArabic(line)
      const words = shaped.split(/\s+/).filter(Boolean)
      return words.reverse().join(' ')
    })
    .join('\n')
}

export function resolveArabicFontPath() {
  const windir = process.env.WINDIR || 'C:\\Windows'
  const fontsDir = path.join(windir, 'Fonts')
  // Prefer fonts with strong Arabic Presentation Forms coverage
  const candidates = [
    path.join(fontsDir, 'tahoma.ttf'),
    path.join(fontsDir, 'arial.ttf'),
    path.join(fontsDir, 'segoeui.ttf'),
    path.join(fontsDir, 'tradbdo.ttf'),
    path.join(fontsDir, 'arialbd.ttf'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}
