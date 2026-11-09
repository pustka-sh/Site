# pustka.sh

The website for pustka: a Minecraft software workshop, project register, documentation browser, and API reference. Built with React, Vite, and Motion.

## Develop

```bash
npm install
npm run dev       # local dev server with hot reload
npm run build     # production build into dist/
npm run preview   # serve the production build
```

Requires Node 20.19+ (Node 22 recommended).

## Host

`npm run build` writes a fully static site to `dist/`. The build is committed, so anything already publishing `dist/` keeps working. Rebuild and commit `dist/` after changing `src/`, or point your host (Cloudflare Pages, Netlify, Vercel, GitHub Pages) at `npm run build` with `dist` as the output directory.

The site uses hash routes (`#/docs/relay`) and relative asset paths, so it needs no rewrite rules and works from any sub-path.

## What's inside

- **Hero voxel study**: an original, code-drawn isometric cutaway. Blocks rise out of the void on load, the terrain swells toward the cursor, the scene tilts in 3D, and it can be viewed solid, as a wireframe, or exploded.
- **Ambient effects**: a canvas of drifting embers pulled toward the pointer, a trailing cursor glow, a scroll-progress bar, and a one-per-session intro where the logo draws itself.
- **Motion throughout**: masked headline reveals, scramble-decoded labels, word-by-word headings, magnetic buttons, 3D tilt cards with spotlights, count-up figures, an infinite marquee, page transitions, and a glitching "void."
- **Interactive Relay topology**: a packet travels client → Relay → backend. Click a server to re-route it.
- **Typed quick-start terminal** with the real setup commands.
- **Command palette** (`⌘K`, `Ctrl K` or `/`): fuzzy search across pages, doc sections, and API routes, with keyboard navigation.
- **Docs**: animated sidebar, scroll-spy table of contents with a reading-progress line, copy buttons, an API route filter, and animated accordions.
- A secret: try the Konami code.

All motion respects `prefers-reduced-motion`. Canvas effects pause when the tab is hidden. The site still makes no external API requests and uses no tracking or cookies. Only `sessionStorage` is used, to remember that the intro has played.

## Editing

| What | Where |
| --- | --- |
| Doc metadata, nav, API endpoints, search index | `src/data/site.js` |
| Doc page bodies | `src/pages/docContent.jsx` |
| Home page sections | `src/pages/Home.jsx` |
| Project register | `src/pages/Projects.jsx` |
| Voxel illustration | `src/components/VoxelSpecimen.jsx` |
| Original layout styles | `src/styles/base.css` |
| Animation and effect styles | `src/styles/effects.css` |
| Static files (icons, manifest, robots) | `public/` |

The included documentation is a concise companion to the upstream Relay references, reviewed on November 9, 2026. Every guide links to the corresponding source. Dashboard routes describe a user's own Relay dashboard; this website does not expose or execute them. Verify details against upstream before treating this as the canonical technical reference.

## Sources and licenses

- Brand: https://github.com/pustka-sh/pustka-info
- Relay: https://github.com/pustka-sh/Relay
- Backend API: https://github.com/pustka-sh/Relay/blob/main/docs/backend-api.md
- Client API: https://github.com/pustka-sh/Relay/blob/main/docs/client-api.md
- Typed packets: https://github.com/pustka-sh/Relay/blob/main/docs/server-packets.md
- JetBrains Mono: https://fonts.google.com/specimen/JetBrains+Mono

Original branding assets remain owned by their respective owners. JetBrains Mono is supplied under the SIL Open Font License; see `public/OFL-JetBrains-Mono.txt`.
