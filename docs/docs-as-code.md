# Documentation from source

Project authors keep guides and API comments beside their code. CI extracts declarations and comments, combines them with selected Markdown files, and publishes a versioned package. The website renders it in pustka's reader at `/docs/projects`.

The first adapter targets Java 21 and Relay's proxy module. It uses Javadoc's compiler model, including real types, overloads and source locations. It does not infer documentation from implementation or run uploaded project code on the website server. Missing comments stay visibly undocumented. Future language adapters can emit the same API model.

## Author a project

Register the project in the operator-owned `server/projects.json`. Each project declares its own `pustka.docs.json`:

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "relay",
    "name": "Relay",
    "repository": "https://github.com/pustka-sh/Relay"
  },
  "guides": [{"path": "README.md", "slug": "overview", "title": "Overview"}],
  "api": {"language": "java", "artifact": "build/pustka-docs/api.json"}
}
```

Write Java documentation using ordinary `/** ... */` comments. The adapter extracts public/protected declarations, nested types, parameters, returns, exceptions, `@since`, deprecations and inline links. Overloads have distinct stable IDs. This first adapter does not expand inherited comments or custom taglets; see [adapter details](../tools/javadoc/README.md).

Guides are Markdown. Math uses LaTeX expressions inside `$...$` or `$$...$$`, rendered locally with KaTeX. This supports mathematical notation, not arbitrary `.tex` document compilation:

```markdown
For an illustrative transfer estimate, let $n$ be the message count
and $b$ the mean message size in bytes:

$$
B = n \times b
$$
```

Code retains literal dollar signs. Invalid or oversized math gets a readable fallback. Raw HTML is escaped; images become explicit links. Relative guide links, exact-commit source links, package search and stable symbol permalinks are supported.

## Build and publish

Relay's `generatePustkaDocs` Gradle task uses the proxy's actual compile classpath and the adapter from a pinned Site checkout. It requires a JDK 21+ toolchain; the application's runtime targets stay the same. Follow Relay's `.github/workflows/docs.yml` for its exact Gradle invocation and artifact paths.

The packaging CLI takes explicit paths and commit metadata:

```sh
node scripts/package-docs.mjs \
  --manifest /checkout/Relay/pustka.docs.json --root /checkout/Relay \
  --api /checkout/Relay/build/pustka-docs/api.json --out /checkout/Relay/build/pustka-docs/package.json \
  --version main --commit <full-commit-sha> --ref refs/heads/main

node scripts/publish-docs.mjs --file /checkout/Relay/build/pustka-docs/package.json
```

For a release use the tag as both version and `refs/tags/<version>`. Packaging validates selected files and never executes manifest-supplied commands. Paths must stay within the checkout after symbolic-link resolution.

## Connect Docker and GitHub Actions

1. Merge and deploy the backend and documentation changes. Keep the `/data` volume.
2. Generate an independent random key per project on your own host, for example `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
3. Add `DOCS_PUBLISH_KEYS={"relay":"YOUR_RANDOM_KEY"}` to the host's `.env` and recreate the container with `docker compose up -d --no-deps --force-recreate site`. A plain `docker restart` retains the old environment. Keep the existing data volume and never commit the real key.
4. Set Relay's GitHub Actions secret `PUSTKA_DOCS_PUBLISH_KEY` to the same Relay key. The publisher defaults to `https://pustka.sh/api/site/docs/publish`. For another host set the repository variable `PUSTKA_DOCS_PUBLISH_URL` to its HTTPS publication endpoint.
5. Merge Relay's workflow. Main pushes and version tags publish; pull requests validate and upload a review artifact without the publication secret. Run it manually on main for the first publication if needed.

The workflow pins the Site toolchain to an exact commit. Update that pin deliberately when the schema or adapter changes. Only the publication step receives the key. Until the first valid package arrives, the reader explains that the project has not published documentation.

The publication endpoint accepts JSON up to 8 MiB. It requires `X-Pustka-Project`, `X-Pustka-Timestamp` (Unix seconds) and `X-Pustka-Signature` (`sha256=` plus HMAC-SHA256 of `timestamp + "." + unchanged body bytes`). Signatures expire after five minutes; keys are scoped to an operator-registered project and repository. Use HTTPS and the bundled publisher. The browser never receives publication credentials. Rotate keys in both the host and the corresponding project's Actions secret.

## Versions and persistence

`main` is a development snapshot; `v1.2.0` must identify `refs/tags/v1.2.0`. Releases are immutable. An identical retry succeeds without replacing the package; changed release content requires a new version. The directory defaults to the latest stable release when present and labels main as development.

Complete packages are written atomically to `/data/documentation/<project>/<version>.json`. Failed validation/publication retains the previous snapshot. Limits are 100 versions per project, 150 guides and 12,000 symbols per package. Back up the volume using the [backend backup procedure](backend.md). Restore complete original snapshots with the container stopped; do not edit wrapper metadata or hashes.

Existing curated Relay guides and dashboard reference keep their URLs. The old GitHub webhook refreshes that curated snapshot; published packages are built in project CI. A purely static host shows an unavailable state for published docs.

## Read API

All browser requests stay on this origin:

| Method | Endpoint | Result |
| --- | --- | --- |
| GET | `/api/site/docs/projects` | Registered projects and versions |
| GET | `/api/site/docs/search?q=<query>&project=<id>&version=<version>` | Ranked guide-body and API-comment search with versioned result links; project/version are optional |
| GET | `/api/site/docs/:project/versions` | Version list and default version |
| GET | `/api/site/docs/:project/:version` | Guide/API index and source metadata |
| GET | `/api/site/docs/:project/:version/pages/:slug` | Markdown and sanitized guide HTML |
| GET | `/api/site/docs/:project/:version/api?symbol=<encoded-id>` | API symbol with sanitized comment HTML |
| POST | `/api/site/docs/publish` | Signed CI publication |

See the [format contract](docs-as-code-contract.md) and [JSON Schema](package.schema.json). Tests cover signatures, immutability, persistence, path boundaries, rendering, packaging, real Java extraction and Express integration. The Docker builder includes Java for these checks; the production image contains only Node and the website services.
