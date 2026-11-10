# Authoring API stability policy

Java visibility describes access. It does not establish a supported integration surface. Projects can declare stability in `pustka.docs.json`; packaging applies that policy to the extracted symbols before validation and publication.

```json
"api": {
  "language": "java",
  "artifact": "build/pustka-docs/api.json",
  "stability": {
    "default": "internal",
    "rules": [
      {
        "type": "example.protocol.Messages",
        "level": "supported",
        "note": "Only the documented wire messages are supported; this is not an in-process Java ABI promise."
      }
    ]
  }
}
```

- **Supported** identifies an author-designated integration surface within the scope explained by its note. Read the project's version and migration guidance before relying on it.
- **Experimental** identifies a surface explicitly offered for evaluation that may change. It does not mean every undocumented declaration is an experiment.
- **Internal** identifies implementation details that are visible in source but are not offered as an integration contract.
- **Unclassified** means a package predates labels or its author has not declared a policy. It carries no inferred support promise.

Rules name exact qualified Java types. They cover that type, its members, and nested types; a more specific nested-type rule wins. A rule for `example.BackendApi` never matches `example.BackendApiHandler`. Duplicate rules, unknown types and invalid levels fail packaging so a misspelling cannot silently grant or remove support. Rules are bounded to 500 entries and notes to 1,000 characters.

With a policy, every symbol receives either its matching rule's level and note or the policy default without a note. Without a policy, existing extracted labels are preserved and no labels or defaults are added. The optional package fields are `stability` and `stabilityNote`; old stored package bytes and digests remain valid.

A label is not evidence of semantic versioning, binary compatibility, a release, or a plugin extension API. For example, a project can support the documented bytes of a network protocol while keeping the Java classes that encode or handle those bytes internal. State that scope in the rule's note and authored guide. Structural comparisons help reviewers find changes but cannot prove compatibility; publish reviewed migration instructions alongside actual releases.
