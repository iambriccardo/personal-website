import { useEffect, useRef, useState } from 'react'

type MermaidProps = {
  chart: string
  mobileChart?: string
  title: string
}

type RenderStatus = 'loading' | 'ready' | 'error'

let renderSequence = 0

function themeValue(styles: CSSStyleDeclaration, token: string) {
  return styles.getPropertyValue(token).trim()
}

export function Mermaid({ chart, mobileChart, title }: MermaidProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<RenderStatus>('loading')

  useEffect(() => {
    let generation = 0
    const root = document.documentElement
    const compactViewport = window.matchMedia('(max-width: 720px)')

    const render = async () => {
      const currentGeneration = ++generation
      setStatus('loading')

      try {
        const { default: mermaid } = await import('mermaid')
        const styles = getComputedStyle(root)
        const paper = themeValue(styles, '--paper')
        const ink = themeValue(styles, '--ink')
        const muted = themeValue(styles, '--muted')
        const soft = themeValue(styles, '--soft')

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          suppressErrorRendering: true,
          theme: 'base',
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          themeVariables: {
            background: paper,
            primaryColor: paper,
            primaryTextColor: ink,
            primaryBorderColor: ink,
            lineColor: muted,
            secondaryColor: paper,
            tertiaryColor: paper,
            clusterBkg: paper,
            clusterBorder: soft,
            edgeLabelBackground: paper,
          },
        })

        const id = `post-mermaid-${++renderSequence}`
        const source = compactViewport.matches && mobileChart ? mobileChart : chart
        const { svg, bindFunctions } = await mermaid.render(id, source)
        const container = containerRef.current

        if (!container || currentGeneration !== generation) return

        container.innerHTML = svg
        bindFunctions?.(container)
        setStatus('ready')
      } catch (error) {
        if (currentGeneration !== generation) return
        console.error('Could not render Mermaid diagram.', error)
        setStatus('error')
      }
    }

    void render()

    const observer = new MutationObserver(() => {
      void render()
    })
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    compactViewport.addEventListener('change', render)

    return () => {
      generation += 1
      observer.disconnect()
      compactViewport.removeEventListener('change', render)
    }
  }, [chart, mobileChart])

  return (
    <figure className="post-mermaid" data-theme-stable>
      <div
        ref={containerRef}
        className="post-mermaid-canvas"
        role="img"
        aria-label={title}
        aria-busy={status === 'loading'}
      />
      {status === 'error' ? (
        <pre className="post-mermaid-fallback">{chart}</pre>
      ) : null}
      <figcaption>{title}</figcaption>
    </figure>
  )
}
