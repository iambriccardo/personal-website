import type {
  AnchorHTMLAttributes,
  HTMLAttributes,
  ImgHTMLAttributes,
  ReactNode,
} from 'react'
import type { MDXComponents } from 'mdx/types'
import { Mermaid } from './Mermaid'

type CalloutProps = {
  title?: string
  tone?: 'default' | 'quiet'
  children: ReactNode
}

export function Callout({ title, tone = 'default', children }: CalloutProps) {
  return (
    <aside className={`post-callout post-callout-${tone}`}>
      {title ? <p className="post-callout-title">{title}</p> : null}
      <div className="post-callout-body">{children}</div>
    </aside>
  )
}

type FigureProps = {
  src: string
  alt: string
  caption?: string
}

export function Figure({ src, alt, caption }: FigureProps) {
  return (
    <figure className="post-figure" data-theme-stable>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
      />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  )
}

type EmbedProps = {
  src: string
  title: string
  aspectRatio?: string
  allow?: string
}

export function Embed({
  src,
  title,
  aspectRatio = '16 / 9',
  allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
}: EmbedProps) {
  if (!src.startsWith('https://')) return null

  return (
    <div className="post-embed" style={{ aspectRatio }}>
      <iframe
        src={src}
        title={title}
        loading="lazy"
        allow={allow}
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  )
}

export function YouTube({ id, title }: { id: string; title: string }) {
  return <Embed src={`https://www.youtube-nocookie.com/embed/${id}`} title={title} />
}

function PostLink({ href = '', children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  const external = /^https?:\/\//.test(href)
  return (
    <a
      href={href}
      {...props}
      {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
    >
      {children}
    </a>
  )
}

function PostImage({ src, alt = '', title }: ImgHTMLAttributes<HTMLImageElement>) {
  if (typeof src !== 'string') return null
  return <Figure src={src} alt={alt} caption={title} />
}

function PostTable({ children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="post-table-scroll" tabIndex={0}>
      <table {...props}>{children}</table>
    </div>
  )
}

type PostPreProps = HTMLAttributes<HTMLPreElement> & {
  'data-language'?: string
}

function PostPre({ children, ...props }: PostPreProps) {
  const language = props['data-language'] ?? 'text'
  return (
    <>
      <div className="post-code-language">{language}</div>
      <pre {...props}>{children}</pre>
    </>
  )
}

export const postComponents: MDXComponents = {
  a: PostLink,
  img: PostImage,
  table: PostTable,
  pre: PostPre,
  Callout,
  Figure,
  Embed,
  Mermaid,
  YouTube,
}
