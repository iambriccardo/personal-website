import type { ComponentType } from 'react'
import type { MDXProps } from 'mdx/types'
import { postModules as modules } from 'virtual:posts'

export type PostMetadata = {
  title: string
  description: string
  date: string
  updated?: string
  tags: string[]
  draft: boolean
  coverAlt?: string
}

export type Post = PostMetadata & {
  slug: string
  coverImage?: string
  socialImage?: string
  Content: ComponentType<MDXProps>
}

type PostModule = {
  default: ComponentType<MDXProps>
  frontmatter: Partial<PostMetadata>
  coverImage?: string
  socialImage?: string
}

function postFromModule(path: string, module: PostModule): Post {
  const filename = path.split('/').at(-1)
  const slug = filename?.replace(/\.mdx$/, '')
  const metadata = module.frontmatter

  if (!slug) throw new Error(`Could not derive a post slug from "${path}".`)
  if (!metadata.title || !metadata.description || !metadata.date) {
    throw new Error(`Post "${slug}" must define title, description, and date.`)
  }
  if (Number.isNaN(Date.parse(metadata.date))) {
    throw new Error(`Post "${slug}" has an invalid date: ${metadata.date}`)
  }
  if (metadata.updated && Number.isNaN(Date.parse(metadata.updated))) {
    throw new Error(`Post "${slug}" has an invalid updated date: ${metadata.updated}`)
  }

  return {
    slug,
    title: metadata.title,
    description: metadata.description,
    date: metadata.date,
    updated: metadata.updated,
    tags: metadata.tags ?? [],
    draft: metadata.draft ?? false,
    coverAlt: metadata.coverAlt,
    coverImage: module.coverImage,
    socialImage: module.socialImage,
    Content: module.default,
  }
}

export const posts = Object.entries(modules)
  .map(([path, module]) => postFromModule(path, module))
  .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))

export const getPost = (slug: string | null) =>
  posts.find((post) => post.slug === slug) ?? null
