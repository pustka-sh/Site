# Review documentation before publication

Build and check a package with the existing documentation toolchain, then render it locally:

```sh
npm run docs:check -- --package /path/to/documentation.json --root /path/to/project --manifest /path/to/project/pustka.docs.json
npm run docs:preview -- --file /path/to/documentation.json --out /path/to/new-preview-folder
```

The preview folder contains self-contained HTML, CSS, math fonts and a manifest recording the input package SHA-256 and exact source identity. Open `index.html` directly or serve the folder with a local static server. Guides and the API reference use local relative links; no production credentials or publication request are involved. The output directory must be new or empty, and paths containing symlinks are rejected. Preview HTML displays a draft banner even if the package describes a release version.

Relay's documentation workflow generates the preview in its unprivileged package job. Download and extract the rendered artifact from the Actions run linked in the job summary. Review it before merging. The existing separate publication job runs only for eligible trusted events and uses its publication key there. A preview is never listed as published documentation or in a sitemap.

# Read changes between actual snapshots

`/docs/:project/compare` lists the project's published versions and compares two selected packages. Selection is shareable through `?from=VERSION&to=VERSION`. The endpoint is `GET /api/site/docs/:project/compare?from=VERSION&to=VERSION`; both snapshots must exist in the configured project's documentation store.

The comparison reports added and removed identifiers, changed declarations, authored policy changes, comment-only changes, and guide changes. Each result links to its own version and exact source revision. A changed identifier appears as an addition and removal; this is not automatic rename detection. Signature changes and declared exceptions prompt review, but this is not a binary, source or runtime compatibility checker. Semantics, implementation-only behavior and inherited surface changes can require review even when declarations are unchanged.

With fewer than two published versions the page explains that comparison is not available yet and links to actual documentation. It never creates sample releases. A target package's authored `migration` guide is linked when present. Development `main` follows ongoing work; it is not a history of every prior development publication. To preserve a future release comparison, publish distinct reviewed release versions.

# Journal publishing

The initial two journal articles are implementation notes with exact-commit source links. Their publication dates describe the articles, not feature release dates. `npm run build` renders the Markdown with the same escaping, Markdown and math rules as project guides, generates the interactive content, and writes full article HTML for static hosts and no-JavaScript readers. New notes are discoverable in navigation, search, and the static sitemap. There are no analytics, author personas, or invented release milestones in this content.
