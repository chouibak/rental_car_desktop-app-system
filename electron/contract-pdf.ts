import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import { PDFDocument as PdfLibDocument } from 'pdf-lib'
import type { ContractRecord } from './contracts-db'

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
const FOOTER_H = 40

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
  doc.rect(x, y, w, 14).fill('#e0e0e0')
  doc.rect(x, y, w, 14).lineWidth(0.5).stroke('#222')
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(8).text(title, x, y + 4, { width: w, align: 'center' })
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
  const ox = x + (w - imgW * scale) / 2
  const oy = y + (h - imgH * scale) / 2
  const S = (n: number) => n * scale

  doc.save()
  // Container border
  doc.roundedRect(x, y, w, h, 6).fillAndStroke('#ffffff', '#d7dde5')
  
  // Draw the car diagram image
  const publicDir = process.env.VITE_PUBLIC || path.join(__dirname, '../public')
  const imagePath = path.join(publicDir, 'car-diagram.png')
  if (fs.existsSync(imagePath)) {
    doc.image(imagePath, ox, oy, {
      width: imgW * scale,
      height: imgH * scale,
    })
  }

  damages.forEach((rawDamage) => {
    const damage = normalizeDamageItem(rawDamage)
    const mx = ox + (imgW * scale * damage.x) / 100
    const my = oy + (imgH * scale * damage.y) / 100
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
  const boxW = 18
  const gap = 3
  const boxStartX = x + 6

  for (let i = 0; i < 4; i++) {
    const bx = boxStartX + i * (boxW + gap)
    doc.rect(bx, y, boxW, 10).lineWidth(0.5).stroke('#222')
    if (i < filled) {
      doc.rect(bx + 1, y + 1, boxW - 2, 8).fill('#222')
    }
  }

  doc.font('Helvetica-Bold').fontSize(6).fillColor('#1a4480')
  doc.text(`Niveau de carburant : ${fraction}`, x + 6, y + 13, { width: w - 12, lineBreak: false })
}

function companyAddressLines(settings: Record<string, string>) {
  const address = settings.company_address?.trim() || ''
  const city = settings.company_city?.trim() || ''
  if (!address && !city) return []
  if (address.includes('\n')) return address.split('\n').map((line) => line.trim()).filter(Boolean)
  if (address && city) return [address, city]
  return [address || city]
}

function drawHeader(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  contract: ContractRecord & { client_name?: string },
  settings: Record<string, string>,
) {
  const h = 68
  const rightW = 252
  const logoW = 74
  const logoGap = 12
  const company = settings.company_name || 'Rental Car Agency'
  const logoPath = settings.company_logo?.trim()
  let infoX = x

  if (logoPath && fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, x, y + 4, { fit: [logoW, h - 8] })
      infoX = x + logoW + logoGap
    } catch {
      // no logo — agency block starts at left margin
    }
  }

  const addressLines = companyAddressLines(settings)
  let infoY = y + 6

  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a4480').text(company, infoX, infoY, { width: 250 })
  infoY += 13

  doc.font('Helvetica').fontSize(7).fillColor('#111').text(settings.company_tagline || 'Location de voitures', infoX, infoY, { width: 250 })
  infoY += 10

  doc.font('Helvetica').fontSize(6.8).fillColor('#111')
  for (const line of addressLines) {
    doc.text(line, infoX, infoY, { width: 250 })
    infoY += 9
  }

  if (settings.company_phone) {
    const phoneText = settings.company_phone.trim().toUpperCase().startsWith('GSM')
      ? settings.company_phone.trim()
      : `GSM : ${settings.company_phone.trim()}`
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#111').text(phoneText, infoX, infoY, { width: 250 })
  }

  const rx = x + w - rightW
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#111')
  doc.text(`N° contrat : ${contract.contract_number}`, rx, y + 4, { width: rightW })
  const contractDate = fmtDate(contract.contract_date || contract.start_date)
  const city = contract.contract_city || settings.company_city || ''
  doc.font('Helvetica-Bold').fontSize(7)
  doc.text(`Le ${contractDate}${city ? ` à ${city}` : ''}`, rx, y + 16, { width: rightW })
  doc.text(`Le locataire (client) : ${val(contract.driver1_name || contract.client_name)}`, rx, y + 28, { width: rightW })

  doc.font('Helvetica').fontSize(5).fillColor('#444').text(
    'Ce contrat doit accompagner le véhicule pendant toute la durée de la location, afin d\'être présenté à toute réquisition des services de police ou de gendarmerie.',
    rx,
    y + 42,
    { width: rightW, lineGap: 0.5 },
  )

  return h
}

function drawDrivers(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, contract: ContractRecord) {
  const h = 126
  const w2 = (w - COL_GAP) / 2
  const rightX = x + w2 + COL_GAP

  strokeBox(doc, x, y, w2, h)
  strokeBox(doc, rightX, y, w2, h)

  sectionBar(doc, x, y, w2, '1er Conducteur')
  sectionBar(doc, rightX, y, w2, '2ème Conducteur')

  const innerY = y + 18
  const lineH = 13
  const labelW = 106

  const drawHalf = (startX: number, prefix: string) => {
    const colW = w2
    const labelX = startX + 4
    const valX = startX + labelW + 4
    const valW = colW - labelW - 8
    const docValW = 52
    const expLblX = startX + labelW + docValW + 6
    const expValX = startX + labelW + docValW + 34
    const expValW = colW - (expValX - startX) - 4
    const rowY = (row: number) => innerY + row * lineH

    const textL = (lbl: string, valStr: string, row: number) => {
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#111').text(lbl, labelX, rowY(row), { width: labelW, lineBreak: false })
      doc.font('Helvetica').fontSize(7).text(valStr || '', valX, rowY(row), { width: valW, lineBreak: false })
    }

    const textDoc = (lbl: string, valStr: string, expStr: string, row: number) => {
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#111').text(lbl, labelX, rowY(row), { width: labelW, lineBreak: false })
      doc.font('Helvetica').fontSize(7).text(valStr || '', valX, rowY(row), { width: docValW, lineBreak: false })
      doc.font('Helvetica-Bold').fontSize(7).text('Expire :', expLblX, rowY(row), { width: 28, lineBreak: false })
      doc.font('Helvetica').fontSize(7).text(expStr || '', expValX, rowY(row), { width: expValW, lineBreak: false })
    }

    textL('Nom et Prénom :', val(contract[`${prefix}name` as keyof ContractRecord]), 0)
    const birthDate = fmtDate(String(contract[`${prefix}birth_date` as keyof ContractRecord] ?? ''))
    const birthPlace = val(contract[`${prefix}birth_place` as keyof ContractRecord])
    textL('Date et lieu de naissance :', (birthDate || birthPlace !== '—') ? `${birthDate} — ${birthPlace}` : '—', 1)
    textL('Nationalité :', val(contract[`${prefix}nationality` as keyof ContractRecord]), 2)
    textL('Adresse :', val(contract[`${prefix}address` as keyof ContractRecord]), 3)

    textDoc('N° passeport :', val(contract[`${prefix}passport_number` as keyof ContractRecord]), fmtDate(String(contract[`${prefix}passport_expires_at` as keyof ContractRecord] ?? '')), 4)
    textDoc('CIN :', val(contract[`${prefix}cin_number` as keyof ContractRecord]), fmtDate(String(contract[`${prefix}cin_expires_at` as keyof ContractRecord] ?? '')), 5)
    textDoc('Permis :', val(contract[`${prefix}license_number` as keyof ContractRecord]), fmtDate(String(contract[`${prefix}license_expires_at` as keyof ContractRecord] ?? '')), 6)
    textL('Tel (GSM) :', val(contract[`${prefix}phone` as keyof ContractRecord]), 7)
  }

  drawHalf(x, 'driver1_')
  drawHalf(rightX, 'driver2_')
  return h
}

function drawVehicleEquipment(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, contract: ContractRecord) {
  const h = 105
  const leftW = (w - COL_GAP) * 0.55
  const rightW = w - COL_GAP - leftW
  const rightX = x + leftW + COL_GAP

  strokeBox(doc, x, y, leftW, h)
  strokeBox(doc, rightX, y, rightW, h)

  sectionBar(doc, x, y, leftW, 'Description du véhicule')
  sectionBar(doc, rightX, y, rightW, 'Équipements et accessoires')

  const innerY = y + 18
  const lineH = 12
  const valX = x + 120

  const vehicleName = `${contract.vehicle_brand || ''} ${contract.vehicle_model || ''}`.trim()

  doc.font('Helvetica-Bold').fontSize(7).text('Marque :', x + 4, innerY)
  doc.font('Helvetica').fontSize(7).text(vehicleName || '—', valX, innerY)
  doc.font('Helvetica-Bold').fontSize(7).text('IMMT :', x + leftW - 90, innerY)
  doc.font('Helvetica-Bold').fontSize(8).text(val(contract.vehicle_plate), x + leftW - 60, innerY, { width: 50, align: 'right' })

  const textL = (lbl: string, valStr: string, row: number) => {
    doc.font('Helvetica-Bold').fontSize(7).text(lbl, x + 4, innerY + row * lineH)
    doc.font('Helvetica').fontSize(7).text(valStr || '', valX, innerY + row * lineH)
  }

  textL('Date et heure de départ :', withPlace(fmtDatetime(contract.departure_at || contract.start_date), contract.departure_place), 1.5)
  textL('KM de départ :', contract.departure_mileage != null ? String(contract.departure_mileage) : '—', 2.5)
  textL('Date et heure de retour :', withPlace(fmtDatetime(contract.return_at || contract.end_date), contract.return_place), 3.5)
  textL('KM de retour :', contract.return_mileage != null ? String(contract.return_mileage) : '—', 4.5)

  doc.font('Helvetica-Bold').fontSize(7).text('Nb de jours facturés :', x + 4, innerY + 5.5 * lineH)
  doc.font('Helvetica').fontSize(7).text(String(contract.billed_days ?? contract.total_days ?? '—'), valX, innerY + 5.5 * lineH)

  doc.font('Helvetica-Bold').fontSize(7).text('Prolongation jusqu\'à :', x + 4, innerY + 6.5 * lineH)
  doc.font('Helvetica').fontSize(7).text(contract.extension_until ? fmtDate(contract.extension_until) : '—', valX, innerY + 6.5 * lineH)
  doc.font('Helvetica-Bold').fontSize(7).text('Nb jours prolong. :', x + leftW - 100, innerY + 6.5 * lineH)
  doc.font('Helvetica').fontSize(7).text(String(contract.extension_days ?? 0), x + leftW - 20, innerY + 6.5 * lineH)

  // Equipments — fixed column widths to prevent label/checkbox overlap
  const equipment = parseJsonArray<string>(contract.equipment)
  const equipX = rightX + 6
  const equipRowH = 15
  const equipRows: Array<Array<{ key: string; label: string; slotW: number; labelW: number }>> = [
    [
      { key: 'radio', label: 'Poste Radio', slotW: 58, labelW: 44 },
      { key: 'spare_wheel', label: 'Roue de secours', slotW: 84, labelW: 70 },
      { key: 'jack', label: 'Cric', slotW: 36, labelW: 22 },
      { key: 'documents', label: 'Documents', slotW: 62, labelW: 48 },
    ],
    [
      { key: 'vest', label: 'Gilet', slotW: 44, labelW: 30 },
      { key: 'extinguisher', label: 'Extincteur', slotW: 58, labelW: 44 },
      { key: 'warning_triangle', label: 'Plaque de panne', slotW: 84, labelW: 70 },
      { key: 'baby_seat', label: 'Siège bébé', slotW: 58, labelW: 44 },
    ],
  ]

  equipRows.forEach((row, rowIndex) => {
    let cx = equipX
    const rowY = innerY + rowIndex * equipRowH
    row.forEach((item) => {
      drawCheckbox(doc, cx, rowY, equipment.includes(item.key), item.label, item.labelW)
      cx += item.slotW
    })
  })

  const autresY = innerY + 2 * equipRowH + 4
  drawCheckbox(doc, equipX, autresY, !!contract.equipment_other, 'Autres', 30)
  doc.moveTo(equipX + 50, autresY + 8).lineTo(rightX + rightW - 8, autresY + 8).stroke('#aaa')
  if (contract.equipment_other) {
    doc.font('Helvetica').fontSize(7).fillColor('#111').text(contract.equipment_other, equipX + 52, autresY, { width: rightW - 58, lineBreak: false })
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

  // Layout constants
  const legW = 46  // left legend column width
  const diagramX_offset = legW + 4
  const diagramW = w2 - diagramX_offset - 4
  const diagramY = y + 16
  const diagramH = h - 44

  ;[
    { damages: departureDamages, fuel: contract.departure_fuel_level || '', bx: x },
    { damages: returnDamages, fuel: contract.return_fuel_level || '', bx: rightX },
  ].forEach((block) => {
    const bx = block.bx

    // Legend on the LEFT side, vertically centered
    const legStartY = diagramY + 10
    const legItems = ['R - Rayure', 'B - Bosse', 'E - Éclat', 'C - Cassure']
    doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#111')
    legItems.forEach((item, i) => {
      doc.text(item, bx + 4, legStartY + i * 12, { width: legW - 4, lineBreak: false })
    })

    // Car diagram to the right of the legend
    drawCarDiagram(doc, bx + diagramX_offset, diagramY, diagramW, diagramH, block.damages)

    // Fuel gauge at the very bottom of the box
    drawFuelGauge(doc, bx + 4, y + h - 20, w2 - 8, block.fuel)
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
    if (y + blockH > PAGE.h - PAGE.m - FOOTER_H - 8) {
      drawFooter(doc, x, PAGE.h - PAGE.m - FOOTER_H, CONTENT_W, settings)
      doc.addPage({ size: 'A4', margin: 0 })
      y = PAGE.m
    }
    strokeBox(doc, x, y, CONTENT_W, blockH)
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111').text(block.title, x + 8, y + 8)
    drawCarDiagram(doc, x + 8, y + 24, diagramW, blockH - 32, block.damages)
    drawDamageList(doc, x + diagramW + 18, y + 28, listW - 12, block.damages)
    y += blockH
  })

  drawFooter(doc, x, PAGE.h - PAGE.m - FOOTER_H, CONTENT_W, settings)
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
    if (y + 28 + PHOTO_CELL_H > PAGE.h - PAGE.m - FOOTER_H - 8) {
      drawFooter(doc, x, PAGE.h - PAGE.m - FOOTER_H, CONTENT_W, settings)
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

  drawFooter(doc, x, PAGE.h - PAGE.m - FOOTER_H, CONTENT_W, settings)
}

function drawInvoice(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, contract: ContractRecord & { client_name?: string; paid_amount?: number }, breakdown: InvoiceBreakdown) {
  const vatApplies = Number(contract.vat_applies) === 1
  const vatRate = vatApplies ? Number(contract.vat_rate ?? 0) : 0
  const qty = contract.billed_days || 1
  const vehicleLabel = `${contract.vehicle_brand || ''} ${contract.vehicle_model || ''}`.trim()
  const lines = breakdown.lines.length > 0 ? breakdown.lines : [{ label: 'Location', amount: qty * (contract.daily_rate ?? 0) }]
  const paidAmount = Math.max(0, Number(contract.paid_amount ?? 0))
  const remainingUnpaid = Math.max(0, Number(breakdown.total_ttc) - paidAmount)

  // Columns: Désignation | Qté | P.U. HT | Montant HT | TVA % | Montant TVA | Total TTC
  const c = [w * 0.34, w * 0.06, w * 0.12, w * 0.12, w * 0.08, w * 0.12, w * 0.16]
  const headH = 13
  const rowH = 12

  let cy = y
  // Section bar
  sectionBar(doc, x, cy, w, 'Facture')
  cy += 14

  // Info line
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#111')
  doc.text(
    `N° facture : ${contract.contract_number}   |   Date : ${fmtDate(contract.contract_date || contract.start_date)}   |   Client : ${val(contract.driver1_name || contract.client_name)}`,
    x + 4, cy + 2, { width: w - 8, lineBreak: false }
  )
  cy += 12
  doc.moveTo(x, cy).lineTo(x + w, cy).lineWidth(0.5).stroke('#222')

  // Table header row (dark background)
  const headers = ['Désignation', 'Qté', 'P.U. HT', 'Montant HT', 'TVA', 'Montant TVA', 'Total TTC']
  doc.rect(x, cy, w, headH).fill('#374151')
  let cx2 = x
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#fff')
  headers.forEach((h, i) => {
    doc.text(h, cx2 + 2, cy + 3, { width: c[i] - 4, align: i === 0 ? 'left' : 'center', lineBreak: false })
    cx2 += c[i]
  })
  cy += headH

  // Table rows
  const tableStartY = cy
  lines.forEach((line, index) => {
    const amountTtc = Number(line.amount ?? 0)
    const amountHt = vatRate > 0 ? amountTtc / (1 + vatRate / 100) : amountTtc
    const amountVat = amountTtc - amountHt
    const isLocation = line.label === 'Location'
    const lineDays = Number(line.days ?? (isLocation ? qty : 0))
    const designation = isLocation ? `Location ${vehicleLabel || 'véhicule'} (${lineDays} j)` : line.label
    const puHt = lineDays > 0 ? money(amountHt / lineDays) : '—'

    if (index % 2 === 0) doc.rect(x, cy, w, rowH).fill('#f8fafc')
    doc.moveTo(x, cy).lineTo(x + w, cy).lineWidth(0.3).stroke('#ddd')

    const rowVals = [
      designation,
      lineDays > 0 ? String(lineDays) : '—',
      puHt,
      money(amountHt),
      vatApplies ? `${vatRate} %` : '—',
      vatApplies ? money(amountVat) : '—',
      money(amountTtc),
    ]

    cx2 = x
    doc.font('Helvetica').fontSize(6.5).fillColor('#111')
    rowVals.forEach((cell, i) => {
      doc.text(cell, cx2 + (i === 0 ? 4 : 2), cy + 3, { width: c[i] - 6, align: i === 0 ? 'left' : 'center', lineBreak: false })
      cx2 += c[i]
    })
    cy += rowH
  })

  // Table outer border + vertical column separators
  const tableH = headH + rowH * lines.length
  doc.rect(x, tableStartY - headH, w, tableH).lineWidth(0.5).stroke('#222')
  cx2 = x
  c.forEach((cw, i) => {
    cx2 += cw
    if (i < c.length - 1) {
      doc.moveTo(cx2, tableStartY - headH).lineTo(cx2, tableStartY - headH + tableH).lineWidth(0.3).stroke('#aaa')
    }
  })

  cy += 4

  // Summary block (right-aligned, full 4 rows)
  const sW = c[3] + c[4] + c[5] + c[6]
  const sX = x + w - sW
  const sRowH = 11

  const summaryRows: [string, string, string][] = [
    ['Total HT', money(breakdown.total_ht), '#111'],
    [`TVA (${vatApplies ? vatRate : 0} %)`, vatApplies ? money(breakdown.total_vat) : '—', '#111'],
    ['Total TTC', money(breakdown.total_ttc), '#111'],
    ['Montant payé', money(paidAmount), '#111'],
    ['Reste impayé', remainingUnpaid > 0 ? money(remainingUnpaid) : 'Soldé', remainingUnpaid > 0 ? '#b45309' : '#16a34a'],
  ]

  const sLabelW = sW * 0.55
  const sValW = sW - sLabelW
  summaryRows.forEach(([label, value, color], i) => {
    const isBold = i === 2 || i === 4
    const bgColor = i === 2 ? '#e5e7eb' : i % 2 === 0 ? '#f9fafb' : '#fff'
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

  // Extras line
  doc.font('Helvetica').fontSize(6).fillColor('#555')
  const franchise = Number(contract.franchise_amount) > 0 ? money(contract.franchise_amount) : 'Non'
  const caution = money(contract.deposit_amount ?? contract.deposit ?? 0)
  const tarifHt = money((contract.daily_rate ?? 0) / (vatRate > 0 ? 1 + vatRate / 100 : 1))
  const tarifTtc = money(contract.daily_rate ?? 0)
  doc.text(`Franchise : ${franchise}   |   Caution : ${caution}   |   Tarif/jour : ${tarifHt} HT / ${tarifTtc} TTC`, x + 4, cy, { width: w - 8, lineBreak: false })
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
  const legalText =
    settings.legal_mention_fr?.trim() ||
    'Chaque dommage touche la société pendant la période de location ; le locataire sera exposé à la responsabilité administrative et judiciaire jusqu\'à la décision finale, ainsi qu\'au paiement de tous les frais résultants.'

  strokeBox(doc, x, y, w, FOOTER_H)

  doc.font('Helvetica').fontSize(4.5).fillColor('#111')
  doc.text(legalText, x + 6, y + 4, { width: w - 12, align: 'left', lineGap: 0, height: 16 })

  const ids = [
    ['RC', settings.company_rc],
    ['IF', settings.company_if],
    ['TP', settings.company_tp],
    ['CNSS', settings.company_cnss],
    ['ICE', settings.company_ice],
  ] as const

  const idsY = y + 22
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

    drawFooter(doc, x, PAGE.h - PAGE.m - FOOTER_H, CONTENT_W, settings)
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
