declare module '*.mdx' {
  import type { ComponentType } from 'react'
  import type { MDXProps } from 'mdx/types'

  export type PostFrontmatter = {
    title: string
    description: string
    date: string
    updated?: string
    tags?: string[]
    coverAlt?: string
    draft?: boolean
  }

  export const frontmatter: PostFrontmatter
  const MDXContent: ComponentType<MDXProps>
  export default MDXContent
}

declare module 'virtual:posts' {
  import type { ComponentType } from 'react'
  import type { MDXProps } from 'mdx/types'

  type PostFrontmatter = {
    title: string
    description: string
    date: string
    updated?: string
    tags?: string[]
    coverAlt?: string
    draft?: boolean
  }

  export const postModules: Record<
    string,
    {
      default: ComponentType<MDXProps>
      frontmatter: PostFrontmatter
      coverImage?: string
      socialImage?: string
    }
  >
}
