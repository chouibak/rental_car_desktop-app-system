import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import { PDFDocument as PdfLibDocument } from 'pdf-lib'
import type { ContractRecord } from './contracts-db'
import { prepareArabicForPdf, resolveArabicFontPath } from './arabic-text'

type DamageItem = {
  id?: string
  part: string
  type: string
  note: string
  x?: number
  y?: number
  photo?: string
}

type InvoiceBreakdown = {
  total_ht: number
  total_vat: number
  total_ttc: number
  lines: Array<{ label: string; amount: number; days?: number }>
}

const PAGE = { w: 595.28, h: 841.89, m: 22 }
const CONTENT_W = PAGE.w - PAGE.m * 2
const SECTION_GAP = 10
const COL_GAP = 6
const SECTION_BAR_PAD = 3
const SECTION_BAR_FONT = 8
const SECTION_BAR_H = SECTION_BAR_PAD + SECTION_BAR_FONT + SECTION_BAR_PAD
const FOOTER_H = 40
const FOOTER_H_WITH_AR = 54
const ARABIC_FONT_NAME = 'ContractArabic'

function footerHeight(settings: Record<string, string>) {
  return settings.legal_mention_ar?.trim() ? FOOTER_H_WITH_AR : FOOTER_H
}

function ensureArabicFont(doc: InstanceType<typeof PDFDocument>) {
  const fontPath = resolveArabicFontPath()
  if (!fontPath) return false
  try {
    const registered = (doc as unknown as { _fontFamilies?: Record<string, unknown> })._fontFamilies
    if (!registered?.[ARABIC_FONT_NAME]) {
      doc.registerFont(ARABIC_FONT_NAME, fontPath)
    }
    return true
  } catch {
    return false
  }
}

function footerIdValue(value?: string) {
  const text = String(value ?? '').trim()
  return text || '—'
}

const PART_POSITIONS: Record<string, { x: number; y: number }> = {
  front_bumper: { x: 0.5, y: 0.12 },
  hood: { x: 0.5, y: 0.22 },
  windshield: { x: 0.5, y: 0.33 },
  roof: { x: 0.5, y: 0.5 },
  rear_window: { x: 0.5, y: 0.66 },
  rear_bumper: { x: 0.5, y: 0.89 },
  front_left_fender: { x: 0.12, y: 0.31 },
  front_left_door: { x: 0.12, y: 0.43 },
  rear_left_door: { x: 0.12, y: 0.57 },
  rear_left_fender: { x: 0.12, y: 0.69 },
  front_right_fender: { x: 0.88, y: 0.31 },
  front_right_door: { x: 0.88, y: 0.43 },
  rear_right_door: { x: 0.88, y: 0.57 },
  rear_right_fender: { x: 0.88, y: 0.69 },
  front_left_wheel: { x: 0.15, y: 0.25 },
  rear_left_wheel: { x: 0.15, y: 0.75 },
  front_right_wheel: { x: 0.85, y: 0.25 },
  rear_right_wheel: { x: 0.85, y: 0.75 },
  front: { x: 0.5, y: 0.12 },
  rear: { x: 0.5, y: 0.89 },
  left_side: { x: 0.12, y: 0.5 },
  right_side: { x: 0.88, y: 0.5 },
  wheels: { x: 0.15, y: 0.25 },
  interior: { x: 0.5, y: 0.5 },
}

const PART_LABELS: Record<string, string> = {
  front_bumper: 'Pare-chocs avant',
  hood: 'Capot',
  front_left_fender: 'Aile avant gauche',
  front_right_fender: 'Aile avant droite',
  front_left_door: 'Porte avant gauche',
  rear_left_door: 'Porte arrière gauche',
  front_right_door: 'Porte avant droite',
  rear_right_door: 'Porte arrière droite',
  roof: 'Toit',
  windshield: 'Pare-brise',
  rear_window: 'Vitre arrière',
  rear_bumper: 'Pare-chocs arrière',
  rear_left_fender: 'Aile arrière gauche',
  rear_right_fender: 'Aile arrière droite',
  front_left_wheel: 'Roue avant gauche',
  front_right_wheel: 'Roue avant droite',
  rear_left_wheel: 'Roue arrière gauche',
  rear_right_wheel: 'Roue arrière droite',
  front: 'Avant',
  rear: 'Arrière',
  left_side: 'Côté gauche',
  right_side: 'Côté droit',
  wheels: 'Roues',
  interior: 'Intérieur',
}

const DAMAGE_LABELS: Record<string, string> = {
  R: 'Rayure',
  B: 'Bosse',
  E: 'Éclat',
  C: 'Cassure',
}

const DAMAGE_LEGEND_ORDER = ['R', 'B', 'E', 'C'] as const

function countDamagesByType(damages: DamageItem[]) {
  const counts: Record<string, number> = { R: 0, B: 0, E: 0, C: 0 }
  for (const damage of damages) {
    const type = String(damage.type || '').toUpperCase()
    if (type in counts) counts[type] += 1
  }
  return counts
}

const DAMAGE_COLORS: Record<string, string> = {
  R: '#dc2626',
  B: '#f59e0b',
  E: '#2563eb',
  C: '#7c3aed',
}

const PHOTO_GRID_COLS = 2
const PHOTO_CELL_H = 168
const PHOTO_LABEL_H = 14
const PHOTO_IMG_MAX_H = 148

const FUEL_FILL: Record<string, number> = {
  vide: 0,
  quart: 1,
  moitie: 2,
  trois_quarts: 3,
  plein: 4,
}

const FUEL_FRACTION: Record<string, string> = {
  vide: '0/4',
  quart: '1/4',
  moitie: '2/4',
  trois_quarts: '3/4',
  plein: '4/4',
}

function fuelLevelFraction(level: string) {
  if (!level) return '—'
  return FUEL_FRACTION[level] ?? '—'
}

function parseJsonArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function clampPercent(value: unknown, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(0, Math.min(100, n))
}

function normalizeDamageItem(item: DamageItem) {
  const fallback = PART_POSITIONS[item.part] || { x: 0.5, y: 0.5 }
  return {
    ...item,
    x: clampPercent(item.x, fallback.x * 100),
    y: clampPercent(item.y, fallback.y * 100),
  }
}

function money(n: number, currency = 'DH') {
  const value = Number(n || 0)
  const negative = value < 0
  const abs = Math.abs(value)
  const fixed = abs.toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${currency} ${negative ? '-' : ''}${grouped}.${decPart}`
}

function fmtDate(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  return d.toLocaleDateString('fr-FR')
}

function fmtDatetime(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const date = d.toLocaleDateString('fr-FR')
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}

function pdfSafe(value: unknown) {
  const text = String(value ?? '')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
  // Helvetica is WinAnsi — Arabic/other scripts become garbage glyphs.
  return Array.from(text)
    .map((ch) => (ch.charCodeAt(0) <= 255 ? ch : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

function placeLabelFr(value?: string | null) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const folded = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, "'")
  const labels: Record<string, string> = {
    agency: "À l'agence",
    airport: 'Aéroport',
    hotel: 'Hôtel',
    "a l'agence": "À l'agence",
    agence: "À l'agence",
    aeroport: 'Aéroport',
    'في الوكالة': "À l'agence",
    الوكالة: "À l'agence",
    المطار: 'Aéroport',
    الفندق: 'Hôtel',
  }
  return pdfSafe(labels[raw] ?? labels[folded] ?? raw)
}

function withPlace(datetime: string, place?: string | null) {
  const label = placeLabelFr(place)
  return label ? `${datetime} - ${label}` : datetime
}

function val(value: unknown) {
  const text = String(value ?? '').trim()
  return text || '—'
}

function strokeBox(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, h: number) {
  doc.rect(x, y, w, h).lineWidth(0.5).stroke('#222')
}

function sectionBar(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, title: string) {
  doc.save()
  doc.rect(x, y, w, SECTION_BAR_H).fill('#e0e0e0')
  doc.rect(x, y, w, SECTION_BAR_H).lineWidth(0.5).stroke('#222')
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(SECTION_BAR_FONT).text(title, x, y + SECTION_BAR_PAD, { width: w, align: 'center' })
  doc.restore()
}

function drawCheckbox(doc: InstanceType<typeof PDFDocument>, x: number, y: number, checked: boolean, label: string, labelWidth = 88) {
  doc.rect(x, y, 8, 8).lineWidth(0.5).stroke('#222')
  if (checked) {
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#111').text('X', x + 2, y + 1.5, { lineBreak: false })
  }
  doc.font('Helvetica').fontSize(7).fillColor('#111').text(label, x + 12, y + 1.5, { width: labelWidth, lineBreak: false })
}

function drawCarDiagram(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  damages: DamageItem[],
) {
  const imgW = 1024
  const imgH = 1024
  const scale = Math.min(w / imgW, h / imgH)
  const drawW = imgW * scale
  const drawH = imgH * scale
  const ox = x + (w - drawW) / 2
  const oy = y + (h - drawH) / 2

  doc.save()
  doc.roundedRect(x, y, w, h, 6).fillAndStroke('#ffffff', '#d7dde5')
  doc.roundedRect(x, y, w, h, 6).clip()

  const publicDir = process.env.VITE_PUBLIC || path.join(__dirname, '../public')
  const imagePath = path.join(publicDir, 'car-diagram.png')
  if (fs.existsSync(imagePath)) {
    doc.image(imagePath, ox, oy, {
      width: drawW,
      height: drawH,
    })
  }

  damages.forEach((rawDamage) => {
    const damage = normalizeDamageItem(rawDamage)
    const mx = ox + (drawW * damage.x) / 100
    const my = oy + (drawH * damage.y) / 100
    const color = DAMAGE_COLORS[damage.type] || '#dc2626'

    const r = 2.2
    const f = 2.8

    doc.circle(mx, my, r).fill(color)
    doc.font('Helvetica-Bold').fontSize(f).fillColor('#fff')
    doc.text(damage.type || '?', mx - r, my - (f / 2 - 0.5), {
      width: r * 2,
      align: 'center',
      lineBreak: false,
    })
  })
  doc.restore()
}

function drawFuelGauge(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, level: string) {
  const filled = FUEL_FILL[level] ?? 0
  const fraction = fuelLevelFraction(level)
  const boxW = 12
  const gap = 2
  const boxStartX = x + 76
  const boxH = 6

  doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#374151')
  doc.text('Niveau de carburant :', x, y + 2, { width: 72, lineBreak: false })

  for (let i = 0; i < 4; i++) {
    const bx = boxStartX + i * (boxW + gap)
    doc.rect(bx, y, boxW, boxH).lineWidth(0.5).stroke('#777')
    if (i < filled) {
      doc.rect(bx + 1, y + 1, boxW - 2, boxH - 2).fill('#374151')
    }
  }

  doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#374151')
  doc.text(fraction, boxStartX + 4 * (boxW + gap) + 4, y + 2, { lineBreak: false })
}

function companyAddressLines(settings: Record<string, string>) {
  const address = settings.company_address?.trim() || ''
  const city = settings.company_city?.trim() || ''
  if (!address && !city) return []
  if (address.includes('\n')) return address.split('\n').map((line) => line.trim()).filter(Boolean)
  if (address && city) return [address, city]
  return [address || city]
}

function looksLikeStreetAddress(value: string) {
  return /\b(rue|avenue|bd|boulevard|hay|street|route|lot)\b/i.test(value) || /^\d+\s/.test(value)
}

function contractPlaceLabel(city: string, settings: Record<string, string>) {
  let raw = city.trim()
  if (!raw || looksLikeStreetAddress(raw)) {
    raw = settings.company_city?.trim() || ''
  }
  if (!raw) return ''
  const firstPart = raw.split(',')[0]?.trim() || raw
  return firstPart.replace(/\s+\d{4,5}(?:\s.*)?$/, '').trim() || firstPart
}

function drawHeader(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  contract: ContractRecord & { client_name?: string },
  settings: Record<string, string>,
) {
  const logoW = 62
  const logoGap = 10
  const lineS = 8
  const padBottom = 2
  const company = settings.company_name || 'Rental Car Agency'
  const logoPath = settings.company_logo?.trim()
  let infoX = x

  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, x, y + 2, { fit: [logoW, 56] })
      infoX = x + logoW + logoGap
    } catch {
      // no logo
    }
  }

  const addressLines = companyAddressLines(settings)
  let infoY = y + 4

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a4480').text(company, infoX, infoY, { width: 240 })
  infoY += 11

  doc.font('Helvetica').fontSize(6.5).fillColor('#555').text(settings.company_tagline || 'Location de voitures', infoX, infoY, { width: 240 })
  infoY += lineS

  doc.font('Helvetica').fontSize(6.5).fillColor('#111')
  for (const line of addressLines) {
    doc.text(line, infoX, infoY, { width: 240 })
    infoY += lineS
  }

  const gsm = settings.company_phone?.trim()
    ? (settings.company_phone.trim().toUpperCase().startsWith('GSM')
      ? settings.company_phone.trim()
      : `GSM : ${settings.company_phone.trim()}`)
    : ''
  const email = settings.company_email?.trim() ? `Email : ${settings.company_email.trim()}` : ''
  const fax = settings.company_fax?.trim() ? `Fix / Fax : ${settings.company_fax.trim()}` : ''

  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#111')
  if (gsm) {
    doc.text(gsm, infoX, infoY, { width: 240 })
    infoY += lineS
  }
  if (fax) {
    doc.text(fax, infoX, infoY, { width: 240 })
    infoY += lineS
  }
  if (email) {
    doc.text(email, infoX, infoY, { width: 240 })
    infoY += lineS
  }

  const leftBottom = infoY

  const w2 = (w - COL_GAP) / 2
  const rightX = x + w2 + COL_GAP
  let ry = y + 4

  const contractDate = fmtDate(contract.contract_date || contract.start_date)
  const city = contractPlaceLabel(String(contract.contract_city ?? ''), settings)
  const dateVal = `Le ${contractDate}${city ? ` à ${city}` : ''}`
  const legalText =
    'Ce contrat doit accompagner le véhicule pendant toute la durée de la location, afin d\'être présenté à toute réquisition des services de police ou de gendarmerie.'

  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111')
  doc.text(`N° contrat : ${val(contract.contract_number)}`, rightX, ry, { width: w2 })
  ry += 10

  doc.font('Helvetica-Bold').fontSize(6.8)
  doc.text(`Date : ${dateVal}`, rightX, ry, { width: w2 })
  ry += 10

  doc.text(`Locataire (client) : ${val(contract.driver1_name || contract.client_name)}`, rightX, ry, { width: w2 })
  ry += 11

  doc.font('Helvetica').fontSize(5).fillColor('#666')
  const legalH = doc.heightOfString(legalText, { width: w2, lineGap: 0.3 })
  doc.text(legalText, rightX, ry, { width: w2, lineGap: 0.3 })

  const rightBottom = ry + legalH
  const headerH = Math.max(leftBottom, rightBottom) - y + padBottom

  doc.moveTo(x, y + headerH - 0.5).lineTo(x + w, y + headerH - 0.5).lineWidth(0.3).stroke('#ddd')
  return headerH
}

function drawDrivers(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, contract: ContractRecord) {
  const w2 = (w - COL_GAP) / 2
  const rightX = x + w2 + COL_GAP
  const pad = 5
  const labelW = 92
  const lineH = 11
  const fontSize = 6.5

  type DriverRow =
    | { label: string; value: string; wrap?: boolean }
    | { label: string; docNum: string; docExp: string; type: 'doc' }

  const buildRows = (prefix: string): DriverRow[] => {
    const birthDate = fmtDate(String(contract[`${prefix}birth_date` as keyof ContractRecord] ?? ''))
    const birthPlace = val(contract[`${prefix}birth_place` as keyof ContractRecord])
    const birthVal = (birthDate || birthPlace !== '—') ? `${birthDate}${birthPlace !== '—' ? ` — ${birthPlace}` : ''}` : '—'

    return [
      { label: 'Nom et Prénom', value: val(contract[`${prefix}name` as keyof ContractRecord]), wrap: true },
      { label: 'Date / lieu naiss.', value: birthVal, wrap: true },
      { label: 'Nationalité', value: val(contract[`${prefix}nationality` as keyof ContractRecord]) },
      { label: 'Adresse', value: val(contract[`${prefix}address` as keyof ContractRecord]), wrap: true },
      { label: 'Tél (GSM)', value: val(contract[`${prefix}phone` as keyof ContractRecord]) },
      { type: 'doc', label: 'N° passeport', docNum: val(contract[`${prefix}passport_number` as keyof ContractRecord]), docExp: fmtDate(String(contract[`${prefix}passport_expires_at` as keyof ContractRecord] ?? '')) },
      { type: 'doc', label: 'CIN', docNum: val(contract[`${prefix}cin_number` as keyof ContractRecord]), docExp: fmtDate(String(contract[`${prefix}cin_expires_at` as keyof ContractRecord] ?? '')) },
      { type: 'doc', label: 'Permis', docNum: val(contract[`${prefix}license_number` as keyof ContractRecord]), docExp: fmtDate(String(contract[`${prefix}license_expires_at` as keyof ContractRecord] ?? '')) },
    ]
  }

  doc.font('Helvetica').fontSize(fontSize)
  const valW = w2 - labelW - pad * 2 - 4
  const docNumW = 68
  const docGap = 14

  const rowHeight = (row: DriverRow) => {
    if ('type' in row && row.type === 'doc') return lineH
    if (!('value' in row) || !row.wrap) return lineH
    return Math.max(lineH, doc.heightOfString(row.value || '—', { width: valW }))
  }

  const rows1 = buildRows('driver1_')
  const rows2 = buildRows('driver2_')
  const contentH = (rows: DriverRow[]) => rows.reduce((sum, row) => sum + rowHeight(row), 0)
  const innerTop = SECTION_BAR_H + SECTION_BAR_PAD
  const bottomPad = SECTION_BAR_PAD
  const h = innerTop + Math.max(contentH(rows1), contentH(rows2)) + bottomPad

  strokeBox(doc, x, y, w2, h)
  strokeBox(doc, rightX, y, w2, h)
  sectionBar(doc, x, y, w2, '1er Conducteur')
  sectionBar(doc, rightX, y, w2, '2ème Conducteur')

  const drawHalf = (startX: number, rows: DriverRow[]) => {
    const labelX = startX + pad
    const valX = startX + labelW + pad
    let cy = y + innerTop

    rows.forEach((row, index) => {
      const rh = rowHeight(row)

      if (index > 0) {
        doc.moveTo(startX + pad, cy - 1).lineTo(startX + w2 - pad, cy - 1).lineWidth(0.25).stroke('#e5e7eb')
      }

      doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#374151')
      doc.text(`${row.label} :`, labelX, cy + 1, { width: labelW - 4, lineBreak: false })

      if ('type' in row && row.type === 'doc') {
        const expLblX = valX + docNumW + docGap
        const expValX = expLblX + 34
        const expValW = valX + valW - expValX

        doc.font('Helvetica').fontSize(fontSize).fillColor('#111')
        doc.text(row.docNum || '—', valX, cy + 1, { width: docNumW, lineBreak: false })
        doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#374151')
        doc.text('Expire :', expLblX, cy + 1, { width: 32, lineBreak: false })
        doc.font('Helvetica').fontSize(fontSize).fillColor('#111')
        doc.text(row.docExp && row.docExp !== '—' ? row.docExp : '—', expValX, cy + 1, { width: expValW, lineBreak: false })
      } else if ('value' in row) {
        doc.font('Helvetica').fontSize(fontSize).fillColor('#111')
        doc.text(row.value || '—', valX, cy + 1, row.wrap ? { width: valW } : { width: valW, lineBreak: false })
      }

      cy += rh
    })
  }

  drawHalf(x, rows1)
  drawHalf(rightX, rows2)
  return h
}

function drawVehicleEquipment(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, contract: ContractRecord) {
  const leftW = (w - COL_GAP) / 2
  const rightW = (w - COL_GAP) / 2
  const rightX = x + leftW + COL_GAP

  const innerY = y + SECTION_BAR_H + SECTION_BAR_PAD
  const lineH = 12
  const rowGap = 3
  const valX = x + 120
  const valW = leftW - (valX - x) - 6

  const vehicleName = `${contract.vehicle_brand || ''} ${contract.vehicle_model || ''}`.trim()
  const departureText = withPlace(fmtDatetime(contract.departure_at || contract.start_date), contract.departure_place)
  const returnText = withPlace(fmtDatetime(contract.return_at || contract.end_date), contract.return_place)

  // Measure wrapped heights first so long addresses grow the box instead of overflowing into the right column.
  doc.font('Helvetica').fontSize(7)
  const departureH = Math.max(lineH, doc.heightOfString(departureText, { width: valW }))
  const returnH = Math.max(lineH, doc.heightOfString(returnText, { width: valW }))

  const contentH =
    lineH * 1.5 + // Marque/IMMT row + gap before départ
    departureH + rowGap +
    lineH + // KM départ
    returnH + rowGap +
    lineH + // KM retour
    lineH + // Nb jours facturés
    lineH + // Prolongation
    10 // bottom padding

  const h = Math.max(105, 18 + contentH)

  strokeBox(doc, x, y, leftW, h)
  strokeBox(doc, rightX, y, rightW, h)

  sectionBar(doc, x, y, leftW, 'Description du véhicule')
  sectionBar(doc, rightX, y, rightW, 'Équipements et accessoires')

  doc.font('Helvetica-Bold').fontSize(7).text('Marque :', x + 4, innerY)
  doc.font('Helvetica').fontSize(7).text(vehicleName || '—', valX, innerY, { width: valW, lineBreak: false })
  doc.font('Helvetica-Bold').fontSize(7).text('IMMT :', x + leftW - 90, innerY)
  doc.font('Helvetica-Bold').fontSize(8).text(val(contract.vehicle_plate), x + leftW - 60, innerY, { width: 50, align: 'right' })

  let cy = innerY + lineH * 1.5

  const textL = (lbl: string, valStr: string, rowH: number, wrap = false) => {
    doc.font('Helvetica-Bold').fontSize(7).text(lbl, x + 4, cy)
    doc.font('Helvetica').fontSize(7).text(valStr || '', valX, cy, wrap ? { width: valW } : { width: valW, lineBreak: false })
    cy += rowH + rowGap
  }

  textL('Date et heure de départ :', departureText, departureH, true)
  textL('KM de départ :', contract.departure_mileage != null ? String(contract.departure_mileage) : '—', lineH)
  textL('Date et heure de retour :', returnText, returnH, true)
  textL('KM de retour :', contract.return_mileage != null ? String(contract.return_mileage) : '—', lineH)

  doc.font('Helvetica-Bold').fontSize(7).text('Nb de jours facturés :', x + 4, cy)
  doc.font('Helvetica').fontSize(7).text(String(contract.billed_days ?? contract.total_days ?? '—'), valX, cy)
  cy += lineH

  doc.font('Helvetica-Bold').fontSize(7).text('Prolongation jusqu\'à :', x + 4, cy)
  doc.font('Helvetica').fontSize(7).text(contract.extension_until ? fmtDate(contract.extension_until) : '—', valX, cy)
  doc.font('Helvetica-Bold').fontSize(7).text('Nb jours prolong. :', x + leftW - 100, cy)
  doc.font('Helvetica').fontSize(7).text(String(contract.extension_days ?? 0), x + leftW - 20, cy)

  // Equipments — clean 2-column grid
  const equipment = parseJsonArray<string>(contract.equipment)
  const equipItems = [
    { key: 'radio', label: 'Poste Radio' },
    { key: 'spare_wheel', label: 'Roue de secours' },
    { key: 'jack', label: 'Cric' },
    { key: 'documents', label: 'Documents' },
    { key: 'vest', label: 'Gilet' },
    { key: 'extinguisher', label: 'Extincteur' },
    { key: 'warning_triangle', label: 'Plaque de panne' },
    { key: 'baby_seat', label: 'Siège bébé' },
  ]

  const equipPad = 6
  const equipCols = 2
  const equipColW = (rightW - equipPad * 2) / equipCols
  const equipRowH = 13
  const equipStartY = innerY + 2

  equipItems.forEach((item, index) => {
    const col = index % equipCols
    const row = Math.floor(index / equipCols)
    const cx = rightX + equipPad + col * equipColW
    const rowY = equipStartY + row * equipRowH
    drawCheckbox(doc, cx, rowY, equipment.includes(item.key), item.label, equipColW - 14)
  })

  const autresY = equipStartY + Math.ceil(equipItems.length / equipCols) * equipRowH + 6
  drawCheckbox(doc, rightX + equipPad, autresY, !!contract.equipment_other, 'Autres', 34)
  doc.moveTo(rightX + equipPad + 46, autresY + 8).lineTo(rightX + rightW - equipPad, autresY + 8).lineWidth(0.4).stroke('#bbb')
  if (contract.equipment_other) {
    doc.font('Helvetica').fontSize(6.5).fillColor('#111').text(contract.equipment_other, rightX + equipPad + 48, autresY + 1, { width: rightW - equipPad * 2 - 48 })
  }

  return h
}

function damagePhotoItems(damages: DamageItem[]) {
  return damages.filter((damage) => damage.photo && fs.existsSync(damage.photo))
}

function photoGridRows(count: number) {
  if (count <= 0) return 0
  return Math.ceil(count / PHOTO_GRID_COLS)
}

function drawDamagePhotoGrid(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  damages: DamageItem[],
) {
  const cellW = w / PHOTO_GRID_COLS

  damages.forEach((damage, index) => {
    const col = index % PHOTO_GRID_COLS
    const row = Math.floor(index / PHOTO_GRID_COLS)
    const cx = x + col * cellW
    const cy = y + row * PHOTO_CELL_H
    const partLabel = PART_LABELS[damage.part] || damage.part
    const typeLabel = DAMAGE_LABELS[damage.type] || damage.type

    doc.save()
    doc.rect(cx + 1, cy, cellW - 2, PHOTO_CELL_H - 2).clip()
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#111')
    doc.text(`${partLabel} — ${typeLabel}`, cx + 3, cy + 2, { width: cellW - 6, align: 'left', lineBreak: false })

    try {
      doc.image(damage.photo!, cx + 3, cy + PHOTO_LABEL_H + 1, {
        fit: [cellW - 6, PHOTO_IMG_MAX_H],
      })
    } catch {
      // skip unreadable image
    }
    doc.restore()
  })
}

function drawVehicleState(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, contract: ContractRecord) {
  const h = 150
  const w2 = (w - COL_GAP) / 2
  const rightX = x + w2 + COL_GAP
  const departureDamages = parseJsonArray<DamageItem>(contract.departure_damages).map(normalizeDamageItem)
  const returnDamages = parseJsonArray<DamageItem>(contract.return_damages).map(normalizeDamageItem)

  strokeBox(doc, x, y, w2, h)
  strokeBox(doc, rightX, y, w2, h)

  sectionBar(doc, x, y, w2, 'État du véhicule à la livraison')
  sectionBar(doc, rightX, y, w2, 'État du véhicule à la reprise')

  // Layout constants — maximize diagram area inside the fixed box
  const fuelH = 14
  const innerTop = SECTION_BAR_H + SECTION_BAR_PAD
  const diagramW = w2 - 6
  const diagramY = y + innerTop
  const diagramH = h - innerTop - fuelH

  ;[
    { damages: departureDamages, fuel: contract.departure_fuel_level || '', bx: x },
    { damages: returnDamages, fuel: contract.return_fuel_level || '', bx: rightX },
  ].forEach((block) => {
    const bx = block.bx

    drawCarDiagram(doc, bx + 3, diagramY, diagramW, diagramH, block.damages)

    const legStartX = bx + 6
    const legStartY = diagramY + Math.max(4, (diagramH - 44) / 2)
    const counts = countDamagesByType(block.damages)
    doc.font('Helvetica-Bold').fontSize(5).fillColor('#374151')

    // Vertical legend on the left with counts
    let curY = legStartY
    DAMAGE_LEGEND_ORDER.forEach((code) => {
      const label = DAMAGE_LABELS[code]
      doc.text(`${code} - ${label} ( ${counts[code]} )`, legStartX, curY, { lineBreak: false })
      curY += 12
    })

    // Fuel gauge at bottom center
    drawFuelGauge(doc, bx + (w2 - 160) / 2, y + h - 10, w2, block.fuel)
  })

  return h
}

function drawDamageList(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  damages: DamageItem[],
) {
  let cy = y
  if (damages.length === 0) {
    doc.font('Helvetica').fontSize(7).fillColor('#666').text('Aucun dommage constaté.', x, cy, { width: w })
    return 12
  }

  damages.forEach((rawDamage, index) => {
    const damage = normalizeDamageItem(rawDamage)
    const title = `${index + 1}. ${PART_LABELS[damage.part] || damage.part}`
    const typeLabel = DAMAGE_LABELS[damage.type] || damage.type
    const typeLetter = damage.type || '?'
    doc.font('Helvetica-Bold').fontSize(7.2).fillColor('#111').text(`${title}  [${typeLetter}]`, x, cy, { width: w })
    cy += 9
    doc.font('Helvetica').fontSize(6.5).fillColor('#333').text(`Type : ${typeLabel}`, x + 8, cy, { width: w - 8 })
    cy += 8
    if (damage.note?.trim()) {
      doc.text(`Note : ${pdfSafe(damage.note)}`, x + 8, cy, { width: w - 8 })
      cy += 8
    }
    doc.text(`Position : X=${Math.round(damage.x ?? 0)}% / Y=${Math.round(damage.y ?? 0)}%`, x + 8, cy, { width: w - 8 })
    cy += 12
  })

  return cy - y
}

function estimateDamageListHeight(damages: DamageItem[]) {
  if (damages.length === 0) return 12
  return damages.reduce((total, damage) => total + 29 + (damage.note?.trim() ? 8 : 0), 0)
}

function drawDamageDiagramAnnex(
  doc: InstanceType<typeof PDFDocument>,
  contract: ContractRecord,
  settings: Record<string, string>,
) {
  const departureDamages = parseJsonArray<DamageItem>(contract.departure_damages).map(normalizeDamageItem)
  const returnDamages = parseJsonArray<DamageItem>(contract.return_damages).map(normalizeDamageItem)

  doc.addPage({ size: 'A4', margin: 0 })
  const x = PAGE.m
  let y = PAGE.m

  sectionBar(doc, x, y, CONTENT_W, 'CAR DAMAGE DIAGRAM')
  y += 18
  doc.font('Helvetica').fontSize(8).fillColor('#333')
  doc.text(`Contrat ${contract.contract_number || ''}`.trim(), x, y, { width: CONTENT_W })
  y += 16

  const blockGap = 16
  const listW = 200
  const diagramW = CONTENT_W - listW - 12

  ;[
    { title: 'État initial du véhicule', damages: departureDamages },
    { title: 'État du véhicule à la reprise', damages: returnDamages },
  ].forEach((block, index) => {
    if (index > 0) y += blockGap
    const blockH = Math.max(300, estimateDamageListHeight(block.damages) + 48)
    if (y + blockH > PAGE.h - PAGE.m - footerHeight(settings) - 8) {
      drawFooter(doc, x, PAGE.h - PAGE.m - footerHeight(settings), CONTENT_W, settings)
      doc.addPage({ size: 'A4', margin: 0 })
      y = PAGE.m
    }
    strokeBox(doc, x, y, CONTENT_W, blockH)
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111').text(block.title, x + 8, y + 8)
    drawCarDiagram(doc, x + 8, y + 24, diagramW, blockH - 32, block.damages)
    drawDamageList(doc, x + diagramW + 18, y + 28, listW - 12, block.damages)
    y += blockH
  })

  drawFooter(doc, x, PAGE.h - PAGE.m - footerHeight(settings), CONTENT_W, settings)
}

function collectDamagePhotos(contract: ContractRecord) {
  if (Number(contract.include_damage_photos_in_pdf) !== 1) {
    return { departure: [] as DamageItem[], returnPhotos: [] as DamageItem[] }
  }
  return {
    departure: damagePhotoItems(parseJsonArray<DamageItem>(contract.departure_damages)),
    returnPhotos: damagePhotoItems(parseJsonArray<DamageItem>(contract.return_damages)),
  }
}

function drawDamagePhotosAnnex(
  doc: InstanceType<typeof PDFDocument>,
  contract: ContractRecord,
  settings: Record<string, string>,
) {
  const { departure, returnPhotos } = collectDamagePhotos(contract)
  if (departure.length === 0 && returnPhotos.length === 0) return

  doc.addPage({ size: 'A4', margin: 0 })
  const x = PAGE.m
  let y = PAGE.m

  sectionBar(doc, x, y, CONTENT_W, 'Photos des dommages')
  y += 20
  doc.font('Helvetica').fontSize(8).fillColor('#333')
  doc.text(`Contrat ${contract.contract_number || ''}`.trim(), x, y, { width: CONTENT_W })
  y += 16

  const blocks = [
    { title: 'À la livraison', photos: departure },
    { title: 'À la reprise', photos: returnPhotos },
  ]

  for (const block of blocks) {
    if (block.photos.length === 0) continue
    if (y + 28 + PHOTO_CELL_H > PAGE.h - PAGE.m - footerHeight(settings) - 8) {
      drawFooter(doc, x, PAGE.h - PAGE.m - footerHeight(settings), CONTENT_W, settings)
      doc.addPage({ size: 'A4', margin: 0 })
      y = PAGE.m
    }
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111')
    doc.text(block.title, x, y)
    y += 14
    strokeBox(doc, x, y, CONTENT_W, photoGridRows(block.photos.length) * PHOTO_CELL_H + 8)
    drawDamagePhotoGrid(doc, x + 4, y + 4, CONTENT_W - 8, block.photos)
    y += photoGridRows(block.photos.length) * PHOTO_CELL_H + 18
  }

  drawFooter(doc, x, PAGE.h - PAGE.m - footerHeight(settings), CONTENT_W, settings)
}

function drawInvoice(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, contract: ContractRecord & { client_name?: string; paid_amount?: number }, breakdown: InvoiceBreakdown) {
  const vatApplies = Number(contract.vat_applies) === 1
  const vatRate = vatApplies ? Number(contract.vat_rate ?? 0) : 0
  const qty = contract.billed_days || 1
  const vehicleLabel = `${contract.vehicle_brand || ''} ${contract.vehicle_model || ''}`.trim()
  const lines = breakdown.lines.length > 0 ? breakdown.lines : [{ label: 'Location', amount: qty * (contract.daily_rate ?? 0) }]
  const paidAmount = Math.max(0, Number(contract.paid_amount ?? 0))
  const remainingUnpaid = Math.max(0, Number(breakdown.total_ttc) - paidAmount)
  const dash = '—'
  const headH = 13
  const rowH = 12

  // TVA YES: Désignation | Qté | P.U. HT | Montant HT | TVA | Montant TVA | Total TTC
  // TVA NO:  Désignation | Qté | Prix unitaire | Montant | Total
  const c = vatApplies
    ? [w * 0.34, w * 0.06, w * 0.12, w * 0.12, w * 0.08, w * 0.12, w * 0.16]
    : [w * 0.4, w * 0.1, w * 0.18, w * 0.16, w * 0.16]
  const headers = vatApplies
    ? ['Désignation', 'Qté', 'P.U. HT', 'Montant HT', 'TVA', 'Montant TVA', 'Total TTC']
    : ['Désignation', 'Qté', 'Prix unitaire', 'Montant', 'Total']

  let cy = y
  sectionBar(doc, x, cy, w, 'Facture')
  cy += 14

  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#111')
  doc.text(
    `N° facture : ${contract.contract_number}   |   Date : ${fmtDate(contract.contract_date || contract.start_date)}   |   Client : ${val(contract.driver1_name || contract.client_name)}`,
    x + 4, cy + 2, { width: w - 8, lineBreak: false }
  )
  cy += 12
  doc.moveTo(x, cy).lineTo(x + w, cy).lineWidth(0.5).stroke('#222')

  doc.rect(x, cy, w, headH).fill('#374151')
  let cx2 = x
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#fff')
  headers.forEach((h, i) => {
    doc.text(h, cx2 + 2, cy + 3, { width: c[i] - 4, align: i === 0 ? 'left' : 'center', lineBreak: false })
    cx2 += c[i]
  })
  cy += headH

  const tableStartY = cy
  doc.font('Helvetica').fontSize(6.5)
  const rowInfo = lines.map((line) => {
    const isLocation = line.label === 'Location'
    const lineDays = Number(line.days ?? (isLocation ? qty : 0))
    const designation = isLocation ? `Location ${vehicleLabel || 'véhicule'} (${lineDays} j)` : line.label
    const rowHeight = Math.max(rowH, doc.heightOfString(designation, { width: c[0] - 6 }) + 4)
    return { designation, lineDays, rowHeight }
  })

  lines.forEach((line, index) => {
    const amountTtc = Number(line.amount ?? 0)
    const amountHt = vatRate > 0 ? amountTtc / (1 + vatRate / 100) : amountTtc
    const amountVat = amountTtc - amountHt
    const { designation, lineDays, rowHeight } = rowInfo[index]
    const unitPrice = vatApplies
      ? (lineDays > 0 ? money(amountHt / lineDays) : dash)
      : (lineDays > 0 ? money(amountTtc / lineDays) : dash)

    if (index % 2 === 0) doc.rect(x, cy, w, rowHeight).fill('#f8fafc')
    doc.moveTo(x, cy).lineTo(x + w, cy).lineWidth(0.3).stroke('#ddd')

    const rowVals = vatApplies
      ? [
          designation,
          lineDays > 0 ? String(lineDays) : dash,
          unitPrice,
          money(amountHt),
          `${vatRate} %`,
          money(amountVat),
          money(amountTtc),
        ]
      : [
          designation,
          lineDays > 0 ? String(lineDays) : dash,
          unitPrice,
          money(amountTtc),
          money(amountTtc),
        ]

    cx2 = x
    doc.font('Helvetica').fontSize(6.5).fillColor('#111')
    rowVals.forEach((cell, i) => {
      doc.text(cell, cx2 + (i === 0 ? 4 : 2), cy + 3, { width: c[i] - 6, align: i === 0 ? 'left' : 'center', lineBreak: i !== 0 })
      cx2 += c[i]
    })
    cy += rowHeight
  })

  const tableH = headH + rowInfo.reduce((sum, r) => sum + r.rowHeight, 0)
  doc.rect(x, tableStartY - headH, w, tableH).lineWidth(0.5).stroke('#222')
  cx2 = x
  c.forEach((cw, i) => {
    cx2 += cw
    if (i < c.length - 1) {
      doc.moveTo(cx2, tableStartY - headH).lineTo(cx2, tableStartY - headH + tableH).lineWidth(0.3).stroke('#aaa')
    }
  })

  cy += 4

  const sW = vatApplies ? c[3] + c[4] + c[5] + c[6] : c[2] + c[3] + c[4]
  const sX = x + w - sW
  const sRowH = 11
  const remainingLabel = remainingUnpaid > 0 ? money(remainingUnpaid) : 'Soldé'
  const remainingColor = remainingUnpaid > 0 ? '#b45309' : '#16a34a'

  const summaryRows: [string, string, string][] = vatApplies
    ? [
        ['Total HT', money(breakdown.total_ht), '#111'],
        [`TVA (${vatRate} %)`, money(breakdown.total_vat), '#111'],
        ['Total TTC', money(breakdown.total_ttc), '#111'],
        ['Montant payé', money(paidAmount), '#111'],
        ['Reste impayé', remainingLabel, remainingColor],
      ]
    : [
        ['Total', money(breakdown.total_ttc), '#111'],
        ['Montant payé', money(paidAmount), '#111'],
        ['Reste impayé', remainingLabel, remainingColor],
      ]

  const sLabelW = sW * 0.55
  const sValW = sW - sLabelW
  const totalRowIndex = vatApplies ? 2 : 0
  const unpaidRowIndex = summaryRows.length - 1
  summaryRows.forEach(([label, value, color], i) => {
    const isBold = i === totalRowIndex || i === unpaidRowIndex
    const bgColor = i === totalRowIndex ? '#e5e7eb' : i % 2 === 0 ? '#f9fafb' : '#fff'
    doc.rect(sX, cy, sW, sRowH).fill(bgColor)
    doc.moveTo(sX, cy).lineTo(sX + sW, cy).lineWidth(0.3).stroke('#ccc')
    doc.moveTo(sX + sLabelW, cy).lineTo(sX + sLabelW, cy + sRowH).lineWidth(0.3).stroke('#ccc')
    doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').fontSize(6.5).fillColor(color)
    doc.text(label, sX + 3, cy + 2, { width: sLabelW - 6, align: 'left', lineBreak: false })
    doc.text(value, sX + sLabelW + 2, cy + 2, { width: sValW - 4, align: 'right', lineBreak: false })
    cy += sRowH
  })
  doc.rect(sX, cy - sRowH * summaryRows.length, sW, sRowH * summaryRows.length).lineWidth(0.5).stroke('#555')
  doc.fillColor('#111')

  cy += 4

  doc.font('Helvetica').fontSize(6).fillColor('#555')
  const franchise = Number(contract.franchise_amount) > 0 ? money(contract.franchise_amount) : 'Non'
  const caution = money(contract.deposit_amount ?? contract.deposit ?? 0)
  const dailyRate = Number(contract.daily_rate ?? 0)
  const tarifHt = money(dailyRate / (vatRate > 0 ? 1 + vatRate / 100 : 1))
  const tarifTtc = money(dailyRate)
  const tarifLine = vatApplies
    ? `Franchise : ${franchise}   |   Caution : ${caution}   |   Tarif/jour : ${tarifHt} HT / ${tarifTtc} TTC`
    : `Franchise : ${franchise}   |   Caution : ${caution}   |   Tarif/jour : ${tarifTtc}`
  doc.text(tarifLine, x + 4, cy, { width: w - 8, lineBreak: false })
  cy += 10

  const totalH = cy - y
  doc.rect(x, y, w, totalH).lineWidth(0.5).stroke('#222')
  return totalH
}

function drawSignatures(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number) {
  const headerH = 14
  const partyRowH = 14
  const subHeaderH = 12
  const legalH = 18
  const sigAreaH = 56
  const h = headerH + partyRowH + subHeaderH + sigAreaH + legalH

  strokeBox(doc, x, y, w, h)
  sectionBar(doc, x, y, w, 'Signature')

  const w2 = w / 2
  const w4 = w / 4
  const partyY = y + headerH
  const subY = partyY + partyRowH
  const sigY = subY + subHeaderH
  const legalY = sigY + sigAreaH

  // Horizontal dividers
  doc.moveTo(x, partyY).lineTo(x + w, partyY).stroke('#222')
  doc.moveTo(x, subY).lineTo(x + w, subY).stroke('#222')
  doc.moveTo(x, sigY).lineTo(x + w, sigY).stroke('#222')
  doc.moveTo(x, legalY).lineTo(x + w2, legalY).stroke('#222')

  // Vertical dividers
  doc.moveTo(x + w2, partyY).lineTo(x + w2, y + h).stroke('#222')
  doc.moveTo(x + w4, subY).lineTo(x + w4, legalY).stroke('#222')
  doc.moveTo(x + w2 + w4, subY).lineTo(x + w2 + w4, y + h).stroke('#222')

  doc.font('Helvetica-Bold').fontSize(7).fillColor('#111')
  doc.text('Le locataire (client)', x, partyY + 4, { width: w2, align: 'center' })
  doc.text('Société', x + w2, partyY + 4, { width: w2, align: 'center' })

  doc.font('Helvetica-Bold').fontSize(6)
  doc.text('À la livraison', x, subY + 3, { width: w4, align: 'center' })
  doc.text('À la reprise', x + w4, subY + 3, { width: w4, align: 'center' })
  doc.text('À la livraison', x + w2, subY + 3, { width: w4, align: 'center' })
  doc.text('À la reprise', x + w2 + w4, subY + 3, { width: w4, align: 'center' })

  doc.font('Helvetica').fontSize(4.5).fillColor('#111')
  doc.text(
    'Par sa signature, le client déclare avoir lu et approuvé les conditions stipulées ci-dessous et au verso du contrat.',
    x + 4,
    legalY + 2,
    { width: w2 - 8 },
  )

  return h
}

function isPdfPath(filePath: string) {
  return path.extname(filePath).toLowerCase() === '.pdf'
}

function drawConditionsVerso(doc: InstanceType<typeof PDFDocument>, settings: Record<string, string>) {
  const filePath = settings.contract_conditions_image?.trim()
  if (!filePath || !fs.existsSync(filePath) || isPdfPath(filePath)) return

  doc.addPage({ size: 'A4', margin: 0 })
  try {
    doc.image(filePath, 0, 0, {
      fit: [PAGE.w, PAGE.h],
      align: 'center',
      valign: 'center',
    })
  } catch {
    // Skip verso if the image format cannot be embedded.
  }
}

async function appendConditionsPdf(contractPdfPath: string, settings: Record<string, string>) {
  const filePath = settings.contract_conditions_image?.trim()
  if (!filePath || !fs.existsSync(filePath) || !isPdfPath(filePath)) return

  const contractDoc = await PdfLibDocument.load(fs.readFileSync(contractPdfPath))
  const conditionsDoc = await PdfLibDocument.load(fs.readFileSync(filePath))
  const pages = await contractDoc.copyPages(conditionsDoc, conditionsDoc.getPageIndices())
  for (const page of pages) {
    contractDoc.addPage(page)
  }
  fs.writeFileSync(contractPdfPath, await contractDoc.save())
}

function drawFooter(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, settings: Record<string, string>) {
  const legalFr =
    settings.legal_mention_fr?.trim() ||
    'Chaque dommage touche la société pendant la période de location ; le locataire sera exposé à la responsabilité administrative et judiciaire jusqu\'à la décision finale, ainsi qu\'au paiement de tous les frais résultants.'
  const legalAr = settings.legal_mention_ar?.trim() || ''
  const h = footerHeight(settings)
  const hasArabic = Boolean(legalAr) && ensureArabicFont(doc)

  strokeBox(doc, x, y, w, h)

  doc.font('Helvetica').fontSize(4.5).fillColor('#111')
  doc.text(legalFr, x + 6, y + 3, { width: w - 12, align: 'left', lineGap: 0, height: hasArabic ? 12 : 16 })

  if (hasArabic) {
    const prepared = prepareArabicForPdf(legalAr)
    doc.font(ARABIC_FONT_NAME).fontSize(5.5).fillColor('#111')
    doc.text(prepared, x + 6, y + 14, {
      width: w - 12,
      align: 'right',
      lineGap: 0,
      height: 16,
    })
  }

  const ids = [
    ['RC', settings.company_rc],
    ['IF', settings.company_if],
    ['TP', settings.company_tp],
    ['CNSS', settings.company_cnss],
    ['ICE', settings.company_ice],
  ] as const

  const idsY = y + (hasArabic ? 32 : 22)
  const colW = w / ids.length
  ids.forEach(([label, value], index) => {
    const cx = x + index * colW
    doc.font('Helvetica-Bold').fontSize(5).fillColor('#111')
    doc.text(`${label} : ${footerIdValue(value)}`, cx, idsY, { width: colW, align: 'center', lineBreak: false })
  })
}

export function buildContractPdf(
  outputPath: string,
  contract: ContractRecord & { client_name?: string },
  settings: Record<string, string>,
  breakdown: InvoiceBreakdown,
) {
  return new Promise<string>((resolve, reject) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true })
    const stream = fs.createWriteStream(outputPath)
    doc.pipe(stream)

    let y = PAGE.m
    const x = PAGE.m

    y += drawHeader(doc, x, y, CONTENT_W, contract, settings) + SECTION_GAP
    y += drawDrivers(doc, x, y, CONTENT_W, contract) + SECTION_GAP
    y += drawVehicleEquipment(doc, x, y, CONTENT_W, contract) + SECTION_GAP
    y += drawVehicleState(doc, x, y, CONTENT_W, contract) + SECTION_GAP
    y += drawInvoice(doc, x, y, CONTENT_W, contract, breakdown) + SECTION_GAP
    drawSignatures(doc, x, y, CONTENT_W)

    drawFooter(doc, x, PAGE.h - PAGE.m - footerHeight(settings), CONTENT_W, settings)
    if (Number(contract.include_damage_photos_in_pdf) === 1) {
      drawDamagePhotosAnnex(doc, contract, settings)
    }
    drawConditionsVerso(doc, settings)

    doc.end()
    stream.on('finish', async () => {
      try {
        await appendConditionsPdf(outputPath, settings)
        resolve(outputPath)
      } catch (error) {
        reject(error)
      }
    })
    stream.on('error', reject)
  })
}
