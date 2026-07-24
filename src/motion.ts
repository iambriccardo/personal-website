export type MotionEase = [number, number, number, number]

/** Shared curves for interface motion. Scene motion keeps its own spatial curve. */
export const EASE_ENTER: MotionEase = [0.22, 1, 0.36, 1]
export const EASE_EXIT: MotionEase = [0.4, 0, 1, 1]

/**
 * The scene zoom, canvas glyph flight, and DOM heading crossfade all derive
 * from this timeline. Keep section-title motion section-agnostic: only the
 * measured letter targets vary between About, Experience, Posts, and Contact.
 */
export const SECTION_OPEN_TRANSITION_MS = 1150
export const SECTION_TITLE_HANDOFF_START = 0.82

export const easeInOutCubic = (value: number) =>
  value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2

export const sectionTitleHandoffProgress = (linearProgress: number) => {
  const handoffProgress = Math.min(
    1,
    Math.max(
      0,
      (linearProgress - SECTION_TITLE_HANDOFF_START) /
        (1 - SECTION_TITLE_HANDOFF_START),
    ),
  )
  return easeInOutCubic(handoffProgress)
}

/** Coordinated post-index transition timings, expressed in seconds for Motion. */
export const POST_EXIT_DURATION = 0.16
export const POST_ENTER_DURATION = 0.34
