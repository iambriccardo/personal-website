import { mkdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const [slug, inputPath] = process.argv.slice(2)

if (!slug || !inputPath) {
  throw new Error(
    'Usage: npm run optimize:post-image -- <post-slug> <source-image>',
  )
}

if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  throw new Error(`Post slug must use lowercase kebab-case: ${slug}`)
}

const source = resolve(inputPath)
const outputDirectory = resolve('public', 'posts', slug)
const coverPath = resolve(outputDirectory, 'cover.webp')
const socialCardPath = resolve(outputDirectory, 'social-card.jpg')

await mkdir(outputDirectory, { recursive: true })

const sourceMetadata = await sharp(source).metadata()

await sharp(source)
  .rotate()
  .resize({ width: 1600, withoutEnlargement: true })
  .webp({ quality: 82, effort: 6, smartSubsample: true })
  .toFile(coverPath)

await sharp(source)
  .rotate()
  .resize({
    width: 1200,
    height: 630,
    fit: 'cover',
    position: sharp.strategy.attention,
  })
  .flatten({ background: '#000000' })
  .jpeg({
    quality: 86,
    progressive: true,
    mozjpeg: true,
    chromaSubsampling: '4:4:4',
  })
  .toFile(socialCardPath)

const [sourceStats, coverStats, socialCardStats] = await Promise.all([
  stat(source),
  stat(coverPath),
  stat(socialCardPath),
])

const kilobytes = (bytes) => `${(bytes / 1024).toFixed(1)} kB`

console.log(`Source: ${sourceMetadata.width}x${sourceMetadata.height}, ${kilobytes(sourceStats.size)}`)
console.log(`Cover: ${coverPath}, ${kilobytes(coverStats.size)}`)
console.log(`Social card: ${socialCardPath}, ${kilobytes(socialCardStats.size)}`)
