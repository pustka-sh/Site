An API page is useful only if it describes the code someone is building against. Pustka’s documentation packages keep guides, Java declarations, and a source commit together, rather than letting the website quietly combine unrelated revisions.

# One package, one source revision

A project declares its guides in `pustka.docs.json`. The packaging command reads those Markdown files and combines them with a Java API artifact produced by the documentation toolchain. The resulting package records the project, documentation version, source commit, and source ref.

The site checks that identity against its project registry before accepting a signed publication. The signing key stays in the publishing environment. Visitors receive the rendered documentation and revision information, not the key.

These pieces are visible in the [package builder](https://github.com/pustka-sh/Site/blob/8e73d20447b6f2a378336606591726d9b8028b6e/scripts/package-docs.mjs), [publication service](https://github.com/pustka-sh/Site/blob/8e73d20447b6f2a378336606591726d9b8028b6e/server/services/documentation.mjs), and [Relay’s documentation workflow](https://github.com/pustka-sh/Relay/blob/8e61739a675435320c8b0fe48393e30181249082/.github/workflows/docs.yml). These links capture the implementation this note describes.

# Ask the compiler about Java

The Java doclet works with the compiler’s view of the project. It extracts declarations, parameters, return types, source positions, and authored documentation comments. That gives the website useful structure without treating a text search through `.java` files as a Java parser.

There is still a human boundary: a declaration does not explain itself. When a comment is missing, the reader says so. A public Java method is also not automatically a supported integration API; compatibility policy needs to be stated by the project.

# Make examples earn their place

Relay’s documentation checks compile the Java examples against the project and compare their contents with the Markdown fences that readers copy. A change to one side without the other fails the check.

Compilation establishes that an example uses real declarations with compatible types. It does not establish that a network exchange succeeds, that a callback runs on a particular thread, or that every failure case has been handled. Those behaviors still need their own tests and clear explanations.

# Preserve what a version means

Development documentation follows `main` and can advance with a newer signed publication. Published release documentation is preserved: the same release version cannot be replaced with a different package.

Each page links to its exact source commit, so a reader can inspect the implementation even after development moves on. When comparing versions, structural changes are useful review cues; they do not provide a complete binary or runtime compatibility verdict.

The result is a small, explicit contract: the page can tell you which code it describes, which words came from that code, and which checks its examples passed. Start from the [documentation directory](/docs/projects) to inspect the packages that have actually been published.
