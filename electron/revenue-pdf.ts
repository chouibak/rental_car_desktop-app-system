import { dialog, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import { getDbApi } from './db'
import type { RevenuePeriodSummary } from './revenue-db'

const MONTHS_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
]

const METHOD_FR: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte',
  bank_transfer: 'Virement',
}

const GREEN = '#047857'
const GREEN_SOFT = '#ecfdf5'
const AMBER = '#b45309'
const AMBER_SOFT = '#fffbeb'
const RED = '#b91c1c'
const RED_SOFT = '#fef2f2'
const INK = '#0f172a'
const MUTED = '#64748b'
const LINE = '#e2e8f0'
const SLATE = '#334155'

function money(value: number) {
  const n = Math.round((Number(value) || 0) * 100) / 100
  const sign = n < 0 ? '-' : ''
  const [intPart, dec] = Math.abs(n).toFixed(2).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${sign}${grouped},${dec} DH`
}

function periodLabel(year: number, month: number) {
  return `${MONTHS_FR[month - 1] || month} ${year}`
}

function writePdf(outputPath: string, summary: RevenuePeriodSummary, settings: Record<string, string>) {
  return new Promise<string>((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    const doc = new PDFDocument({ size: 'A4', margin: 0 })
    const stream = fs.createWriteStream(outputPath)
    doc.pipe(stream)

    const pageW = doc.page.width
    const pageH = doc.page.height
    const m = 36
    const contentW = pageW - m * 2
    const company = String(settings.company_name ?? '').trim() || 'LocAgence Pro'
    const city = [settings.company_address, settings.company_city].filter(Boolean).join(' · ')
    const netPositive = summary.net >= 0

    doc.rect(0, 0, pageW, 118).fill(GREEN)
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11).text(company, m, 28, { width: contentW })
    doc.font('Helvetica').fontSize(9).fillColor('#d1fae5').text('Résumé financier', m, 48, { width: contentW })
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#fff').text(periodLabel(summary.year, summary.month), m, 68, {
      width: contentW,
    })
    if (city) {
      doc.font('Helvetica').fontSize(8).fillColor('#a7f3d0').text(city, m, 96, { width: contentW })
    }

    let y = 140
    const gap = 12
    const cardW = (contentW - gap * 2) / 3
    const cards: Array<{ label: string; value: string; bg: string; color: string }> = [
      { label: 'Recettes', value: money(summary.revenue), bg: GREEN_SOFT, color: GREEN },
      { label: 'Dépenses', value: money(summary.expenses), bg: AMBER_SOFT, color: AMBER },
      {
        label: 'Résultat net',
        value: money(summary.net),
        bg: netPositive ? GREEN_SOFT : RED_SOFT,
        color: netPositive ? GREEN : RED,
      },
    ]

    cards.forEach((card, index) => {
      const x = m + index * (cardW + gap)
      doc.roundedRect(x, y, cardW, 72, 10).fill(card.bg)
      doc.roundedRect(x, y, 5, 72, 2).fill(card.color)
      doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(card.label.toUpperCase(), x + 16, y + 14, {
        width: cardW - 24,
      })
      doc.fillColor(card.color).font('Helvetica-Bold').fontSize(13).text(card.value, x + 16, y + 36, {
        width: cardW - 24,
      })
    })

    y += 92
    doc.roundedRect(m, y, contentW, 42, 8).fillAndStroke('#f8fafc', LINE)
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('Paiements encaissés', m + 16, y + 14)
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(String(summary.payments_count), m, y + 12, {
      width: contentW - 16,
      align: 'right',
    })

    y += 62
    const colW = (contentW - gap) / 2
    const leftX = m
    const rightX = m + colW + gap
    const tableTop = y

    const sources = [
      ['Contrats', money(summary.revenue_by_source.contracts)],
      ['Réservations', money(summary.revenue_by_source.reservations)],
    ]
    const methods =
      summary.by_payment_method.length > 0
        ? summary.by_payment_method.map((row) => [METHOD_FR[row.method] || row.method, money(row.amount)])
        : [['Aucune donnée', '—']]

    const tableH = (title: string, rows: string[][], x: number) => {
      const headerH = 34
      const rowH = 28
      const h = headerH + rows.length * rowH
      doc.roundedRect(x, tableTop, colW, h, 10).fillAndStroke('#fff', LINE)
      doc.rect(x, tableTop, colW, headerH).fill(GREEN)
      doc.fillColor('#fff').font('Helvetica-Bold').fontSize(10).text(title, x + 14, tableTop + 11, { width: colW - 28 })
      rows.forEach((row, index) => {
        const rowY = tableTop + headerH + index * rowH
        if (index % 2 === 1) doc.rect(x, rowY, colW, rowH).fill('#f8fafc')
        doc.fillColor(SLATE).font('Helvetica').fontSize(10).text(row[0], x + 14, rowY + 8, { width: colW / 2 })
        doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(row[1], x, rowY + 8, {
          width: colW - 14,
          align: 'right',
        })
      })
      return h
    }

    const leftH = tableH('Sources de recettes', sources, leftX)
    const rightH = tableH('Modes de paiement', methods, rightX)
    y = tableTop + Math.max(leftH, rightH) + 28

    doc.moveTo(m, y).lineTo(m + contentW, y).strokeColor(LINE).lineWidth(1).stroke()
    y += 14
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(MUTED)
      .text(
        `Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })}`,
        m,
        y,
        { width: contentW, align: 'center' },
      )

    doc.rect(0, pageH - 8, pageW, 8).fill(GREEN)

    doc.end()
    stream.on('finish', () => resolve(outputPath))
    stream.on('error', reject)
  })
}

export async function generateRevenuePdf(year: number, month: number) {
  const api = getDbApi()
  const summary = api.getRevenuePeriodSummary(year, month)
  const settings = api.getSettings()
  const stamp = `${summary.year}-${String(summary.month).padStart(2, '0')}`

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exporter le résumé des recettes',
    defaultPath: `recettes-${stamp}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })

  if (canceled || !filePath) return { ok: false, canceled: true }

  const outputPath = path.extname(filePath).toLowerCase() === '.pdf' ? filePath : `${filePath}.pdf`
  await writePdf(outputPath, summary, settings)
  await shell.openPath(outputPath)
  return { ok: true, path: outputPath }
}
