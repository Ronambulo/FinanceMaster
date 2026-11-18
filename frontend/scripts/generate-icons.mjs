// Iconos de la PWA desde public/icon.svg:  node scripts/generate-icons.mjs
// PNG truecolor y opacos (iOS ignora los de paleta y pinta de negro lo transparente).
import { copyFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const PUBLIC = join(import.meta.dirname, '..', 'public')
const BG = '#5b52f0'
const svg = await readFile(join(PUBLIC, 'icon.svg'))

async function render(size, padding, file) {
  const inner = Math.round(size * (1 - padding * 2))
  const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 3, background: BG } })
    .composite([{ input: art, gravity: 'center' }])
    .removeAlpha()
    .png({ compressionLevel: 9, palette: false })
    .toFile(join(PUBLIC, file))
  console.log(`ok ${file}`)
}

await render(64, 0, 'pwa-64x64.png')
await render(192, 0, 'pwa-192x192.png')
await render(512, 0, 'pwa-512x512.png')
await render(512, 0.12, 'maskable-icon-512x512.png')
await render(180, 0, 'apple-touch-icon-180x180.png')
await render(32, 0, 'favicon-32x32.png')
for (const alias of ['apple-touch-icon.png', 'apple-touch-icon-precomposed.png']) {
  await copyFile(join(PUBLIC, 'apple-touch-icon-180x180.png'), join(PUBLIC, alias))
}
