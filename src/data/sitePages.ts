export const SITE_URL = 'https://riccardobusetti.me'
export const RSS_FEED_URL = `${SITE_URL}/rss.xml`
export const RSS_FEED_TITLE = 'Riccardo Busetti — Posts'
export const SITE_SOCIAL_IMAGE = '/site-social-card.jpg'
export const SITE_SOCIAL_IMAGE_ALT = 'A flowing three-dimensional landscape made from white ASCII characters on a black background.'
export const TECHNICAL_FOCUS = 'distributed systems, databases, and data infrastructure'
export const PROFILE_DESCRIPTION = `Riccardo Busetti is a Vienna-based software engineer focused on ${TECHNICAL_FOCUS}.`
export const POSTS_DESCRIPTION = 'Writing by Riccardo Busetti about technology, work, and other ideas.'

const SITE_PAGE_SOCIAL_METADATA = {
  image: SITE_SOCIAL_IMAGE,
  imageAlt: SITE_SOCIAL_IMAGE_ALT,
}

export const HOME_PAGE = {
  title: 'Riccardo Busetti',
  description: PROFILE_DESCRIPTION,
  ...SITE_PAGE_SOCIAL_METADATA,
}

export const SECTION_PAGES = {
  about: {
    title: 'About — Riccardo Busetti',
    description: PROFILE_DESCRIPTION,
    ...SITE_PAGE_SOCIAL_METADATA,
  },
  experience: {
    title: 'Experience — Riccardo Busetti',
    description: `Riccardo Busetti’s experience spans software engineering and technical leadership across ${TECHNICAL_FOCUS}.`,
    ...SITE_PAGE_SOCIAL_METADATA,
  },
  posts: {
    title: 'Posts — Riccardo Busetti',
    description: POSTS_DESCRIPTION,
    ...SITE_PAGE_SOCIAL_METADATA,
  },
  contact: {
    title: 'Contact — Riccardo Busetti',
    description: `You can contact Riccardo Busetti about ${TECHNICAL_FOCUS}.`,
    ...SITE_PAGE_SOCIAL_METADATA,
  },
} as const

export function getSectionPage(sectionId: string | null) {
  if (sectionId && Object.hasOwn(SECTION_PAGES, sectionId)) {
    return SECTION_PAGES[sectionId as keyof typeof SECTION_PAGES]
  }
  return HOME_PAGE
}
