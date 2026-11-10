# pustka.sh

The website for pustka: a Minecraft software workshop, documentation hub, and collection of network tools. Built with React, Vite, Motion, and an Express backend, with SQLite persistence and a Docker deployment.

## Run with Docker

```sh
cp .env.example .env
# Set PUBLIC_ORIGIN to the HTTPS address served by your reverse proxy.
docker compose up -d --build
```

The container serves the website and API on port 3000. Compose binds it to `127.0.0.1:3000`; point your existing HTTPS reverse proxy there. Set `TRUST_PROXY` to that proxy's actual address/range so rate limits distinguish visitors correctly. Keep the `site-data` volume: it contains shared configs, aggregate docs votes, and the last successful docs snapshot.

Core tools work without external credentials. To enable anonymous GitHub reports, configure the separate issue token and opt-in flag. To connect the demo, configure a dashboard account and URL. These features show an honest unavailable state until connected. See [backend operations and API](docs/backend.md) for the complete setup, limits, webhook, storage, backup, and privacy details.

For a local Docker trial without an HTTPS proxy, set `PUBLIC_ORIGIN=http://localhost:3000` in `.env` and visit that address.

## Develop

```bash
npm install
npm run dev       # local dev server with hot reload
npm run build     # production build into dist/ (plus per-route HTML, 404.html, sitemap.xml)
npm run preview   # serve the production build
npm run sync      # pull the latest docs, config, versions and history from Relay
npm run server    # Express on port 3000, with automatic restart
npm start         # Express serving the built website
npm test          # deterministic backend and integration checks
```

Requires Node 24+. During development, run `npm run server` and `npm run dev` in separate terminals; Vite proxies the site API to Express. Local commands read environment variables from your shell. Docker Compose reads `.env` automatically. For a standalone Node launch using a file, run `node --env-file=.env server/index.mjs`.

## Keeping the docs current

`npm run sync` clones [pustka-sh/Relay](https://github.com/pustka-sh/Relay) and writes `src/content/relay.json`, which holds:

- the four docs in `docs/`, plus README sections, rendered to HTML with syntax highlighting
- `relay.default.toml`, for the config builder's "full default" view
- the supported versions from `ProtocolVersion.java`, with how each was verified (from `docs/protocol-ids.md` and the README)
- the roadmap phases from the README status table
- the commit history, for the changelog

The JSON is committed, so building never needs the network and the diff shows exactly what changed upstream. Point it at a local checkout with `RELAY_DIR=../relay npm run sync`. Raw HTML in upstream Markdown is escaped, not rendered. In Docker, a startup refresh, a six-hour refresh, and an optional signed GitHub push webhook update a separate snapshot in the data volume. A failed refresh keeps the previous complete snapshot available. Browsers read that snapshot through the same-origin API, with the bundled content as a static-host fallback.

## Documentation from code

The project documentation reader at `/docs/projects` accepts versioned Markdown guides and API references extracted from Java comments. Relay is the first adapter; packages include exact source commits, overload-specific symbol links, local search, and LaTeX math rendered with self-hosted KaTeX. Publication uses per-project signed uploads from CI and atomic snapshots in the Docker data volume. Main is labeled development; releases are immutable.

See [authoring, publication and Docker setup](docs/docs-as-code.md) and the [package contract](docs/docs-as-code-contract.md). Running all tests also requires a JDK 21+ toolchain. The Docker builder and GitHub build workflow provide it; Java is absent from the production image.

Relay's documentation home at `/docs/relay` brings setup, integration guides, versioned Java reference, dashboard API and the Lab together. The original introduction is at `/docs/introduction`; old `/docs/relay#section` links continue there. Published guides include a heading outline and permalinks, syntax-highlighted code copying, original Markdown copy/download, and previous/next navigation.

`Ctrl K` and the versioned reader search guide bodies and authored API comments through the same-origin search endpoint. Project/version filters, ranked exact symbol names, snippets, keyboard navigation and cancellation keep results tied to the selected code. Static hosting retains curated-page search when the documentation service is unavailable.

Project CI can run `npm run docs:check -- --root <checkout> --package <package.json> --manifest <manifest.json> --report <quality.json>` to validate local links, source lines and checked examples, and report missing API documentation. See [documentation quality checks](docs/docs-quality.md). Relay's Gradle task compiles declared Java examples against its actual proxy classpath before publishing.

`/lab/relay` is a local educational simulator: step through a sample handshake, identity, routing, forwarding and play session, change settings/failure scenarios, and inspect a byte-accurate handshake. It opens no Minecraft connections and verifies no real accounts. See [Lab scope and source provenance](docs/relay-lab.md).

## Host

Docker runs Express, which serves `dist/` and `/api/site/*` together. `/api` remains the Relay API documentation page. `npm run build` also produces a static `dist/` with per-route HTML and an RSS feed; static hosting retains the existing pages and local config builder, while server-dependent tools explain when the service is unavailable.

URLs are clean (`/docs/relay`). The build writes an `index.html` into a folder for every route, each with its own title, description, canonical URL and social tags, so no rewrite rules are needed. `404.html` handles unknown paths. Old hash links (`/#/docs/relay`) redirect automatically. The site expects to be served from the domain root.

## What's inside

- **Hero voxel study**: an original isometric cutaway. Blocks rise on load, swell toward the cursor, tilt in 3D, and switch between solid, wireframe and exploded views. Hold a block to mine it: it cracks, shatters, and grows back.
- **Ambient effects**: drifting embers pulled toward the pointer, a cursor glow, scroll progress, and a once-per-session logo intro.
- **Motion where it helps**: masked headline reveals, a scrambled eyebrow, magnetic buttons, page transitions, and a glitching "void." Project and reading content stays still.
- **Homepage**: hero and voxel study, then Relay's project register (with compact specs and the routing diagram), one documentation index, and a short manifesto.
- **Responsive header**: Changelog, Help and (on phones) GitHub collapse into a **More** disclosure as space runs out; checked from 320px to 1440px.
- **Light and dark themes**: dark by default, with the choice remembered on the device and applied before first paint. All text meets WCAG AA contrast in both. Per the brand guide, the mark always sits on Void (in light mode on a Void square with a ring thickness of clear space) and is never rotated.
- **Docs**: a hand-written guide (Part 1) followed by the full upstream reference (Part 2), a table of contents grouped into Guide and Full reference with indented subsections, an animated sidebar, scroll-spy, highlighted code with copy buttons, and **Copy as Markdown** on every page.
- **Compatibility**: every supported Minecraft version and protocol number, with how sure each one is.
- **Config builder**: real `relay.toml` keys, validated as you type, with matching `paper-global.yml` and `server.properties`. Side by side on wide screens; on tablets and phones a sticky **Settings / Generated files** switcher with a validation badge. The forwarding secret is generated in the browser and never sent anywhere.
- **Changelog**: Relay's commit history as a filterable timeline. **Roadmap**: the README's phases on the Projects page.
- **Help**: diagnosing with `relay.py doctor`, what to put in an issue, how to contribute, and an FAQ drawn from the README.
- **Command palette** (`⌘K`, `Ctrl K` or `/`): pages, sections, API routes, FAQ, and full-text search across the synced docs.
- **Social previews**: a 1200×630 `og.png` (regenerate with `node scripts/og-image.mjs`, which needs Playwright).
- **Performance**: everything but the home page is loaded on demand; the docs content and highlighter are separate chunks; the font is preloaded.
- **Workshop tools**: a Minecraft Java server status checker with Relay compatibility, and a transient Relay/Paper setup comparison.
- **Live project data**: cached GitHub stars, accurate open-issue counts, last change, release assets and available GitHub-published SHA-256 checksums, backed by an extensible project registry.
- **Shared configurations**: expiring links store whitelisted settings in SQLite. Forwarding secrets are excluded on both client and server; opening a share generates a fresh secret.
- **Docs feedback**: aggregate helpful/unhelpful votes, plus opt-in anonymous GitHub reports with same-origin validation, a one-use challenge, per-address limits and a site-wide daily budget.
- **Read-only demo**: an optional server-side dashboard adapter exposes only counts and backend health. Dashboard credentials and the proxy control channel are never exposed to the browser.
- **RSS**: `/feed.xml` follows the Relay changelog, generated for static builds and refreshed from the current snapshot in Express.
- A secret: try the Konami code.

All motion respects `prefers-reduced-motion`, and canvas effects pause in background tabs. There is no analytics or visitor tracking. The browser calls only this site's API, with no third-party API calls or tracking cookies. It remembers the theme (`localStorage`) and whether the intro played (`sessionStorage`). Shared settings and aggregate feedback are stored on the server; pasted setup files are processed in memory and discarded. Rate limits use addresses transiently in process memory. Download links and explicit GitHub links navigate to GitHub when selected.

## Editing

The documentation publishing additions are described in [discovery](docs/discovery.md), [API support policy](docs/api-stability.md), and [preview and comparison](docs/publishing-experience.md). Journal source lives in `src/content/journal/`; add its metadata in `src/data/journal.js`. The build renders these notes to sanitized HTML for both the initial response and the interactive reader.

| What | Where |
| --- | --- |
| Page titles, docs navigation, API endpoints, FAQ, search index | `src/data/site.js` |
| Hand-written doc pages, compatibility, config page | `src/pages/docContent.jsx` |
| Config builder | `src/components/ConfigBuilder.jsx` |
| Synced Relay content (generated) | `src/content/relay.json` via `scripts/sync-relay.mjs` |
| Home page sections | `src/pages/Home.jsx` |
| Project register and its specs | `src/components/ProjectsSection.jsx` |
| Changelog, Help, Projects pages | `src/pages/` |
| Voxel illustration and mining | `src/components/VoxelSpecimen.jsx` |
| Layout, effects, syntax colours | `src/styles/base.css`, `effects.css`, `code.css` |
| Per-route HTML, 404, sitemap | `scripts/postbuild.mjs` |
| Static files (icons, og.png, manifest, robots, font) | `public/` |
| Express routes, security and configuration | `server/app.mjs`, `server/config.mjs` |
| Network checks, GitHub cache, syncing, demo adapter | `server/services/` |
| Project registry | `server/projects.json` |
| SQLite storage | `server/storage.mjs` |
| Workshop, releases and live view | `src/pages/Tools.jsx`, `Releases.jsx`, `Live.jsx` |
| Docker and deployment settings | `Dockerfile`, `compose.yml`, `.env.example` |

The hand-written guides are a concise companion to Relay's own docs, and each page links to its source. Dashboard routes describe a user's own Relay dashboard; this website does not expose or execute them.

## Sources and licenses

- Brand: https://github.com/pustka-sh/pustka-info
- Relay: https://github.com/pustka-sh/Relay
- Backend API: https://github.com/pustka-sh/Relay/blob/main/docs/backend-api.md
- Client API: https://github.com/pustka-sh/Relay/blob/main/docs/client-api.md
- Typed packets: https://github.com/pustka-sh/Relay/blob/main/docs/server-packets.md
- JetBrains Mono: https://fonts.google.com/specimen/JetBrains+Mono

Original branding assets remain owned by their respective owners. JetBrains Mono is supplied under the SIL Open Font License; see `public/OFL-JetBrains-Mono.txt`.
