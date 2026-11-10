# Published documentation comparisons

`/docs/:project/compare` lists only versions present in the published documentation directory. Choose a **Before** and **After** package using the native selectors; the `from` and `to` query parameters make the choice shareable. Swap reverses the direction.

There is no sample release data in the page. With fewer than two published packages, the page explains what is available and links back to the documentation. A version from an old or mistyped URL must be chosen again if it is no longer published.

The same-origin endpoint is:

```text
GET /api/site/docs/:project/compare?from=VERSION&to=VERSION
```

Both snapshots must be actual validated packages from the same project and GitHub repository. The pure `compareDocumentationPackages(before, after)` model returns source revisions, counts, added/removed symbols, changed symbols and guide changes. It does not execute or compile project code.

## What changes mean

- **Added / removed:** the exact symbol identifier appears in one snapshot only. A renamed or differently identified declaration appears as a removal and an addition.
- **Changed:** an existing symbol has a changed declaration kind, name, owner, signature, parameter names/types, return type, declared exceptions, source comments, deprecation state, or authored support policy.
- **Comments only:** only descriptions, summaries, parameter/return/exception comments, `since` text or deprecation explanation changed. This count is a subset of Changed.
- **Policy changes:** the stability label or its authored explanation changed. This count is also a subset of Changed. Packages without a policy retain the **Unclassified** label; the comparison does not infer support from Java visibility.
- **Guide changes:** a guide was added, removed or had its title, Markdown or source path edited.

Source line movement and package generation timestamps do not create API changes. Structural, deprecation-state and support-policy changes are marked **Review required**. This is a request for human review, never a binary, source or runtime compatibility verdict. Parameter name changes are included even when the signature string was not updated.

Each entry links to the appropriate before/after API and exact source commit. Removed guides link to the old package. If the target package includes a guide with slug `migration`, the result links to that authored guidance. There is no automatically invented migration instruction.
