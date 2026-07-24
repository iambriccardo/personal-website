import { AnimatePresence, motion } from 'motion/react'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AsciiImage, type AsciiImageOptions } from './AsciiImage'
import { loadPostsSection } from './postsSectionLoader'
import type { SectionDefinition } from '../data/sections'
import {
  easeInOutCubic,
  EASE_ENTER,
  EASE_EXIT,
  POST_ENTER_DURATION,
  POST_EXIT_DURATION,
  SECTION_OPEN_TRANSITION_MS,
  SECTION_TITLE_HANDOFF_START,
} from '../motion'
import type { TitleLetterRect } from '../scene/AsciiScene'

const PostsSection = lazy(loadPostsSection)

/**
 * Markdown images render as ASCII. The image title carries renderer options,
 * e.g. `![Portrait](photo.jpg "invert cols=110")`.
 */
function parseAsciiOptions(title: string | undefined): AsciiImageOptions {
  const options: AsciiImageOptions = {}
  for (const token of title?.split(/\s+/) ?? []) {
    if (token === 'invert') options.invert = true
    else if (token === 'solid') options.solid = true
    else if (token.startsWith('cols=')) options.columns = Number(token.slice(5)) || undefined
    else if (token.startsWith('low=')) options.low = Number(token.slice(4))
    else if (token.startsWith('high=')) options.high = Number(token.slice(5))
  }
  return options
}

const markdownComponents = {
  p: ({
    node,
    children,
  }: {
    node?: { children?: Array<{ type?: string; tagName?: string }> }
    children?: ReactNode
  }) => {
    const child = node?.children?.[0]
    const containsOnlyImage =
      node?.children?.length === 1 && child?.type === 'element' && child.tagName === 'img'
    return containsOnlyImage ? (
      <div className="markdown-image">{children}</div>
    ) : (
      <p>{children}</p>
    )
  },
  img: ({ src, alt, title }: { src?: string | Blob; alt?: string; title?: string }) =>
    typeof src === 'string' ? (
      <AsciiImage src={src} alt={alt ?? ''} caption={alt} {...parseAsciiOptions(title)} />
    ) : null,
}

type SectionPanelProps = {
  section: SectionDefinition
  transitionStartedAt: number
  reducedMotion: boolean
  animateSectionTransition: boolean
  postSlug: string | null
  animatePostTransition: boolean
  onOpenPost: (slug: string, animate?: boolean) => void
  onBack: (animate?: boolean) => void
  onTitleMeasure: (
    sectionId: string,
    fontSize: number,
    rects: TitleLetterRect[],
  ) => void
  onScrollStateChange: (scrolled: boolean) => void
}

export function SectionPanel({
  section,
  transitionStartedAt,
  reducedMotion,
  animateSectionTransition,
  postSlug,
  animatePostTransition,
  onOpenPost,
  onBack,
  onTitleMeasure,
  onScrollStateChange,
}: SectionPanelProps) {
  const shellRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const scrolledRef = useRef(false)
  const isPostsSection = section.id === 'posts'
  const [postsHeaderReady, setPostsHeaderReady] = useState(
    () => !isPostsSection || !postSlug,
  )
  const showSectionHeader = !isPostsSection || postsHeaderReady
  const shouldAnimateSectionTransition = animateSectionTransition && !reducedMotion
  const shouldAnimatePostTransition = animatePostTransition && !reducedMotion
  // Anchor every delayed child to one mount-time snapshot. Re-renders caused
  // by images, lazy content, or scroll state must not restart the title's
  // global opening schedule with a newly calculated delay.
  const elapsedSinceOpen = useRef(
    Math.max(0, performance.now() - transitionStartedAt),
  ).current
  const delayFromOpen = (targetMs: number) =>
    shouldAnimateSectionTransition
      ? Math.max(0, targetMs - elapsedSinceOpen) / 1000
      : 0
  const titleHandoffStartMs =
    SECTION_OPEN_TRANSITION_MS * SECTION_TITLE_HANDOFF_START
  const titleHandoffDurationMs =
    SECTION_OPEN_TRANSITION_MS - titleHandoffStartMs

  // Motion animations begin on their own document timeline after React's
  // commit, which can vary with section content. Drive the title directly
  // from the shared scene clock so every section samples the same algorithm
  // at the same point, even after a late commit or an unrelated re-render.
  useLayoutEffect(() => {
    const heading = headingRef.current
    if (!heading) return
    if (!shouldAnimateSectionTransition) {
      heading.style.opacity = '1'
      return
    }

    let frame = 0
    const update = () => {
      const elapsed = performance.now() - transitionStartedAt
      const linearProgress = Math.min(
        1,
        Math.max(0, (elapsed - titleHandoffStartMs) / titleHandoffDurationMs),
      )
      heading.style.opacity = String(easeInOutCubic(linearProgress))
      if (linearProgress < 1) frame = window.requestAnimationFrame(update)
    }
    update()
    return () => window.cancelAnimationFrame(frame)
  }, [
    section.id,
    shouldAnimateSectionTransition,
    titleHandoffDurationMs,
    titleHandoffStartMs,
    transitionStartedAt,
  ])

  // The canvas title glyphs fly into the exact letter slots of this heading,
  // so keep the scene's measurements current across layout and scrolling.
  const measure = useCallback(() => {
    const heading = headingRef.current
    if (!heading) return
    const fontSize = Number.parseFloat(window.getComputedStyle(heading).fontSize)
    const headerTransform = headerRef.current
      ? window.getComputedStyle(headerRef.current).transform
      : 'none'
    const transform =
      headerTransform === 'none'
        ? null
        : new DOMMatrixReadOnly(headerTransform)
    // The Posts header translates while moving between its index and reader.
    // getBoundingClientRect() includes that temporary transform, but the scene
    // cache must always describe the stable, settled title layout.
    const transientX = transform?.m41 ?? 0
    const transientY = transform?.m42 ?? 0
    const rects = [...heading.querySelectorAll('[data-letter]')].map((span) => {
      const rect = span.getBoundingClientRect()
      return {
        x: rect.x - transientX,
        y: rect.y - transientY,
        width: rect.width,
        height: rect.height,
      }
    })
    onTitleMeasure(section.id, fontSize, rects)
  }, [section.id, onTitleMeasure])

  useLayoutEffect(() => {
    measure()
    const observer = new ResizeObserver(measure)
    if (headingRef.current) observer.observe(headingRef.current)
    const shell = shellRef.current
    // The shell's content box shrinks when late content grows past the fold
    // and a classic scrollbar claims its gutter; the centered heading moves
    // without changing size, so the heading observer alone would miss it.
    if (shell) observer.observe(shell)
    shell?.addEventListener('scroll', measure, { passive: true })
    return () => {
      observer.disconnect()
      shell?.removeEventListener('scroll', measure)
    }
  }, [measure, showSectionHeader])

  useEffect(() => {
    const elapsed = Math.max(0, performance.now() - transitionStartedAt)
    const timeout = window.setTimeout(
      () => headingRef.current?.focus(),
      shouldAnimateSectionTransition
        ? Math.max(0, SECTION_OPEN_TRANSITION_MS - elapsed)
        : 0,
    )
    return () => window.clearTimeout(timeout)
  }, [section.id, shouldAnimateSectionTransition, transitionStartedAt])

  useEffect(
    () => () => {
      onScrollStateChange(false)
    },
    [onScrollStateChange],
  )

  const handlePostTransitionExitComplete = useCallback(() => {
    if (isPostsSection) setPostsHeaderReady(!postSlug)
  }, [isPostsSection, postSlug])

  const resetShellScroll = useCallback(() => {
    shellRef.current?.scrollTo({ top: 0 })
  }, [])

  return (
    <motion.main
      ref={shellRef}
      className="section-shell"
      onScroll={(event) => {
        const { scrollTop } = event.currentTarget
        const scrolled = scrollTop > 32
        if (scrolled === scrolledRef.current) return
        scrolledRef.current = scrolled
        onScrollStateChange(scrolled)
      }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        transition: {
          duration: shouldAnimateSectionTransition ? 0.45 : 0,
          delay: delayFromOpen(300),
          ease: EASE_ENTER,
        },
      }}
      exit={{
        opacity: 0,
        transition: {
          duration: shouldAnimateSectionTransition ? 0.3 : 0,
          ease: EASE_EXIT,
        },
      }}
    >
      {section.id === 'posts' ? (
        <motion.div
          className="post-reading-backdrop"
          aria-hidden="true"
          initial={false}
          animate={{ opacity: postSlug ? 1 : 0 }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : postSlug
                ? { duration: 0.58, ease: EASE_ENTER }
                : { duration: 0.36, ease: EASE_EXIT }
          }
        />
      ) : null}
      <article className="section-article">
        <motion.button
          className="back-button"
          type="button"
          onClick={(event) => onBack(event.detail !== 0)}
          aria-label={postSlug ? 'Back to posts' : 'Back to overview'}
          initial={{ opacity: 0 }}
          animate={{
            opacity: 1,
            transition: {
              duration: reducedMotion ? 0 : 0.28,
              delay: delayFromOpen(300),
              ease: EASE_ENTER,
            },
          }}
          exit={{
            opacity: 0,
            transition: {
              duration: reducedMotion ? 0 : 0.14,
              ease: EASE_EXIT,
            },
          }}
        >
          <svg
            className="back-icon"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M13.5 8H2.5M6.5 4L2.5 8l4 4" />
          </svg>
          <span>Back</span>
        </motion.button>

        {showSectionHeader ? (
          <motion.header
            ref={headerRef}
            className="section-header"
            initial={
              isPostsSection && shouldAnimatePostTransition
                ? { opacity: 0, x: -20, filter: 'blur(2px)' }
                : false
            }
            animate={
              isPostsSection && postSlug
                ? {
                    opacity: shouldAnimatePostTransition ? 0 : 1,
                    x: shouldAnimatePostTransition ? -10 : 0,
                    filter: shouldAnimatePostTransition ? 'blur(1.5px)' : 'blur(0px)',
                    transition: shouldAnimatePostTransition
                      ? { duration: POST_EXIT_DURATION, ease: EASE_EXIT }
                      : { duration: 0 },
                  }
                : isPostsSection
                  ? {
                      opacity: 1,
                      x: 0,
                      filter: 'blur(0px)',
                      transition: shouldAnimatePostTransition
                        ? { type: 'spring', duration: POST_ENTER_DURATION, bounce: 0 }
                        : { duration: 0 },
                    }
                  : undefined
            }
          >
            {/* The heading is laid out immediately (only opacity animates) so the
                morphing canvas glyphs land exactly on its letters. */}
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="section-title"
            >
              {[...section.label].map((letter, index) => (
                <span key={index} data-letter aria-hidden="true">
                  {letter}
                </span>
              ))}
              <span className="sr-only">{section.label}</span>
            </h1>
          </motion.header>
        ) : null}

        <motion.div
          className={`section-copy section-copy-${section.id}`}
          initial={{ opacity: 0, y: reducedMotion ? 0 : 12 }}
          animate={{
            opacity: 1,
            y: 0,
            transition: {
              type: 'spring',
              duration: reducedMotion ? 0 : 0.55,
              bounce: 0,
              delay: delayFromOpen(800),
            },
          }}
        >
          {section.id === 'posts' ? (
            <Suspense fallback={<p className="posts-loading">Loading posts…</p>}>
              <PostsSection
                postSlug={postSlug}
                reducedMotion={reducedMotion}
                animateTransition={animatePostTransition}
                onOpenPost={onOpenPost}
                onBackToPosts={onBack}
                onResetScroll={resetShellScroll}
                onTransitionExitComplete={handlePostTransitionExitComplete}
              />
            </Suspense>
          ) : section.portrait ? (
            <div className="about-layout">
              <div className="about-text">
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {section.markdown}
                </ReactMarkdown>
              </div>
              <div className="about-portrait">
                <AsciiImage
                  src={section.portrait.src}
                  alt={section.portrait.alt}
                  caption={section.portrait.alt}
                  columns={104}
                  invert
                  low={0.52}
                  high={0.985}
                  fit="contain"
                />
              </div>
            </div>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {section.markdown}
            </ReactMarkdown>
          )}

          {section.groups?.map((group) => (
            <section
              className="entry-group"
              key={group.title ?? group.entries?.[0]?.heading ?? group.projects?.[0]?.name}
            >
              {group.title ? <h2 className="entry-group-title">{group.title}</h2> : null}
              {group.entries?.map((entry) => (
                <article className="entry" key={entry.heading}>
                  <div className="entry-logo">
                    {entry.url ? (
                      <a
                        className="entry-logo-link"
                        href={entry.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Visit ${entry.heading} website`}
                      >
                        <AsciiImage
                          src={entry.logo}
                          alt={entry.logoAlt}
                          solid
                          columns={entry.logoCols ?? 40}
                        />
                      </a>
                    ) : (
                      <AsciiImage
                        src={entry.logo}
                        alt={entry.logoAlt}
                        solid
                        columns={entry.logoCols ?? 40}
                      />
                    )}
                  </div>
                  <div className="entry-text">
                    <div className="entry-head">
                      {group.title ? (
                        <h3 className="entry-heading" translate="no">
                          {entry.heading}
                        </h3>
                      ) : (
                        <h2 className="entry-heading" translate="no">
                          {entry.heading}
                        </h2>
                      )}
                      {entry.period ? <span className="entry-period">{entry.period}</span> : null}
                    </div>
                    {entry.meta ? <p className="entry-meta">{entry.meta}</p> : null}
                    {entry.body ? <p className="entry-copy">{entry.body}</p> : null}
                    {entry.roles?.length ? (
                      <div className="entry-roles">
                        {entry.roles.map((role) => (
                          <section
                            className={`entry-role${role.current ? ' entry-role-current' : ''}`}
                            key={`${role.title}-${role.period}`}
                          >
                            <div className="entry-role-head">
                              {group.title ? (
                                <h4 className="entry-role-title">
                                  <span className="entry-role-title-label">{role.title}</span>
                                  {role.current ? (
                                    <span className="current-role-line" aria-hidden="true">
                                      {Array.from({ length: 11 }, (_, index) => (
                                        <motion.span
                                          key={index}
                                          initial={
                                            reducedMotion
                                              ? false
                                              : { opacity: 0, y: 2, filter: 'blur(2px)' }
                                          }
                                          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                          transition={{
                                            duration: reducedMotion ? 0 : 0.24,
                                            delay: reducedMotion
                                              ? 0
                                              : delayFromOpen(1080) + index * 0.025,
                                            ease: EASE_ENTER,
                                          }}
                                        >
                                          -
                                        </motion.span>
                                      ))}
                                    </span>
                                  ) : null}
                                </h4>
                              ) : (
                                <h3 className="entry-role-title">{role.title}</h3>
                              )}
                              <span className="entry-role-period">{role.period}</span>
                            </div>
                            <p className="entry-role-copy">{role.body}</p>
                          </section>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}

              {group.projects?.length ? (
                <ul className="project-list">
                  {group.projects.map((project) => (
                    <li key={project.name}>
                      <a
                        className="project-link"
                        href={project.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <div className="project-copy">
                          <div className="project-head">
                            <h3 className="project-name" translate="no">
                              {project.name}
                            </h3>
                            <span className="project-meta">{project.meta}</span>
                          </div>
                          <p className="project-body">{project.body}</p>
                        </div>
                        <span className="project-arrow" aria-hidden="true">↗</span>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </motion.div>
      </article>
    </motion.main>
  )
}
