# Java documentation adapter

`PustkaDoclet.java` runs through the JDK 21 Javadoc compiler model. It reads declarations and Javadoc comments without executing project classes. Output follows documentation package v1's `api` model.

```sh
javac --release 21 -d build/pustka-doclet tools/javadoc/PustkaDoclet.java
javadoc -quiet -protected -encoding UTF-8 \
  -doclet sh.pustka.docs.PustkaDoclet -docletpath build/pustka-doclet \
  --source-root /path/to/project --output build/pustka-docs/api.json \
  -sourcepath /path/to/project/src/main/java -subpackages your.package
```

Supply the project's compilation classpath when its API depends on other libraries. Relay's `generatePustkaDocs` Gradle task does that and leaves its Java runtime targets unchanged.

The adapter includes public/protected declarations and visible nested types, excludes private/package-private declarations and `@hidden` declarations, and preserves overloaded method IDs. Comments supply description, value/type parameter/return/throws text, `@since`, `@see` and deprecation text. Inline code, links and basic Javadoc HTML become readable Markdown. Preformatted examples retain their code formatting. Links to included symbols use the `javadoc:` reader scheme; unresolved/external references stay readable as code. API index summaries are plain text with decoded entities; full descriptions preserve Markdown links. Raw HTML is escaped. Undocumented APIs keep empty descriptions so the reader can label them accurately.

This first adapter does not expand `{@inheritDoc}` or custom taglets; an explicit inherited-doc marker stays visible and can link readers to the parent declaration. Classpath resolution failures fail generation instead of publishing a partial reference. Every source link uses a repository-relative path and a real source line, and extraction refuses source files outside the declared repository root. Output is sorted and written atomically.

Run `node --test test/javadoc.test.mjs` with a JDK 21+ toolchain installed. The fixture tests real compilation, overloads, nested visibility, records, comment fields, escaped HTML and source boundaries.
