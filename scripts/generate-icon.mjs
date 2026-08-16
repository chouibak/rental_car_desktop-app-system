import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pngToIco from 'png-to-ico'
import sharp from 'sharp'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(root, 'build')
const svgPath = path.join(buildDir, 'icon.svg')
const sizes = [16, 24, 32, 48, 64, 128, 256]

const svg = fs.readFileSync(svgPath)
const pngPaths = []

for (const size of sizes) {
  const out = path.join(buildDir, `icon-${size}.png`)
  await sharp(svg).resize(size, size).png().toFile(out)
  pngPaths.push(out)
}

await sharp(svg).resize(256, 256).png().toFile(path.join(buildDir, 'icon.png'))
await sharp(svg).resize(256, 256).png().toFile(path.join(buildDir, 'icon-app.png'))
await sharp(svg).resize(256, 256).png().toFile(path.join(buildDir, 'icon-256.png'))

const ico = await pngToIco(pngPaths)
fs.writeFileSync(path.join(buildDir, 'icon.ico'), ico)

const publicDir = path.join(root, 'public')
fs.mkdirSync(publicDir, { recursive: true })
fs.copyFileSync(path.join(buildDir, 'icon.ico'), path.join(publicDir, 'icon.ico'))
fs.copyFileSync(path.join(buildDir, 'icon.png'), path.join(publicDir, 'icon.png'))

console.log('Generated car app icon in build/ and public/')
