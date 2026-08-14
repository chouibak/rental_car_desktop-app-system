import fs from 'node:fs'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import { PDFDocument as PdfLibDocument } from 'pdf-lib'
import type { ContractRecord } from './contracts-db'

type DamageItem = { part: string; type: string; note: string; photo?: string }

type InvoiceBreakdown = {
  total_ht: number
  total_vat: number
  total_ttc: number
  lines: Array<{ label: string; amount: number }>
}

const PAGE = { w: 595.28, h: 841.89, m: 22 }
const CONTENT_W = PAGE.w - PAGE.m * 2
const SECTION_GAP = 10
const COL_GAP = 6

function footerIdValue(value?: string) {
  const text = String(value ?? '').trim()
  return text || '—'
}

const PART_POSITIONS: Record<string, { x: number; y: number }> = {
  front: { x: 0.2, y: 0.5 },
  windshield: { x: 0.32, y: 0.5 },
  roof: { x: 0.5, y: 0.5 },
  left_side: { x: 0.5, y: 0.8 },
  right_side: { x: 0.5, y: 0.2 },
  rear: { x: 0.82, y: 0.5 },
  wheels: { x: 0.22, y: 0.88 },
  interior: { x: 0.5, y: 0.5 },
}

const PART_LABELS: Record<string, string> = {
  front: 'Avant',
  rear: 'Arrière',
  left_side: 'Côté gauche',
  right_side: 'Côté droit',
  roof: 'Toit',
  windshield: 'Pare-brise',
  wheels: 'Roues',
  interior: 'Intérieur',
}

const DAMAGE_LABELS: Record<string, string> = {
  R: 'Rayure',
  B: 'Bosse',
  E: 'Éclat',
  C: 'Cassure',
}

const PHOTO_GRID_COLS = 4
const PHOTO_CELL_H = 50
const PHOTO_LABEL_H = 9
const PHOTO_IMG_MAX_H = 34

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

function money(n: number, currency = 'DH') {
  const value = Number(n || 0)
  const negative = value < 0
  const abs = Math.abs(value)
  const fixed = abs.toFixed(2)
  const [intPart, decPart] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${negative ? '-' : ''}${grouped},${decPart} ${currency}`
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

function drawCleanCarOutline(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const srcW = 230
  const srcH = 100
  const scale = Math.min(w / srcW, h / srcH)
  const ox = x + (w - srcW * scale) / 2
  const oy = y + (h - srcH * scale) / 2
  const X = (u: number) => ox + u * scale
  const Y = (v: number) => oy + v * scale
  const S = (n: number) => n * scale

  doc.save()
  doc.lineWidth(Math.max(0.7, S(0.85)))
  doc.strokeColor('#222')
  doc.fillColor('#222')
  doc.lineJoin('round')
  doc.lineCap('round')

  const wheel = (cx: number, cy: number) => {
    doc.ellipse(X(cx), Y(cy), S(11), S(7.2)).stroke()
    doc.ellipse(X(cx), Y(cy), S(6.2), S(3.8)).stroke()
  }
  wheel(50, 14)
  wheel(50, 86)
  wheel(180, 14)
  wheel(180, 86)

  doc.roundedRect(X(28), Y(22), S(174), S(56), S(10)).stroke()

  doc.ellipse(X(32), Y(36), S(3.1), S(5.4)).stroke()
  doc.ellipse(X(32), Y(64), S(3.1), S(5.4)).stroke()
  doc.ellipse(X(198), Y(36), S(2.5), S(4.8)).stroke()
  doc.ellipse(X(198), Y(64), S(2.5), S(4.8)).stroke()

  doc.moveTo(X(60), Y(26)).lineTo(X(60), Y(74)).stroke()
  doc.moveTo(X(60), Y(26)).lineTo(X(82), Y(33)).lineTo(X(82), Y(67)).lineTo(X(60), Y(74)).closePath().stroke()
  doc.moveTo(X(148), Y(33)).lineTo(X(170), Y(26)).lineTo(X(170), Y(74)).lineTo(X(148), Y(67)).closePath().stroke()
  doc.moveTo(X(82), Y(33)).lineTo(X(148), Y(33)).stroke()
  doc.moveTo(X(82), Y(67)).lineTo(X(148), Y(67)).stroke()
  doc.moveTo(X(115), Y(22)).lineTo(X(115), Y(78)).stroke()

  doc.ellipse(X(76), Y(18), S(6.2), S(3.1)).stroke()
  doc.ellipse(X(76), Y(82), S(6.2), S(3.1)).stroke()

  const handle = (hx: number, hy: number) => {
    doc.roundedRect(X(hx), Y(hy), S(7), S(2.1), S(0.8)).stroke()
  }
  handle(94, 29.2)
  handle(126, 29.2)
  handle(94, 68.7)
  handle(126, 68.7)

  doc.font('Helvetica').fontSize(Math.max(4.2, S(5.5)))
  doc.text('AVANT', X(1), Y(46), { width: S(26), align: 'center', lineBreak: false })
  doc.restore()

  return { ox, oy, dw: srcW * scale, dh: srcH * scale }
}

function drawCarDiagram(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  w: number,
  h: number,
  damages: DamageItem[],
) {
  const box = drawCleanCarOutline(doc, x, y, w, h)

  doc.save()
  doc.font('Helvetica-Bold').fontSize(7).fillColor('#c0392b')
  for (const damage of damages) {
    const pos = PART_POSITIONS[damage.part] || { x: 0.5, y: 0.5 }
    const mx = box.ox + box.dw * pos.x - 4
    const my = box.oy + box.dh * pos.y - 4
    doc.text(damage.type, mx, my, { width: 12, align: 'center' })
  }
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

  textL('Date et heure de départ :', `${fmtDatetime(contract.departure_at || contract.start_date)}${contract.departure_place ? ` — ${contract.departure_place}` : ''}`, 1.5)
  textL('KM de départ :', contract.departure_mileage != null ? String(contract.departure_mileage) : '—', 2.5)
  textL('Date et heure de retour :', `${fmtDatetime(contract.return_at || contract.end_date)}${contract.return_place ? ` — ${contract.return_place}` : ''}`, 3.5)
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

    doc.font('Helvetica-Bold').fontSize(5).fillColor('#111')
    doc.text(`${partLabel} — ${typeLabel}`, cx + 3, cy + 1, { width: cellW - 6, align: 'left', lineBreak: false })

    try {
      doc.image(damage.photo!, cx + 3, cy + PHOTO_LABEL_H + 1, {
        fit: [cellW - 6, PHOTO_IMG_MAX_H],
      })
    } catch {
      // skip unreadable image
    }
  })
}

function drawVehicleState(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, contract: ContractRecord) {
  const baseH = 108
  const includePhotos = Number(contract.include_damage_photos_in_pdf) === 1
  const departureDamages = parseJsonArray<DamageItem>(contract.departure_damages)
  const returnDamages = parseJsonArray<DamageItem>(contract.return_damages)
  const departurePhotos = includePhotos ? damagePhotoItems(departureDamages) : []
  const returnPhotos = includePhotos ? damagePhotoItems(returnDamages) : []
  const photoRows = Math.max(photoGridRows(departurePhotos.length), photoGridRows(returnPhotos.length))
  const photoBlockH = photoRows > 0 ? photoRows * PHOTO_CELL_H + 4 : 0
  const h = baseH + photoBlockH
  const w2 = (w - COL_GAP) / 2
  const rightX = x + w2 + COL_GAP

  strokeBox(doc, x, y, w2, h)
  strokeBox(doc, rightX, y, w2, h)

  sectionBar(doc, x, y, w2, 'État du véhicule à la livraison')
  sectionBar(doc, rightX, y, w2, 'État du véhicule à la reprise')

  ;[
    { damages: departureDamages, fuel: contract.departure_fuel_level || '', bx: x },
    { damages: returnDamages, fuel: contract.return_fuel_level || '', bx: rightX },
  ].forEach((block) => {
    const bx = block.bx

    const legY = y + 20
    doc.font('Helvetica-Bold').fontSize(5.5).fillColor('#111')
    doc.text('R - Rayure', bx + 6, legY)
    doc.text('B - Bosse', bx + 6, legY + 10)
    doc.text('E - Éclat', bx + 6, legY + 20)
    doc.text('C - Cassure', bx + 6, legY + 30)

    drawCarDiagram(doc, bx + 46, y + 14, w2 - 54, baseH - 42, block.damages)
    drawFuelGauge(doc, bx + 6, y + baseH - 26, w2 - 12, block.fuel)
  })

  if (photoBlockH > 0) {
    const photoY = y + baseH
    doc.moveTo(x, photoY).lineTo(x + w2, photoY).stroke('#222')
    doc.moveTo(rightX, photoY).lineTo(rightX + w2, photoY).stroke('#222')
    if (departurePhotos.length > 0) drawDamagePhotoGrid(doc, x, photoY + 3, w2, departurePhotos)
    if (returnPhotos.length > 0) drawDamagePhotoGrid(doc, rightX, photoY + 3, w2, returnPhotos)
  }

  return h
}

function drawInvoice(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number, contract: ContractRecord & { client_name?: string; paid_amount?: number }, breakdown: InvoiceBreakdown) {
  const cols = [
    w * 0.40, // Désignation
    w * 0.05, // Qté
    w * 0.11, // P.U. HT
    w * 0.12, // Montant HT
    w * 0.08, // TVA
    w * 0.12, // Montant TVA
    w * 0.12  // Montant TTC
  ]

  const headerH = 14
  const tableHeadH = 14
  const rowH = 16
  const summaryH = 14
  const vatApplies = Number(contract.vat_applies) === 1
  const vatRate = vatApplies ? Number(contract.vat_rate ?? 0) : 0
  const qty = contract.billed_days || 1
  const vehicleLabel = `${contract.vehicle_brand || ''} ${contract.vehicle_model || ''}`.trim()
  const lines = breakdown.lines.length > 0 ? breakdown.lines : [{ label: 'Location', amount: qty * (contract.daily_rate ?? 0) }]
  const tableRowsH = rowH * lines.length
  const topBoxH = 14 + headerH + tableHeadH + tableRowsH

  strokeBox(doc, x, y, w, topBoxH)
  sectionBar(doc, x, y, w, 'Facture')

  const infoY = y + 14
  doc.moveTo(x, infoY + headerH).lineTo(x + w, infoY + headerH).stroke('#222')
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#111')
  doc.text(
    `N° facture : ${contract.contract_number}   |   Date : ${fmtDate(contract.contract_date || contract.start_date)}   |   Le locataire (client) : ${val(contract.driver1_name || contract.client_name)}`,
    x + 6,
    infoY + 4,
  )

  const tableY = infoY + headerH
  let cx = x
  const headers = ['Désignation', 'Qté', 'P.U. HT', 'Montant HT', 'TVA', 'Montant TVA', 'Montant TTC']
  doc.font('Helvetica-Bold').fontSize(7)
  headers.forEach((h, i) => {
    if (i > 0) doc.moveTo(cx, tableY).lineTo(cx, tableY + tableHeadH + tableRowsH).stroke('#222')
    doc.text(h, cx, tableY + 4, { width: cols[i], align: 'center' })
    cx += cols[i]
  })
  doc.moveTo(x, tableY + tableHeadH).lineTo(x + w, tableY + tableHeadH).stroke('#222')

  lines.forEach((line, index) => {
    const rowY = tableY + tableHeadH + index * rowH
    if (index > 0) doc.moveTo(x, rowY).lineTo(x + w, rowY).stroke('#222')

    const amountTtc = Number(line.amount ?? 0)
    const amountHt = vatRate > 0 ? amountTtc / (1 + vatRate / 100) : amountTtc
    const amountVat = amountTtc - amountHt
    const isLocation = line.label === 'Location'
    const designation = isLocation
      ? `Location ${vehicleLabel || 'véhicule'} (${qty} j)`
      : line.label

    const rowValues = [
      designation,
      isLocation ? String(qty) : '—',
      isLocation && qty > 0 ? money(amountHt / qty) : '—',
      money(amountHt),
      vatApplies ? `${vatRate} %` : '—',
      vatApplies ? money(amountVat) : '—',
      money(amountTtc),
    ]

    cx = x
    doc.font('Helvetica').fontSize(6.5).fillColor('#111')
    rowValues.forEach((cell, i) => {
      if (i === 0) doc.text(cell, cx + 4, rowY + 5, { width: cols[i] - 8, align: 'left' })
      else doc.text(cell, cx, rowY + 5, { width: cols[i], align: 'center' })
      cx += cols[i]
    })
  })

  // Summary box
  const summaryY = y + topBoxH
  const labelW = cols[3] + cols[4] + cols[5]
  const valueW = cols[6]
  const sumX = x + cols[0] + cols[1] + cols[2]

  // Total HT
  strokeBox(doc, sumX, summaryY, labelW + valueW, summaryH)
  doc.moveTo(sumX + labelW, summaryY).lineTo(sumX + labelW, summaryY + summaryH).stroke('#222')
  doc.font('Helvetica-Bold').text('Total HT', sumX + 4, summaryY + 4)
  doc.text(money(breakdown.total_ht), sumX + labelW, summaryY + 4, { width: valueW - 4, align: 'right' })

  // TVA
  strokeBox(doc, sumX, summaryY + summaryH, labelW + valueW, summaryH)
  doc.moveTo(sumX + labelW, summaryY + summaryH).lineTo(sumX + labelW, summaryY + summaryH * 2).stroke('#222')
  doc.font('Helvetica-Bold').text(`TVA (${vatApplies ? vatRate : 0} %)`, sumX + 4, summaryY + summaryH + 4)
  doc.text(vatApplies ? money(breakdown.total_vat) : '—', sumX + labelW, summaryY + summaryH + 4, { width: valueW - 4, align: 'right' })

  // Total TTC
  strokeBox(doc, sumX, summaryY + summaryH * 2, labelW + valueW, summaryH)
  doc.moveTo(sumX + labelW, summaryY + summaryH * 2).lineTo(sumX + labelW, summaryY + summaryH * 3).stroke('#222')
  doc.font('Helvetica-Bold').text('Total TTC', sumX + 4, summaryY + summaryH * 2 + 4)
  doc.text(money(breakdown.total_ttc), sumX + labelW, summaryY + summaryH * 2 + 4, { width: valueW - 4, align: 'right' })

  const paidAmount = Math.max(0, Number(contract.paid_amount ?? 0))
  const remainingUnpaid = Math.max(0, Number(breakdown.total_ttc) - paidAmount)

  // Montant payé
  strokeBox(doc, sumX, summaryY + summaryH * 3, labelW + valueW, summaryH)
  doc.moveTo(sumX + labelW, summaryY + summaryH * 3).lineTo(sumX + labelW, summaryY + summaryH * 4).stroke('#222')
  doc.font('Helvetica-Bold').text('Montant payé', sumX + 4, summaryY + summaryH * 3 + 4)
  doc.text(money(paidAmount), sumX + labelW, summaryY + summaryH * 3 + 4, { width: valueW - 4, align: 'right' })

  // Reste impayé
  strokeBox(doc, sumX, summaryY + summaryH * 4, labelW + valueW, summaryH)
  doc.moveTo(sumX + labelW, summaryY + summaryH * 4).lineTo(sumX + labelW, summaryY + summaryH * 5).stroke('#222')
  doc.font('Helvetica-Bold').fillColor(remainingUnpaid > 0 ? '#b45309' : '#111')
  doc.text('Reste impayé', sumX + 4, summaryY + summaryH * 4 + 4)
  doc.text(
    remainingUnpaid > 0 ? money(remainingUnpaid) : 'Soldé',
    sumX + labelW,
    summaryY + summaryH * 4 + 4,
    { width: valueW - 4, align: 'right' },
  )
  doc.fillColor('#111')

  // Extras
  const extrasY = summaryY + summaryH * 5 + 4
  doc.font('Helvetica-Bold').fontSize(6.5).text('Franchise : ', sumX + 4, extrasY, { continued: true }).font('Helvetica').text(
    Number(contract.franchise_amount) > 0 ? money(contract.franchise_amount) : 'Non',
  )
  doc.font('Helvetica-Bold').text('Caution : ', sumX + 4, extrasY + 10, { continued: true }).font('Helvetica').text(money(contract.deposit_amount ?? contract.deposit ?? 0))
  doc.font('Helvetica-Bold').text('Tarif / jour : ', sumX + 4, extrasY + 20, { continued: true }).font('Helvetica').text(
    vatApplies
      ? `${money((contract.daily_rate ?? 0) / (1 + vatRate / 100))} HT / ${money(contract.daily_rate ?? 0)} TTC`
      : money(contract.daily_rate ?? 0)
  )

  return topBoxH + summaryH * 5 + 34
}

function drawSignatures(doc: InstanceType<typeof PDFDocument>, x: number, y: number, w: number) {
  const headerH = 14
  const partyRowH = 14
  const subHeaderH = 12
  const legalH = 12
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

  const footerH = 32
  strokeBox(doc, x, y, w, footerH)

  doc.font('Helvetica').fontSize(4.5).fillColor('#111')
  doc.text(legalText, x + 6, y + 4, { width: w - 12, align: 'left', lineGap: 0 })

  const ids = [
    ['RC', settings.company_rc],
    ['IF', settings.company_if],
    ['TP', settings.company_tp],
    ['CNSS', settings.company_cnss],
    ['ICE', settings.company_ice],
  ] as const

  const idsY = y + 16
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

    const footerY = PAGE.h - PAGE.m - 32
    drawFooter(doc, x, footerY, CONTENT_W, settings)
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
