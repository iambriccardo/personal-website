# Riccardo Busetti

## TL;DR

I’m a software engineer at Supabase, based in Vienna. My work focuses on distributed systems, databases, and data infrastructure, especially the details that make software fast, dependable, and predictable.

I lead the team building Supabase ETL, a Postgres replication engine in Rust. Before that, I worked at Sentry on distributed ingestion, metrics, stack trace symbolication, and dynamic sampling.

I earned a Bachelor of Computer Science from the Free University of Bozen-Bolzano, graduating with 110/110 cum laude. My thesis explored distributed optimization with Apache Spark and Kubernetes.

## Contact

If you’re working on distributed systems, databases, or data infrastructure—or simply want to discuss technical ideas—feel free to reach out:

- [Email](mailto:riccardob36@gmail.com)
- [GitHub](https://github.com/iambriccardo)
- [LinkedIn](https://www.linkedin.com/in/iambriccardo)

## Publishing the public snapshot

Development history belongs in a private repository configured as `origin`. The
public website repository is configured as `public` and receives only a fresh
root commit named `Deploy new version` on each publication.

Configure a clone once:

```sh
git remote rename origin public
git remote add origin <private-repository-url>
git push -u origin main
```

Publish the latest committed private snapshot with:

```sh
npm run publish:public
```

The command requires a clean working tree, runs the production build, exports
only committed files into a temporary repository, and force-pushes a single
root commit to `public/main`. Rewriting the public branch does not remove copies
that have already been cloned, forked, cached, or retained by the host.

## Local development

This repository contains my personal website.

```sh
npm install
npm run dev
```

Create a production build with:

```sh
npm run build
```

## Posts

Posts live in the repository-root [`posts`](./posts) folder as MDX files. That folder contains content only: add a file there and everything else is automatic. Frontmatter provides the title, description, publication date, optional update date, tags, and draft status; the filename becomes the URL slug. The site discovers posts automatically and sorts them newest-first.

MDX supports standard and GitHub-flavored Markdown, syntax-highlighted code, LaTeX, images, tables, footnotes, callouts, figures, and privacy-conscious embeds. `npm run build` also creates a static entry page for every post, along with `sitemap.xml` and `rss.xml`.

See the [`post formatting guide`](./docs/post-formatting.md) for copy-ready examples of every supported content type. [`AGENTS.md`](./AGENTS.md) contains the content-import rules for agents.
