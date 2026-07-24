import profilePic from '../assets/images/profile-pic.jpg'
import supabaseLogo from '../assets/images/supabase-logo.png'
import sentryLogo from '../assets/images/sentry-logo.png'
import unibzLogo from '../assets/images/unibz-logo.png'

export type Point = { x: number; y: number }

export type SectionEntry = {
  logo: string
  logoAlt: string
  url?: string
  /** ASCII columns for the logo mark; wordmarks need more than symbols. */
  logoCols?: number
  heading: string
  period?: string
  meta?: string
  body?: string
  roles?: SectionRole[]
}

export type SectionRole = {
  title: string
  period: string
  body: string
  current?: boolean
}

/** A compact, logo-less list row for side projects and similar links. */
export type SectionProject = {
  name: string
  url: string
  /** Short mono label shown beside the name, e.g. the language. */
  meta: string
  body: string
}

export type SectionEntryGroup = {
  title?: string
  entries?: SectionEntry[]
  projects?: SectionProject[]
}

export type SectionDefinition = {
  id: string
  label: string
  portrait?: {
    src: string
    alt: string
  }
  anchor: {
    desktop: Point
    mobile: Point
    compactLandscape: Point
  }
  markdown: string
  groups?: SectionEntryGroup[]
}

export const sections: SectionDefinition[] = [
  {
    id: 'about',
    label: 'About',
    anchor: {
      desktop: { x: 0.25, y: 0.27 },
      mobile: { x: 0.5, y: 0 },
      compactLandscape: { x: 0.28, y: 0.38 },
    },
    portrait: {
      src: profilePic,
      alt: 'Riccardo Busetti',
    },
    markdown: `
I’m a software engineer at Supabase, based in Vienna. My work focuses on distributed systems, databases, and data infrastructure, especially the details that make software fast, dependable, and predictable.

I’m leading the Pipelines team at Supabase, where we’re building a platform for moving data between Postgres and other data systems quickly and reliably.

I also care deeply about product and industrial design. How something feels matters as much as how it works.
`,
  },
  {
    id: 'experience',
    label: 'Experience',
    anchor: {
      desktop: { x: 0.75, y: 0.29 },
      mobile: { x: 0.31, y: 1 / 3 },
      compactLandscape: { x: 0.72, y: 0.38 },
    },
    markdown: '',
    groups: [
      {
        title: 'Work',
        entries: [
          {
            logo: supabaseLogo,
            logoAlt: 'Supabase logo',
            url: 'https://supabase.com/',
            heading: 'Supabase',
            roles: [
              {
                title: 'Team Lead',
                period: 'Nov 2025 to present',
                body: 'I lead the team building Supabase Pipelines, a platform for moving data between Postgres and other data systems quickly and reliably, powered by Supabase ETL, our open-source Postgres replication engine in Rust. I work across system architecture, product direction, and infrastructure while growing the team.',
                current: true,
              },
              {
                title: 'Senior Software Engineer',
                period: 'May 2025 to Nov 2025',
                body: 'I rewrote the Supabase ETL prototype as a production-grade Postgres replication engine and built the infrastructure, deployment pipeline, observability, and end-to-end testing around it.',
              },
            ],
          },
          {
            logo: sentryLogo,
            logoAlt: 'Sentry logo',
            url: 'https://sentry.io/',
            heading: 'Sentry',
            roles: [
              {
                title: 'Software Engineer II',
                period: 'Aug 2023 to Apr 2025',
                body: 'I worked on Sentry’s distributed ingestion systems, improving resilience and throughput under heavy load. I also helped build the metrics platform and API behind a new product.',
              },
              {
                title: 'Software Engineer',
                period: 'Sep 2022 to Aug 2023',
                body: 'I worked on stack trace symbolication and redesigned dynamic sampling, helping Sentry prioritize billions of events each day.',
              },
            ],
          },
        ],
      },
      {
        title: 'Education',
        entries: [
          {
            logo: unibzLogo,
            logoAlt: 'Free University of Bozen-Bolzano logo',
            url: 'https://www.unibz.it/',
            logoCols: 56,
            heading: 'Free University of Bozen-Bolzano',
            roles: [
              {
                title: 'Bachelor of Computer Science',
                period: 'Sep 2019 to Jul 2022',
                body: 'I graduated with 110/110 cum laude. My thesis explored distributed optimization with Apache Spark and Kubernetes. The work was presented at FiCloud 2022 and led to published papers.',
              },
            ],
          },
        ],
      },
      {
        title: 'Projects',
        projects: [
          {
            name: 'Ruft',
            url: 'https://github.com/iambriccardo/ruft',
            meta: 'Rust',
            body: 'An implementation of the Raft consensus protocol.',
          },
          {
            name: 'Causal',
            url: 'https://github.com/iambriccardo/causal',
            meta: 'Rust',
            body: 'A reliable causal broadcast protocol that implements several conflict-free replicated data types.',
          },
          {
            name: 'Distribuito',
            url: 'https://github.com/iambriccardo/distribuito',
            meta: 'Rust',
            body: 'A simple distributed column-oriented database.',
          },
          {
            name: 'Coda',
            url: 'https://github.com/getsentry/hackweek-coda',
            meta: 'Python · Rust',
            body: 'An experimental workflow execution engine inspired by Temporal, built during a hackweek at Sentry.',
          },
        ],
      },
    ],
  },
  {
    id: 'posts',
    label: 'Posts',
    anchor: {
      desktop: { x: 0.28, y: 0.74 },
      mobile: { x: 0.69, y: 2 / 3 },
      compactLandscape: { x: 0.28, y: 0.76 },
    },
    markdown: '',
  },
  {
    id: 'contact',
    label: 'Contact',
    anchor: {
      desktop: { x: 0.74, y: 0.73 },
      mobile: { x: 0.47, y: 1 },
      compactLandscape: { x: 0.72, y: 0.78 },
    },
    markdown: `
If you’re working on distributed systems, databases, or data infrastructure—or simply want to discuss technical ideas—feel free to reach out:

- [Email](mailto:riccardob36@gmail.com)
- [GitHub](https://github.com/iambriccardo)
- [LinkedIn](https://www.linkedin.com/in/iambriccardo)
`,
  },
]

export const getSection = (id: string | null) =>
  sections.find((section) => section.id === id) ?? null
