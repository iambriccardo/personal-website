import { useLayoutEffect, useRef, useState } from 'react'

const SCRAMBLE_GLYPHS = '.-~=+*#$@<>/[]{}'
const SECOND_SCRAMBLE_AT_MS = 48
const RESOLVE_AT_MS = 96
const RESOLVE_DURATION_MS = 190

type GlyphAssemblyProps = {
  text: string
  reducedMotion: boolean
  delayMs?: number
  stepMs?: number
}

function scrambleGlyph(text: string, index: number, phase: number) {
  let seed = index * 71 + text.length * 29 + phase * 131
  for (let characterIndex = 0; characterIndex < text.length; characterIndex += 1) {
    seed += text.charCodeAt(characterIndex) * (characterIndex + 3)
  }
  return SCRAMBLE_GLYPHS[seed % SCRAMBLE_GLYPHS.length]
}

/**
 * Resolves text from terminal-like noise, one growing character at a time.
 * The real characters are laid out from the first frame to avoid reflow.
 */
export function GlyphAssembly({
  text,
  reducedMotion,
  delayMs = 0,
  stepMs = 34,
}: GlyphAssemblyProps) {
  const [settled, setSettled] = useState(reducedMotion)
  const hasAnimated = useRef(reducedMotion)
  const displayRefs = useRef<Array<HTMLSpanElement | null>>([])

  useLayoutEffect(() => {
    const characters = [...text]
    const showFinalText = () => {
      characters.forEach((character, index) => {
        const display = displayRefs.current[index]
        if (!display) return
        display.textContent = character === ' ' ? '\u00a0' : character
        display.className = 'glyph-display is-static'
        display.dataset.stage = 'final'
      })
      setSettled(true)
    }

    if (reducedMotion || hasAnimated.current) {
      showFinalText()
      return
    }

    hasAnimated.current = true
    displayRefs.current.forEach((display) => {
      if (!display) return
      display.textContent = ''
      display.className = 'glyph-display'
      display.dataset.stage = 'blank'
    })

    const startedAt = performance.now()
    const finalCharacterIndex = Math.max(0, characters.length - 1)
    const finalJitter = ((finalCharacterIndex * 17 + characters.length) % 3) * 9
    const settledAt =
      delayMs +
      finalCharacterIndex * stepMs +
      finalJitter +
      RESOLVE_AT_MS +
      RESOLVE_DURATION_MS
    let frame = 0

    const update = (now: number) => {
      const elapsed = now - startedAt

      characters.forEach((character, index) => {
        const display = displayRefs.current[index]
        if (!display) return
        const jitter = ((index * 17 + characters.length) % 3) * 9
        const characterElapsed = elapsed - (delayMs + index * stepMs + jitter)

        let stage = 'blank'
        if (characterElapsed >= RESOLVE_AT_MS || character === ' ') stage = 'final'
        else if (characterElapsed >= SECOND_SCRAMBLE_AT_MS) stage = 'scramble-1'
        else if (characterElapsed >= 0) stage = 'scramble-0'

        if (display.dataset.stage === stage) return
        display.dataset.stage = stage

        if (stage === 'blank') {
          display.textContent = ''
          display.className = 'glyph-display'
        } else if (stage === 'final') {
          display.textContent = character === ' ' ? '\u00a0' : character
          display.className = 'glyph-display is-final'
        } else {
          const phase = stage === 'scramble-0' ? 0 : 1
          display.textContent = scrambleGlyph(text, index, phase)
          display.className = 'glyph-display is-decoy'
        }
      })

      if (elapsed < settledAt) {
        frame = requestAnimationFrame(update)
      } else {
        setSettled(true)
      }
    }

    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [delayMs, reducedMotion, stepMs, text])

  return (
    <>
      <span
        className={`glyph-assembly${settled ? ' is-settled' : ''}`}
        aria-hidden="true"
      >
        {[...text].map((character, index) => {
          const whitespace = character === ' '

          return (
            <span className="glyph-character" key={index}>
              <span className="glyph-measure">{whitespace ? '\u00a0' : character}</span>
              <span
                className="glyph-display"
                ref={(element) => {
                  displayRefs.current[index] = element
                }}
              />
            </span>
          )
        })}
      </span>
      <span className="sr-only">{text}</span>
    </>
  )
}
