# Post formatting guide

Posts are MDX files stored in the repository-root `posts/` folder. Adding a file there is enough for the site to discover it; no application code, route, sitemap, or RSS change is needed.

## Start a post

Create a lowercase, kebab-case filename:

```text
posts/how-postgres-replication-works.mdx
```

The filename becomes the permanent URL:

```text
https://riccardobusetti.me/posts/how-postgres-replication-works/
```

Start with this template:

```mdx
---
title: How Postgres Replication Works
description: A plain-text summary used in the post list, search results, link previews, RSS, and page metadata.
date: 2026-07-13
updated: 2026-07-20
tags:
  - Databases
  - Postgres
draft: true
---

Write the opening paragraph here. Its first letter is rendered as a drop cap.

## First section

Continue the post here.
```

### Frontmatter fields

| Field | Required | Format | Purpose |
| --- | --- | --- | --- |
| `title` | Yes | Plain text | Post heading, list entry, browser title, and social metadata. |
| `description` | Yes | Plain text | Short summary used by the UI, search engines, RSS, and link previews. |
| `date` | Yes | `YYYY-MM-DD` | Publication date and default sorting value. |
| `updated` | No | `YYYY-MM-DD` | Last substantial revision date. Omit it when the post has not been revised. |
| `tags` | No | YAML list | Searchable topic labels. Use title case and reuse existing tags where possible. |
| `draft` | No | `true` or `false` | `true` shows the post locally but excludes it from production pages, RSS, and the sitemap. Omitted means `false`. |

Drafts are unpublished, not confidential. Their source may still be present in the production JavaScript bundle, so never put secrets or private material in a draft.

Use an unformatted, self-contained sentence for `description`; Markdown and MDX components are not rendered there. Quote a YAML value when it contains a colon or other syntax that YAML could interpret:

```yaml
title: "Replication: From Prototype to Production"
```

## Text

```md
# Heading level one
## Heading level two
### Heading level three

Regular paragraph with **bold text**, *italic text*, and ~~struck text~~.

Use `inline code` for identifiers, commands, and short technical values.

[Internal link](/#about)
[External link](https://www.postgresql.org/)

> A blockquote can span one or more lines.
>
> It may contain multiple paragraphs.

---

The line above is a horizontal rule.
```

Headings automatically receive linkable IDs. Prefer `##` for the main sections inside a post because the post title already acts as the page's top-level heading.

## Lists and checklists

```md
- Unordered item
- Another item
  - Nested item

1. First step
2. Second step
   1. Nested step

- [x] Completed task
- [ ] Open task
```

## Code

Inline code uses single backticks:

```md
Call `startReplication()` after the connection is ready.
```

Fenced code blocks use three backticks and should name the language. The reader displays that language above the highlighted block.

````md
```rust
fn main() {
    println!("hello, world");
}
```
````

Common language names include `rust`, `typescript`, `javascript`, `tsx`, `jsx`, `sql`, `bash`, `json`, `yaml`, `toml`, `html`, `css`, `python`, `go`, and `text`.

Use `text` for logs or content that has no programming language:

````md
```text
replication slot is active
```
````

## Mathematics

Inline LaTeX is wrapped in single dollar signs:

```md
The expected latency is $L = t_{receive} - t_{send}$.
```

Display LaTeX is wrapped in double dollar signs on separate lines:

```md
$$
T(n) = \sum_{i=1}^{n} t_i
$$
```

## Images and figures

Keep post assets in a folder matching the post slug:

```text
public/posts/how-postgres-replication-works/architecture.svg
```

Reference public assets with an absolute path. Standard Markdown image syntax is automatically rendered as a figure; the optional image title becomes its caption:

```md
![Replication architecture showing the publisher and two subscribers](/posts/how-postgres-replication-works/architecture.svg "Replication architecture")
```

The equivalent explicit MDX component is:

```mdx
<Figure
  src="/posts/how-postgres-replication-works/architecture.svg"
  alt="Replication architecture showing the publisher and two subscribers"
  caption="Replication architecture"
/>
```

Always write alt text that communicates the image's relevant meaning. Use `alt=""` only for a purely decorative image. Prefer SVG for diagrams and appropriately compressed WebP, AVIF, JPEG, or PNG files for raster images.

## Tables

GitHub-flavored Markdown tables are supported and scroll horizontally on narrow screens:

```md
| System | Delivery | Ordering |
| --- | ---: | :---: |
| A | At least once | Per key |
| B | Exactly once | Global |
```

Colons in the separator row control column alignment.

## Footnotes

```md
Logical replication sends changes from the write-ahead log.[^wal]

[^wal]: PostgreSQL's write-ahead log records changes before they reach data files.
```

Use descriptive footnote identifiers when possible; they do not appear as the visible footnote number.

## Callouts

Use a callout for information that genuinely benefits from being set apart:

```mdx
<Callout title="Note">
  This behavior applies only while the replication slot is active.
</Callout>
```

For a less prominent callout, set `tone="quiet"`:

```mdx
<Callout title="Aside" tone="quiet">
  This is useful context, but it is not part of the main argument.
</Callout>
```

The title is optional. Supported tones are `default` and `quiet`.

## YouTube videos

Use the privacy-conscious YouTube component with the video ID, not the full URL:

```mdx
<YouTube
  id="dQw4w9WgXcQ"
  title="Descriptive title of the embedded video"
/>
```

The component uses YouTube's `youtube-nocookie.com` embed domain. A meaningful `title` is required for accessibility.

## Other embeds

Use `Embed` for an HTTPS iframe source:

```mdx
<Embed
  src="https://example.com/embed/demo"
  title="Interactive replication demo"
  aspectRatio="4 / 3"
/>
```

`src` and `title` are required. `aspectRatio` is optional and defaults to `16 / 9`. Non-HTTPS sources are rejected. Do not paste third-party `<script>` tags into a post.

If an embed needs a narrower permission policy, provide `allow` explicitly:

```mdx
<Embed
  src="https://example.com/embed/demo"
  title="Interactive replication demo"
  allow="fullscreen"
/>
```

## Raw MDX and HTML

MDX allows JSX-like markup, but prefer Markdown and the provided components. Arbitrary custom React components are not automatically available inside posts. The supported post components are:

- `Callout`
- `Figure`
- `Embed`
- `YouTube`

Use HTML entities when literal angle brackets could be read as JSX. For example, write `&lt;T&gt;` when showing a generic type in normal prose, or put it in inline code as `` `<T>` ``.

## Writing and publishing checklist

1. Put the `.mdx` file directly in `posts/` and use a lowercase, kebab-case filename.
2. Add valid `title`, `description`, and `date` fields.
3. Keep `draft: true` while writing.
4. Put images and downloads under `public/posts/<post-slug>/`.
5. Add meaningful image alt text and embed titles.
6. Specify a language on every fenced code block when known.
7. Run `npm run dev` and review the post in light and dark themes, on desktop and mobile.
8. Set `draft: false` or remove the `draft` field when it is ready to publish.
9. Run `npm run build` before committing.

Published posts are automatically added to the Posts section, their permanent URL, `sitemap.xml`, and `rss.xml`, sorted newest first by `date`.
