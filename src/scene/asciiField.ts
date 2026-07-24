import { clamp, random } from '../math'

export type AsciiCell = {
  x: number
  y: number
  seed: number
}

export type DensitySampler = (
  normalizedX: number,
  normalizedY: number,
  seed: number,
  fieldSeed: number,
) => number

export type AsciiFieldOptions = {
  width: number
  height: number
  cellX: number
  cellY: number
  seed: number
  sampleDensity: DensitySampler
}

/**
 * Turns any normalized density source into stable character cells.
 * A future image-to-ASCII source only needs to return pixel luminance here.
 */
export function generateAsciiField({
  width,
  height,
  cellX,
  cellY,
  seed: fieldSeed,
  sampleDensity,
}: AsciiFieldOptions): AsciiCell[] {
  const cells: AsciiCell[] = []
  const halfColumns = Math.floor(width / cellX / 2)
  const halfRows = Math.floor(height / cellY / 2)

  for (let row = -halfRows; row <= halfRows; row += 1) {
    for (let column = -halfColumns; column <= halfColumns; column += 1) {
      const seed = fieldSeed + (row + 80) * 1000 + column + 100
      const rowOffset = row % 2 === 0 ? 0 : cellX * 0.5
      const x = column * cellX + rowOffset
      const y = row * cellY
      const normalizedX = x / (width * 0.5)
      const normalizedY = y / (height * 0.5)
      const density = sampleDensity(normalizedX, normalizedY, seed, fieldSeed)

      if (density <= 0 || random(seed + 27) > density) continue

      cells.push({
        x: x + (random(seed + 12) - 0.5) * 1.6,
        y: y + (random(seed + 13) - 0.5) * 1.3,
        seed,
      })
    }
  }

  return cells
}

/**
 * Blob outline built from a few low-frequency angular harmonics, so every
 * field gets its own coherent organic silhouette instead of uniform noise.
 * Density fades toward the boundary, which stipples the edge like a cloud.
 */
export const organicCloudDensity: DensitySampler = (x, y, seed, fieldSeed) => {
  const angle = Math.atan2(y, x)
  const boundary =
    0.8 +
    Math.sin(angle * 2 + random(fieldSeed + 1) * Math.PI * 2) * 0.1 +
    Math.sin(angle * 3 + random(fieldSeed + 2) * Math.PI * 2) * 0.07 +
    Math.sin(angle * 5 + random(fieldSeed + 3) * Math.PI * 2) * 0.045
  const shape = Math.abs(x) ** 2.45 + Math.abs(y) ** 2.2
  const edge = (boundary - shape) / 0.24
  if (edge <= 0) return 0
  return clamp(edge + (random(seed + 4) - 0.5) * 0.14)
}
