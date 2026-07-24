import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const [inputPath] = process.argv.slice(2)

if (!inputPath) {
  throw new Error('Usage: npm run optimize:site-image -- <source-image>')
}

const source = resolve(inputPath)
const output = resolve('public', 'site-social-card.jpg')
const sourceMetadata = await sharp(source).metadata()

await sharp(source)
  .rotate()
  .resize({
    width: 1200,
    height: 630,
    fit: 'cover',
    position: 'centre',
  })
  .flatten({ background: '#000000' })
  .jpeg({
    quality: 86,
    progressive: true,
    mozjpeg: true,
    chromaSubsampling: '4:4:4',
  })
  .toFile(output)

const [sourceStats, outputStats] = await Promise.all([
  stat(source),
  stat(output),
])
const kilobytes = (bytes) => `${(bytes / 1024).toFixed(1)} kB`

console.log(
  `Source: ${sourceMetadata.width}x${sourceMetadata.height}, ${kilobytes(sourceStats.size)}`,
)
console.log(`Site social card: ${output}, 1200x630, ${kilobytes(outputStats.size)}`)
