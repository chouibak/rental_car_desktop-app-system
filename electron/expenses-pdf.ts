import { dialog, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import { getDbApi } from './db'
import type { ExpenseRecord } from './expenses-db'

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

const CATEGORY_FR: Record<string, string> = {
  fuel: 'Carburant',
  maintenance: 'Entretien',
  insurance: 'Assurance',
  rent: 'Loyer',
  salaries: 'Salaires',
  utilities: 'Charges',
  marketing: 'Marketing',
  office: 'Bureau',
  other: 'Autre',
}

const METHOD_FR: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte',
  bank_transfer: 'Virement',
}

const GREEN = '#047857'
const GREEN_DARK = '#065f46'
const GREEN_SOFT = '#ecfdf5'
const AMBER = '#b45309'
const AMBER_SOFT = '#fffbeb'
const INK = '#0f172a'
const MUTED = '#64748b'
const LINE = '#e2e8f0'
const SLATE = '#334155'
const PAPER = '#f8fafc'
const WHITE = '#ffffff'

const CATEGORY_TONE: Record<string, { bg: string; fg: string }> = {
  fuel: { bg: '#fff7ed', fg: '#c2410c' },
  maintenance: { bg: '#eff6ff', fg: '#1d4ed8' },
  insurance: { bg: '#f5f3ff', fg: '#6d28d9' },
  rent: { bg: '#f1f5f9', fg: '#334155' },
  salaries: { bg: '#f0fdfa', fg: '#0f766e' },
  utilities: { bg: '#ecfeff', fg: '#0e7490' },
  marketing: { bg: '#fdf2f8', fg: '#be185d' },
  office: { bg: '#f8fafc', fg: '#475569' },
  other: { bg: '#f8fafc', fg: '#475569' },
}

function money(value: number) {
  const n = Math.round((Number(value) || 0) * 100) / 100
  const sign = n < 0 ? '-' : ''
  const [intPart, dec] = Math.abs(n).toFixed(2).split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${sign}${grouped},${dec} DH`
}

function formatDate(value: string) {
  const ymd = String(value || '').slice(0, 10)
  const [y, m, d] = ymd.split('-')
  if (!y || !m || !d) return value || '—'
  return `${d}/${m}/${y}`
}

function periodLabel(year: number, month: number) {
  return `${MONTHS_FR[month - 1] || month} ${year}`
}

function monthRange(year: number, month: number) {
  const lastDay = new Date(year, month, 0).getDate()
  const mm = String(month).padStart(2, '0')
  return {
    date_from: `${year}-${mm}-01`,
    date_to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

function vehicleLabel(expense: ExpenseRecord) {
  if (!expense.car_id) return 'Agence (général)'
  const name = expense.car_name || `#${expense.car_id}`
  return expense.car_plate ? `${name} · ${expense.car_plate}` : name
}

function writePdf(
  outputPath: string,
  expenses: ExpenseRecord[],
  year: number,
  month: number,
  settings: Record<string, string>,
) {
  return new Promise<string>((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 })
    const stream = fs.createWriteStream(outputPath)
    doc.pipe(stream)

    const pageW = doc.page.width
    const pageH = doc.page.height
    const m = 36
    const contentW = pageW - m * 2
    const company = String(settings.company_name ?? '').trim() || 'LocAgence Pro'
    const city = [settings.company_address, settings.company_city].filter(Boolean).join(' · ')
    const total = expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const generated = `Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`

    const cols = [
      { key: 'title', label: 'Titre', w: 0.21 },
      { key: 'category', label: 'Catégorie', w: 0.13 },
      { key: 'vehicle', label: 'Véhicule', w: 0.21 },
      { key: 'amount', label: 'Montant', w: 0.12 },
      { key: 'date', label: 'Date de dépense', w: 0.13 },
      { key: 'method', label: 'Mode de paiement', w: 0.13 },
      { key: 'receipt', label: 'Reçu', w: 0.07 },
    ] as const
    const colW = cols.map((col) => Math.floor(contentW * col.w))
    colW[colW.length - 1] += Math.round(contentW) - colW.reduce((sum, w) => sum + w, 0)
    const tableW = colW.reduce((sum, w) => sum + w, 0)
    const tableX = m
    const bannerH = 72
    const cardY = 90
    const cardH = 58
    const headerH = 32
    const rowH = 28
    const totalH = 32
    const footerReserve = 42
    const firstTableY = cardY + cardH + 18
    const nextTableY = bannerH + 24

    const colX = (index: number) => tableX + colW.slice(0, index).reduce((sum, w) => sum + w, 0)
    const amountColIndex = cols.findIndex((col) => col.key === 'amount')
    const amountX = colX(amountColIndex)
    const amountW = colW[amountColIndex]

    const drawBanner = (compact: boolean) => {
      doc.rect(0, 0, pageW, pageH).fill(WHITE)
      doc.rect(0, 0, pageW, bannerH).fill(GREEN)
      doc.rect(0, bannerH, pageW, 4).fill(GREEN_DARK)
      doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(11).text(company, m, compact ? 22 : 14, {
        width: contentW * 0.62,
      })
      if (!compact) {
        doc.font('Helvetica').fontSize(9).fillColor('#d1fae5').text('Liste des dépenses', m, 32, {
          width: contentW * 0.62,
        })
        if (city) {
          doc.font('Helvetica').fontSize(8).fillColor('#a7f3d0').text(city, m, 48, { width: contentW * 0.62 })
        }
      }
      doc
        .font('Helvetica-Bold')
        .fontSize(compact ? 14 : 18)
        .fillColor(WHITE)
        .text(periodLabel(year, month), m, compact ? 38 : 18, {
          width: contentW,
          align: 'right',
        })
    }

    const drawSummary = () => {
      const gap = 14
      const cardW = (contentW - gap) / 2
      const cards = [
        { label: 'Total dépenses', value: money(total), bg: AMBER_SOFT, color: AMBER },
        { label: 'Nombre de lignes', value: String(expenses.length), bg: GREEN_SOFT, color: GREEN },
      ]
      cards.forEach((card, index) => {
        const x = m + index * (cardW + gap)
        doc.roundedRect(x, cardY, cardW, cardH, 10).fill(card.bg)
        doc.roundedRect(x, cardY, 5, cardH, 2).fill(card.color)
        doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(card.label.toUpperCase(), x + 18, cardY + 12, {
          width: cardW - 30,
        })
        doc.fillColor(card.color).font('Helvetica-Bold').fontSize(16).text(card.value, x + 18, cardY + 28, {
          width: cardW - 30,
        })
      })
    }

    const drawTableHead = (top: number) => {
      doc.rect(tableX, top, tableW, headerH).fill(PAPER)
      doc.moveTo(tableX, top + headerH).lineTo(tableX + tableW, top + headerH).strokeColor(GREEN).lineWidth(1.5).stroke()
      cols.forEach((col, index) => {
        doc
          .fillColor(MUTED)
          .font('Helvetica-Bold')
          .fontSize(8)
          .text(col.label, colX(index) + 10, top + 11, {
            width: colW[index] - 20,
            align: col.key === 'amount' || col.key === 'receipt' ? 'right' : 'left',
          })
      })
    }

    const cell = (expense: ExpenseRecord, key: (typeof cols)[number]['key']) => {
      if (key === 'title') return expense.title || '—'
      if (key === 'category') return CATEGORY_FR[expense.category] || expense.category
      if (key === 'vehicle') return vehicleLabel(expense)
      if (key === 'amount') return money(expense.amount)
      if (key === 'date') return formatDate(expense.expense_date)
      if (key === 'method') return METHOD_FR[expense.payment_method] || expense.payment_method
      return expense.receipt_path ? 'Oui' : '—'
    }

    const drawRow = (expense: ExpenseRecord, top: number, index: number) => {
      if (index % 2 === 1) doc.rect(tableX, top, tableW, rowH).fill(PAPER)
      doc.moveTo(tableX, top + rowH).lineTo(tableX + tableW, top + rowH).strokeColor(LINE).lineWidth(0.6).stroke()

      cols.forEach((col, colIndex) => {
        const x = colX(colIndex)
        const w = colW[colIndex]
        const value = cell(expense, col.key)
        if (col.key === 'category') {
          const tone = CATEGORY_TONE[expense.category] || CATEGORY_TONE.other
          const pillW = Math.min(w - 16, Math.max(58, value.length * 6.2 + 16))
          const pillX = x + 10
          const pillY = top + 6
          doc.roundedRect(pillX, pillY, pillW, 16, 8).fill(tone.bg)
          doc.fillColor(tone.fg).font('Helvetica-Bold').fontSize(7.5).text(value, pillX, pillY + 3.5, {
            width: pillW,
            align: 'center',
            lineBreak: false,
          })
          return
        }
        const align = col.key === 'amount' || col.key === 'receipt' ? 'right' : 'left'
        doc
          .fillColor(col.key === 'amount' ? INK : col.key === 'title' ? INK : SLATE)
          .font(col.key === 'amount' || col.key === 'title' ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(col.key === 'amount' ? 9 : 8.5)
          .text(value, x + 10, top + 9, { width: w - 20, align, lineBreak: false, ellipsis: true })
      })
    }

    const drawTotal = (top: number) => {
      doc.rect(tableX, top, tableW, totalH).fill(GREEN_SOFT)
      doc.moveTo(tableX, top).lineTo(tableX + tableW, top).strokeColor(GREEN).lineWidth(1).stroke()
      doc.fillColor(GREEN_DARK).font('Helvetica-Bold').fontSize(9).text('TOTAL', tableX + 10, top + 11)
      doc.fillColor(GREEN_DARK).font('Helvetica-Bold').fontSize(11).text(money(total), amountX, top + 9, {
        width: amountW - 10,
        align: 'right',
      })
    }

    const drawFooter = (pageCountHint: string) => {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(`${generated}  ·  ${pageCountHint}`, m, pageH - 28, {
          width: contentW,
          align: 'center',
        })
      doc.rect(0, pageH - 6, pageW, 6).fill(GREEN)
    }

    let page = 1
    let y = firstTableY

    const startPage = (first: boolean) => {
      if (!first) {
        drawFooter(`Page ${page}`)
        doc.addPage()
        page += 1
      }
      drawBanner(!first)
      if (first) drawSummary()
      y = first ? firstTableY : nextTableY
      drawTableHead(y)
      y += headerH
    }

    startPage(true)

    expenses.forEach((expense, index) => {
      const need = rowH + (index === expenses.length - 1 ? totalH : 0)
      if (y + need > pageH - footerReserve) startPage(false)
      drawRow(expense, y, index)
      y += rowH
    })

    if (expenses.length === 0) {
      doc.fillColor(MUTED).font('Helvetica').fontSize(11).text('Aucune dépense pour cette période.', tableX, y + 22, {
        width: tableW,
        align: 'center',
      })
    } else {
      if (y + totalH > pageH - footerReserve) startPage(false)
      drawTotal(y)
    }

    drawFooter(`Page ${page}`)

    doc.end()
    stream.on('finish', () => resolve(outputPath))
    stream.on('error', reject)
  })
}

export async function generateExpensesPdf(year: number, month: number) {
  const y = Math.floor(Number(year))
  const m = Math.floor(Number(month))
  if (!Number.isFinite(y) || y < 2000 || y > 2100) throw new Error('INVALID_DATES')
  if (!Number.isFinite(m) || m < 1 || m > 12) throw new Error('INVALID_DATES')

  const api = getDbApi()
  const expenses = api.listExpenses(monthRange(y, m))
  const settings = api.getSettings()
  const stamp = `${y}-${String(m).padStart(2, '0')}`

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exporter les dépenses',
    defaultPath: `depenses-${stamp}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })

  if (canceled || !filePath) return { ok: false, canceled: true }

  const outputPath = path.extname(filePath).toLowerCase() === '.pdf' ? filePath : `${filePath}.pdf`
  await writePdf(outputPath, expenses, y, m, settings)
  await shell.openPath(outputPath)
  return { ok: true, path: outputPath }
}
