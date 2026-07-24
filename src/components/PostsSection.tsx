import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import 'katex/dist/katex.min.css'
import { getPost, posts, type Post } from '../data/posts'
import {
  easeInOutCubic,
  EASE_ENTER,
  EASE_EXIT,
  POST_ENTER_DURATION,
  POST_EXIT_DURATION,
} from '../motion'
import { applyDocumentMetadata } from '../seo'
import { postComponents } from './mdx/PostComponents'

type SortMode = 'recent' | 'oldest' | 'title'

type PostsSectionProps = {
  postSlug: string | null
  reducedMotion: boolean
  animateTransition: boolean
  onOpenPost: (slug: string, animate?: boolean) => void
  onBackToPosts: () => void
  /** Owned by SectionPanel, which holds the scrollable shell. */
  onResetScroll: () => void
  onTransitionExitComplete: () => void
}

const dateFormatter = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

const formatDate = (date: string) => dateFormatter.format(new Date(`${date}T00:00:00Z`))

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: 'recent', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title A–Z' },
]

function SortMenu({
  value,
  reducedMotion,
  onChange,
}: {
  value: SortMode
  reducedMotion: boolean
  onChange: (value: SortMode) => void
}) {
  const [open, setOpen] = useState(false)
  const [animateMenu, setAnimateMenu] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(() =>
    sortOptions.findIndex((option) => option.value === value),
  )
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const selectedOption = sortOptions.find((option) => option.value === value) ?? sortOptions[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setAnimateMenu(!reducedMotion)
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, reducedMotion])

  const openMenu = (
    index = sortOptions.findIndex((option) => option.value === value),
    animate = true,
  ) => {
    setAnimateMenu(animate && !reducedMotion)
    setFocusedIndex(index)
    setOpen(true)
    requestAnimationFrame(() => optionRefs.current[index]?.focus())
  }

  const selectOption = (option: SortMode, animate: boolean) => {
    setAnimateMenu(animate && !reducedMotion)
    onChange(option)
    setOpen(false)
    triggerRef.current?.focus()
  }

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const selectedIndex = sortOptions.findIndex((option) => option.value === value)
    openMenu(
      event.key === 'ArrowDown'
        ? (selectedIndex + 1) % sortOptions.length
        : (selectedIndex - 1 + sortOptions.length) % sortOptions.length,
      false,
    )
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextIndex = focusedIndex
    if (event.key === 'ArrowDown') nextIndex = (focusedIndex + 1) % sortOptions.length
    else if (event.key === 'ArrowUp') {
      nextIndex = (focusedIndex - 1 + sortOptions.length) % sortOptions.length
    } else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = sortOptions.length - 1
    else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setAnimateMenu(false)
      setOpen(false)
      triggerRef.current?.focus()
      return
    } else return

    event.preventDefault()
    setFocusedIndex(nextIndex)
    optionRefs.current[nextIndex]?.focus()
  }

  return (
    <div
      className="posts-sort"
      ref={rootRef}
      data-animate={animateMenu ? 'true' : 'false'}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setAnimateMenu(false)
          setOpen(false)
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="posts-sort-trigger"
        aria-label={`Sort posts: ${selectedOption.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          const animate = event.detail !== 0 && !reducedMotion
          setAnimateMenu(animate)
          if (open) setOpen(false)
          else openMenu(undefined, animate)
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span>{selectedOption.label}</span>
        <span className="posts-sort-arrow" aria-hidden="true">↓</span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            className="posts-sort-menu"
            role="listbox"
            aria-label="Sort posts"
            initial={
              animateMenu
                ? { opacity: 0, y: -4, filter: 'blur(2px)' }
                : false
            }
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={
              animateMenu
                ? { opacity: 0, y: -2, filter: 'blur(1px)' }
                : { opacity: 1, y: 0, filter: 'blur(0px)' }
            }
            transition={
              animateMenu
                ? { duration: POST_EXIT_DURATION, ease: EASE_ENTER }
                : { duration: 0 }
            }
            onKeyDown={onMenuKeyDown}
          >
            {sortOptions.map((option, index) => (
              <button
                ref={(element) => { optionRefs.current[index] = element }}
                key={option.value}
                type="button"
                className="posts-sort-option"
                role="option"
                aria-selected={option.value === value}
                tabIndex={index === focusedIndex ? 0 : -1}
                onFocus={() => setFocusedIndex(index)}
                onClick={(event) => selectOption(option.value, event.detail !== 0)}
              >
                <span aria-hidden="true">{option.value === value ? '>' : ''}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function PostMeta({ post, article = false }: { post: Post; article?: boolean }) {
  return (
    <div className="post-meta">
      <time dateTime={post.date} itemProp={article ? 'datePublished' : undefined}>
        {formatDate(post.date)}
      </time>
      {post.tags.length ? (
        <ul className="post-tags" aria-label="Tags">
          {post.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

type TableOfContentsItem = {
  id: string
  label: string
  excerpt: string
  level: 1 | 2 | 3
  kind: 'start' | 'section'
}

function MobilePostNavigator({
  items,
  activeId,
  visible,
  reducedMotion,
  onNavigate,
  onScrub,
}: {
  items: TableOfContentsItem[]
  activeId: string
  visible: boolean
  reducedMotion: boolean
  onNavigate: (item: TableOfContentsItem, behavior: ScrollBehavior) => void
  onScrub: (position: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [displayIndex, setDisplayIndex] = useState(0)
  const [titleDirection, setTitleDirection] = useState(1)
  const holdTimerRef = useRef<number | null>(null)
  const holdPointRef = useRef({ x: 0, y: 0 })
  const suppressClickRef = useRef(false)
  const holdScrubbingRef = useRef(false)
  const holdStartIndexRef = useRef(0)
  const scrubbingRef = useRef(false)
  const listDidScrubRef = useRef(false)
  const listPressPointRef = useRef({ x: 0, y: 0 })
  const suppressListClickRef = useRef(false)
  const scrubFrameRef = useRef(0)
  const scrubInputFrameRef = useRef(0)
  const scrubYRef = useRef(0)
  const displayIndexRef = useRef(0)
  const listRef = useRef<HTMLOListElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeIndex = Math.max(0, items.findIndex((item) => item.id === activeId))
  const displayedItem = items[displayIndex] ?? items[activeIndex]

  const showIndex = useCallback((nextIndex: number) => {
    displayIndexRef.current = nextIndex
    setDisplayIndex((currentIndex) => {
      if (currentIndex === nextIndex) return currentIndex
      setTitleDirection(nextIndex > currentIndex ? 1 : -1)
      return nextIndex
    })
  }, [])

  const closeHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) window.clearTimeout(holdTimerRef.current)
    holdTimerRef.current = null
  }, [])

  const openNavigator = useCallback(() => {
    showIndex(activeIndex)
    setOpen(true)
  }, [activeIndex, showIndex])

  const revealDisplayedItem = useCallback(() => {
    const list = listRef.current
    const selected = itemRefs.current[displayIndexRef.current]
    if (!list || !selected) return
    const selectedTop = selected.offsetTop - list.offsetTop
    const selectedBottom = selectedTop + selected.offsetHeight
    if (selectedTop < list.scrollTop) list.scrollTop = selectedTop
    else if (selectedBottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = selectedBottom - list.clientHeight
    }
  }, [])

  useEffect(() => {
    if (!open) showIndex(activeIndex)
  }, [activeIndex, open, showIndex])

  useEffect(() => {
    if (!visible) setOpen(false)
  }, [visible])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

  useEffect(() => () => {
    closeHoldTimer()
    window.cancelAnimationFrame(scrubFrameRef.current)
    window.cancelAnimationFrame(scrubInputFrameRef.current)
  }, [closeHoldTimer])

  const scrubAt = (clientY: number) => {
    const centers = itemRefs.current.map((button) => {
      const rect = button?.getBoundingClientRect()
      return rect ? rect.top + rect.height / 2 : 0
    })
    if (centers.length === 0) return

    let position = 0
    if (clientY >= centers.at(-1)!) position = centers.length - 1
    else if (clientY > centers[0]) {
      const upperIndex = centers.findIndex((center) => center >= clientY)
      const lowerIndex = Math.max(0, upperIndex - 1)
      const interval = Math.max(1, centers[upperIndex] - centers[lowerIndex])
      position = lowerIndex + (clientY - centers[lowerIndex]) / interval
    }

    const closestIndex = Math.max(0, Math.min(items.length - 1, Math.round(position)))
    if (closestIndex !== displayIndexRef.current) showIndex(closestIndex)
    onScrub(position)
  }

  const scheduleScrub = (clientY: number) => {
    scrubYRef.current = clientY
    if (scrubInputFrameRef.current) return
    scrubInputFrameRef.current = window.requestAnimationFrame(() => {
      scrubInputFrameRef.current = 0
      scrubAt(scrubYRef.current)
    })
  }

  const continueEdgeScrub = () => {
    const list = listRef.current
    if (!list || !scrubbingRef.current) return
    const rect = list.getBoundingClientRect()
    const edgeZone = Math.min(46, rect.height * 0.18)
    let scrollDelta = 0
    if (scrubYRef.current < rect.top + edgeZone) {
      const intensity = Math.min(
        1,
        (rect.top + edgeZone - scrubYRef.current) / edgeZone,
      )
      scrollDelta = -13 * intensity ** 1.7
    } else if (scrubYRef.current > rect.bottom - edgeZone) {
      const intensity = Math.min(
        1,
        (scrubYRef.current - (rect.bottom - edgeZone)) / edgeZone,
      )
      scrollDelta = 13 * intensity ** 1.7
    }
    if (scrollDelta !== 0) {
      list.scrollTop += scrollDelta
      scrubAt(scrubYRef.current)
    }
    scrubFrameRef.current = window.requestAnimationFrame(continueEdgeScrub)
  }

  return (
    <>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.button
            type="button"
            className="mobile-post-nav-dismiss"
            aria-label="Close article sections"
            onClick={() => setOpen(false)}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: reducedMotion ? 0 : 0.26, ease: EASE_ENTER } }}
            exit={{ opacity: 0, transition: { duration: reducedMotion ? 0 : 0.16, ease: EASE_EXIT } }}
          />
        ) : null}
      </AnimatePresence>
      <nav
      className="mobile-post-nav"
      data-open={open ? 'true' : 'false'}
      data-visible={visible ? 'true' : 'false'}
      aria-label="Article sections"
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        className="mobile-post-nav-trigger"
        aria-expanded={open}
        aria-controls="mobile-post-sections"
        aria-label={`${displayedItem?.label ?? 'Article sections'}. Tap or hold to browse sections.`}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          holdPointRef.current = { x: event.clientX, y: event.clientY }
          holdStartIndexRef.current = activeIndex
          holdScrubbingRef.current = false
          closeHoldTimer()
          const trigger = event.currentTarget
          const pointerId = event.pointerId
          holdTimerRef.current = window.setTimeout(() => {
            suppressClickRef.current = true
            holdScrubbingRef.current = true
            if (!trigger.hasPointerCapture(pointerId)) trigger.setPointerCapture(pointerId)
            openNavigator()
          }, 420)
        }}
        onPointerMove={(event) => {
          if (holdScrubbingRef.current) {
            const position = Math.max(
              0,
              Math.min(
                items.length - 1,
                holdStartIndexRef.current + (event.clientY - holdPointRef.current.y) / 44,
              ),
            )
            showIndex(Math.round(position))
            onScrub(position)
            window.requestAnimationFrame(revealDisplayedItem)
            return
          }
          if (
            Math.hypot(
              event.clientX - holdPointRef.current.x,
              event.clientY - holdPointRef.current.y,
            ) > 8
          ) closeHoldTimer()
        }}
        onPointerUp={(event) => {
          closeHoldTimer()
          if (!holdScrubbingRef.current) return
          holdScrubbingRef.current = false
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          onNavigate(items[displayIndexRef.current], 'auto')
          setOpen(false)
          window.setTimeout(() => { suppressClickRef.current = false }, 0)
        }}
        onPointerCancel={() => {
          closeHoldTimer()
          holdScrubbingRef.current = false
        }}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false
            return
          }
          if (open) setOpen(false)
          else openNavigator()
        }}
      >
        <span className="mobile-post-nav-count" aria-hidden="true">
          {String(displayIndex + 1).padStart(2, '0')}/{String(items.length).padStart(2, '0')}
        </span>
        <span className="mobile-post-nav-title-window">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={displayedItem?.id}
              className="mobile-post-nav-title"
              initial={reducedMotion ? false : { y: `${titleDirection * 90}%`, opacity: 0, filter: 'blur(3px)' }}
              animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
              exit={reducedMotion ? { opacity: 0 } : { y: `${titleDirection * -90}%`, opacity: 0, filter: 'blur(3px)' }}
              transition={{ duration: reducedMotion ? 0 : 0.22, ease: EASE_ENTER }}
            >
              {displayedItem?.label}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="mobile-post-nav-chevron" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.ol
            ref={listRef}
            id="mobile-post-sections"
            className="mobile-post-nav-list"
            initial={reducedMotion ? false : { height: 0, opacity: 0, y: -8, filter: 'blur(4px)' }}
            animate={{
              height: 'auto',
              opacity: 1,
              y: 0,
              filter: 'blur(0px)',
              transition: { duration: reducedMotion ? 0 : 0.32, ease: EASE_ENTER },
            }}
            exit={{
              height: 0,
              opacity: 0,
              y: reducedMotion ? 0 : -5,
              filter: reducedMotion ? 'blur(0px)' : 'blur(2px)',
              transition: { duration: reducedMotion ? 0 : 0.18, ease: EASE_EXIT },
            }}
            onAnimationComplete={() => {
              if (open) revealDisplayedItem()
            }}
            onPointerDown={(event) => {
              scrubbingRef.current = true
              listDidScrubRef.current = false
              listPressPointRef.current = { x: event.clientX, y: event.clientY }
            }}
            onPointerMove={(event) => {
              if (!scrubbingRef.current) return
              if (!listDidScrubRef.current) {
                const distance = Math.hypot(
                  event.clientX - listPressPointRef.current.x,
                  event.clientY - listPressPointRef.current.y,
                )
                if (distance <= 5) return
                listDidScrubRef.current = true
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.setPointerCapture(event.pointerId)
                }
                window.cancelAnimationFrame(scrubFrameRef.current)
                scrubFrameRef.current = window.requestAnimationFrame(continueEdgeScrub)
              }
              const samples = event.nativeEvent.getCoalescedEvents?.() ?? []
              const latestSample = samples.at(-1) ?? event.nativeEvent
              scheduleScrub(latestSample.clientY)
            }}
            onPointerUp={(event) => {
              if (!scrubbingRef.current) return
              scrubbingRef.current = false
              window.cancelAnimationFrame(scrubFrameRef.current)
              window.cancelAnimationFrame(scrubInputFrameRef.current)
              scrubInputFrameRef.current = 0
              if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId)
              }
              if (listDidScrubRef.current) {
                scrubAt(event.clientY)
                suppressListClickRef.current = true
                onNavigate(items[displayIndexRef.current], 'auto')
                setOpen(false)
                window.setTimeout(() => { suppressListClickRef.current = false }, 0)
              }
            }}
            onPointerCancel={() => {
              scrubbingRef.current = false
              window.cancelAnimationFrame(scrubFrameRef.current)
              window.cancelAnimationFrame(scrubInputFrameRef.current)
              scrubInputFrameRef.current = 0
            }}
          >
            {items.map((item, index) => (
              <li key={item.id}>
                <button
                  ref={(element) => { itemRefs.current[index] = element }}
                  type="button"
                  aria-current={item.id === activeId ? 'location' : undefined}
                  data-selected={index === displayIndex ? 'true' : 'false'}
                  onClick={() => {
                    if (suppressListClickRef.current) return
                    showIndex(index)
                    onNavigate(item, reducedMotion ? 'auto' : 'smooth')
                    setOpen(false)
                  }}
                >
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <span>{item.label}</span>
                </button>
              </li>
            ))}
          </motion.ol>
        ) : null}
      </AnimatePresence>
      </nav>
    </>
  )
}

function PostTableOfContents({
  post,
  proseRef,
  reducedMotion,
}: {
  post: Post
  proseRef: RefObject<HTMLDivElement | null>
  reducedMotion: boolean
}) {
  const [items, setItems] = useState<TableOfContentsItem[]>([])
  const [activeId, setActiveId] = useState('')
  const [interactionIndex, setInteractionIndex] = useState<number | null>(null)
  const [mobileVisible, setMobileVisible] = useState(false)
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null)
  const scrollAnimationRef = useRef(0)

  useEffect(() => {
    const prose = proseRef.current
    if (!prose) return

    const headings = [...prose.querySelectorAll<HTMLHeadingElement>('h2[id], h3[id]')]
    const sectionItems: TableOfContentsItem[] = headings.map((heading) => {
      let sibling = heading.nextElementSibling
      while (sibling && sibling.tagName !== 'P') sibling = sibling.nextElementSibling
      const paragraph = sibling?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      const excerpt = paragraph.length > 150
        ? `${paragraph.slice(0, 147).trimEnd()}…`
        : paragraph

      return {
        id: heading.id,
        label: heading.textContent?.trim() ?? heading.id,
        excerpt,
        level: Number(heading.tagName.slice(1)) as 2 | 3,
        kind: 'section',
      }
    })
    const nextItems: TableOfContentsItem[] = [
      {
        id: 'post-start',
        label: post.title,
        excerpt: post.description,
        level: 1,
        kind: 'start',
      },
      ...sectionItems,
    ]
    const scrollRoot = prose.closest<HTMLElement>('.section-shell')
    const startHeading = document.getElementById('post-start')
    const trackedHeadings = startHeading ? [startHeading, ...headings] : headings

    setItems(nextItems)
    setActiveId(nextItems[0]?.id ?? '')
    setPortalRoot(scrollRoot)

    if (!scrollRoot || trackedHeadings.length === 0) return

    let frame = 0
    const cancelScrollAnimation = () => {
      window.cancelAnimationFrame(scrollAnimationRef.current)
      scrollAnimationRef.current = 0
    }
    const updateActiveHeading = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const rootTop = scrollRoot.getBoundingClientRect().top
        const readingLine = rootTop + Math.min(180, scrollRoot.clientHeight * 0.24)
        let nextActive = trackedHeadings[0].id

        for (const heading of trackedHeadings) {
          if (heading.getBoundingClientRect().top > readingLine) break
          nextActive = heading.id
        }

        if (
          scrollRoot.scrollTop + scrollRoot.clientHeight >=
          scrollRoot.scrollHeight - 2
        ) {
          nextActive = trackedHeadings.at(-1)?.id ?? nextActive
        }

        setActiveId((current) => current === nextActive ? current : nextActive)
        const shouldShowMobileNavigator = scrollRoot.scrollTop > 32
        setMobileVisible((current) => current === shouldShowMobileNavigator
          ? current
          : shouldShowMobileNavigator)
      })
    }

    updateActiveHeading()
    scrollRoot.addEventListener('scroll', updateActiveHeading, { passive: true })
    scrollRoot.addEventListener('wheel', cancelScrollAnimation, { passive: true })
    scrollRoot.addEventListener('touchstart', cancelScrollAnimation, { passive: true })
    scrollRoot.addEventListener('pointerdown', cancelScrollAnimation, { passive: true })
    window.addEventListener('resize', updateActiveHeading)
    return () => {
      window.cancelAnimationFrame(frame)
      cancelScrollAnimation()
      scrollRoot.removeEventListener('scroll', updateActiveHeading)
      scrollRoot.removeEventListener('wheel', cancelScrollAnimation)
      scrollRoot.removeEventListener('touchstart', cancelScrollAnimation)
      scrollRoot.removeEventListener('pointerdown', cancelScrollAnimation)
      window.removeEventListener('resize', updateActiveHeading)
    }
  }, [post.description, post.title, proseRef])

  if (items.length < 2 || !portalRoot) return null

  const waveProfile = [1, 0.72, 0.5, 0.36]
  const navigateToItem = (item: TableOfContentsItem, behavior: ScrollBehavior) => {
    const heading = document.getElementById(item.id)
    if (!heading || !portalRoot) return
    window.history.replaceState(null, '', `#${item.id}`)
    window.cancelAnimationFrame(scrollAnimationRef.current)

    if (behavior === 'auto' || reducedMotion) {
      heading.scrollIntoView({ behavior: 'auto', block: 'start' })
      return
    }

    const rootRect = portalRoot.getBoundingClientRect()
    const headingRect = heading.getBoundingClientRect()
    const scrollMargin = Number.parseFloat(getComputedStyle(heading).scrollMarginTop) || 0
    const startTop = portalRoot.scrollTop
    const unclampedTarget = startTop + headingRect.top - rootRect.top - scrollMargin
    const targetTop = item.kind === 'start'
      ? 0
      : Math.max(
          0,
          Math.min(portalRoot.scrollHeight - portalRoot.clientHeight, unclampedTarget),
        )
    const distance = Math.abs(targetTop - startTop)
    const duration = Math.min(720, Math.max(360, distance * 0.2))
    const startedAt = performance.now()

    const animateScroll = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration)
      portalRoot.scrollTop = startTop + (targetTop - startTop) * easeInOutCubic(progress)
      if (progress < 1) scrollAnimationRef.current = window.requestAnimationFrame(animateScroll)
    }
    scrollAnimationRef.current = window.requestAnimationFrame(animateScroll)
  }
  const scrubToPosition = (position: number) => {
    if (!portalRoot) return
    const lowerIndex = Math.max(0, Math.min(items.length - 1, Math.floor(position)))
    const upperIndex = Math.max(0, Math.min(items.length - 1, Math.ceil(position)))
    const lowerHeading = document.getElementById(items[lowerIndex].id)
    const upperHeading = document.getElementById(items[upperIndex].id)
    if (!lowerHeading || !upperHeading) return
    const rootRect = portalRoot.getBoundingClientRect()
    const headingTop = (heading: HTMLElement) =>
      portalRoot.scrollTop + heading.getBoundingClientRect().top - rootRect.top - 64
    const progress = position - lowerIndex
    const target = headingTop(lowerHeading) +
      (headingTop(upperHeading) - headingTop(lowerHeading)) * progress
    portalRoot.scrollTo({ top: target, behavior: 'auto' })
  }

  return createPortal(
    <>
      <nav
        className="post-toc"
        aria-label="Table of contents"
        onPointerLeave={() => setInteractionIndex(null)}
      >
        <ol>
          {items.map((item, index) => {
            const distanceFromCenter = interactionIndex === null
              ? Number.POSITIVE_INFINITY
              : Math.abs(index - interactionIndex)
            const scale = waveProfile[distanceFromCenter] ?? 0.3
            return (
            <li key={item.id} data-kind={item.kind} data-level={item.level}>
              <a
                href={`#${item.id}`}
                aria-label={item.label}
                aria-current={item.id === activeId ? 'location' : undefined}
                style={{
                  '--toc-scale': scale,
                  '--toc-wave-delay': `${Math.min(distanceFromCenter, 4) * 18}ms`,
                } as CSSProperties}
                onPointerEnter={() => setInteractionIndex(index)}
                onPointerLeave={() => setInteractionIndex(null)}
                onFocus={() => setInteractionIndex(index)}
                onBlur={(event) => {
                  if (!event.currentTarget.closest('nav')?.contains(event.relatedTarget as Node | null)) {
                    setInteractionIndex(null)
                  }
                }}
                onClick={(event) => {
                  event.preventDefault()
                  navigateToItem(item, reducedMotion ? 'auto' : 'smooth')
                }}
              >
                <span className="post-toc-index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="post-toc-title">{item.label}</span>
                <span className="post-toc-preview" aria-hidden="true">
                  <strong>{item.label}</strong>
                  <span>{item.excerpt}</span>
                </span>
              </a>
            </li>
            )
          })}
        </ol>
      </nav>
      <MobilePostNavigator
        items={items}
        activeId={activeId}
        visible={mobileVisible}
        reducedMotion={reducedMotion}
        onNavigate={navigateToItem}
        onScrub={scrubToPosition}
      />
    </>,
    portalRoot,
  )
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const normalizedQuery = query.trim().toLocaleLowerCase()
  if (!normalizedQuery) return text

  const normalizedText = text.toLocaleLowerCase()
  const fragments: ReactNode[] = []
  let cursor = 0
  let matchIndex = normalizedText.indexOf(normalizedQuery)

  while (matchIndex !== -1) {
    if (matchIndex > cursor) fragments.push(text.slice(cursor, matchIndex))
    const matchEnd = matchIndex + normalizedQuery.length
    fragments.push(
      <mark className="posts-search-match" key={`${matchIndex}-${matchEnd}`}>
        {text.slice(matchIndex, matchEnd)}
      </mark>,
    )
    cursor = matchEnd
    matchIndex = normalizedText.indexOf(normalizedQuery, cursor)
  }

  if (cursor < text.length) fragments.push(text.slice(cursor))
  return <>{fragments}</>
}

function PostsIndex({
  onOpenPost,
  reducedMotion,
}: Pick<PostsSectionProps, 'onOpenPost' | 'reducedMotion'>) {
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [sort, setSort] = useState<SortMode>('recent')

  const tags = useMemo(
    () => [...new Set(posts.flatMap((post) => post.tags))].sort(),
    [],
  )

  const visiblePosts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return [...posts]
      .filter((post) => {
        const matchesTag = !activeTag || post.tags.includes(activeTag)
        const searchable = [post.title, post.description]
          .join(' ')
          .toLocaleLowerCase()
        return matchesTag && (!normalizedQuery || searchable.includes(normalizedQuery))
      })
      .sort((a, b) => {
        if (sort === 'oldest') return Date.parse(a.date) - Date.parse(b.date)
        if (sort === 'title') return a.title.localeCompare(b.title)
        return Date.parse(b.date) - Date.parse(a.date)
      })
  }, [activeTag, query, sort])

  return (
    <div className="posts-index">
      <div className="posts-controls">
        <label className="posts-search">
          <span className="sr-only">Search posts</span>
          <span aria-hidden="true">&gt;</span>
          <input
            type="search"
            name="post-search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || !query) return
              event.preventDefault()
              event.stopPropagation()
              setQuery('')
            }}
            placeholder="Search posts…"
          />
        </label>
        <SortMenu value={sort} reducedMotion={reducedMotion} onChange={setSort} />
      </div>

      {tags.length ? (
        <div className="posts-filter" aria-label="Filter posts by tag">
          <button
            type="button"
            className={!activeTag ? 'is-active' : undefined}
            aria-pressed={!activeTag}
            onClick={() => setActiveTag(null)}
          >
            All
          </button>
          {tags.map((tag) => (
            <button
              type="button"
              key={tag}
              className={activeTag === tag ? 'is-active' : undefined}
              aria-pressed={activeTag === tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}

      {visiblePosts.length ? (
        <ol className="posts-list">
          {visiblePosts.map((post) => (
            <li key={post.slug}>
              <a
                href={`/posts/${post.slug}/`}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  ) return
                  event.preventDefault()
                  onOpenPost(post.slug, event.detail !== 0)
                }}
              >
                <div className="posts-list-copy">
                  <PostMeta post={post} />
                  <h2><HighlightedText text={post.title} query={query} /></h2>
                  <p><HighlightedText text={post.description} query={query} /></p>
                </div>
                {post.coverImage ? (
                  <div
                    className="posts-list-cover"
                    data-theme-stable
                    aria-hidden="true"
                  >
                    <img
                      src={post.coverImage}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                ) : null}
                <span className="posts-list-arrow" aria-hidden="true">↗</span>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="posts-empty" role="status">No posts match this search.</p>
      )}

      <a className="posts-rss-link" href="/rss.xml">
        Subscribe via RSS <span aria-hidden="true">↗</span>
      </a>
    </div>
  )
}

function PostReader({ post, reducedMotion }: { post: Post; reducedMotion: boolean }) {
  const proseRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    applyDocumentMetadata({
      title: post.title,
      description: post.description,
      url: `${window.location.origin}/posts/${post.slug}/`,
      type: 'article',
      image: post.socialImage
        ? `${window.location.origin}${post.socialImage}`
        : null,
      imageAlt: post.coverAlt,
    })
  }, [post])

  return (
    <article
      className="post-reader"
      itemScope
      itemType="https://schema.org/BlogPosting"
    >
      <meta itemProp="author" content="Riccardo Busetti" />
      <link
        itemProp="mainEntityOfPage"
        href={`${window.location.origin}/posts/${post.slug}/`}
      />
      <header id="post-start" className="post-header">
        <PostMeta post={post} article />
        <h1 itemProp="headline">{post.title}</h1>
        <p itemProp="description">{post.description}</p>
        {post.updated ? (
          <p className="post-updated">
            Updated{' '}
            <time itemProp="dateModified" dateTime={post.updated}>
              {formatDate(post.updated)}
            </time>
          </p>
        ) : null}
      </header>
      {post.coverImage ? (
        <figure className="post-figure post-cover" data-theme-stable>
          <img
            src={post.coverImage}
            alt={post.coverAlt ?? ''}
            itemProp="image"
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
        </figure>
      ) : null}
      <PostTableOfContents post={post} proseRef={proseRef} reducedMotion={reducedMotion} />
      <div ref={proseRef} className="post-prose" itemProp="articleBody">
        <post.Content components={postComponents} />
      </div>
    </article>
  )
}

export default function PostsSection({
  postSlug,
  reducedMotion,
  animateTransition,
  onOpenPost,
  onBackToPosts,
  onResetScroll,
  onTransitionExitComplete,
}: PostsSectionProps) {
  const post = getPost(postSlug)
  const direction = postSlug ? 1 : -1
  const shouldAnimate = animateTransition && !reducedMotion

  // Reset the shared scroll only between the outgoing view finishing its exit
  // and the incoming view fading in. Doing it any earlier would visibly yank
  // a scrolled post list (or article) to the top before it animates away.
  const handleExitComplete = useCallback(() => {
    onResetScroll()
    onTransitionExitComplete()
  }, [onResetScroll, onTransitionExitComplete])

  return (
    <AnimatePresence
      mode="wait"
      initial={false}
      custom={{ direction, shouldAnimate }}
      onExitComplete={handleExitComplete}
    >
      <motion.div
        key={postSlug ?? 'posts-index'}
        custom={{ direction, shouldAnimate }}
        variants={{
          enter: ({ direction: travel, shouldAnimate: enabled }) => ({
            opacity: enabled ? 0 : 1,
            x: enabled ? travel * 20 : 0,
            filter: enabled ? 'blur(2px)' : 'blur(0px)',
          }),
          center: ({ shouldAnimate: enabled }) => ({
            opacity: 1,
            x: 0,
            filter: 'blur(0px)',
            transition: enabled
              ? { type: 'spring', duration: POST_ENTER_DURATION, bounce: 0 }
              : { duration: 0 },
          }),
          exit: ({ direction: travel, shouldAnimate: enabled }) => ({
            opacity: enabled ? 0 : 1,
            x: enabled ? travel * -10 : 0,
            filter: enabled ? 'blur(1.5px)' : 'blur(0px)',
            transition: enabled
              ? { duration: POST_EXIT_DURATION, ease: EASE_EXIT }
              : { duration: 0 },
          }),
        }}
        initial="enter"
        animate="center"
        exit="exit"
      >
        {!postSlug ? (
          <PostsIndex onOpenPost={onOpenPost} reducedMotion={reducedMotion} />
        ) : post ? (
          <PostReader post={post} reducedMotion={reducedMotion} />
        ) : (
          <div className="posts-not-found">
            <p>This post could not be found.</p>
            <button type="button" onClick={onBackToPosts}>Back to posts</button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
