# pustka.sh

The website for pustka: a Minecraft software workshop, project register, documentation browser, and API reference. Built with React, Vite, and Motion.

## Develop

```bash
npm install
npm run dev       # local dev server with hot reload
npm run build     # production build into dist/ (plus per-route HTML, 404.html, sitemap.xml)
npm run preview   # serve the production build
npm run sync      # pull the latest docs, config, versions and history from Relay
```

Requires Node 20.19+ (Node 22 recommended).

## Keeping the docs current

`npm run sync` clones [pustka-sh/Relay](https://github.com/pustka-sh/Relay) and writes `src/content/relay.json`, which holds:

- the four docs in `docs/`, plus README sections, rendered to HTML with syntax highlighting
- `relay.default.toml`, for the config builder's "full default" view
- the supported versions from `ProtocolVersion.java`, with how each was verified (from `docs/protocol-ids.md` and the README)
- the roadmap phases from the README status table
- the commit history, for the changelog

The JSON is committed, so building never needs the network and the diff shows exactly what changed upstream. Point it at a local checkout with `RELAY_DIR=../relay npm run sync`. Raw HTML in upstream Markdown is escaped, not rendered.

## Host

`npm run build` writes a fully static site to `dist/`. The build is committed, so a host that already publishes `dist/` keeps working. Rebuild and commit `dist/` after changing `src/`, or let your host (Cloudflare Pages, Netlify, Vercel, GitHub Pages) run `npm run build` with `dist` as the output directory.

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
- A secret: try the Konami code.

All motion respects `prefers-reduced-motion`, and canvas effects pause in background tabs. The site uses no tracking, no cookies and no external requests in the browser. It stores two things locally: the theme choice (`localStorage`) and whether the intro has played (`sessionStorage`).

## Editing

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

The hand-written guides are a concise companion to Relay's own docs, and each page links to its source. Dashboard routes describe a user's own Relay dashboard; this website does not expose or execute them.

## Sources and licenses

- Brand: https://github.com/pustka-sh/pustka-info
- Relay: https://github.com/pustka-sh/Relay
- Backend API: https://github.com/pustka-sh/Relay/blob/main/docs/backend-api.md
- Client API: https://github.com/pustka-sh/Relay/blob/main/docs/client-api.md
- Typed packets: https://github.com/pustka-sh/Relay/blob/main/docs/server-packets.md
- JetBrains Mono: https://fonts.google.com/specimen/JetBrains+Mono

Original branding assets remain owned by their respective owners. JetBrains Mono is supplied under the SIL Open Font License; see `public/OFL-JetBrains-Mono.txt`.
