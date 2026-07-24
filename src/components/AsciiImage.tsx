import { useEffect, useRef, useState } from 'react'
import { ASCII_FONT_FACE, ASCII_GLYPH_ADVANCE_EM } from '../asciiStyle'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { clamp } from '../math'

/** Light to dense; index 0 renders nothing. */
const RAMP = ' .,:;~=+*#%@'
const EMPTY_ALPHA = 90
const EMPTY_DENSITY = 0.1

/** Ordered-dither matrix: breaks the contour bands a smooth gradient makes. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]
/** JetBrains Mono advance is 0.6em; cells are twice as tall as wide. */
const CHAR_WIDTH = ASCII_GLYPH_ADVANCE_EM
const CELL_ASPECT = 0.5

export type AsciiImageOptions = {
  /** Character columns of the rendering. */
  columns?: number
  /** Bright pixels become dense characters (for light subjects on dark). */
  invert?: boolean
  /**
   * Density from alpha coverage alone — for logo marks and other flat
   * cut-out shapes where the silhouette matters, not the shading.
   */
  solid?: boolean
  /**
   * Histogram percentiles (0-1) mapped to the ends of the character ramp.
   * Raise `low` to clip more of the background to empty space.
   */
  low?: number
  high?: number
}

type AsciiImageProps = AsciiImageOptions & {
  src: string
  alt: string
  caption?: string
  /** Fit both the available width and height instead of width alone. */
  fit?: 'width' | 'contain'
}

type AsciiGrid = {
  /** Ramp index per cell; 0 is empty and stays empty. */
  indices: Uint8Array
  columns: number
  rows: number
}

/**
 * Samples an image into ramp indices. Transparent pixels stay empty — a PNG
 * with no background renders nothing there. Remaining pixels are composited
 * over paper white before measuring brightness, and the density range is
 * auto-stretched from the image's own histogram so any exposure fills the
 * full character ramp.
 */
function sampleImage(
  image: HTMLImageElement,
  { columns = 96, invert = false, solid = false, low, high }: AsciiImageOptions,
): AsciiGrid {
  const rows = Math.max(
    1,
    Math.round((image.naturalHeight / image.naturalWidth) * columns * CELL_ASPECT),
  )
  const canvas = document.createElement('canvas')
  canvas.width = columns
  canvas.height = rows
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  // A whisper of blur smooths sensor noise and JPEG blockiness that would
  // otherwise speckle the flat regions.
  context.filter = solid ? 'none' : 'blur(0.6px)'
  context.drawImage(image, 0, 0, columns, rows)
  context.filter = 'none'
  const pixels = context.getImageData(0, 0, columns, rows).data

  if (solid) {
    // Silhouette mode: alpha is the density; anti-aliased edges become the
    // lighter ramp characters on their own.
    const indices = new Uint8Array(columns * rows)
    for (let cell = 0; cell < indices.length; cell += 1) {
      const coverage = pixels[cell * 4 + 3] / 255
      if (coverage < EMPTY_DENSITY) continue
      indices[cell] = Math.max(1, Math.round(coverage * (RAMP.length - 1)))
    }
    return { indices, columns, rows }
  }

  // First pass: raw density per covered cell. Perceptual luminance separates
  // subject detail from strongly coloured light blooms; a small dominant-
  // channel contribution keeps tinted portraits from collapsing toward black.
  const raw = new Float32Array(columns * rows).fill(-1)
  const covered: number[] = []
  for (let cell = 0; cell < raw.length; cell += 1) {
    const alpha = pixels[cell * 4 + 3]
    if (alpha < EMPTY_ALPHA) continue

    const r = pixels[cell * 4] / 255
    const g = pixels[cell * 4 + 1] / 255
    const b = pixels[cell * 4 + 2] / 255
    const coverage = alpha / 255
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const brightness =
      (0.8 * luminance + 0.2 * Math.max(r, g, b)) * coverage +
      (1 - coverage)
    const density = invert ? brightness : 1 - brightness
    raw[cell] = density
    covered.push(density)
  }

  // Second pass: percentile levels and a mild gamma lift.
  covered.sort((a, b) => a - b)
  const percentile = (p: number) =>
    covered.length ? covered[Math.floor(p * (covered.length - 1))] : 0
  const floor = percentile(low ?? 0.1)
  const ceiling = percentile(high ?? 0.97)
  const range = Math.max(0.001, ceiling - floor)

  const indices = new Uint8Array(columns * rows)
  for (let cell = 0; cell < indices.length; cell += 1) {
    if (raw[cell] < 0) continue
    let density = clamp((raw[cell] - floor) / range) ** 0.9
    if (density < EMPTY_DENSITY) continue
    // Dither midtones and highlights only; faint regions would turn into a
    // visible checker pattern instead of clean empty space.
    if (density > 0.22) {
      const column = cell % columns
      const row = (cell - column) / columns
      density = clamp(density + (BAYER[row % 4][column % 4] / 15 - 0.5) * 0.06)
    }
    indices[cell] = Math.max(1, Math.round(density * (RAMP.length - 1)))
  }

  // Despeckle: faint cells with mostly-empty neighborhoods are stray noise
  // (vignettes, JPEG artifacts), not subject — drop them.
  const cleaned = Uint8Array.from(indices)
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = row * columns + column
      if (indices[cell] === 0 || indices[cell] > 2) continue
      let neighbors = 0
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue
          const nx = column + dx
          const ny = row + dy
          if (nx >= 0 && nx < columns && ny >= 0 && ny < rows && indices[ny * columns + nx] > 0) {
            neighbors += 1
          }
        }
      }
      if (neighbors < 4) cleaned[cell] = 0
    }
  }

  return { indices: cleaned, columns, rows }
}

function gridToText(grid: AsciiGrid, jitterSeed: number) {
  const { indices, columns, rows } = grid
  const lines: string[] = []
  for (let row = 0; row < rows; row += 1) {
    let line = ''
    for (let column = 0; column < columns; column += 1) {
      let index = indices[row * columns + column]
      if (index > 1 && jitterSeed >= 0) {
        // Cheap deterministic-ish flicker: nudge a few cells one ramp step.
        const noise = Math.sin(row * 91.7 + column * 47.3 + jitterSeed * 13.1)
        if (noise > 0.92) index = Math.min(RAMP.length - 1, index + 1)
        else if (noise < -0.92) index -= 1
      }
      line += RAMP[index]
    }
    lines.push(line)
  }
  return lines.join('\n')
}

/**
 * Renders an image as living ASCII text, matching the site's glyph fields.
 */
export function AsciiImage({
  src,
  alt,
  caption,
  fit = 'width',
  ...options
}: AsciiImageProps) {
  const figureRef = useRef<HTMLElement>(null)
  const preRef = useRef<HTMLSpanElement>(null)
  const [grid, setGrid] = useState<AsciiGrid | null>(null)
  const reducedMotion = useReducedMotion()
  const columns = options.columns ?? 96

  useEffect(() => {
    let canceled = false
    const image = new Image()
    image.decoding = 'async'
    image.src = src
    Promise.all([
      image.decode(),
      document.fonts.load(`500 12px ${ASCII_FONT_FACE}`).catch(() => []),
    ])
      .then(() => {
        if (!canceled) setGrid(sampleImage(image, { ...options, columns }))
      })
      .catch(() => {})
    return () => {
      canceled = true
    }
    // `options` is a fresh object every render; depend on its primitive
    // fields so the image is only resampled when a setting actually changes.
  }, [src, columns, options.invert, options.solid, options.low, options.high])

  // Fit the character grid to the container width.
  useEffect(() => {
    const figure = figureRef.current
    const pre = preRef.current
    if (!figure || !pre || !grid) return
    const resizeArt = () => {
      const fitHeight =
        fit === 'contain' && window.matchMedia('(min-width: 720px)').matches
      const widthFontSize = figure.clientWidth / (grid.columns * CHAR_WIDTH)
      const caption = figure.querySelector('figcaption')
      // The contained caption uses auto margin to sit at the bottom. Only its
      // rendered box consumes portrait space; the auto gap must stay available
      // to the ASCII artwork rather than being subtracted a second time.
      const captionHeight = caption?.getBoundingClientRect().height ?? 0
      const availableHeight = Math.max(1, figure.clientHeight - captionHeight)
      const heightFontSize =
        availableHeight / (grid.rows * (CHAR_WIDTH / CELL_ASPECT))
      const fontSize = fitHeight
        ? Math.min(widthFontSize, heightFontSize)
        : widthFontSize
      pre.style.fontSize = `${fontSize}px`
      pre.style.lineHeight = `${fontSize * (CHAR_WIDTH / CELL_ASPECT)}px`
      pre.style.width = fitHeight
        ? `${grid.columns * CHAR_WIDTH * fontSize}px`
        : ''
      pre.style.marginInline = fitHeight ? 'auto' : ''
    }
    resizeArt()
    const observer = new ResizeObserver(resizeArt)
    observer.observe(figure)
    return () => observer.disconnect()
  }, [grid, fit])

  // Ambient shimmer, only while visible and only if motion is allowed.
  useEffect(() => {
    const pre = preRef.current
    if (!pre || !grid) return
    pre.textContent = gridToText(grid, -1)
    if (reducedMotion) return

    let interval = 0
    let epoch = 0
    const observer = new IntersectionObserver(([entry]) => {
      window.clearInterval(interval)
      interval = 0
      if (entry.isIntersecting) {
        interval = window.setInterval(() => {
          epoch += 1
          pre.textContent = gridToText(grid, epoch)
        }, 160)
      }
    })
    observer.observe(pre)
    return () => {
      observer.disconnect()
      window.clearInterval(interval)
    }
  }, [grid, reducedMotion])

  return (
    <figure
      ref={figureRef}
      className={`ascii-figure${grid ? ' is-ready' : ''}${fit === 'contain' ? ' is-contained' : ''}`}
    >
      <span ref={preRef} className="ascii-figure-art" role="img" aria-label={alt} />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  )
}
