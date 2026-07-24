let postsSectionPromise: Promise<typeof import('./PostsSection')> | null = null

export function loadPostsSection() {
  postsSectionPromise ??= import('./PostsSection')
  return postsSectionPromise
}

export function preloadPostsSection() {
  void loadPostsSection()
}
