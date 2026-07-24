/** Shared metrics for every ASCII renderer. Individual renderers may use
 * different density ramps or cell geometry, but they all resolve the same
 * glyph face and horizontal advance. */
export const ASCII_FONT_FACE = '"JetBrains Mono Variable"'
export const ASCII_FONT_STACK =
  '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace'
export const ASCII_GLYPH_ADVANCE_EM = 0.6
