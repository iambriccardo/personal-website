import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { evaluate } from '@mdx-js/mdx'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import mdx from '@mdx-js/rollup'
import react from '@vitejs/plugin-react'
import matter from 'gray-matter'
import { createElement, Fragment } from 'react'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as runtime from 'react/jsx-runtime'
import type { MDXComponents } from 'mdx/types'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeKatex from 'rehype-katex'
import rehypePrettyCode from 'rehype-pretty-code'
import rehypeSlug from 'rehype-slug'
import remarkFrontmatter from 'remark-frontmatter'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkMdxFrontmatter from 'remark-mdx-frontmatter'
import {
  HOME_PAGE,
  POSTS_DESCRIPTION,
  RSS_FEED_TITLE,
  RSS_FEED_URL,
  SECTION_PAGES,
  SITE_URL,
} from './src/data/sitePages'

const POSTS_MODULE_ID = 'virtual:posts'
const RESOLVED_POSTS_MODULE_ID = `\0${POSTS_MODULE_ID}`
const SITE_SECTIONS = Object.entries(SECTION_PAGES).map(([slug, page]) => ({ slug, ...page }))

type BuildPost = {
  filename: string
  body: string
  slug: string
  title: string
  description: string
  date: string
  updated?: string
  tags: string[]
  draft: boolean
  coverAlt?: string
  coverImage?: string
  socialImage?: string
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

const escapeXml = (value: string) =>
  escapeHtml(value).replace(/'/g, '&apos;').replace(/>/g, '&gt;')

const frontmatterDate = (value: unknown) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : String(value)

const rssDate = (value: string) => new Date(`${value}T00:00:00Z`).toUTCString()

function applyPageMetadata(
  baseHtml: string,
  page: {
    title: string
    description: string
    url: string
    type?: 'article' | 'website'
    image?: string
    imageAlt?: string
  },
) {
  const html = baseHtml
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(" \/>)/, `$1${escapeHtml(page.description)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(" \/>)/, `$1${page.url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(" \/>)/, `$1${escapeHtml(page.title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(" \/>)/, `$1${escapeHtml(page.description)}$2`)
    .replace(/(<meta property="og:type" content=")[^"]*(" \/>)/, `$1${page.type ?? 'website'}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(" \/>)/, `$1${page.url}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(" \/>)/, `$1${escapeHtml(page.title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(" \/>)/, `$1${escapeHtml(page.description)}$2`)
    .replace(/(<meta name="twitter:url" content=")[^"]*(" \/>)/, `$1${page.url}$2`)
    .replace(
      /^\s*<meta (?:property="og:image(?::[^"]+)?"|name="twitter:image(?::alt)?")[^>]*>\s*$/gm,
      '',
    )

  if (!page.image) return html

  const imageAlt = escapeHtml(page.imageAlt ?? `${page.title} cover image`)
  return html
    .replace(
      /(<meta name="twitter:card" content=")[^"]*(" \/>)/,
      '$1summary_large_image$2',
    )
    .replace(
      '</head>',
      `    <meta property="og:image" content="${page.image}" />\n    <meta property="og:image:secure_url" content="${page.image}" />\n    <meta property="og:image:type" content="image/jpeg" />\n    <meta property="og:image:width" content="1200" />\n    <meta property="og:image:height" content="630" />\n    <meta property="og:image:alt" content="${imageAlt}" />\n    <meta name="twitter:image" content="${page.image}" />\n    <meta name="twitter:image:alt" content="${imageAlt}" />\n  </head>`,
    )
}

function applySeoFallback(baseHtml: string, content: string) {
  return baseHtml.replace(
    '<div id="root"></div>',
    `<div id="root"><main class="seo-fallback">${content}</main></div>`,
  )
}

function homeFallback() {
  const links = SITE_SECTIONS.map(
    (section) => `<a href="/${section.slug}/">${escapeHtml(section.title.split(' — ')[0])}</a>`,
  ).join('')

  return `<h1>Riccardo Busetti</h1>
        <p>${escapeHtml(HOME_PAGE.description)}</p>
        <nav aria-label="Primary" data-nosnippet>${links}</nav>`
}

function sectionFallback(
  section: (typeof SITE_SECTIONS)[number],
  posts: BuildPost[],
) {
  const heading = escapeHtml(section.title.split(' — ')[0])
  const postList = section.slug === 'posts'
    ? `<ol>${posts.map((post) => `<li><a href="/posts/${post.slug}/">${escapeHtml(post.title)}</a><p>${escapeHtml(post.description)}</p></li>`).join('')}</ol>`
    : ''

  return `<nav aria-label="Breadcrumb" data-nosnippet><a href="/">Riccardo Busetti</a></nav>
        <h1>${heading}</h1>
        <p>${escapeHtml(section.description)}</p>
        ${postList}`
}

function postFallback(post: BuildPost, body: string) {
  const tags = post.tags.length
    ? `<ul aria-label="Tags">${post.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('')}</ul>`
    : ''
  const cover = post.coverImage
    ? `<img src="${post.coverImage}" alt="${escapeHtml(post.coverAlt ?? '')}" />`
    : ''

  return `<nav aria-label="Breadcrumb" data-nosnippet><a href="/posts/">Posts</a></nav>
        <article class="post-reader" itemscope itemtype="https://schema.org/BlogPosting">
          <meta itemprop="author" content="Riccardo Busetti" />
          <link itemprop="mainEntityOfPage" href="${SITE_URL}/posts/${post.slug}/" />
          <header class="post-header">
            <time itemprop="datePublished" datetime="${post.date}">${post.date}</time>
            ${post.updated ? `<meta itemprop="dateModified" content="${post.updated}" />` : ''}
            ${tags}
            <h1 itemprop="headline">${escapeHtml(post.title)}</h1>
            <p itemprop="description">${escapeHtml(post.description)}</p>
          </header>
          ${cover}
          <div class="post-prose" itemprop="articleBody">${body}</div>
        </article>`
}

function readPosts(root = process.cwd(), includeDrafts = false): BuildPost[] {
  const directory = resolve(root, 'posts')
  return readdirSync(directory)
    .filter((file) => file.endsWith('.mdx'))
    .map((file) => {
      const { content, data } = matter(readFileSync(resolve(directory, file), 'utf8'))
      const slug = basename(file, '.mdx')
      const postAssets = resolve(root, 'public', 'posts', slug)
      const hasCover = existsSync(resolve(postAssets, 'cover.webp'))
      if (!data.title || !data.description || !data.date) {
        throw new Error(`${file} must define title, description, and date.`)
      }
      const date = frontmatterDate(data.date)
      const updated = data.updated ? frontmatterDate(data.updated) : undefined
      if (Number.isNaN(Date.parse(date))) {
        throw new Error(`${file} has an invalid date: ${date}`)
      }
      if (updated && Number.isNaN(Date.parse(updated))) {
        throw new Error(`${file} has an invalid updated date: ${updated}`)
      }
      if (hasCover && (!data.coverAlt || typeof data.coverAlt !== 'string')) {
        throw new Error(`${file} must define coverAlt when cover.webp exists.`)
      }
      return {
        filename: file,
        body: content,
        slug,
        title: String(data.title),
        description: String(data.description),
        date,
        updated,
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        draft: Boolean(data.draft),
        coverAlt: data.coverAlt ? String(data.coverAlt) : undefined,
        coverImage: hasCover
          ? `/posts/${slug}/cover.webp`
          : undefined,
        socialImage: existsSync(resolve(postAssets, 'social-card.jpg'))
          ? `/posts/${slug}/social-card.jpg`
          : undefined,
      }
    })
    .filter((post) => includeDrafts || !post.draft)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
}

const absoluteContentUrl = (value: string, baseUrl = `${SITE_URL}/`) =>
  new URL(value, baseUrl).href

function StaticLink({
  href,
  baseUrl,
  children,
  ...props
}: ComponentPropsWithoutRef<'a'> & { baseUrl: string }) {
  return createElement(
    'a',
    { ...props, href: href ? absoluteContentUrl(href, baseUrl) : undefined },
    children,
  )
}

function StaticImage({
  src,
  alt = '',
  baseUrl,
  ...props
}: ComponentPropsWithoutRef<'img'> & { baseUrl: string }) {
  if (typeof src !== 'string') return null
  return createElement('img', {
    ...props,
    src: absoluteContentUrl(src, baseUrl),
    alt,
    loading: 'lazy',
  })
}

function StaticCallout({
  title,
  children,
}: {
  title?: string
  children?: ReactNode
}) {
  return createElement(
    'aside',
    null,
    title ? createElement('strong', null, title) : null,
    children,
  )
}

function StaticFigure({
  src,
  alt,
  caption,
  baseUrl,
}: {
  src: string
  alt: string
  caption?: string
  baseUrl: string
}) {
  return createElement(
    'figure',
    null,
    createElement('img', {
      src: absoluteContentUrl(src, baseUrl),
      alt,
      loading: 'lazy',
    }),
    caption ? createElement('figcaption', null, caption) : null,
  )
}

function StaticMermaid({ chart, title }: { chart: string; title: string }) {
  return createElement(
    'figure',
    null,
    createElement('pre', null, chart),
    createElement('figcaption', null, title),
  )
}

function StaticEmbed({ src, title }: { src: string; title: string }) {
  return createElement(
    'p',
    null,
    createElement('a', { href: absoluteContentUrl(src) }, `View embedded content: ${title}`),
  )
}

function StaticYouTube({ id, title }: { id: string; title: string }) {
  return createElement(StaticEmbed, {
    src: `https://www.youtube-nocookie.com/watch?v=${id}`,
    title,
  })
}

const createStaticPostComponents = (baseUrl: string): MDXComponents => ({
  a: (props) => createElement(StaticLink, { ...props, baseUrl }),
  img: (props) => createElement(StaticImage, { ...props, baseUrl }),
  Callout: StaticCallout,
  Figure: (props) => createElement(StaticFigure, { ...props, baseUrl }),
  Mermaid: StaticMermaid,
  Embed: StaticEmbed,
  YouTube: StaticYouTube,
})

async function renderPostBody(post: BuildPost) {
  const postUrl = `${SITE_URL}/posts/${post.slug}/`
  const module = await evaluate(post.body, {
    ...runtime,
    Fragment,
    remarkPlugins: [remarkGfm, remarkMath],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: 'wrap' }],
      rehypeKatex,
      [
        rehypePrettyCode,
        {
          theme: {
            light: 'github-light',
            dark: 'github-dark',
          },
          keepBackground: false,
        },
      ],
    ],
  })

  return renderToStaticMarkup(
    createElement(module.default, { components: createStaticPostComponents(postUrl) }),
  )
}

const cdata = (value: string) => `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`

async function renderRss(posts: BuildPost[], feedUrl = RSS_FEED_URL) {
  const postBodies = new Map(
    await Promise.all(posts.map(async (post) => [post.slug, await renderPostBody(post)] as const)),
  )
  const rssItems = posts.map((post) => {
    const url = `${SITE_URL}/posts/${post.slug}/`
    const cover = post.coverImage
      ? `<figure><img src="${SITE_URL}${post.coverImage}" alt="${escapeHtml(post.coverAlt ?? '')}" loading="lazy" /></figure>`
      : ''
    const body = `${cover}${postBodies.get(post.slug) ?? ''}`
    return `    <item>\n      <title>${escapeXml(post.title)}</title>\n      <link>${url}</link>\n      <guid isPermaLink="true">${url}</guid>\n      <pubDate>${rssDate(post.date)}</pubDate>\n      <dc:creator>Riccardo Busetti</dc:creator>\n      <description>${escapeXml(post.description)}</description>\n      <content:encoded>${cdata(body)}</content:encoded>\n${post.tags.map((tag) => `      <category>${escapeXml(tag)}</category>`).join('\n')}\n    </item>`
  })
  const lastBuildDate = posts.reduce(
    (latest, post) => Math.max(latest, Date.parse(post.updated ?? post.date)),
    0,
  )

  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">\n  <channel>\n    <title>${escapeXml(RSS_FEED_TITLE)}</title>\n    <link>${SITE_URL}/posts/</link>\n    <description>${escapeXml(POSTS_DESCRIPTION)}</description>\n    <language>en</language>\n    <lastBuildDate>${new Date(lastBuildDate).toUTCString()}</lastBuildDate>\n    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />\n${rssItems.join('\n')}\n  </channel>\n</rss>\n`
}

function postsManifest(): Plugin {
  let root = process.cwd()
  let includeDrafts = false

  return {
    name: 'posts-manifest',
    configResolved(config) {
      root = config.root
      includeDrafts = config.command === 'serve'
    },
    resolveId(id) {
      return id === POSTS_MODULE_ID ? RESOLVED_POSTS_MODULE_ID : null
    },
    load(id) {
      if (id !== RESOLVED_POSTS_MODULE_ID) return null

      const posts = readPosts(root, includeDrafts)
      const imports = posts.map(
        (post, index) =>
          `import Post${index}, { frontmatter as frontmatter${index} } from ${JSON.stringify(resolve(root, 'posts', post.filename))};`,
      )
      const entries = posts.map(
        (post, index) =>
          `${JSON.stringify(`../../posts/${post.filename}`)}: { default: Post${index}, frontmatter: frontmatter${index}, coverImage: ${JSON.stringify(post.coverImage)}, socialImage: ${JSON.stringify(post.socialImage)} }`,
      )

      return `${imports.join('\n')}\nexport const postModules = { ${entries.join(', ')} };\n`
    },
    configureServer(server) {
      const postsDirectory = resolve(server.config.root, 'posts')
      server.watcher.add(postsDirectory)

      server.middlewares.use('/rss.xml', (request, response) => {
        const host = request.headers.host ?? 'localhost'
        const protocol = request.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'
        response.statusCode = 200
        response.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        void renderRss(
          readPosts(server.config.root),
          `${protocol}://${host}/rss.xml`,
        ).then((feed) => response.end(feed), (error: unknown) => {
          response.statusCode = 500
          response.end('Could not render the RSS feed.')
          server.config.logger.error(String(error))
        })
      })

      const reloadManifest = (path: string) => {
        if (!path.startsWith(`${postsDirectory}/`) || !path.endsWith('.mdx')) return
        const module = server.moduleGraph.getModuleById(RESOLVED_POSTS_MODULE_ID)
        if (module) server.moduleGraph.invalidateModule(module)
        server.ws.send({ type: 'full-reload' })
      }

      server.watcher.on('add', reloadManifest)
      server.watcher.on('unlink', reloadManifest)
    },
  }
}

function postsOutput(): Plugin {
  let root = process.cwd()
  let outputDirectory = resolve('dist')

  return {
    name: 'posts-output',
    configResolved(config) {
      root = config.root
      outputDirectory = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      const posts = readPosts(root)
      const baseHtml = readFileSync(resolve(outputDirectory, 'index.html'), 'utf8')

      writeFileSync(
        resolve(outputDirectory, 'index.html'),
        applySeoFallback(baseHtml, homeFallback()),
      )

      for (const section of SITE_SECTIONS) {
        const url = `${SITE_URL}/${section.slug}/`
        const sectionDirectory = resolve(outputDirectory, section.slug)
        mkdirSync(sectionDirectory, { recursive: true })
        writeFileSync(
          resolve(sectionDirectory, 'index.html'),
          applySeoFallback(
            applyPageMetadata(baseHtml, {
              ...section,
              url,
              image: section.image ? `${SITE_URL}${section.image}` : undefined,
            }),
            sectionFallback(section, posts),
          ),
        )
      }

      for (const post of posts) {
        const url = `${SITE_URL}/posts/${post.slug}/`
        const body = await renderPostBody(post)
        const jsonLd = JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.description,
          datePublished: post.date,
          ...(post.updated ? { dateModified: post.updated } : {}),
          keywords: post.tags,
          ...(post.socialImage
            ? { image: `${SITE_URL}${post.socialImage}` }
            : {}),
          author: {
            '@type': 'Person',
            name: 'Riccardo Busetti',
            url: `${SITE_URL}/`,
          },
          inLanguage: 'en',
          url,
          mainEntityOfPage: url,
        }).replace(/</g, '\\u003c')
        const html = applySeoFallback(
          applyPageMetadata(baseHtml, {
            title: post.title,
            description: post.description,
            url,
            type: 'article',
            image: post.socialImage ? `${SITE_URL}${post.socialImage}` : undefined,
            imageAlt: post.coverAlt,
          }),
          postFallback(post, body),
        ).replace('</head>', `    <script type="application/ld+json">${jsonLd}</script>\n  </head>`)
        const postDirectory = resolve(outputDirectory, 'posts', post.slug)
        mkdirSync(postDirectory, { recursive: true })
        writeFileSync(resolve(postDirectory, 'index.html'), html)
      }

      const sitemapEntries = [
        `  <url>\n    <loc>${SITE_URL}/</loc>\n  </url>`,
        ...SITE_SECTIONS.map(
          (section) => `  <url>\n    <loc>${SITE_URL}/${section.slug}/</loc>\n  </url>`,
        ),
        ...posts.map(
          (post) =>
            `  <url>\n    <loc>${SITE_URL}/posts/${post.slug}/</loc>\n    <lastmod>${escapeXml(post.updated ?? post.date)}</lastmod>\n  </url>`,
        ),
      ]
      writeFileSync(
        resolve(outputDirectory, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.join('\n')}\n</urlset>\n`,
      )

      writeFileSync(
        resolve(outputDirectory, 'rss.xml'),
        await renderRss(posts),
      )
    },
  }
}

export default defineConfig({
  plugins: [
    postsManifest(),
    {
      ...mdx({
        remarkPlugins: [remarkFrontmatter, remarkMdxFrontmatter, remarkGfm, remarkMath],
        rehypePlugins: [
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: 'wrap' }],
          rehypeKatex,
          [
            rehypePrettyCode,
            {
              theme: {
                light: 'github-light',
                dark: 'github-dark',
              },
              keepBackground: false,
            },
          ],
        ],
      }),
      // Vite 8's built-in transform runs earlier than normal plugins; MDX
      // needs to become JSX before that stage sees the source file.
      enforce: 'pre' as const,
    },
    react({ include: /\.(?:js|jsx|ts|tsx|mdx)$/ }),
    postsOutput(),
  ],
})
