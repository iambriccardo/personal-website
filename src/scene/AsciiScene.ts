import { Application, Container, Rectangle, Sprite, Texture } from 'pixi.js'
import { ASCII_FONT_FACE, ASCII_FONT_STACK } from '../asciiStyle'
import type { Point, SectionDefinition } from '../data/sections'
import { clamp, mix, random } from '../math'
import {
  easeInOutCubic,
  SECTION_OPEN_TRANSITION_MS,
  sectionTitleHandoffProgress,
} from '../motion'
import { generateAsciiField, organicCloudDensity } from './asciiField'

type SceneMode = 'home' | 'open'

type Particle = {
  sprite: Sprite
  sectionIndex: number
  localX: number
  localY: number
  seed: number
  introDelay: number
  introDuration: number
  introPower: number
  introExpoMix: number
  introArc: number
  introSourceRadius: number
  introScaleFrom: number
  edgeAngle: number
  baseScale: number
  scale: number
  scaleVelocity: number
  /** Polar angle of the cell around the cloud center. */
  angle: number
  /** 0 at the center, 1 at the boundary — gates every organic deformation. */
  edgeWeight: number
  /** Pseudo-depth used by the 3D yaw/pitch rotation. */
  zBase: number
  /**
   * Cells under the cloud title stay invisible at home and fade in while
   * zooming, so the cloud heals into a full blob once its title departs.
   */
  holeFiller: boolean
}
type ByteStream = {
  sprites: Sprite[]
  from: number
  to: number
  /** Index into the scene's link list; curves are computed once per route. */
  route: number
  /** Position of the byte-group center, measured from source to destination. */
  progress: number
  /** Set when the byte has been placed just inside its source cloud. */
  started: boolean
  /** Small post-assembly stagger so routes do not transmit in lockstep. */
  startDelay: number
  direction: 1 | -1
  laneOffset: number
  bitSpacingPx: number
  bitXJitter: number[]
  bitYJitter: number[]
  groupGap: number
  cadenceSeed: number
  packetCount: number
  /** Stable per-direction throughput, varied within a restrained range. */
  speed: number
  /** A slow shared pulse keeps a stream from reading as a conveyor belt. */
  flowPhase: number
  flowFrequency: number
  /** Smoothed hover multiplier so traffic accelerates without snapping. */
  speedScale: number
  /** Protocol bytes sent one at a time, with bits ordered MSB to LSB. */
  payload: Uint8Array
  byteIndex: number
}

type FixedGlyph = {
  sprite: Sprite
  sectionIndex: number
  letterIndex: number
  localX: number
  localY: number
  baseScale: number
  scale: number
  scaleVelocity: number
  introDelay: number
  introDuration: number
  introPower: number
  introOffsetX: number
  introOffsetY: number
}

export type TitleLetterRect = {
  x: number
  y: number
  width: number
  height: number
}

type TitleMorphTarget = {
  sectionIndex: number
  fontSize: number
  rects: TitleLetterRect[]
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ01ilrvmwz28:;,.+-*/\\<>[]{}|~^#@'
// The dark ink is the exact inversion of the light ink, so the theme
// curtain's backdrop invert produces pixel-identical colors mid-flip.
const INK_LIGHT = 0x0a0a0a
const INK_DARK = 0xf5f5f5
// Glyph atlases render at 2x so sprites stay crisp on high-density screens.
const ATLAS_RES = 2
const BYTE_WIDTH = 8
const PROTOCOL_PAYLOADS = [
  { label: 'TCP SYN', bytes: [0x50, 0x02] },
  { label: 'TCP SYN-ACK', bytes: [0x50, 0x12] },
  { label: 'TCP ACK', bytes: [0x50, 0x10] },
  { label: 'TCP FIN-ACK', bytes: [0x50, 0x11] },
  { label: 'TCP PSH-ACK', bytes: [0x50, 0x18] },
  { label: 'TCP RST', bytes: [0x50, 0x04] },
  { label: 'TCP sequence number', bytes: [0x00, 0x00, 0x00, 0x2a] },
  { label: 'TCP acknowledgment number', bytes: [0x00, 0x00, 0x00, 0x2b] },
  { label: 'TCP advertised window', bytes: [0xff, 0xff] },
  { label: 'TCP zero window', bytes: [0x00, 0x00] },
  {
    label: 'UDP DNS header',
    bytes: [0xc0, 0x00, 0x00, 0x35, 0x00, 0x08, 0x00, 0x00],
  },
  {
    label: 'UDP NTP header',
    bytes: [0xc0, 0x01, 0x00, 0x7b, 0x00, 0x08, 0x00, 0x00],
  },
] as const

const easeOutExpo = (value: number) =>
  value === 1 ? 1 : 1 - 2 ** (-10 * value)
const easeOutPower = (value: number, power: number) =>
  1 - (1 - value) ** power
function bitsForByte(byte: number) {
  return byte.toString(2).padStart(BYTE_WIDTH, '0')
}

function bezierPoint(
  t: number,
  start: { x: number; y: number },
  controlA: { x: number; y: number },
  controlB: { x: number; y: number },
  end: { x: number; y: number },
) {
  const n = 1 - t
  return {
    x:
      n ** 3 * start.x +
      3 * n ** 2 * t * controlA.x +
      3 * n * t ** 2 * controlB.x +
      t ** 3 * end.x,
    y:
      n ** 3 * start.y +
      3 * n ** 2 * t * controlA.y +
      3 * n * t ** 2 * controlB.y +
      t ** 3 * end.y,
  }
}

function bezierTangent(
  t: number,
  start: { x: number; y: number },
  controlA: { x: number; y: number },
  controlB: { x: number; y: number },
  end: { x: number; y: number },
) {
  const n = 1 - t
  return {
    x:
      3 * n ** 2 * (controlA.x - start.x) +
      6 * n * t * (controlB.x - controlA.x) +
      3 * t ** 2 * (end.x - controlB.x),
    y:
      3 * n ** 2 * (controlA.y - start.y) +
      6 * n * t * (controlB.y - controlA.y) +
      3 * t ** 2 * (end.y - controlB.y),
  }
}

type BezierCurve = {
  from: { x: number; y: number }
  controlA: { x: number; y: number }
  controlB: { x: number; y: number }
  to: { x: number; y: number }
}

/** Maps normalized route distance to Bézier t so bit gaps stay pixel-stable. */
function measureCurve(curve: BezierCurve, segments = 28) {
  const samples = [{ t: 0, distance: 0 }]
  let previous = curve.from
  let length = 0

  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments
    const point = bezierPoint(
      t,
      curve.from,
      curve.controlA,
      curve.controlB,
      curve.to,
    )
    length += Math.hypot(point.x - previous.x, point.y - previous.y)
    samples.push({ t, distance: length })
    previous = point
  }

  return { length: Math.max(1, length), samples }
}

function parameterAtRouteProgress(
  metrics: ReturnType<typeof measureCurve>,
  progress: number,
) {
  const target = clamp(progress) * metrics.length
  let index = 1
  while (
    index < metrics.samples.length - 1 &&
    metrics.samples[index].distance < target
  ) {
    index += 1
  }
  const previous = metrics.samples[index - 1]
  const next = metrics.samples[index]
  const span = Math.max(1e-6, next.distance - previous.distance)
  return mix(previous.t, next.t, (target - previous.distance) / span)
}

export class AsciiScene {
  private app = new Application()
  private root = new Container()
  private packetLayer = new Container()
  private particleLayer = new Container()
  private fixedGlyphLayer = new Container()
  private particles: Particle[] = []
  private byteStreams: ByteStream[] = []
  private fixedGlyphs: FixedGlyph[] = []
  private textures: Texture[] = []
  private fixedTextures: Texture[] = []
  private mode: SceneMode = 'home'
  private transitionFrom = 0
  private transitionTo = 0
  private transitionStart = 0
  private transitionDuration = 900
  private transitionProgress = 0
  private transitionLinearProgress = 0
  private selectedIndex = 0
  private hoveredIndex: number | null = null
  private startedAt = performance.now()
  private revealed = false
  private reducedMotion = false
  private manuallyPaused = false
  private hidden = false
  private pausedAt: number | null = null
  private totalPausedMs = 0
  private destroyed = false
  private initialized = false
  private width = 1
  private height = 1
  private mobile = false
  private compactLandscape = false
  private glyphEpoch = -1
  private cloudWidth = 1
  private cloudHeight = 1
  /** DOM-measured centers keep the WebGL clouds aligned with responsive safe areas. */
  private layoutAnchors: Point[] = []
  /** Intro-clock time when every cloud cell and title glyph has settled. */
  private communicationStartTime = 0
  /** Every unordered cloud pair; packets reference these by index. */
  private routes: Array<readonly [number, number]> = []
  /** Per-route control-point offsets, solved so curves clear other clouds. */
  private routeBends: Array<{ a: number; b: number }> = []
  private buildKey = ''
  private titleTarget: TitleMorphTarget | null = null
  private dark = false

  private get ink() {
    return this.dark ? INK_DARK : INK_LIGHT
  }

  constructor(
    private canvas: HTMLCanvasElement,
    private host: HTMLElement,
    private sections: SectionDefinition[],
  ) {}

  async init(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion
    const resolution = Math.min(window.devicePixelRatio || 1, 1.75)

    await Promise.all([
      this.app.init({
        canvas: this.canvas,
        resizeTo: this.host,
        // Transparent canvas: the page body owns the background, so the
        // theme can never disagree between DOM and WebGL.
        backgroundAlpha: 0,
        antialias: true,
        autoDensity: true,
        resolution,
        preference: 'webgl',
        powerPreference: 'high-performance',
      }),
      document.fonts.load(`400 15px ${ASCII_FONT_FACE}`),
      document.fonts.load(`700 15px ${ASCII_FONT_FACE}`),
    ])

    this.initialized = true
    if (import.meta.env.DEV) {
      ;(window as unknown as { __asciiScene?: AsciiScene }).__asciiScene = this
    }
    if (this.destroyed) {
      this.app.destroy({ removeView: false }, { children: true, texture: true })
      return
    }

    // Packets sit below the clouds so they appear to enter and disappear into
    // them. The title layer lives in screen space (outside the zoomed root)
    // so titles can morph into the HTML page heading during the zoom.
    this.root.addChild(this.packetLayer, this.particleLayer)
    this.app.stage.addChild(this.root, this.fixedGlyphLayer)
    this.createGlyphAtlas()
    // resize() sees a fresh buildKey and performs the initial rebuild().
    this.resize()
    // Re-tint for whatever theme was set while init was still awaiting.
    this.applyTheme()
    this.app.ticker.add(this.tick)
    // Respect a hide request that arrived while init was still awaiting.
    if (this.hidden) this.app.ticker.stop()
  }

  private createGlyphAtlas() {
    this.textures = this.createAtlas(400)
    this.fixedTextures = this.createAtlas(700)
  }

  private createAtlas(weight: 400 | 700) {
    const size = 24 * ATLAS_RES
    const atlas = document.createElement('canvas')
    atlas.width = size * GLYPHS.length
    atlas.height = size
    const context = atlas.getContext('2d')!
    context.clearRect(0, 0, atlas.width, atlas.height)
    // Glyphs are drawn white so sprite tints give exact final colors.
    context.fillStyle = '#ffffff'
    context.font = `${weight} ${15 * ATLAS_RES}px ${ASCII_FONT_STACK}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    ;[...GLYPHS].forEach((glyph, index) => {
      context.fillText(glyph, index * size + size / 2, size / 2 + ATLAS_RES)
    })

    const base = Texture.from(atlas)
    return [...GLYPHS].map(
      (_, index) =>
        new Texture({
          source: base.source,
          frame: new Rectangle(index * size, 0, size, size),
        }),
    )
  }

  private rebuild() {
    this.particles.forEach(({ sprite }) => sprite.destroy())
    this.byteStreams.forEach(({ sprites }) =>
      sprites.forEach((sprite) => sprite.destroy()),
    )
    this.fixedGlyphs.forEach(({ sprite }) => sprite.destroy())
    this.particles = []
    this.byteStreams = []
    this.fixedGlyphs = []

    // Clouds scale with the viewport so the three bubbles stay distinct on
    // small windows instead of merging into one mass.
    const fit = this.cloudFit()
    const compactCloud = this.mobile || this.compactLandscape
    const cloud = compactCloud
      ? { width: 232 * fit, height: 156 * fit, cellX: 7, cellY: 9, glyphScale: 0.48 }
      : { width: 388 * fit, height: 242 * fit, cellX: 7.4, cellY: 9.2, glyphScale: 0.51 }
    this.cloudWidth = cloud.width
    this.cloudHeight = cloud.height

    this.sections.forEach((section, sectionIndex) => {
      const title = section.label.toUpperCase()
      const titleScale = cloud.glyphScale * 1.85
      const titleAdvance = 15 * titleScale * 0.74
      const titleWidth = title.length * titleAdvance
      const cells = generateAsciiField({
        width: cloud.width,
        height: cloud.height,
        cellX: cloud.cellX,
        cellY: cloud.cellY,
        seed: sectionIndex * 100_000,
        sampleDensity: organicCloudDensity,
      })

      // The harmonic silhouette shifts the blob's visual mass, so recenter it
      // on the anchor to keep the title in the middle of the bubble.
      const centroidX =
        cells.reduce((sum, cell) => sum + cell.x, 0) / (cells.length || 1)
      const centroidY =
        cells.reduce((sum, cell) => sum + cell.y, 0) / (cells.length || 1)

      cells.forEach(({ x: rawX, y: rawY, seed }) => {
        const localX = rawX - centroidX
        const localY = rawY - centroidY
        // Cells occupied by the title stay empty at home and fill during zoom.
        const titleCell =
          Math.abs(localX) <= titleWidth * 0.5 + cloud.cellX * 0.5 &&
          Math.abs(localY) < cloud.cellY * 1.05

        const sprite = new Sprite(
          this.textures[Math.floor(random(seed + 9) * this.textures.length)],
        )
        sprite.anchor.set(0.5)
        sprite.scale.set(cloud.glyphScale / ATLAS_RES)
        sprite.alpha = 0.96
        sprite.tint = this.ink
        this.particleLayer.addChild(sprite)

        const normalizedRadius = Math.hypot(
          localX / (cloud.width * 0.5),
          localY / (cloud.height * 0.5),
        )
        const edgeWeight = clamp((normalizedRadius - 0.22) / 0.78) ** 1.4
        const depthEnvelope = Math.sqrt(
          clamp(1.08 - normalizedRadius * normalizedRadius),
        )

        this.particles.push({
          sprite,
          sectionIndex,
          localX,
          localY,
          seed,
          // Each cell receives a stable arrival profile. A little spatial
          // bias keeps the assembly coherent; seeded variation keeps it from
          // reading as one uniform easing curve.
          introDelay:
            sectionIndex * 0.035 +
            mix(0.015, 0.52, random(seed + 11) * 0.72 + edgeWeight * 0.28),
          introDuration: mix(0.76, 1.38, random(seed + 29)),
          introPower: mix(2.4, 5.4, random(seed + 31)),
          introExpoMix: mix(0.08, 0.62, random(seed + 37)),
          introArc:
            mix(-28, 28, random(seed + 41)) * (0.35 + edgeWeight * 0.65),
          introSourceRadius: mix(0.54, 0.68, random(seed + 43)),
          introScaleFrom: mix(0.7, 0.9, random(seed + 47)),
          edgeAngle:
            Math.atan2(localY, localX) + mix(-0.14, 0.14, random(seed + 17)),
          baseScale: cloud.glyphScale,
          scale: cloud.glyphScale,
          scaleVelocity: 0,
          angle: Math.atan2(localY, localX),
          edgeWeight,
          zBase:
            (random(seed + 23) - 0.5) * 2 * depthEnvelope * cloud.width * 0.2,
          holeFiller: titleCell,
        })
      })

      ;[...title].forEach((character, index) => {
        const glyphSeed = 500_000 + sectionIndex * 1000 + index * 71
        const sprite = new Sprite(this.textureFor(character, true))
        sprite.anchor.set(0.5)
        sprite.scale.set(titleScale / ATLAS_RES)
        sprite.alpha = 0
        sprite.tint = this.ink
        this.fixedGlyphLayer.addChild(sprite)
        this.fixedGlyphs.push({
          sprite,
          sectionIndex,
          letterIndex: index,
          localX: (index - (title.length - 1) * 0.5) * titleAdvance,
          localY: 0,
          baseScale: titleScale,
          scale: titleScale,
          scaleVelocity: 0,
          introDelay:
            0.4 +
            sectionIndex * 0.045 +
            index * 0.018 +
            random(glyphSeed + 3) * 0.14,
          introDuration: mix(0.3, 0.52, random(glyphSeed + 5)),
          introPower: mix(2.6, 4.8, random(glyphSeed + 7)),
          introOffsetX: mix(-11, 11, random(glyphSeed + 9)),
          introOffsetY: mix(7, 17, random(glyphSeed + 11)),
        })
      })
    })

    // Derive the handoff from the real assembly profiles rather than a
    // duplicate timeout. Bytes remain hidden and stationary until the final
    // cloud cell and title glyph have reached their rendered state.
    this.communicationStartTime = Math.max(
      0,
      ...this.particles.map(
        (particle) => particle.introDelay + particle.introDuration,
      ),
      ...this.fixedGlyphs.map((glyph) => glyph.introDelay + glyph.introDuration),
    )

    this.routes = this.sections.flatMap((_, index) =>
      this.sections
        .slice(index + 1)
        .map((__, offset) => [index, index + offset + 1] as const),
    )

    this.routes.forEach(([from, to], routeIndex) => {
      ;([1, -1] as const).forEach((direction) => {
        const streamSeed =
          1_200_000 + routeIndex * 10_000 + (direction === 1 ? 0 : 5_000)
        const payloadIndex = routeIndex * 2 + (direction === 1 ? 0 : 1)
        const protocol = PROTOCOL_PAYLOADS[payloadIndex % PROTOCOL_PAYLOADS.length]
        const payload = new Uint8Array(protocol.bytes)
        // Each byte follows the route as an ordered sequence. Arc-length
        // mapping below keeps this gap stable even through tight bends.
        const bitSpacingPx = compactCloud ? 17 : 24
        const bitXJitter = Array.from(
          { length: BYTE_WIDTH },
          (_, bitIndex) =>
            (random(streamSeed + 101 + bitIndex * 31) - 0.5) * bitSpacingPx * 0.22,
        )
        const bitYJitter = Array.from(
          { length: BYTE_WIDTH },
          (_, bitIndex) =>
            (random(streamSeed + 401 + bitIndex * 43) - 0.5) * 1.2,
        )
        const groupGap = mix(0.1, 0.18, random(streamSeed + 701))
        const speed = mix(0.064, 0.086, random(streamSeed + 29))
        const flowPhase = random(streamSeed + 41) * Math.PI * 2
        const flowFrequency = mix(0.34, 0.58, random(streamSeed + 53))
        const firstByteBits = bitsForByte(payload[0])
        const sprites = [...firstByteBits].map((bit) => {
          const sprite = new Sprite(this.textureFor(bit))
          sprite.anchor.set(0.5)
          sprite.scale.set((compactCloud ? 0.48 : 0.52) / ATLAS_RES)
          sprite.alpha = 0
          sprite.tint = this.ink
          this.packetLayer.addChild(sprite)
          return sprite
        })

        this.byteStreams.push({
          sprites,
          from,
          to,
          route: routeIndex,
          // The real starting position depends on the measured route length,
          // so it is assigned when communication begins after cloud assembly.
          progress: 0,
          started: false,
          startDelay: mix(0.08, 0.25, random(streamSeed + 17)),
          direction,
          // Keep opposing lanes clearly wider apart than one glyph, so the
          // two directions read as parallel flows rather than a collision.
          laneOffset: direction * (compactCloud ? 5.5 : 8),
          bitSpacingPx,
          bitXJitter,
          bitYJitter,
          groupGap,
          cadenceSeed: streamSeed + 809,
          packetCount: 0,
          speed,
          flowPhase,
          flowFrequency,
          speedScale: 1,
          payload,
          byteIndex: 0,
        })
      })
    })
  }

  private cloudFit() {
    const reference = this.compactLandscape
      ? Math.min(this.width / 950, this.height / 460)
      : this.mobile
        ? Math.min(this.width / 390, this.height / 720)
        : Math.min(this.width / 1360, this.height / 820)
    // Quantized so live window resizes only trigger a rebuild per step.
    return Math.round(clamp(reference, 0.66, 1.12) * 10) / 10
  }

  private textureFor(character: string, fixed = false) {
    const index = GLYPHS.indexOf(character)
    const atlas = fixed ? this.fixedTextures : this.textures
    return atlas[index >= 0 ? index : GLYPHS.indexOf('.')]
  }

  private getAnchor(index: number) {
    const layoutAnchor = this.layoutAnchors[index]
    if (layoutAnchor) return layoutAnchor

    const anchor = this.compactLandscape
      ? this.sections[index].anchor.compactLandscape
      : this.mobile
        ? this.sections[index].anchor.mobile
        : this.sections[index].anchor.desktop
    return { x: anchor.x * this.width, y: anchor.y * this.height }
  }

  private measureLayoutAnchors() {
    const hostRect = this.host.getBoundingClientRect()
    this.layoutAnchors = Array.from(
      this.host.querySelectorAll<HTMLElement>('[data-section-anchor]'),
      (element) => {
        const rect = element.getBoundingClientRect()
        return {
          x: rect.left - hostRect.left + rect.width * 0.5,
          y: rect.top - hostRect.top + rect.height * 0.5,
        }
      },
    )
  }

  private getCloudDrift(index: number, time: number) {
    return {
      x: Math.sin(time * 0.24 + index * 2.4) * 3.2,
      y: Math.cos(time * 0.19 + index * 1.7) * 2.6,
    }
  }

  private getAnimatedAnchor(index: number, time: number) {
    const anchor = this.getAnchor(index)
    const drift = this.getCloudDrift(index, time)
    return { x: anchor.x + drift.x, y: anchor.y + drift.y }
  }

  /**
   * Solves each route's control-point offsets against the actual layout so no
   * stream passes through a cloud that is not one of its endpoints.
   *
   * The lateral offset of the curve from its chord at parameter t is
   * `coefA(t) * bendA + coefB(t) * bendB` with the Bernstein weights of the
   * two inner control points. Each non-endpoint cloud contributes a keep-out
   * constraint at its chord projection; the solver prefers the gentle
   * house-style arc, falls back to the smallest clearing arc, and threads an
   * S-curve between clouds when a route is blocked on both sides (the stacked
   * mobile layout).
   */
  private computeRouteBends() {
    const halfWidth = this.cloudWidth * 0.5
    const halfHeight = this.cloudHeight * 0.5
    // Covers lane offsets, wobble, glyph size, cloud breathing, and drift.
    const margin = 34
    const coefA = (t: number) => 3 * (1 - t) ** 2 * t
    const coefB = (t: number) => 3 * (1 - t) * t ** 2

    this.routeBends = this.routes.map(([fromIndex, toIndex]) => {
      const from = this.getAnchor(fromIndex)
      const to = this.getAnchor(toIndex)
      const dx = to.x - from.x
      const dy = to.y - from.y
      const length = Math.hypot(dx, dy) || 1
      const directionX = dx / length
      const directionY = dy / length
      const normalX = -directionY
      const normalY = directionX

      const bendLimit = Math.min(this.width, this.height) * 0.16
      const base = Math.min(
        bendLimit,
        length * mix(0.14, 0.22, random(fromIndex * 7 + toIndex * 13 + 5)),
      )
      const paritySign = (fromIndex + toIndex) % 2 === 0 ? 1 : -1
      const uniform = (bend: number) => ({ a: bend, b: bend })

      const obstacles = this.sections.flatMap((_, cloudIndex) => {
        if (cloudIndex === fromIndex || cloudIndex === toIndex) return []
        const anchor = this.getAnchor(cloudIndex)
        const offsetX = anchor.x - from.x
        const offsetY = anchor.y - from.y
        const t = (offsetX * directionX + offsetY * directionY) / length
        // Clouds level with an endpoint cannot sit on the stream's span.
        if (t < 0.1 || t > 0.9) return []
        const lateral = offsetX * normalX + offsetY * normalY
        // The cloud's silhouette radius along the chord normal, treating the
        // blob as the ellipse it approximates.
        const radius = Math.hypot(normalX * halfWidth, normalY * halfHeight)
        return [{ t, lateral, clearance: radius + margin, weight: 3 * t * (1 - t) }]
      })

      if (!obstacles.length) return uniform(base * paritySign)

      const clears = (bend: number) =>
        obstacles.every(
          (obstacle) =>
            Math.abs(obstacle.weight * bend - obstacle.lateral) >=
            obstacle.clearance - 1,
        )

      // Candidate uniform bends: the aesthetic arc on either side, plus the
      // exact clearing bend on each side of every obstacle.
      const candidates = [base * paritySign, -base * paritySign]
      for (const obstacle of obstacles) {
        candidates.push(
          (obstacle.lateral + obstacle.clearance) / obstacle.weight,
          (obstacle.lateral - obstacle.clearance) / obstacle.weight,
        )
      }
      const cleared = candidates.filter(clears)
      const gentle = cleared
        .filter((bend) => Math.abs(bend) <= length * 0.5)
        .sort((p, q) => Math.abs(Math.abs(p) - base) - Math.abs(Math.abs(q) - base))
      if (gentle.length) return uniform(gentle[0])

      // Blocked on both sides: bend each control point independently so the
      // stream threads between the clouds, passing each with full clearance.
      if (obstacles.length >= 2) {
        const [first, second] = [...obstacles].sort((p, q) => p.t - q.t)
        const target = (obstacle: (typeof obstacles)[number]) =>
          obstacle.lateral -
          Math.sign(obstacle.lateral || 1) * obstacle.clearance
        const a11 = coefA(first.t)
        const a12 = coefB(first.t)
        const a21 = coefA(second.t)
        const a22 = coefB(second.t)
        const determinant = a11 * a22 - a12 * a21
        if (Math.abs(determinant) > 1e-6) {
          const targetFirst = target(first)
          const targetSecond = target(second)
          return {
            a: (targetFirst * a22 - a12 * targetSecond) / determinant,
            b: (a11 * targetSecond - targetFirst * a21) / determinant,
          }
        }
      }

      // A wide single-side bow is still better than crossing a cloud.
      const anyClearing = cleared.sort((p, q) => Math.abs(p) - Math.abs(q))
      return uniform(anyClearing.length ? anyClearing[0] : base * paritySign)
    })
  }

  private getCurve(fromIndex: number, toIndex: number, time: number, routeIndex: number) {
    const from = this.getAnimatedAnchor(fromIndex, time)
    const to = this.getAnimatedAnchor(toIndex, time)
    const dx = to.x - from.x
    const dy = to.y - from.y
    const distance = Math.hypot(dx, dy)
    const normalX = distance > 0 ? -dy / distance : 0
    const normalY = distance > 0 ? dx / distance : 0
    const bend = this.routeBends[routeIndex] ?? { a: 0, b: 0 }
    return {
      from,
      to,
      controlA: {
        x: from.x + dx * 0.3 + normalX * bend.a,
        y: from.y + dy * 0.3 + normalY * bend.a,
      },
      controlB: {
        x: from.x + dx * 0.7 + normalX * bend.b,
        y: from.y + dy * 0.7 + normalY * bend.b,
      },
    }
  }

  /**
   * Per-cloud motion state for one frame: a breathing pulse, a slow 3D
   * yaw/pitch oscillation, and the drifting phases of the boundary harmonics.
   */
  private getSectionMotion(time: number) {
    return this.sections.map((_, index) => {
      const yaw = Math.sin(time * 0.13 + index * 2.4) * 0.34
      const pitch = Math.sin(time * 0.093 + index * 1.3) * 0.2
      return {
        center: this.getAnimatedAnchor(index, time),
        cosYaw: Math.cos(yaw),
        sinYaw: Math.sin(yaw),
        cosPitch: Math.cos(pitch),
        sinPitch: Math.sin(pitch),
        breath: Math.sin(time * 0.43 + index * 1.45) * 0.024,
        phaseA: time * 0.31 + index * 1.7,
        phaseB: time * 0.23 - index * 3.1,
        phaseC: time * 0.41 + index * 0.9,
      }
    })
  }

  private tick = () => {
    const now = performance.now()
    // Hold the intro clock at zero until the boot loader hands over, so the
    // assembly animation always starts from its first frame.
    if (!this.revealed) {
      this.startedAt = now
      if (this.pausedAt !== null) this.pausedAt = now
    }
    const time = (now - this.startedAt) / 1000
    const elapsed = Math.min(this.app.ticker.deltaMS / 1000, 1 / 30)
    if (this.destroyed) return

    if (this.transitionProgress !== this.transitionTo) {
      const t = clamp((now - this.transitionStart) / this.transitionDuration)
      this.transitionLinearProgress = mix(this.transitionFrom, this.transitionTo, t)
      this.transitionProgress = mix(
        this.transitionFrom,
        this.transitionTo,
        easeInOutCubic(t),
      )
      if (t === 1) this.transitionProgress = this.transitionTo
    }

    // A pause freezes the ambient clock at its current phase. Resetting it to
    // zero would snap every cloud back to its initial position while the
    // post-reading backdrop is still fading in.
    const motionNow = this.pausedAt ?? now
    const motionTime = this.reducedMotion
      ? 0
      : Math.max(0, (motionNow - this.startedAt - this.totalPausedMs) / 1000)
    const nextGlyphEpoch = Math.floor(motionTime * 7)

    if (nextGlyphEpoch !== this.glyphEpoch) {
      this.glyphEpoch = nextGlyphEpoch
      this.particles.forEach((particle, index) => {
        if ((index + nextGlyphEpoch) % 6 !== 0) return
        particle.sprite.texture =
          this.textures[
            Math.floor(
              random(particle.seed + nextGlyphEpoch * 31) * this.textures.length,
            )
          ]
      })
    }

    // Opening a section zooms the whole world into the selected cloud: the
    // anchor pans toward the viewport center while everything scales around
    // it, until the cloud dissolves into a full-screen ASCII background.
    const zoomAmount = this.reducedMotion
      ? 1
      : this.mobile || this.compactLandscape
        ? 5.6
        : 5
    const zoom = mix(1, zoomAmount, this.transitionProgress)
    const focal = this.getAnchor(this.selectedIndex)
    const focalTargetX = mix(focal.x, this.width * 0.5, this.transitionProgress)
    const focalTargetY = mix(focal.y, this.height * 0.52, this.transitionProgress)
    this.root.scale.set(zoom)
    this.root.position.set(focalTargetX - focal.x * zoom, focalTargetY - focal.y * zoom)

    const sectionMotion = this.getSectionMotion(motionTime)

    this.particles.forEach((particle) => {
      const motion = sectionMotion[particle.sectionIndex]
      const introProgress = this.reducedMotion
        ? 1
        : clamp((time - particle.introDelay) / particle.introDuration)
      const intro = mix(
        easeOutPower(introProgress, particle.introPower),
        easeOutExpo(introProgress),
        particle.introExpoMix,
      )

      // The whole boundary undulates: low-frequency harmonics travel around
      // the edge so neighboring glyphs swell and shrink together, while the
      // center of the bubble stays still.
      const undulation =
        Math.sin(particle.angle * 2 + motion.phaseA) * 0.058 +
        Math.sin(particle.angle * 3 - motion.phaseB) * 0.042 +
        Math.sin(particle.angle * 5 + motion.phaseC) * 0.028
      const swell = 1 + (undulation + motion.breath) * particle.edgeWeight
      const swellX = particle.localX * swell
      const swellY = particle.localY * swell

      // Fake 3D: rotate the swollen cloud around its vertical and horizontal
      // axes using each glyph's pseudo-depth, gated toward the edges so the
      // title area stays legible.
      const rotatedX = swellX * motion.cosYaw + particle.zBase * motion.sinYaw
      let rotatedZ = -swellX * motion.sinYaw + particle.zBase * motion.cosYaw
      const rotatedY = swellY * motion.cosPitch + rotatedZ * motion.sinPitch
      rotatedZ = -swellY * motion.sinPitch + rotatedZ * motion.cosPitch
      const gate = 0.3 + 0.7 * particle.edgeWeight
      const depth = clamp(0.5 + rotatedZ / (this.cloudWidth * 0.55))

      const glyphDriftX = Math.sin(motionTime * 0.7 + particle.seed * 0.37) * 0.45
      const glyphDriftY = Math.cos(motionTime * 0.57 + particle.seed * 0.19) * 0.4
      const driftWeight = 0.3 + particle.edgeWeight * 0.7
      const homeX =
        motion.center.x + mix(swellX, rotatedX, gate) + glyphDriftX * driftWeight
      const homeY =
        motion.center.y + mix(swellY, rotatedY, gate) + glyphDriftY * driftWeight

      const sourceX =
        this.width *
        (0.5 + Math.cos(particle.edgeAngle) * particle.introSourceRadius)
      const sourceY =
        this.height *
        (0.5 + Math.sin(particle.edgeAngle) * particle.introSourceRadius)
      // A small perpendicular arc separates neighboring trajectories without
      // changing either endpoint or adding any frame-to-frame randomness.
      const arc = Math.sin(Math.PI * introProgress) * particle.introArc
      particle.sprite.x =
        mix(sourceX, homeX, intro) - Math.sin(particle.edgeAngle) * arc
      particle.sprite.y =
        mix(sourceY, homeY, intro) + Math.cos(particle.edgeAngle) * arc
      const holeFillAlpha = particle.holeFiller
        ? clamp((this.transitionProgress - 0.25) / 0.45)
        : 1
      particle.sprite.alpha =
        clamp((intro - 0.03) * 2.6) * (0.62 + 0.38 * depth) * holeFillAlpha

      const hoverTarget =
        this.hoveredIndex === particle.sectionIndex && this.transitionProgress === 0
          ? particle.baseScale * 1.16
          : particle.baseScale
      const scaleAcceleration = (hoverTarget - particle.scale) * 185
      particle.scaleVelocity =
        (particle.scaleVelocity + scaleAcceleration * elapsed) *
        Math.exp(-13 * elapsed)
      particle.scale += particle.scaleVelocity * elapsed
      particle.sprite.scale.set(
        (particle.scale *
          (0.92 + 0.16 * depth) *
          mix(particle.introScaleFrom, 1, intro)) /
          ATLAS_RES,
      )
    })

    const titleScrambleEpoch = Math.floor(time * 18)
    const morph =
      this.titleTarget && this.titleTarget.sectionIndex === this.selectedIndex
        ? this.titleTarget
        : null
    this.fixedGlyphs.forEach((glyph) => {
      const center = sectionMotion[glyph.sectionIndex].center
      // The title layer sits in screen space, so track the zoomed root by hand.
      const worldX = center.x + glyph.localX
      const worldY = center.y + glyph.localY
      let screenX = this.root.position.x + worldX * zoom
      let screenY = this.root.position.y + worldY * zoom

      const hoverTarget =
        this.hoveredIndex === glyph.sectionIndex && this.transitionProgress === 0
          ? glyph.baseScale * 1.16
          : glyph.baseScale
      const scaleAcceleration = (hoverTarget - glyph.scale) * 185
      glyph.scaleVelocity =
        (glyph.scaleVelocity + scaleAcceleration * elapsed) * Math.exp(-13 * elapsed)
      glyph.scale += glyph.scaleVelocity * elapsed
      const isSelected = glyph.sectionIndex === this.selectedIndex
      const targetCharacter = this.sections[glyph.sectionIndex].label
        .toUpperCase()[glyph.letterIndex]
      const resolveAt =
        0.76 +
        glyph.sectionIndex * 0.055 +
        glyph.letterIndex * 0.052 +
        random(840_000 + glyph.sectionIndex * 1000 + glyph.letterIndex * 71) * 0.16
      const titleResolved =
        this.reducedMotion ||
        time >= resolveAt ||
        (isSelected && this.transitionProgress > 0)

      glyph.sprite.texture = titleResolved
        ? this.textureFor(targetCharacter, true)
        : this.fixedTextures[
            Math.floor(
              random(
                880_000 +
                  glyph.sectionIndex * 1000 +
                  glyph.letterIndex * 71 +
                  titleScrambleEpoch * 131,
              ) * this.fixedTextures.length,
            )
          ]

      const fixedIntroProgress = this.reducedMotion
        ? 1
        : clamp((time - glyph.introDelay) / glyph.introDuration)
      const fixedIntro = easeOutPower(fixedIntroProgress, glyph.introPower)
      screenX += (1 - fixedIntro) * glyph.introOffsetX
      screenY += (1 - fixedIntro) * glyph.introOffsetY
      let screenScale =
        (glyph.scale / ATLAS_RES) * zoom * mix(0.88, 1, fixedIntro)
      let alpha = fixedIntro

      if (isSelected && this.transitionProgress > 0) {
        const rect = morph?.rects[glyph.letterIndex]
        if (rect && !this.reducedMotion) {
          // Fly each letter into its slot in the HTML heading, then hand off.
          const progress = this.transitionProgress
          screenX = mix(screenX, rect.x + rect.width / 2, progress)
          screenY = mix(screenY, rect.y + rect.height / 2, progress)
          screenScale = mix(screenScale, morph.fontSize / (15 * ATLAS_RES), progress)
          // The canvas and DOM use this exact shared easing function, so their
          // opacities stay complementary throughout the handoff.
          alpha =
            fixedIntro *
            (1 - sectionTitleHandoffProgress(this.transitionLinearProgress))
        } else {
          alpha = fixedIntro * (1 - this.transitionProgress)
        }
      }

      glyph.sprite.position.set(screenX, screenY)
      glyph.sprite.scale.set(screenScale)
      glyph.sprite.alpha = alpha
    })

    const attentionIndex =
      this.hoveredIndex ?? (this.mode === 'open' ? this.selectedIndex : null)
    // One curve per route per frame; both directional byte streams reuse it.
    const routeCurves = this.routes.map(([from, to], routeIndex) => {
      const curve = this.getCurve(from, to, motionTime, routeIndex)
      return { curve, metrics: measureCurve(curve) }
    })
    this.byteStreams.forEach((stream) => {
      const { curve, metrics } = routeCurves[stream.route]
      const streamStartTime = this.communicationStartTime + stream.startDelay
      const streamActive = this.reducedMotion || time >= streamStartTime
      const streamVisibility = this.reducedMotion
        ? 1
        : easeOutExpo(clamp((time - streamStartTime) / 0.32))

      if (streamActive && !stream.started) {
        const byteSpan =
          ((BYTE_WIDTH - 1) * stream.bitSpacingPx) / metrics.length
        // Keep the whole group inside its source until the cloud assembly is
        // complete. The leading edge then emerges from the cloud naturally
        // instead of materializing at a random point along the route.
        stream.progress = this.reducedMotion ? 0.24 : -byteSpan
        stream.started = true
      }

      // A focused node increases throughput on every attached stream in both
      // directions. Unrelated routes keep their normal pace and visibility.
      const connected =
        attentionIndex !== null &&
        (stream.from === attentionIndex || stream.to === attentionIndex)
      const targetSpeedScale = connected ? 2.25 : 1
      const speedResponse = 1 - Math.exp(-(connected ? 10 : 7) * elapsed)
      stream.speedScale += (targetSpeedScale - stream.speedScale) * speedResponse

      if (streamActive && !this.manuallyPaused && !this.reducedMotion) {
        // The low-amplitude pulse reads as fluctuating network throughput, not
        // random jitter. It is shared by each directional stream, preserving
        // the intentionally uneven packet spacing.
        const trafficPulse =
          1 +
          Math.sin(motionTime * stream.flowFrequency + stream.flowPhase) * 0.08 +
          Math.sin(
            motionTime * stream.flowFrequency * 2.17 + stream.flowPhase * 0.63,
          ) *
            0.035
        stream.progress +=
          elapsed * stream.speed * trafficPulse * stream.speedScale

        if (stream.progress > 1) {
          const { metrics } = routeCurves[stream.route]
          const byteSpan =
            ((BYTE_WIDTH - 1) * stream.bitSpacingPx) / metrics.length
          stream.packetCount += 1
          const pauseScale = mix(
            0.82,
            1.18,
            random(stream.cadenceSeed + stream.packetCount * 97),
          )
          stream.progress = -byteSpan - stream.groupGap * pauseScale
          stream.byteIndex = (stream.byteIndex + 1) % stream.payload.length
          const bits = bitsForByte(stream.payload[stream.byteIndex])
          stream.sprites.forEach((sprite, bitIndex) => {
            sprite.texture = this.textureFor(bits[bitIndex])
          })
        }
      }

      stream.sprites.forEach((sprite, bitIndex) => {
        // MSB starts the group; LSB remains last in the sending direction.
        // Small stable jitter never exceeds the inter-bit gap or changes order.
        const distanceFromSource =
          stream.progress +
          (bitIndex * stream.bitSpacingPx + stream.bitXJitter[bitIndex]) /
            metrics.length
        const onRoute = distanceFromSource > 0 && distanceFromSource < 1
        const routeProgress =
          stream.direction === 1 ? distanceFromSource : 1 - distanceFromSource
        const t = parameterAtRouteProgress(metrics, routeProgress)
        const point = bezierPoint(
          t,
          curve.from,
          curve.controlA,
          curve.controlB,
          curve.to,
        )
        const tangent = bezierTangent(
          t,
          curve.from,
          curve.controlA,
          curve.controlB,
          curve.to,
        )
        const tangentLength = Math.hypot(tangent.x, tangent.y) || 1
        const normalX = -tangent.y / tangentLength
        const normalY = tangent.x / tangentLength
        const wobble =
          Math.sin(
            motionTime * 1.3 + distanceFromSource * 12 + stream.laneOffset,
          ) * 0.65
        const routeOffset =
          stream.laneOffset + wobble + stream.bitYJitter[bitIndex]
        sprite.position.set(
          point.x + normalX * routeOffset,
          point.y + normalY * routeOffset,
        )
        const endpointFade = onRoute
          ? Math.sin(Math.PI * distanceFromSource) ** 0.45
          : 0
        sprite.alpha = streamVisibility * endpointFade * 0.96
      })
    })
  }

  setMode(
    mode: SceneMode,
    sectionId?: string,
    startedAt = performance.now(),
    animate = true,
  ) {
    this.mode = mode
    if (mode === 'open') this.hoveredIndex = null
    if (sectionId) {
      const index = this.sections.findIndex((section) => section.id === sectionId)
      if (index >= 0) this.selectedIndex = index
    }
    this.transitionFrom = this.transitionProgress
    this.transitionTo = mode === 'open' ? 1 : 0
    this.transitionStart = startedAt
    if (this.reducedMotion || !animate) {
      this.transitionProgress = this.transitionTo
      this.transitionLinearProgress = this.transitionTo
      this.transitionDuration = 1
    } else {
      this.transitionDuration = mode === 'open' ? SECTION_OPEN_TRANSITION_MS : 950
    }
  }

  /**
   * Screen-space rectangles of the open section's heading letters, measured
   * from the DOM. The cloud title morphs into these during the zoom.
   */
  setTitleTargets(sectionId: string, fontSize: number, rects: TitleLetterRect[]) {
    const sectionIndex = this.sections.findIndex(
      (section) => section.id === sectionId,
    )
    const label = this.sections[sectionIndex]?.label ?? ''
    this.titleTarget =
      sectionIndex >= 0 && rects.length === label.length
        ? { sectionIndex, fontSize, rects }
        : null
  }

  /** Starts the intro assembly; called when the boot loader fades out. */
  reveal() {
    this.revealed = true
  }

  setTheme(dark: boolean) {
    if (this.dark === dark) return
    this.dark = dark
    if (!this.initialized || this.destroyed) return
    this.applyTheme()
    // Render synchronously so the canvas swaps in the same paint as the DOM —
    // the theme curtain removes itself expecting no stale frame underneath.
    this.app.render()
  }

  private applyTheme() {
    this.particles.forEach(({ sprite }) => (sprite.tint = this.ink))
    this.fixedGlyphs.forEach(({ sprite }) => (sprite.tint = this.ink))
    this.byteStreams.forEach(({ sprites }) =>
      sprites.forEach((sprite) => (sprite.tint = this.ink)),
    )
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced
  }

  /**
   * While the world is completely covered by opaque content (reading a post),
   * stop the ticker so no per-frame sprite updates or WebGL renders run. The
   * ambient clocks are already frozen by the accompanying pause, so the frame
   * rendered on resume matches the one that was on screen before hiding.
   */
  setHidden(hidden: boolean) {
    if (hidden === this.hidden) return
    this.hidden = hidden
    if (!this.initialized || this.destroyed) return
    if (hidden) this.app.ticker.stop()
    else this.app.ticker.start()
  }

  setPaused(paused: boolean) {
    if (paused === this.manuallyPaused) return

    const now = performance.now()
    if (paused) {
      this.pausedAt = now
    } else if (this.pausedAt !== null) {
      this.totalPausedMs += now - this.pausedAt
      this.pausedAt = null
    }
    this.manuallyPaused = paused
  }

  setHovered(sectionId: string | null) {
    this.hoveredIndex = sectionId
      ? this.sections.findIndex((section) => section.id === sectionId)
      : null
    if (this.hoveredIndex === -1) this.hoveredIndex = null
  }

  resize() {
    const nextWidth = Math.max(1, this.host.clientWidth)
    const nextHeight = Math.max(1, this.host.clientHeight)
    const nextMobile = nextWidth < 720
    const nextCompactLandscape = nextHeight <= 560 && nextWidth / nextHeight >= 1.5
    this.width = nextWidth
    this.height = nextHeight
    if (!this.initialized) return
    this.app.renderer.resize(nextWidth, nextHeight)
    this.mobile = nextMobile
    this.compactLandscape = nextCompactLandscape
    this.measureLayoutAnchors()
    const nextBuildKey = `${nextMobile}:${nextCompactLandscape}:${this.cloudFit()}`
    if (nextBuildKey !== this.buildKey) {
      this.buildKey = nextBuildKey
      if (this.textures.length) this.rebuild()
    }
    // Anchors track the viewport continuously, so route avoidance must be
    // re-solved on every resize, not only when the field rebuilds.
    if (this.routes.length) this.computeRouteBends()
  }

  destroy() {
    this.destroyed = true
    if (!this.initialized) return
    this.app.ticker.remove(this.tick)
    this.app.destroy({ removeView: false }, { children: true, texture: true })
  }
}
