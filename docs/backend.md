# Backend operations

## Runtime and Docker

Use Node 24+ or the supplied multi-stage Docker image. The image builds and tests the app, installs production dependencies, runs as the unprivileged `node` user, and serves the website plus Express API on port 3000. Git is included for the fixed-repository documentation sync. SQLite uses Node's built-in `node:sqlite` module.

```sh
cp .env.example .env
docker compose up -d --build
docker compose logs --tail=100 site
curl -f http://127.0.0.1:3000/health
```

Compose uses a read-only image filesystem, writable `/tmp`, and the persistent `site-data:/data` volume. It drops Linux capabilities, prevents privilege escalation, and applies memory and process limits. Run a single app replica per data volume; this SQLite setup is not a multi-host database. Keep an HTTPS reverse proxy in front of the loopback-bound port. If your proxy runs in another container, attach it to the appropriate Docker network and route to `site:3000` rather than exposing an unauthenticated dashboard or database port.

`PUBLIC_ORIGIN` must match the public website origin, including scheme and port. Non-local production origins require HTTPS. Set `TRUST_PROXY` to only your actual proxy's address or CIDR range; never trust arbitrary forwarded headers. The default trusts no proxy. Without that setting, visitors behind a proxy share that proxy's rate-limit bucket. Vite development uses port 5173 and proxies `/api/site`, `/health`, and `/feed.xml` to Express on 3000; leave `PUBLIC_ORIGIN` empty for that shell or set it to the Vite origin.

No production credentials belong in the image or repository. Compose reads `.env`, which Git and Docker both exclude. Use your host's environment/secret management for production values.

## Feature configuration

| Variable | Purpose / default |
| --- | --- |
| `PUBLIC_ORIGIN` | Public origin used for same-origin writes and absolute shared links. Empty supports local development. |
| `PORT`, `HOST` | Node listener; `3000`, `0.0.0.0` by default. Compose pins port 3000 internally. |
| `DATA_DIR` | Persistence directory; `/data` in Docker. |
| `TRUST_PROXY` | Comma-separated trusted proxy addresses/ranges; empty by default. |
| `GITHUB_TOKEN` | Optional read-only token for higher GitHub API limits. Never sent to browsers. |
| `GITHUB_WEBHOOK_SECRET` | High-entropy shared secret for the Relay push webhook. |
| `DOCS_SYNC_ENABLED` | `true`; set `false` to use only a bundled/persisted snapshot. |
| `DOCS_SYNC_ON_START` | `true`; refresh asynchronously after startup. |
| `DOCS_SYNC_INTERVAL_MINUTES` | `360`; `0` disables periodic refresh, while signed webhooks can still refresh. |
| `SHARE_TTL_DAYS` | `30`, accepted range 1–365. |
| `ENABLE_ISSUE_REPORTS` | `false`; explicitly opt in after configuring the write token. |
| `ISSUE_REPOSITORY` | `pustka-sh/Relay`; target for visitor documentation reports. |
| `ISSUE_GITHUB_TOKEN` | Separate fine-grained token with Issues write permission only on the target repository. |
| `DEMO_DASHBOARD_URL` | Fixed operator-configured dashboard HTTP(S) origin/address; empty disables the demo. |
| `DEMO_DASHBOARD_USERNAME`, `DEMO_DASHBOARD_PASSWORD` | A read-only dashboard account. The server handles its session cookie. |
| `DEMO_DASHBOARD_AUTHORIZATION` | Optional full authorization header only for an authenticated reverse proxy. This is not Relay control authentication. |

### Documentation webhook

After deploying the backend, create a webhook on **pustka-sh/Relay**:

1. Payload URL: `https://pustka.sh/api/site/webhooks/github`.
2. Content type: `application/json`.
3. Secret: the same value as `GITHUB_WEBHOOK_SECRET`.
4. Event: push events. Keep TLS verification enabled.

The server verifies the HMAC over the original request bytes, checks the fixed repository and `refs/heads/main`, rejects invalid signatures, and deduplicates delivery IDs. Sync jobs are bounded, coalesced and serialized. The job always reads the fixed Relay `main` repository; visitor-provided URLs, commands and branches are not accepted. No website or dashboard credentials are passed to the sync subprocess. A failed or malformed sync cannot replace the last successful snapshot.

The periodic refresh makes docs update without a webhook. Signing a webhook is required for that public endpoint; no unsigned manual refresh endpoint is exposed.

### Demo dashboard

Relay's dashboard authenticates HTTP requests through `POST /login` and a session cookie. Its proxy-to-companion **control token is not an HTTP API credential**. Configure a dedicated read-only account. This site's adapter permits only dashboard overview/server reads and projects them into public counts, server names, health, population and latency. It does not return backend addresses, player identities, control credentials, or action endpoints. Failed refreshes show dated cached data, not a new live result.

## API

The namespace is `/api/site`, so `/api` remains the existing API-reference page. Browser writes require JSON and matching origin; cross-site browser requests are rejected. There is no permissive CORS policy.

| Method | Route | Behavior |
| --- | --- | --- |
| GET | `/health` and `/api/site/health` | Host health check. |
| GET | `/api/site/capabilities` | Available backend features; no credentials or internal settings. |
| GET | `/api/site/projects` | Registered projects with cached GitHub statistics. |
| GET | `/api/site/releases?project=relay` | Real published releases, asset URLs, sizes and available SHA-256 values. |
| GET | `/api/site/content` | Current validated Relay documentation snapshot. |
| POST | `/api/site/webhooks/github` | Signed Relay main-branch push notifications. |
| POST | `/api/site/server-check` | `{ "address": "play.example.com" }`; bounded public Java status ping. |
| POST | `/api/site/setup-check` | `{ "relayToml": "…", "paperYaml": "…", "serverProperties": "…" }`; transient config comparison. |
| POST | `/api/site/configs` | `{ "settings": { … } }`; whitelisted, secret-free config model. Returns a short link and expiry. |
| GET | `/api/site/configs/:id` | Unexpired shared settings. No forwarding secret is returned. |
| POST | `/api/site/feedback` | `{ "page": "/docs/relay", "helpful": true }`; aggregate vote only. |
| GET | `/api/site/feedback?page=/docs/relay` | Aggregate votes for a known documentation page. |
| GET | `/api/site/issue-challenge` | Short-lived, address-bound one-use report challenge when reports are enabled. |
| POST | `/api/site/issues` | Validated report with challenge and honeypot field; files a GitHub issue when enabled. |
| GET | `/api/site/demo` | Safe, cached read-only demo snapshot, or an explicit unavailable response. |
| GET | `/feed.xml` | RSS generated from the current Relay changelog. |

Errors use `{ "error": { "code": "…", "message": "…" } }`. Static hosting keeps the documentation, local builder, and build-time RSS. Server-only features show an unavailable message rather than a fake success.

## Boundaries and limits

- Minecraft checks accept public, qualified hostnames or public literal IPs and ports 1024–65535. Every DNS/SRV result is checked; mixed public/private answers are rejected and the validated literal IP is pinned to the socket. Loopback, private, link-local, reserved, multicast, mapped private IPv6 and alternative numeric address formats are rejected. Checks have a four-second budget, bounded packets and four global concurrent slots. Player samples are discarded.
- Setup inputs are limited to 24 KiB per file by the UI; the API also bounds each field and the total JSON body. The checker parses content rather than accessing paths, compares forwarding/authentication/PROXY settings, and never returns the pasted secret. It cannot test live connectivity or settings in files that were not supplied. Use `relay.py doctor --live` for a real running network.
- GitHub responses are fixed to registered repositories, bounded and cached for five minutes. Upstream failures retain a clearly dated last-good result where available. If no releases or checksums are published, the UI says so; missing digests are never invented. Explicit download links navigate to the actual GitHub asset.
- Shared configs have random 96-bit identifiers, expire automatically, and store only a server-side whitelist. The forwarding secret and unknown/nested credential keys are excluded even if a caller bypasses the browser. A new secret is generated locally when importing a link. Anyone with the link can read the shared non-secret settings until expiry. There is a 10,000-active-share capacity limit.
- General API requests are limited to 300 per 15 minutes per address. Writes are limited to 40 per hour, and network/setup checks to 12 per 10 minutes. Issue reports have an additional three-per-hour address limit and a 50-per-day process-wide budget. Reporting uses a timed, expiring, one-use challenge and a honeypot; it is disabled until explicitly configured. Visitor mention/HTML syntax is neutralized before filing.
- No analytics, visitor database, raw request-body logging, or tracking cookies are added. Rate-limit addresses exist only in process memory. SQLite stores shared non-secret settings and aggregate page votes. Setup files are not saved. HTTPS is important because a setup comparison deliberately sends the pasted files to this server for transient processing.

## Persistence and updates

The volume contains `site.sqlite`, its SQLite sidecar files, and `relay-content.json`. To back it up, stop the app briefly and copy the complete volume, then restart; this keeps the database and sidecars consistent. Keep backups private because shared settings can contain network names and addresses even though forwarding secrets are omitted. Do not run `docker compose down --volumes` when preserving shares and votes.

```sh
git pull --ff-only
docker compose up -d --build
```

The health endpoint is independent of GitHub and the optional demo. External downtime does not prevent the docs and local tools from loading. To update the project registry, edit `server/projects.json`, then rebuild the image. No public registry-write endpoint is exposed.
