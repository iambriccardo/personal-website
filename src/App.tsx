import { AnimatePresence, MotionConfig } from 'motion/react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { version as SITE_VERSION } from '../package.json'
import { AsciiWorld } from './components/AsciiWorld'
import { BootLoader } from './components/BootLoader'
import { GlyphAssembly } from './components/GlyphAssembly'
import { preloadPostsSection } from './components/postsSectionLoader'
import { getSection, sections } from './data/sections'
import { getSectionPage } from './data/sitePages'
import { useReducedMotion } from './hooks/useReducedMotion'
import { clamp } from './math'
import type { AsciiScene, TitleLetterRect } from './scene/AsciiScene'
import { applyDocumentMetadata } from './seo'

type SectionPanelModule = {
  default: typeof import('./components/SectionPanel').SectionPanel
}

let sectionPanelPromise: Promise<SectionPanelModule> | null = null

function loadSectionPanel() {
  sectionPanelPromise ??= import('./components/SectionPanel').then((module) => {
    // Posts content lives in its own chunk; fetch it alongside the panel so
    // every section's copy renders synchronously when the panel opens.
    preloadPostsSection()
    return { default: module.SectionPanel }
  })
  return sectionPanelPromise
}

const SectionPanel = lazy(loadSectionPanel)

function preloadSectionPanel() {
  void loadSectionPanel()
  void document.fonts.load('400 16px Sohne')
  void document.fonts.load('500 16px Sohne')
  void document.fonts.load('500 16px "Founders Grotesk"')
}

const THEME_PIXEL_MS = 900
const THEME_PIXEL_JITTER_MS = 150
// Keep the curtain cells close to the cloud-title glyph size so they read as
// display pixels rather than large tiles across both mobile and desktop.
const THEME_PIXEL_MIN_SIZE = 9
const THEME_PIXEL_MAX_SIZE = 14
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const BOOT_SESSION_KEY = 'rb-boot-seen-v1'
const BOOT_HOLD_MS = 650
const REDUCED_MOTION_BOOT_DURATION_MS = 250

let themeClipId = 0

type ThemePixel = {
  path: string
  revealAt: number
}

// Stable spatial noise keeps the pixel front irregular without changing its
// shape between frames or relying on a large set of animated DOM elements.
const pixelNoise = (column: number, row: number) => {
  const value = Math.sin(column * 127.1 + row * 311.7) * 43758.5453
  return value - Math.floor(value)
}

function createThemePixels(width: number, height: number): ThemePixel[] {
  const pixelSize = clamp(
    Math.round(Math.min(width, height) / 64),
    THEME_PIXEL_MIN_SIZE,
    THEME_PIXEL_MAX_SIZE,
  )
  const columns = Math.ceil(width / pixelSize)
  const rows = Math.ceil(height / pixelSize)
  const rowDuration = THEME_PIXEL_MS - THEME_PIXEL_JITTER_MS
  const pixels: ThemePixel[] = []

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = column * pixelSize
      const y = row * pixelSize
      const overlap = 1
      const rowProgress = rows === 1 ? 0 : row / (rows - 1)
      const revealAt = rowProgress * rowDuration + pixelNoise(column, row) * THEME_PIXEL_JITTER_MS

      pixels.push({
        path: `M${x} ${y}h${Math.min(pixelSize + overlap, width - x)}v${Math.min(pixelSize + overlap, height - y)}h-${Math.min(pixelSize + overlap, width - x)}Z`,
        revealAt,
      })
    }
  }

  return pixels.sort((a, b) => a.revealAt - b.revealAt)
}

type ThemeStableClone = {
  source: HTMLElement
  clone: HTMLElement
}

/** The element's viewport rectangle, or null when nothing of it is on screen. */
function visibleViewportBounds(element: HTMLElement) {
  const bounds = element.getBoundingClientRect()
  const isVisible =
    bounds.width > 0 &&
    bounds.height > 0 &&
    bounds.right > 0 &&
    bounds.bottom > 0 &&
    bounds.left < window.innerWidth &&
    bounds.top < window.innerHeight
  return isVisible ? bounds : null
}

function syncThemeStableClone({ source, clone }: ThemeStableClone) {
  if (!source.isConnected) {
    clone.hidden = true
    return
  }

  const bounds = visibleViewportBounds(source)
  clone.hidden = !bounds
  if (!bounds) return

  clone.style.setProperty('--theme-stable-x', `${bounds.left}px`)
  clone.style.setProperty('--theme-stable-y', `${bounds.top}px`)
  clone.style.width = `${bounds.width}px`
  clone.style.height = `${bounds.height}px`
}

function preserveThemeStableElements(): ThemeStableClone[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('[data-theme-stable]'),
  ).flatMap((element) => {
    if (!visibleViewportBounds(element)) return []

    // The transition curtain uses backdrop inversion, which would otherwise
    // recolor photography and editorial artwork. A short-lived visual clone
    // keeps those pixels unchanged above the curtain until the theme commits.
    const clone = element.cloneNode(true) as HTMLElement
    clone.classList.add('theme-stable-clone')
    clone.removeAttribute('data-theme-stable')
    clone.setAttribute('aria-hidden', 'true')
    clone.inert = true
    document.body.appendChild(clone)
    const preserved = { source: element, clone }
    syncThemeStableClone(preserved)
    return [preserved]
  })
}

type SiteRoute = {
  sectionId: string | null
  postSlug: string | null
}

function routePath(route: SiteRoute) {
  if (route.sectionId === 'posts' && route.postSlug) {
    return `/posts/${encodeURIComponent(route.postSlug)}/`
  }
  return route.sectionId ? `/${encodeURIComponent(route.sectionId)}/` : '/'
}

function routeFromLocation(): SiteRoute {
  const postPath = window.location.pathname.match(/^\/posts\/([^/]+)\/?$/)
  if (postPath) {
    return { sectionId: 'posts', postSlug: decodeURIComponent(postPath[1]) }
  }

  const sectionPath = window.location.pathname.match(/^\/([^/]+)\/?$/)
  const pathSection = getSection(
    sectionPath ? decodeURIComponent(sectionPath[1]) : null,
  )
  if (pathSection) return { sectionId: pathSection.id, postSlug: null }

  return { sectionId: null, postSlug: null }
}

function shouldShowBoot() {
  if (routeFromLocation().sectionId) return false

  try {
    return !sessionStorage.getItem(BOOT_SESSION_KEY)
  } catch {
    // If storage is unavailable, preserve the intro instead of failing startup.
    return true
  }
}

type Theme = 'light' | 'dark'
const THEME_STORAGE_KEY = 'rb-theme'
const THEME_OVERRIDE_KEY = 'rb-theme-user-set'

function storedTheme(): Theme {
  try {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY)
    const hasThemeOverride = localStorage.getItem(THEME_OVERRIDE_KEY) === 'true'
    const hasValidSavedTheme = savedTheme === 'dark' || savedTheme === 'light'

    if (hasValidSavedTheme && hasThemeOverride) return savedTheme
  } catch {
    // Storage is optional; dark remains the site default.
  }

  return 'dark'
}

export default function App() {
  const [route, setRoute] = useState<SiteRoute>(routeFromLocation)
  const [paused, setPaused] = useState(false)
  const [animateSectionTransition, setAnimateSectionTransition] = useState(false)
  const [animatePostTransition, setAnimatePostTransition] = useState(false)
  const [booting, setBooting] = useState(shouldShowBoot)
  const [worldReady, setWorldReady] = useState(false)
  const [theme, setTheme] = useState<Theme>(storedTheme)
  const [sectionScrolled, setSectionScrolled] = useState(false)
  const reducedMotion = useReducedMotion()
  const hasOpenedSection = useRef(route.sectionId !== null)
  const sceneRef = useRef<AsciiScene | null>(null)
  const shouldPlayBoot = useRef(booting)
  const bootStartedAt = useRef(performance.now())
  const sectionTransitionStartedAt = useRef(performance.now())
  const activeId = route.sectionId
  const activeSection = getSection(activeId)

  const themeRef = useRef(theme)
  const animateThemeTransition = useRef(true)

  // Post routes manage their own metadata from the post reader, where the
  // frontmatter and sharing image are known.
  useEffect(() => {
    if (route.postSlug) return

    const page = getSectionPage(route.sectionId)
    applyDocumentMetadata({
      title: page.title,
      description: page.description,
      url: `${window.location.origin}${routePath(route)}`,
      type: 'website',
      image: `${window.location.origin}${page.image}`,
      imageAlt: page.imageAlt,
    })
  }, [route.postSlug, route.sectionId])

  useEffect(() => {
    if (!shouldPlayBoot.current) return
    try {
      sessionStorage.setItem(BOOT_SESSION_KEY, 'true')
    } catch {
      // Storage can be unavailable in locked-down browsing contexts.
    }
  }, [])

  const handleSceneReady = useCallback((scene: AsciiScene | null) => {
    sceneRef.current = scene
    scene?.setTheme(themeRef.current === 'dark')
  }, [])

  // The torus is a once-per-session introduction. Repeat visits and direct
  // section links reveal the world as soon as it is ready.
  const handleWorldReady = useCallback(() => {
    setWorldReady(true)

    if (!shouldPlayBoot.current) {
      sceneRef.current?.reveal()
      return
    }

    const minimum = reducedMotion ? REDUCED_MOTION_BOOT_DURATION_MS : BOOT_HOLD_MS
    const remaining = Math.max(0, minimum - (performance.now() - bootStartedAt.current))
    window.setTimeout(() => {
      setBooting(false)
      sceneRef.current?.reveal()
    }, remaining)
  }, [reducedMotion])

  const handleTitleMeasure = useCallback(
    (sectionId: string, fontSize: number, rects: TitleLetterRect[]) => {
      sceneRef.current?.setTitleTargets(sectionId, fontSize, rects)
    },
    [],
  )

  const openSection = useCallback((id: string, animate = true) => {
    preloadSectionPanel()
    hasOpenedSection.current = true
    setAnimateSectionTransition(animate)
    sectionTransitionStartedAt.current = performance.now()
    window.history.pushState(
      { section: id },
      '',
      routePath({ sectionId: id, postSlug: null }),
    )
    setRoute({ sectionId: id, postSlug: null })
  }, [])

  const closeSection = useCallback((animate = true) => {
    setAnimateSectionTransition(animate)
    sectionTransitionStartedAt.current = performance.now()
    window.history.pushState({}, '', '/')
    setRoute({ sectionId: null, postSlug: null })
  }, [])

  const openPost = useCallback((slug: string, animate = true) => {
    setAnimatePostTransition(animate)
    window.history.pushState(
      { section: 'posts', post: slug },
      '',
      routePath({ sectionId: 'posts', postSlug: slug }),
    )
    setRoute({ sectionId: 'posts', postSlug: slug })
  }, [])

  const handlePanelBack = useCallback((animate = true) => {
    if (route.sectionId === 'posts' && route.postSlug) {
      setAnimatePostTransition(animate)
      window.history.pushState({ section: 'posts' }, '', '/posts/')
      setRoute({ sectionId: 'posts', postSlug: null })
      return
    }
    closeSection(animate)
  }, [closeSection, route])

  const toggleTheme = useCallback((animate = true) => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    animateThemeTransition.current = animate
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
      localStorage.setItem(THEME_OVERRIDE_KEY, 'true')
    } catch {
      // Private browsing: the choice lasts for the current page only.
    }
    setTheme(nextTheme)
  }, [theme])

  useEffect(() => {
    const onPopState = () => {
      const nextRoute = routeFromLocation()
      if (nextRoute.sectionId) hasOpenedSection.current = true
      setAnimateSectionTransition(true)
      setAnimatePostTransition(true)
      sectionTransitionStartedAt.current = performance.now()
      setRoute(nextRoute)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    let transitionResetFrame = 0

    // Applies the real theme everywhere in one synchronous step: DOM colors,
    // browser chrome, and the canvas tints (which force-render immediately).
    const apply = (suppressTransitions = false) => {
      const isDark = theme === 'dark'
      const root = document.documentElement
      if (suppressTransitions) root.classList.add('is-theme-committing')
      root.dataset.theme = theme
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', isDark ? '#000000' : '#ffffff')
      document
        .querySelector('#site-favicon-ico')
        ?.setAttribute('href', isDark ? '/favicon.ico' : '/favicon-white.ico')
      document
        .querySelector('#site-favicon-32')
        ?.setAttribute('href', isDark ? '/favicon-32x32.png' : '/favicon-white-32x32.png')
      document
        .querySelector('#site-favicon-16')
        ?.setAttribute('href', isDark ? '/favicon-16x16.png' : '/favicon-white-16x16.png')
      sceneRef.current?.setTheme(isDark)

      if (suppressTransitions) {
        transitionResetFrame = requestAnimationFrame(() => {
          root.classList.remove('is-theme-committing')
        })
      }
    }

    // No flip on first paint or on unrelated re-runs (reduced-motion change).
    const isFlip = themeRef.current !== theme
    const shouldAnimateTheme = animateThemeTransition.current
    animateThemeTransition.current = true
    themeRef.current = theme
    if (!isFlip || reducedMotion || !shouldAnimateTheme) {
      apply()
      return
    }

    // The flip uses one full-screen inversion layer clipped by an SVG path.
    // Square regions join that path in a staggered top-to-bottom wave. Since
    // the palette is pure black and white, every revealed pixel already is
    // the next theme, including its text contrast. Once the viewport is fully
    // covered, the real theme swaps in and the temporary layer disappears.
    const width = window.innerWidth
    const height = window.innerHeight
    const pixels = createThemePixels(width, height)
    const curtain = document.createElement('div')
    const mask = document.createElementNS(SVG_NAMESPACE, 'svg')
    const definitions = document.createElementNS(SVG_NAMESPACE, 'defs')
    const clipPath = document.createElementNS(SVG_NAMESPACE, 'clipPath')
    const pixelPath = document.createElementNS(SVG_NAMESPACE, 'path')
    const clipId = `theme-pixel-clip-${themeClipId++}`
    const stableClones = preserveThemeStableElements()

    curtain.className = 'theme-curtain'
    mask.classList.add('theme-pixel-mask')
    mask.setAttribute('aria-hidden', 'true')
    clipPath.id = clipId
    clipPath.setAttribute('clipPathUnits', 'userSpaceOnUse')
    clipPath.appendChild(pixelPath)
    definitions.appendChild(clipPath)
    mask.appendChild(definitions)
    curtain.style.clipPath = `url(#${clipId})`
    curtain.style.setProperty('-webkit-clip-path', `url(#${clipId})`)
    document.body.appendChild(mask)
    document.body.appendChild(curtain)

    const start = performance.now()
    let revealedPath = ''
    let nextPixel = 0
    let frame = 0

    const step = () => {
      const elapsed = performance.now() - start

      // The section shell is independently scrollable, so keep preserved media
      // aligned with its source for the entire curtain transition.
      stableClones.forEach(syncThemeStableClone)

      while (nextPixel < pixels.length && pixels[nextPixel].revealAt <= elapsed) {
        revealedPath += pixels[nextPixel].path
        nextPixel += 1
      }

      pixelPath.setAttribute('d', revealedPath)

      if (nextPixel < pixels.length) {
        frame = requestAnimationFrame(step)
      } else {
        apply(true)
        curtain.remove()
        mask.remove()
        stableClones.forEach(({ clone }) => clone.remove())
      }
    }
    frame = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(transitionResetFrame)
      document.documentElement.classList.remove('is-theme-committing')
      curtain.remove()
      mask.remove()
      stableClones.forEach(({ clone }) => clone.remove())
      apply()
    }
  }, [theme, reducedMotion])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeId) handlePanelBack(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeId, handlePanelBack])

  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <AsciiWorld
          sections={sections}
          activeId={activeId}
          transitionStartedAt={sectionTransitionStartedAt.current}
          animateTransition={animateSectionTransition}
          reducedMotion={reducedMotion}
          paused={paused || Boolean(route.postSlug)}
          hidden={Boolean(route.postSlug)}
          onIntent={preloadSectionPanel}
          onSelect={openSection}
          onSceneReady={handleSceneReady}
          onWorldReady={handleWorldReady}
        />

        {booting || !worldReady ? null : (
          <header
            className={`world-chrome${!animateSectionTransition ? ' is-instant' : ''}${
              activeSection
                ? ' is-hidden'
                : hasOpenedSection.current
                  ? ' is-returning'
                  : ''
            }`}
            aria-hidden={activeSection ? 'true' : undefined}
          >
            <span className="chrome-logo" aria-hidden="true" />
            <div className="chrome-identity-copy">
              <h1 className="chrome-name" translate="no">
                <GlyphAssembly
                  text="Riccardo Busetti"
                  reducedMotion={reducedMotion}
                  delayMs={80}
                  stepMs={42}
                />
              </h1>
              <p className="chrome-meta">
                <GlyphAssembly
                  text="Software engineer"
                  reducedMotion={reducedMotion}
                  delayMs={390}
                  stepMs={25}
                />
              </p>
            </div>
          </header>
        )}

        {booting || !worldReady ? null : (
          <footer
            className={`site-footer${!animateSectionTransition ? ' is-instant' : ''}${
              activeSection
                ? ' is-hidden'
                : hasOpenedSection.current
                  ? ' is-returning'
                  : ''
            }`}
            aria-label="Site information"
            aria-hidden={activeSection ? 'true' : undefined}
            data-nosnippet
          >
            <small className="site-version" aria-label={`Website version ${SITE_VERSION}`}>
              <GlyphAssembly
                text={`v${SITE_VERSION}`}
                reducedMotion={reducedMotion}
                delayMs={520}
                stepMs={48}
              />
            </small>
          </footer>
        )}

        <button
          type="button"
          className={`theme-toggle${activeSection && sectionScrolled ? ' is-obscured' : ''}`}
          onClick={(event) => toggleTheme(event.detail !== 0)}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          data-nosnippet
        >
          {booting || !worldReady ? null : (
            <GlyphAssembly
              text={`[${theme === 'dark' ? 'light' : 'dark'}]`}
              reducedMotion={reducedMotion}
              delayMs={160}
              stepMs={48}
            />
          )}
        </button>

        <button
          type="button"
          className="motion-toggle"
          onClick={() => setPaused((current) => !current)}
          aria-pressed={paused}
          data-nosnippet
        >
          {paused ? 'Resume ambient motion' : 'Pause ambient motion'}
        </button>

        <Suspense fallback={null}>
          <AnimatePresence mode="wait">
            {activeSection ? (
              <SectionPanel
                key={activeSection.id}
                section={activeSection}
                transitionStartedAt={sectionTransitionStartedAt.current}
                reducedMotion={reducedMotion}
                animateSectionTransition={animateSectionTransition}
                postSlug={route.postSlug}
                animatePostTransition={animatePostTransition}
                onOpenPost={openPost}
                onBack={handlePanelBack}
                onTitleMeasure={handleTitleMeasure}
                onScrollStateChange={setSectionScrolled}
              />
            ) : null}
          </AnimatePresence>
        </Suspense>

        <AnimatePresence>
          {booting ? <BootLoader reducedMotion={reducedMotion} /> : null}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}
