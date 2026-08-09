import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import bidiFactory from 'bidi-js'
import arabicReshaper from 'arabic-persian-reshaper'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const fontPath = path.join(root, 'electron', 'fonts', 'NotoNaskhArabic-Regular.ttf')
const text =
  'كل ضرر يمس الشركة خلال مدة الكراء، سيتحمل المستأجر أمام المسؤولية الإدارية والقانونية، إلى حين صدور القرار النهائي مع أداء جميع المصاريف الناتجة عن ذلك.'

const bidi = bidiFactory()
const { ArabicShaper } = arabicReshaper

const variants = {
  logical: text,
  shaped: ArabicShaper.convertArabic(text),
  shapedRev: ArabicShaper.convertArabic(text).split('').reverse().join(''),
  shapedBidi: bidi.getReorderedString(
    ArabicShaper.convertArabic(text),
    bidi.getEmbeddingLevels(ArabicShaper.convertArabic(text), 'rtl'),
  ),
}

for (const [name, prepared] of Object.entries(variants)) {
  const out = path.join(root, `test-ar-${name}.pdf`)
  const doc = new PDFDocument({ size: 'A4', margin: 40 })
  doc.pipe(fs.createWriteStream(out))
  doc.registerFont('Arabic', fontPath)
  doc.font('Helvetica').fontSize(10).text(`Variant: ${name}`, { align: 'left' })
  doc.moveDown()
  doc.font('Arabic').fontSize(11).text(prepared, { width: 500, align: 'right' })
  doc.end()
  console.log('wrote', out)
}
