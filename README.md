# pustka.sh

The website for pustka: a Minecraft software workshop, project register, documentation browser, and API reference.

## Preview or host

The website is in `dist/`. Open `dist/index.html` in a modern browser, or serve that directory with any static web server. There is no build step and no external runtime dependency. All fonts and branding assets are included locally. The site uses hash routes, so static hosting does not need rewrite rules.

Upload the contents of `dist/` to the host serving pustka.sh, or configure your static hosting service to publish `dist/`.

## Design

- Original voxel cutaway with solid and wireframe views.
- Original project register and Relay routing diagram.
- Exact supplied Redline palette and original empty-set logo assets.
- JetBrains Mono, hosted locally, with 800 display and 400 body weights.
- A restrained reading environment, keyboard search, command copying, and mobile documentation navigation.
- No tracking, accounts, fake adoption statistics, or external API requests.

## Editing

`dist/app.js` contains page content, the project register, search entries, and documentation summaries. `dist/specimen.js` draws the original hero illustration. `dist/styles.css` contains the responsive design. `dist/index.html` contains shared navigation, metadata, search dialog, and footer.

The included documentation is a concise companion to the upstream Relay references, reviewed on November 9, 2026. Every guide links to the corresponding source. Dashboard routes describe a user's own Relay dashboard; this website does not expose or execute them. Verify details against upstream before treating this as the canonical technical reference.

## Sources and licenses

- Brand: https://github.com/pustka-sh/pustka-info
- Relay: https://github.com/pustka-sh/Relay
- Backend API: https://github.com/pustka-sh/Relay/blob/main/docs/backend-api.md
- Client API: https://github.com/pustka-sh/Relay/blob/main/docs/client-api.md
- Typed packets: https://github.com/pustka-sh/Relay/blob/main/docs/server-packets.md
- JetBrains Mono: https://fonts.google.com/specimen/JetBrains+Mono

Original branding assets remain owned by their respective owners. JetBrains Mono is supplied under the SIL Open Font License; see `dist/fonts/OFL-JetBrains-Mono.txt`.
