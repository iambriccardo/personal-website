import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { ASCII_FONT_FACE, ASCII_GLYPH_ADVANCE_EM } from '../asciiStyle'
import { EASE_ENTER } from '../motion'

const WIDTH = 72
const HEIGHT = 34
const SHADES = '.,-~:;=!*#$@'
/** Glyph cell proportions: JetBrains Mono advance 0.6em, line-height 1.04em. */
const CELL_ASPECT = 1.04 / ASCII_GLYPH_ADVANCE_EM
const X_SCALE = 25
const Y_SCALE = X_SCALE / CELL_ASPECT

/**
 * Renders one frame of a 3D ASCII torus (the classic donut) into a string.
 * Luminance picks the character, a z-buffer keeps the nearest surface. The
 * projection compensates for the glyph cell aspect so the torus stays round.
 */
function torusFrame(a: number, b: number) {
  const output = new Array<string>(WIDTH * HEIGHT).fill(' ')
  const zBuffer = new Array<number>(WIDTH * HEIGHT).fill(0)
  const cosA = Math.cos(a)
  const sinA = Math.sin(a)
  const cosB = Math.cos(b)
  const sinB = Math.sin(b)

  for (let theta = 0; theta < Math.PI * 2; theta += 0.05) {
    const cosTheta = Math.cos(theta)
    const sinTheta = Math.sin(theta)
    for (let phi = 0; phi < Math.PI * 2; phi += 0.015) {
      const cosPhi = Math.cos(phi)
      const sinPhi = Math.sin(phi)
      const circleX = 2 + cosTheta
      const circleY = sinTheta

      const x = circleX * (cosB * cosPhi + sinA * sinB * sinPhi) - circleY * cosA * sinB
      const y = circleX * (sinB * cosPhi - sinA * cosB * sinPhi) + circleY * cosA * cosB
      const z = 5 + cosA * circleX * sinPhi + circleY * sinA
      const ooz = 1 / z

      const px = Math.floor(WIDTH / 2 + X_SCALE * ooz * x)
      const py = Math.floor(HEIGHT / 2 + Y_SCALE * ooz * y)
      if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) continue

      const luminance =
        cosPhi * cosTheta * sinB -
        cosA * cosTheta * sinPhi -
        sinA * sinTheta +
        cosB * (cosA * sinTheta - cosTheta * sinA * sinPhi)
      const index = px + py * WIDTH
      if (ooz > zBuffer[index]) {
        zBuffer[index] = ooz
        output[index] = SHADES[Math.max(0, Math.floor(luminance * 8))]
      }
    }
  }

  const rows: string[] = []
  for (let row = 0; row < HEIGHT; row += 1) {
    rows.push(output.slice(row * WIDTH, (row + 1) * WIDTH).join(''))
  }
  return rows.join('\n')
}

const INITIAL_FRAME = torusFrame(1, 0.6)

type BootLoaderProps = {
  reducedMotion: boolean
}

export function BootLoader({ reducedMotion }: BootLoaderProps) {
  const preRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const pre = preRef.current
    if (!pre) return
    let frame = 0
    let canceled = false

    // Wait for the site's mono font so the torus renders with the exact same
    // glyphs as the clouds, without reflowing mid-spin. The initial frame is
    // already present, so a slow font never leaves an empty loader.
    void document.fonts.load(`500 12px ${ASCII_FONT_FACE}`).finally(() => {
      if (canceled) return
      if (reducedMotion) return
      let a = 1
      let b = 0.6
      let last = performance.now()
      const loop = (now: number) => {
        const elapsed = Math.min((now - last) / 1000, 1 / 20)
        last = now
        a += elapsed * 1.9
        b += elapsed * 1.02
        pre.textContent = torusFrame(a, b)
        frame = requestAnimationFrame(loop)
      }
      frame = requestAnimationFrame(loop)
    })

    return () => {
      canceled = true
      cancelAnimationFrame(frame)
    }
  }, [reducedMotion])

  return (
    <motion.div
      className="boot-loader"
      role="status"
      aria-label="Loading"
      initial={{ opacity: 1 }}
      exit={{
        opacity: 0,
        transition: {
          duration: reducedMotion ? 0 : 0.25,
          ease: EASE_ENTER,
        },
      }}
    >
      <pre ref={preRef} aria-hidden="true">
        {INITIAL_FRAME}
      </pre>
      <p className="boot-caption">initializing</p>
    </motion.div>
  )
}
