import { useEffect, useRef } from 'react'
import type { SectionDefinition } from '../data/sections'
import { AsciiScene } from '../scene/AsciiScene'

type AsciiWorldProps = {
  sections: SectionDefinition[]
  activeId: string | null
  transitionStartedAt: number
  animateTransition: boolean
  reducedMotion: boolean
  paused: boolean
  /** True while the world is fully covered (post reading); halts rendering. */
  hidden: boolean
  onIntent?: () => void
  onSelect: (id: string, animate?: boolean) => void
  onSceneReady?: (scene: AsciiScene | null) => void
  onWorldReady?: () => void
}

export function AsciiWorld({
  sections,
  activeId,
  transitionStartedAt,
  animateTransition,
  reducedMotion,
  paused,
  hidden,
  onIntent,
  onSelect,
  onSceneReady,
  onWorldReady,
}: AsciiWorldProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<AsciiScene | null>(null)

  useEffect(() => {
    const host = hostRef.current
    const canvas = canvasRef.current
    if (!host || !canvas) return

    const scene = new AsciiScene(canvas, host, sections)
    sceneRef.current = scene
    onSceneReady?.(scene)
    void scene.init(reducedMotion).then(() => onWorldReady?.())

    const observer = new ResizeObserver(() => scene.resize())
    observer.observe(host)
    return () => {
      observer.disconnect()
      sceneRef.current = null
      onSceneReady?.(null)
      scene.destroy()
    }
  }, [sections])

  useEffect(() => {
    sceneRef.current?.setMode(
      activeId ? 'open' : 'home',
      activeId ?? undefined,
      transitionStartedAt,
      animateTransition,
    )
  }, [activeId, animateTransition, transitionStartedAt])

  useEffect(() => sceneRef.current?.setReducedMotion(reducedMotion), [reducedMotion])
  useEffect(() => sceneRef.current?.setPaused(paused), [paused])
  useEffect(() => sceneRef.current?.setHidden(hidden), [hidden])

  return (
    <div
      ref={hostRef}
      className={`ascii-world${activeId ? ' is-dimmed' : ''}`}
      aria-hidden={activeId ? 'true' : undefined}
      data-nosnippet
    >
      <canvas ref={canvasRef} className="ascii-canvas" aria-hidden="true" />
      <div className="node-layer">
        {sections.map((section) => {
          const style = {
            '--x-desktop': `${section.anchor.desktop.x * 100}%`,
            '--y-desktop': `${section.anchor.desktop.y * 100}%`,
            '--x-mobile': `${section.anchor.mobile.x * 100}%`,
            '--y-mobile': `${section.anchor.mobile.y * 100}%`,
            '--x-compact-landscape': `${section.anchor.compactLandscape.x * 100}%`,
            '--y-compact-landscape': `${section.anchor.compactLandscape.y * 100}%`,
          } as React.CSSProperties
          return (
            <div
              key={section.id}
              style={style}
              className="network-node-position"
              data-section-anchor={section.id}
            >
              <button
                type="button"
                className="network-node"
                onClick={(event) => onSelect(section.id, event.detail !== 0)}
                onPointerEnter={() => {
                  sceneRef.current?.setHovered(section.id)
                  onIntent?.()
                }}
                onPointerLeave={() => sceneRef.current?.setHovered(null)}
                onFocus={() => {
                  sceneRef.current?.setHovered(section.id)
                  onIntent?.()
                }}
                onBlur={() => sceneRef.current?.setHovered(null)}
                aria-label={`Open ${section.label}`}
                disabled={activeId !== null}
              >
                <span className="sr-only">{section.label}</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
