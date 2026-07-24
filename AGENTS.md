# Personal website guide

## Site copy

- Present Riccardo’s overall identity consistently as a “software engineer.” His current Supabase position is “Team Lead,” which belongs in Experience and factual leadership copy, but should not be appended to page titles, homepage identity copy, or general metadata descriptions. Do not mention Supabase in short profile, Open Graph, Twitter, manifest, or structured-data descriptions. In longer visible About and Experience copy, employment context may use “I’m a software engineer at Supabase, based in Vienna.” In third-person metadata, use the canonical profile description exported by `src/data/sitePages.ts`.
- Use “distributed systems, databases, and data infrastructure” as the canonical technical-focus vocabulary in summaries, metadata, contact copy, and other compact descriptions. “Distributed systems” describes the architectural focus, “databases” the core technical domain, and “data infrastructure” the broader systems that move and manage data. Avoid substituting “data-intensive systems” or “reliable data infrastructure” in short summaries, where the overlap can make the scope ambiguous. More specific terms such as Postgres replication, ingestion, metrics, or ETL remain appropriate when describing actual work.
- Keep the voice direct, personal, and understated. Prefer specific descriptions of the work over promotional language, and use sentence case for controls and supporting copy.
- Keep page descriptions as complete declarative sentences. Reuse shared description constants for generated metadata and feeds so the homepage, social previews, manifest, SEO fallbacks, and RSS copy do not drift.
- Keep every page title concise, descriptive, unique, and specific to that page. Avoid repetitive boilerplate and keyword stuffing; branding should never obscure the actual page or article title. This follows Google Search’s title-link and site-name guidance.
- Keep the site name separate from page titles. `og:site_name` and `WebSite` structured data use “Riccardo Busetti,” while `<title>`, `og:title`, and `twitter:title` describe the current page. This follows the Open Graph distinction between `og:title` and `og:site_name`.
- Use `@iambriccardo` for both `twitter:site` and `twitter:creator`. Keep `twitter:url` synchronized with each page’s canonical URL, and include `https://x.com/iambriccardo` in identity links and Person structured data.
- Apply the title pattern consistently: the homepage is “Riccardo Busetti,” sections use “Section — Riccardo Busetti,” and articles use only their article title. Do not append Riccardo’s name to article browser, Open Graph, or Twitter titles; authorship belongs in the site name and structured author metadata. Treat third-party title-length scores as heuristics, not requirements; do not pad a clear title solely to satisfy them.
- After changing title or metadata logic, build the site and audit `<title>`, `og:title`, `twitter:title`, and `og:site_name` in every generated homepage, section, and article route. Dynamic client-side metadata must match the generated static metadata.
- Preserve published post titles and bodies unless Riccardo explicitly requests editorial changes. Metadata descriptions may be normalized for clarity and consistency without changing the article body.

## Layout invariants

- About, Experience, Posts, Contact, the posts index, and every post reader must use the same outer `.section-article` width. The shared desktop width lives in `--section-width`; do not add route-specific container widths.
- A section or post transition must never resize the outer content canvas. Before handoff, verify About → Posts → post reader → Posts and confirm that `.section-article` keeps the same width throughout the forward and back transitions at desktop and mobile sizes.
- Treat the `58rem` `--section-width` and the responsive `.section-article` gutters as the site-wide content canvas. Use fluid `clamp()` values for major type, spacing, and scene dimensions instead of adding isolated breakpoint values.
- Preserve the spacious vertical rhythm: section headers sit well below the back control, header dividers separate navigation from content, and content gaps compress smoothly on small screens. Reuse existing spacing patterns before introducing new values.
- Keep the interface predominantly flat and editorial. Rounded corners and shadows are reserved for controls that need separation from moving content, such as the scroll-to-top control; do not turn sections, posts, or entries into generic cards.

## Typography

- Use the existing four-family system and its CSS variables; do not substitute fonts or assign them new roles casually:
  - `--display`: self-hosted Founders Grotesk Medium 500, with Helvetica Neue, Arial, and sans-serif fallbacks. Use it for the “Riccardo Busetti” homepage identity and compact display headings such as organization and post-list titles. Its condensed, direct character provides personality without making long copy harder to read.
  - `--sans`: self-hosted Söhne Buch 400/italic and Kräftig 500, with Helvetica Neue, Arial, and sans-serif fallbacks. Use it for readable prose, descriptions, and Experience role titles. It is the neutral editorial workhorse of the system.
  - `--mono`: JetBrains Mono Variable, with system monospace fallbacks. Use it for the large uppercase section titles, metadata, dates, labels, controls, ASCII-related UI, and code. The section titles intentionally connect the page content to the computational ASCII world; they are JetBrains Mono 700, not Founders Grotesk.
  - `--drop-cap`: Bodoni Moda 700, with Georgia as fallback. Use it only for article drop caps, where it provides a restrained editorial contrast.
- Preserve the hierarchy rather than choosing fonts element by element: Founders Grotesk identifies and displays, Söhne carries prose, JetBrains Mono supplies structure and interface language, and Bodoni Moda is the single serif accent.
- Keep font synthesis disabled and use only loaded weights. Do not fake bold or italic styles.
- Keep the article drop cap in the self-hosted Bodoni Moda 700 serif face, with Georgia as its fallback. It is the article’s only serif accent; do not reuse it for headings or body text without an explicit typography redesign.
- Keep the shared About, Experience, Posts, and Contact heading scale identical. Section titles use the single `.section-title` rule; do not introduce per-section title sizes that would make navigation feel unstable.

## Color and surfaces

- Build all interface colors from the shared semantic tokens: `--paper`, `--ink`, `--muted`, and `--soft`. Light mode is white paper, near-black ink, neutral gray secondary text, and 14% black dividers; dark mode is the exact inverse. Do not scatter new hard-coded theme colors through components.
- Preserve the strict monochrome palette. Hierarchy comes from type, scale, opacity, spacing, blur, and motion rather than accent colors or gradients. The only gradient is a subtle transparency treatment on the floating scroll control, derived from the same semantic tokens.
- Keep the light and dark palettes mathematically inverse because the pixel-curtain theme transition depends on `backdrop-filter: invert()` producing pixel-identical intermediate colors.
- Use `--ink` on `--paper` for primary content, `--muted` for supporting information and inactive controls, and `--soft` for dividers and quiet boundaries. Selection reverses paper and ink.
- When the ASCII world sits behind an open section, retain the established `0.3` opacity and `6px` blur unless the entire foreground/background relationship is being redesigned; content legibility takes priority over scene detail.

## Motion and interaction

- Motion should explain spatial continuity: clouds morph into section headings, panels enter from the selected scene, posts transition within the same canvas, and the pixel curtain makes a theme change feel physical. Do not add animation solely as decoration.
- Reuse the shared timing curves. Entrances use `--ease-enter` / `EASE_ENTER` (`cubic-bezier(0.22, 1, 0.36, 1)`), exits use `--ease-exit` / `EASE_EXIT` (`cubic-bezier(0.4, 0, 1, 1)`), and large scene movement uses `--ease-scene` (`cubic-bezier(0.45, 0, 0.25, 1)`). Keep CSS and Motion values synchronized.
- Keep micro-interactions quick and restrained: controls use `180ms`, icons use `220ms`, and small reveals use `320ms`. Prefer subtle color changes and translations of only a few pixels; avoid bouncy springs, elastic easing, large hover scaling, or simultaneous animation of many unrelated properties.
- Preserve coordinated navigation timings unless retuning the whole sequence: section opening is `1150ms`, section closing is `950ms`, post exit is `160ms`, post entry is `340ms`, and the theme curtain runs for roughly `900ms` with controlled per-pixel jitter. Title, panel, and copy delays are staged against these shared transitions.
- Springs must use zero bounce. Entrances may settle softly, while exits should be shorter and more direct than entrances.
- Hover and keyboard-focus states must communicate the same affordance. Use the existing cloud swell for invisible network-node focus, ink/muted color changes for text controls, and small directional icon movement for navigation. Do not add generic focus rectangles around transparent ASCII hit areas; provide a shape-appropriate visible focus treatment instead.
- Do not introduce global Enter-key shortcuts on the homepage. Section navigation should occur only through deliberate activation of its corresponding interactive control, and returning home must not automatically focus a section trigger that Enter could reopen.
- Respect `prefers-reduced-motion` throughout CSS, Motion components, the boot sequence, the ASCII scene, and theme changes. Reduced motion should remove spatial animation and delays without hiding content or breaking state changes.

## Responsive behavior

- Treat `720px` as the main content-layout breakpoint already used by the site. Below it, simplify grids, reduce scene hit areas and heading sizes, and preserve readable gutters without changing the shared outer canvas concept.
- Continue supporting compact landscape viewports separately from ordinary mobile portrait layouts. Use both height and aspect ratio when a viewport is short enough that width-only breakpoints would fail.
- Account for safe-area insets on fixed controls and identity chrome. Interactive targets must remain comfortably usable on coarse pointers; do not shrink target areas to match the visual glyph size.
- Test material design-system changes in light and dark themes, at desktop, mobile portrait, and compact landscape sizes, with reduced motion enabled as a separate pass.

## Posts

- Store posts in the repository-root `posts/` folder as `.mdx` files. This folder is content-only: adding an MDX file is sufficient, and post imports must not require changes elsewhere. The filename is the public slug, so use lowercase kebab-case and do not change it after publication without adding a redirect.
- Preserve an imported post's title and body verbatim. Do not rewrite, summarize, "improve," or reorder the author's prose unless Riccardo explicitly asks for editorial changes.
- Add or normalize only the YAML frontmatter needed by the site: `title`, `description`, `date`, optional `updated`, `tags`, optional `coverAlt`, and optional `draft`. Dates use `YYYY-MM-DD`; tags use title case and should reuse existing tags when possible. When `cover.webp` exists, `coverAlt` is required and must meaningfully describe the artwork.
- `description` should be a plain-text summary suitable for the post list and metadata. If the supplied post has no summary, derive one without changing the post body.
- Keep images and downloadable post assets under `public/posts/<post-slug>/` and reference them with absolute paths such as `/posts/<post-slug>/diagram.svg`. Always provide meaningful alt text.
- Standard Markdown, GitHub-flavored Markdown, footnotes, tables, fenced code blocks, inline and display LaTeX are supported. Use `Callout`, `Figure`, `Mermaid`, `Embed`, and `YouTube` only when the content needs them; provide an accessible title for diagrams and embeds.
- Code fences must specify a language when known. Do not paste executable third-party scripts into MDX; use the provided privacy-conscious embed components.
- New posts are discovered and sorted by date automatically. Do not edit `src/data/posts.ts`, the post UI, routing, sitemap, or RSS logic when adding a post.
- Before handing off a post, run `npm run build` and check the post list plus post reader in both light and dark themes at desktop and mobile widths.

## Post images

- Keep the default non-post sharing image at `public/site-social-card.jpg`. Generate it with `npm run optimize:site-image -- <source-image>`; the command strips metadata and crops the source to a 1200×630 progressive JPEG. Homepage and section metadata use this image automatically. Blog posts must override it with their own `public/posts/<post-slug>/social-card.jpg`.

- Put every post image in `public/posts/<post-slug>/`. Use lowercase kebab-case for descriptive inline assets. Reserve `cover.webp` for the primary article image and `social-card.jpg` for the sharing preview. Never keep source exports with spaces, dates, or names such as `final`, `v2`, or `copy` in the repository.
- Generate the standard cover and social card with `npm run optimize:post-image -- <post-slug> <source-image>`. The command creates the destination folder, strips metadata, writes an aspect-ratio-preserving WebP cover at no more than 1600px wide, and creates a 1200×630 progressive JPEG sharing card.
- Use WebP for photographic, rendered, or textured inline images. Use SVG for diagrams and other true vector artwork. Use PNG only when lossless pixels or transparency are materially necessary; do not ship an unoptimized source PNG merely because it was supplied in that format.
- Default to WebP quality 82 for article imagery and JPEG quality 86 with 4:4:4 chroma subsampling for social cards containing fine text or ASCII details. Treat these as starting points: inspect the result at full size and raise quality only when compression artifacts are visible.
- Do not enlarge the article cover. For the social card, crop to 1200×630 and confirm that the subject remains inside the central safe area used by sharing platforms. Keep each output comfortably below 500 kB when possible without visible degradation.
- Do not manually embed the primary cover in MDX. When `cover.webp` exists, the site automatically renders it above the post body and as the post-list thumbnail; `coverAlt` supplies its accessible text. When `social-card.jpg` exists beside it, the build automatically uses it for Open Graph, Twitter/X, and `BlogPosting` image metadata. Other inline images still use absolute `/posts/<post-slug>/...` paths and meaningful alt text.
- Before handoff, compare source and optimized dimensions/file sizes, visually inspect both outputs, run `npm run build`, and verify the cover in the post reader at desktop and mobile widths in both themes.
