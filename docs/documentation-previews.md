# Rendered documentation reviews

A documentation package can be reviewed as a static website before publication:

```sh
node scripts/preview-docs.mjs --file build/pustka-docs.json --out build/docs-preview
```

The output must be new or empty. Open `index.html` in the resulting artifact, or serve that directory with a local static file server. Navigation works without JavaScript. Markdown, LaTeX math, API signatures, parameters, return descriptions, declared exceptions, deprecations and authored stability notes are rendered from the same validated package used for publication.

Every page carries a **DRAFT / UNMERGED DOCUMENTATION** banner, `noindex,nofollow`, and the exact 40-character source commit. Guide links and `javadoc:` links resolve to local guide pages or API symbol anchors. Source links deliberately point at that exact GitHub revision. A preview is a review artifact; it does not update the live documentation.

`preview-manifest.json` records the project, version, source ref/commit, package generation date and SHA-256 of the original package bytes. It also records the size and SHA-256 of every generated HTML, style and font file. The manifest does not hash itself. There are no timestamps taken from the review machine, so the same input and pinned toolchain produce the same file contents.

## Input and output boundaries

- Input is a UTF-8 schema version 1 documentation package no larger than 8 MiB. It is validated before any rendering.
- The tool reads package data and its own installed KaTeX assets. It never runs project commands, fetches a remote resource, or needs a publication key.
- Raw HTML in author Markdown is escaped, and the site's Markdown/KaTeX sanitizer is reused. Images become links. External style sheets, scripts, tracking pixels and embeds are not included.
- Styles and math fonts are included in the artifact. The page CSP disables scripts, network resources, forms, objects and base URL changes; normal source/documentation hyperlinks remain available for deliberate navigation.
- Symbolic links in input or output paths are refused. Existing nonempty output directories and ordinary files are never overwritten. Rendering happens in an invocation-owned staging directory and only replaces an empty destination after success.
- Total output is capped at 64 MiB, each HTML document at 16 MiB and each bundled asset at 512 KiB. An oversized render fails and removes its own staging files, preserving the destination.

For build integrations the module exports `generateDocumentationPreview({file, outDir})`, returning the project, version, exact commit, package hash, generated file count, total bytes and index path. A smaller `maxOutputBytes` may be provided; the hard cap cannot be raised.

## Pull request workflow

Render and upload the artifact in the package/check job, including for pull requests from forks. Use a pinned Site toolchain and the validated package produced by that job. Upload the resulting directory with the CI artifact action and link that artifact from the job summary. Keep publication credentials in the separate trusted publication job; preview generation neither receives them nor posts a PR comment.
