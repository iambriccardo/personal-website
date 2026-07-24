const TWITTER_HANDLE = '@iambriccardo'

const IMAGE_META_SELECTOR =
  'meta[property="og:image"], meta[property="og:image:secure_url"], meta[property="og:image:type"], meta[property="og:image:width"], meta[property="og:image:height"], meta[property="og:image:alt"], meta[name="twitter:image"], meta[name="twitter:image:alt"]'

export type PageMetadata = {
  title: string
  description: string
  /** Absolute canonical URL of the page. */
  url: string
  type: 'website' | 'article'
  /** Absolute URL of the 1200×630 JPEG sharing image, when the page has one. */
  image?: string | null
  imageAlt?: string | null
}

function setMeta(attribute: 'name' | 'property', key: string, content: string) {
  let meta = document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute(attribute, key)
    document.head.appendChild(meta)
  }
  meta.content = content
}

/**
 * Applies a page's document metadata after a client-side navigation: title,
 * description, canonical URL, and the Open Graph and Twitter cards. Must stay
 * in sync with the static metadata the build writes for the same routes in
 * `vite.config.ts`.
 */
export function applyDocumentMetadata(page: PageMetadata) {
  document.title = page.title
  setMeta('name', 'description', page.description)
  setMeta('property', 'og:title', page.title)
  setMeta('property', 'og:description', page.description)
  setMeta('property', 'og:url', page.url)
  setMeta('property', 'og:type', page.type)
  setMeta('name', 'twitter:title', page.title)
  setMeta('name', 'twitter:description', page.description)
  setMeta('name', 'twitter:card', page.image ? 'summary_large_image' : 'summary')
  setMeta('name', 'twitter:site', TWITTER_HANDLE)
  setMeta('name', 'twitter:creator', TWITTER_HANDLE)
  setMeta('name', 'twitter:url', page.url)

  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.rel = 'canonical'
    document.head.appendChild(canonical)
  }
  canonical.href = page.url

  if (page.image) {
    const imageAlt = page.imageAlt ?? `${page.title} cover image`
    setMeta('property', 'og:image', page.image)
    setMeta('property', 'og:image:secure_url', page.image)
    setMeta('property', 'og:image:type', 'image/jpeg')
    setMeta('property', 'og:image:width', '1200')
    setMeta('property', 'og:image:height', '630')
    setMeta('property', 'og:image:alt', imageAlt)
    setMeta('name', 'twitter:image', page.image)
    setMeta('name', 'twitter:image:alt', imageAlt)
  } else {
    document.querySelectorAll(IMAGE_META_SELECTOR).forEach((meta) => meta.remove())
  }
}
