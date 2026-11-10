# Documentation checks

The documentation package contains authored guides and compiler-extracted API comments. `scripts/check-docs.mjs` checks that those references still point at real content in the corresponding checkout. It reads data and source text only: no network requests, project imports or manifest commands are executed.

```sh
node scripts/check-docs.mjs \
  --root /checkout/Relay \
  --package /checkout/Relay/build/pustka-docs/package.json \
  --manifest /checkout/Relay/pustka.docs.json \
  --report /checkout/Relay/build/pustka-docs/quality.json
```

The manifest and report are optional. Package and input paths must stay within the checkout after symbolic-link resolution. The report destination is an explicit operator-selected output path. A package is limited to 8 MiB, individual source reads to 4 MiB, and the whole check to 64 MiB of source input. Files must be UTF-8. No external links are crawled.

## Checks that fail publication

- Local Markdown links and image targets must exist within the checkout. Directory links are allowed when they do not claim an anchor.
- Markdown heading anchors must exist, including the generated suffixes on duplicate headings. Code-fenced text is parsed as code rather than mistaken for links.
- API source paths and 1-based source lines must exist. `javadoc:` references must identify an exported symbol in this package.
- Source line fragments such as `#L20-L30` must fit the target source file. Unsafe schemes, malformed encoding and paths outside the checkout fail.
- Packaged guides must match their checkout source; a stale package must be rebuilt.
- Declared complete Java example blocks must exactly match the source files compiled by the project's documentation task.

The checker verifies explicit Markdown links, not URLs appearing as plain text or escaped HTML. The reader escapes author-provided HTML, so HTML anchors do not provide published heading targets. HTTP(S)/mailto destinations are checked for valid schemes and embedded credentials but are not fetched; their remote availability is outside this local check.

## Keep examples executable by the compiler

Projects may add optional quality policy to `pustka.docs.json`:

```json
{
  "checks": {
    "examples": [
      {
        "path": "docs/examples/java/dev/relay/docs/HandshakeExample.java",
        "guide": "docs/java-examples.md",
        "anchor": "encode-a-login-handshake"
      }
    ]
  }
}
```

The guide must be in the published package. The heading must contain exactly one `java` code fence with the complete source file, including imports. Matching normalizes line endings and trailing newlines; it does not rewrite the example. This policy is used during checks and is not added to the browser's documentation package.

Relay's `checkPustkaExamples` Gradle task compiles `docs/examples/java/**/*.java` against the proxy's actual compiled output and dependency classpath. Its documentation workflow runs that task, builds a package, runs the checker, then uploads the package only if both compilation and checks pass. The checker verifies source/block equality; Gradle proves that the declared API calls compile. Neither check claims to run a complete Minecraft connection or authenticate a test profile.

## Contributor coverage report

Missing comments remain visible work for contributors. They do not fail the build merely because a public implementation symbol has no authored documentation. The JSON report includes description and parameter coverage, plus each incomplete symbol's stable ID, source path, source line and missing fields. Inherited-doc markers are not counted as authored descriptions.

Coverage is a count of written descriptions, not a claim that every public Java declaration is a supported extension API. Projects should review important integration entry points first. Descriptions are never generated from implementation guesses.

The CLI exits with status `1` for broken declared references and writes a report even when those checks fail. Relay uploads `relay-documentation-quality` as a separate review artifact and keeps its publication secret in the isolated publishing job.
