# Documentation package v1 — implementation contract

This is the common format for project-authored guides and source-extracted API references. The first adapter targets Relay's Java 21 source using a real Javadoc doclet. The website renders the normalized model in pustka's own layout.

## Package shape

```json
{
  "schemaVersion": 1,
  "project": {"id": "relay", "name": "Relay", "repository": "https://github.com/pustka-sh/Relay"},
  "version": "main",
  "source": {"commit": "40-lowercase-hex-digits", "ref": "refs/heads/main"},
  "generatedAt": "ISO-8601 UTC timestamp",
  "pages": [{"slug": "overview", "title": "Overview", "kind": "guide", "markdown": "# Overview\n…", "sourcePath": "README.md"}],
  "api": {"schemaVersion": 1, "language": "java", "generator": "pustka-javadoc/1", "symbols": []}
}
```

Each API symbol is `{id, kind, name, qualifiedName, owner, signature, summary, description, parameters:[{name,type,description}], returns:{type,description}|null, throws:[{type,description}], since, deprecated:boolean, deprecation, source:{path,line}}`. All textual fields are strings, all lists are arrays, and optional values have safe empty defaults. `id` is a stable source-level signature, e.g. `dev.relay.Example#route(java.util.UUID,java.lang.String)`; it is URL-encoded as a query parameter, never used as a filesystem path. Kinds: `class`, `interface`, `enum`, `record`, `annotation`, `constructor`, `method`, `field`, `enum-constant`. Descriptions, parameter descriptions and return descriptions are Markdown text; raw HTML is escaped. Source paths are repo-relative POSIX paths with positive 1-based line numbers. Javadoc extraction converts inline code/literal/link tags to readable Markdown and keeps author-provided text. Undocumented symbols are visibly labeled, not filled with invented explanations.

## Project manifest

Each project adds `pustka.docs.json` with `{schemaVersion:1,project:{id,name,repository},guides:[{path,slug,title}],api:{language:"java",artifact:"build/pustka-docs/api.json"}}`. `scripts/package-docs.mjs --manifest <absolute-path> --root <repo-root> --api <absolute-api-json> --out <absolute-output> --version <main-or-tag> --commit <SHA> --ref <git-ref>` validates paths, reads bounded Markdown guides, and combines the doclet output with commit/version metadata. It never runs a project-supplied command. Future language adapters emit the same API model.

## Website routes

- `/docs/projects` — project documentation directory.
- `/docs/:project/:version` — package overview, guides and API index.
- `/docs/:project/:version/:slug` — guide.
- `/docs/:project/:version/api?symbol=<encoded-id>` — API symbol reference.
- Existing `/docs/relay`, `/docs/backend`, `/api`, etc. remain the current guides.

## Same-origin read API

- `GET /api/site/docs/projects` → `{projects:[{id,name,repository,versions:[{version,commit,generatedAt,publishedAt,development:boolean}],defaultVersion}]} `.
- `GET /api/site/docs/:project/versions` → `{project:{id,name,repository},versions:[...],defaultVersion}`.
- `GET /api/site/docs/:project/:version` → `{schemaVersion,project,version,source,generatedAt,publishedAt,pages:[{slug,title,kind,sourcePath}],api:{language,generator,symbols:[{id,kind,name,qualifiedName,owner,signature,summary,deprecated}]}}`.
- `GET /api/site/docs/:project/:version/pages/:slug` → `{page:{slug,title,kind,sourcePath,markdown,html},project,version,source}`.
- `GET /api/site/docs/:project/:version/api?symbol=<id>` → `{symbol:<full-symbol-plus-descriptionHtml-and-parameter/return-html>,project,version,source}`.

Publication: `POST /api/site/docs/publish` raw bounded JSON body, headers `X-Pustka-Project`, `X-Pustka-Timestamp` (Unix seconds), `X-Pustka-Signature` (`sha256=` + HMAC-SHA256 over timestamp + `.` + original body bytes). Per-project keys come from server environment `DOCS_PUBLISH_KEYS` JSON map, e.g. `{"relay":"a-high-entropy-secret"}`. Verify a five-minute timestamp window and constant-time signature before parsing/persisting. The project/repository must match the operator-owned registry. `main` requires `refs/heads/main`; release version `v?X.Y.Z[-prerelease]` requires `refs/tags/<same-version>`. Main is mutable; tagged releases are immutable and duplicate identical publication is idempotent. Persist packages atomically in `/data/documentation/<project>/<version>.json`, retain old good snapshots on failure, never execute uploaded code or follow arbitrary URLs. Never send the publication key to the browser.

Reader output is sanitized/rendered from Markdown with bounded KaTeX math (`$…$`, `$$…$$`), trust disabled, and self-hosted math fonts. Guide/symbol source links use the package's exact repository and commit. Search and version selectors work across the package; unknown or not-yet-published projects/versions return honest empty/404 states.
