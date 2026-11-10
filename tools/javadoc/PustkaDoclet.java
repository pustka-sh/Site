package sh.pustka.docs;

import com.sun.source.doctree.*;
import com.sun.source.util.DocTreePath;
import com.sun.source.util.DocTrees;
import com.sun.source.util.TreePath;
import jdk.javadoc.doclet.*;
import javax.lang.model.SourceVersion;
import javax.lang.model.element.*;
import javax.lang.model.type.TypeMirror;
import javax.lang.model.util.Types;
import javax.tools.Diagnostic;
import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.function.Consumer;
import java.util.stream.Collectors;

/** Extracts source-level API declarations and author-written comments, without loading project classes. */
public final class PustkaDoclet implements Doclet {
    private Reporter reporter;
    private Path output;
    private Path sourceRoot;
    private DocletEnvironment environment;
    private DocTrees trees;
    private Types types;

    @Override public void init(Locale locale, Reporter reporter) { this.reporter = reporter; }
    @Override public String getName() { return "pustka-javadoc/1"; }
    @Override public SourceVersion getSupportedSourceVersion() { return SourceVersion.RELEASE_21; }
    @Override public Set<? extends Option> getSupportedOptions() {
        return Set.of(option("--output", "Destination API JSON file", value -> output = Path.of(value).toAbsolutePath().normalize()),
                      option("--source-root", "Repository root used for source links", value -> sourceRoot = Path.of(value).toAbsolutePath().normalize()));
    }
    private Option option(String name, String description, Consumer<String> setter) {
        return new Option() {
            public int getArgumentCount() { return 1; }
            public String getDescription() { return description; }
            public Kind getKind() { return Kind.STANDARD; }
            public List<String> getNames() { return List.of(name); }
            public String getParameters() { return "<path>"; }
            public boolean process(String option, List<String> arguments) { setter.accept(arguments.getFirst()); return true; }
        };
    }
    @Override public boolean run(DocletEnvironment environment) {
        if (output == null || sourceRoot == null) { reporter.print(Diagnostic.Kind.ERROR, "Both --output and --source-root are required."); return false; }
        this.environment = environment;
        this.trees = environment.getDocTrees();
        this.types = environment.getTypeUtils();
        try {
            sourceRoot = sourceRoot.toRealPath();
            Map<String, Element> selected = new TreeMap<>();
            for (Element element : environment.getIncludedElements()) collect(element, selected);
            if (selected.size() > 12000) throw new IllegalArgumentException("API contains more than 12,000 symbols.");
            List<Map<String, Object>> symbols = new ArrayList<>();
            for (Element element : selected.values()) symbols.add(symbol(element));
            Map<String, Object> result = map("schemaVersion", 1, "language", "java", "generator", getName(), "symbols", symbols);
            Files.createDirectories(output.getParent());
            Path temp = Files.createTempFile(output.getParent(), ".pustka-api-", ".json");
            try {
                Files.writeString(temp, json(result) + "\n", StandardCharsets.UTF_8);
                try { Files.move(temp, output, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
                catch (AtomicMoveNotSupportedException ignored) { Files.move(temp, output, StandardCopyOption.REPLACE_EXISTING); }
            } finally { Files.deleteIfExists(temp); }
            reporter.print(Diagnostic.Kind.NOTE, "pustka: wrote " + symbols.size() + " API symbols.");
            return true;
        } catch (Exception error) {
            reporter.print(Diagnostic.Kind.ERROR, "pustka documentation extraction failed: " + error.getMessage());
            return false;
        }
    }
    private void collect(Element element, Map<String, Element> selected) {
        if (kind(element) != null && hidden(element)) return;
        if (kind(element) != null && visible(element) && environment.isIncluded(element) && !hidden(element)) selected.put(id(element), element);
        if (element instanceof TypeElement || element instanceof PackageElement || element instanceof ModuleElement)
            for (Element child : element.getEnclosedElements()) collect(child, selected);
    }
    private boolean hidden(Element element) {
        DocCommentTree doc = trees.getDocCommentTree(element);
        return doc != null && doc.getBlockTags().stream().anyMatch(t -> t.getKind() == DocTree.Kind.HIDDEN);
    }
    private boolean visible(Element element) {
        for (Element current = element; current != null && !(current instanceof PackageElement) && !(current instanceof ModuleElement); current = current.getEnclosingElement()) {
            Set<Modifier> modifiers = current.getModifiers();
            if (!modifiers.contains(Modifier.PUBLIC) && !modifiers.contains(Modifier.PROTECTED)) return false;
        }
        return true;
    }
    private String kind(Element element) {
        return switch (element.getKind()) {
            case CLASS -> "class"; case INTERFACE -> "interface"; case ENUM -> "enum"; case RECORD -> "record";
            case ANNOTATION_TYPE -> "annotation"; case CONSTRUCTOR -> "constructor"; case METHOD -> "method";
            case FIELD -> "field"; case ENUM_CONSTANT -> "enum-constant"; default -> null;
        };
    }
    private TypeElement ownerType(Element element) {
        Element current = element.getEnclosingElement();
        while (current != null && !(current instanceof TypeElement)) current = current.getEnclosingElement();
        return (TypeElement) current;
    }
    private String name(Element element) {
        return element.getKind() == ElementKind.CONSTRUCTOR ? ownerType(element).getSimpleName().toString() : element.getSimpleName().toString();
    }
    private String id(Element element) {
        if (element instanceof TypeElement type) return type.getQualifiedName().toString();
        TypeElement owner = ownerType(element);
        if (owner == null) return element.toString();
        String result = owner.getQualifiedName() + "#" + name(element);
        if (element instanceof ExecutableElement method) result += "(" + method.getParameters().stream().map(p -> types.erasure(p.asType()).toString()).collect(Collectors.joining(",")) + ")";
        return result;
    }
    private String modifiers(Element element) {
        return element.getModifiers().stream().map(Modifier::toString).collect(Collectors.joining(" "));
    }
    private String signature(Element element) {
        String prefix = modifiers(element);
        if (!prefix.isEmpty()) prefix += " ";
        if (element instanceof TypeElement type) {
            String word = type.getKind() == ElementKind.ANNOTATION_TYPE ? "@interface" : kind(type);
            String generics = type.getTypeParameters().isEmpty() ? "" : "<" + type.getTypeParameters().stream().map(this::typeParameter).collect(Collectors.joining(", ")) + ">";
            String records = type.getKind() == ElementKind.RECORD ? "(" + type.getRecordComponents().stream().map(c -> c.asType() + " " + c.getSimpleName()).collect(Collectors.joining(", ")) + ")" : "";
            String parent = type.getSuperclass().toString();
            String inheritance = parent.equals("none") || parent.equals("java.lang.Object") || type.getKind() != ElementKind.CLASS ? "" : " extends " + parent;
            if (!type.getInterfaces().isEmpty() && type.getKind() != ElementKind.ANNOTATION_TYPE)
                inheritance += (type.getKind() == ElementKind.INTERFACE ? " extends " : " implements ") + type.getInterfaces().stream().map(Object::toString).collect(Collectors.joining(", "));
            if (!type.getPermittedSubclasses().isEmpty()) inheritance += " permits " + type.getPermittedSubclasses().stream().map(Object::toString).collect(Collectors.joining(", "));
            return prefix + word + " " + type.getSimpleName() + generics + records + inheritance;
        }
        if (element instanceof ExecutableElement method) {
            String generic = method.getTypeParameters().isEmpty() ? "" : "<" + method.getTypeParameters().stream().map(this::typeParameter).collect(Collectors.joining(", ")) + "> ";
            String returns = element.getKind() == ElementKind.CONSTRUCTOR ? "" : method.getReturnType() + " ";
            List<? extends VariableElement> parameters = method.getParameters();
            List<String> declarations = new ArrayList<>();
            for (int i = 0; i < parameters.size(); i++) {
                VariableElement p = parameters.get(i);
                String type = p.asType().toString();
                if (method.isVarArgs() && i == parameters.size() - 1 && type.endsWith("[]")) type = type.substring(0, type.length() - 2) + "...";
                declarations.add(type + " " + p.getSimpleName());
            }
            String thrown = method.getThrownTypes().isEmpty() ? "" : " throws " + method.getThrownTypes().stream().map(Object::toString).collect(Collectors.joining(", "));
            return prefix + generic + returns + name(element) + "(" + String.join(", ", declarations) + ")" + thrown;
        }
        return prefix + element.asType() + " " + name(element);
    }
    private String typeParameter(TypeParameterElement parameter) {
        String bounds = parameter.getBounds().stream().map(Object::toString).filter(b -> !b.equals("java.lang.Object")).collect(Collectors.joining(" & "));
        return parameter.getSimpleName() + (bounds.isEmpty() ? "" : " extends " + bounds);
    }
    private Map<String, Object> symbol(Element element) throws IOException {
        DocCommentTree doc = trees.getDocCommentTree(element);
        String description = doc == null ? "" : render(doc.getFullBody(), element, doc);
        String summary = doc == null ? "" : plain(doc.getFirstSentence()).replaceAll("\\s+", " ").trim();
        Map<String, String> parameterDocs = new LinkedHashMap<>();
        Map<String, String> typeParameterDocs = new LinkedHashMap<>();
        Map<String, String> thrownDocs = new LinkedHashMap<>();
        List<String> seeAlso = new ArrayList<>();
        String returnDescription = "", since = "", deprecation = "";
        boolean deprecatedTag = false;
        if (doc != null) for (DocTree tag : doc.getBlockTags()) {
            if (tag instanceof ParamTree p) (p.isTypeParameter() ? typeParameterDocs : parameterDocs).put(p.getName().getName().toString(), render(p.getDescription(), element, doc));
            else if (tag instanceof ReturnTree r) returnDescription = render(r.getDescription(), element, doc);
            else if (tag instanceof ThrowsTree t) thrownDocs.put(t.getExceptionName().getSignature(), render(t.getDescription(), element, doc));
            else if (tag instanceof SinceTree s) since = render(s.getBody(), element, doc);
            else if (tag instanceof DeprecatedTree d) { deprecatedTag = true; deprecation = render(d.getBody(), element, doc); }
            else if (tag instanceof SeeTree see) seeAlso.add(render(see.getReference(), element, doc));
        }
        if (!seeAlso.isEmpty()) description += "\n\nSee also:\n" + seeAlso.stream().map(text -> "- " + text).collect(Collectors.joining("\n"));
        if (doc != null && returnDescription.isEmpty()) for (DocTree item : doc.getFullBody())
            if (item instanceof ReturnTree r) returnDescription = render(r.getDescription(), element, doc);
        List<Map<String, Object>> parameters = new ArrayList<>();
        List<Map<String, Object>> exceptions = new ArrayList<>();
        Object returns = null;
        if (element instanceof Parameterizable generic) for (TypeParameterElement parameter : generic.getTypeParameters())
            parameters.add(map("name", "<" + parameter.getSimpleName() + ">", "type", typeParameter(parameter), "description", typeParameterDocs.getOrDefault(parameter.getSimpleName().toString(), "")));
        if (element instanceof ExecutableElement method) {
            for (VariableElement p : method.getParameters()) parameters.add(map("name", p.getSimpleName().toString(), "type", p.asType().toString(), "description", parameterDocs.getOrDefault(p.getSimpleName().toString(), "")));
            if (element.getKind() == ElementKind.METHOD) returns = map("type", method.getReturnType().toString(), "description", returnDescription);
            for (TypeMirror type : method.getThrownTypes()) {
                String qualified = type.toString();
                String simple = qualified.substring(qualified.lastIndexOf('.') + 1);
                exceptions.add(map("type", qualified, "description", thrownDocs.getOrDefault(qualified, thrownDocs.getOrDefault(simple, ""))));
                thrownDocs.remove(qualified); thrownDocs.remove(simple);
            }
            for (var entry : thrownDocs.entrySet()) exceptions.add(map("type", entry.getKey(), "description", entry.getValue()));
        }
        TypeElement owner = ownerType(element);
        return map("id", id(element), "kind", kind(element), "name", name(element),
            "qualifiedName", element instanceof TypeElement ? id(element) : (owner == null ? "" : owner.getQualifiedName() + ".") + name(element),
            "owner", owner == null ? "" : owner.getQualifiedName().toString(), "signature", signature(element),
            "summary", summary, "description", description, "parameters", parameters, "returns", returns, "throws", exceptions,
            "since", since, "deprecated", element.getAnnotation(Deprecated.class) != null || deprecatedTag, "deprecation", deprecation, "source", source(element));
    }
    private Map<String, Object> source(Element element) throws IOException {
        TreePath tree = trees.getPath(element);
        if (tree == null && ownerType(element) != null) tree = trees.getPath(ownerType(element));
        if (tree == null) throw new IllegalArgumentException("No source location for " + id(element));
        Path file = Path.of(tree.getCompilationUnit().getSourceFile().toUri()).toRealPath();
        if (!file.startsWith(sourceRoot)) throw new IllegalArgumentException("API source is outside --source-root.");
        long position = trees.getSourcePositions().getStartPosition(tree.getCompilationUnit(), tree.getLeaf());
        long line = position < 0 ? 1 : tree.getCompilationUnit().getLineMap().getLineNumber(position);
        return map("path", sourceRoot.relativize(file).toString().replace('\\', '/'), "line", Math.max(1, line));
    }
    private String plain(List<? extends DocTree> content) {
        StringBuilder out = new StringBuilder();
        for (DocTree item : content) {
            switch (item.getKind()) {
                case TEXT -> out.append(((TextTree) item).getBody());
                case CODE, LITERAL -> out.append(((LiteralTree) item).getBody().getBody());
                case LINK, LINK_PLAIN -> {
                    LinkTree link = (LinkTree) item;
                    out.append(link.getLabel().isEmpty() ? link.getReference().getSignature() : plain(link.getLabel()));
                }
                case ENTITY -> {
                    String characters = trees.getCharacters((EntityTree) item);
                    out.append(characters == null ? item.toString() : characters);
                }
                case REFERENCE -> out.append(((ReferenceTree) item).getSignature());
                case SUMMARY -> out.append(plain(((SummaryTree) item).getSummary()));
                case RETURN -> out.append(plain(((ReturnTree) item).getDescription()));
                case START_ELEMENT -> {
                    String tag = ((StartElementTree) item).getName().toString().toLowerCase(Locale.ROOT);
                    if (Set.of("p", "div", "ul", "ol", "li", "br", "pre").contains(tag)) out.append(' ');
                }
                case END_ELEMENT -> {
                    String tag = ((EndElementTree) item).getName().toString().toLowerCase(Locale.ROOT);
                    if (Set.of("p", "div", "ul", "ol", "li", "pre").contains(tag)) out.append(' ');
                }
                case UNKNOWN_INLINE_TAG -> out.append(plain(((UnknownInlineTagTree) item).getContent()));
                default -> out.append(item);
            }
        }
        if (out.length() > 100000) throw new IllegalArgumentException("A documentation summary exceeds 100,000 characters.");
        return out.toString();
    }
    private String render(List<? extends DocTree> content, Element owner, DocCommentTree comment) {
        StringBuilder out = new StringBuilder();
        for (int index = 0; index < content.size(); index++) {
            DocTree item = content.get(index);
            if (item instanceof StartElementTree start && (start.getName().contentEquals("pre") || start.getName().contentEquals("code"))) {
                String tag = start.getName().toString();
                StringBuilder literal = new StringBuilder();
                int depth = 1;
                for (index++; index < content.size(); index++) {
                    DocTree part = content.get(index);
                    if (part instanceof StartElementTree nested && nested.getName().contentEquals(tag)) depth++;
                    if (part instanceof EndElementTree end && end.getName().contentEquals(tag) && --depth == 0) break;
                    if (part instanceof TextTree text) literal.append(text.getBody());
                    else if (part instanceof LiteralTree text) literal.append(text.getBody().getBody());
                    else if (part instanceof EntityTree entity) {
                        String characters = trees.getCharacters(entity);
                        literal.append(characters == null ? entity.toString() : characters);
                    }
                    else if (!(part instanceof StartElementTree nested && nested.getName().contentEquals("code")) && !(part instanceof EndElementTree end && end.getName().contentEquals("code"))) literal.append(part);
                }
                out.append(tag.equals("pre") ? blockCode(literal.toString()) : code(literal.toString()));
                continue;
            }
            switch (item.getKind()) {
                case TEXT -> out.append(((TextTree) item).getBody());
                case CODE -> out.append(code(((LiteralTree) item).getBody().getBody()));
                case LITERAL -> out.append(escapeHtml(((LiteralTree) item).getBody().getBody()));
                case LINK, LINK_PLAIN -> out.append(link((LinkTree) item, owner, comment));
                case REFERENCE -> out.append(reference((ReferenceTree) item, ((ReferenceTree) item).getSignature(), owner, comment));
                case START_ELEMENT -> out.append(start((StartElementTree) item));
                case END_ELEMENT -> out.append(end((EndElementTree) item));
                case ENTITY -> out.append(item);
                case SUMMARY -> out.append(render(((SummaryTree) item).getSummary(), owner, comment));
                case RETURN -> out.append(render(((ReturnTree) item).getDescription(), owner, comment));
                case INHERIT_DOC -> out.append(code("{@inheritDoc}"));
                case UNKNOWN_INLINE_TAG -> out.append(render(((UnknownInlineTagTree) item).getContent(), owner, comment));
                default -> out.append(escapeHtml(item.toString()));
            }
        }
        if (out.length() > 100000) throw new IllegalArgumentException("A documentation comment exceeds 100,000 characters.");
        return out.toString().replaceAll("\\n{3,}", "\n\n").trim();
    }
    private String link(LinkTree link, Element owner, DocCommentTree comment) {
        String label = link.getLabel().isEmpty() ? link.getReference().getSignature() : render(link.getLabel(), owner, comment);
        return reference(link.getReference(), label, owner, comment);
    }
    private String reference(ReferenceTree reference, String label, Element owner, DocCommentTree comment) {
        try {
            TreePath declaration = trees.getPath(owner);
            Element target = trees.getElement(DocTreePath.getPath(declaration, comment, reference));
            if (target != null && kind(target) != null && environment.isIncluded(target) && visible(target) && !hidden(target))
                return "[" + label.replace("[", "\\[").replace("]", "\\]") + "](javadoc:" + URLEncoder.encode(id(target), StandardCharsets.UTF_8).replace("+", "%20") + ")";
        } catch (RuntimeException ignored) { /* An unresolved external reference remains readable. */ }
        return code(label);
    }
    private String start(StartElementTree element) {
        return switch (element.getName().toString().toLowerCase(Locale.ROOT)) {
            case "p", "div", "ul", "ol" -> "\n\n";
            case "li" -> "\n- "; case "br" -> "\n";
            case "b", "strong" -> "**"; case "em", "i" -> "*";
            case "code" -> "`"; case "pre" -> "\n\n```text\n";
            default -> escapeHtml(element.toString());
        };
    }
    private String end(EndElementTree element) {
        return switch (element.getName().toString().toLowerCase(Locale.ROOT)) {
            case "p", "div", "ul", "ol", "li" -> "\n\n";
            case "b", "strong" -> "**"; case "em", "i" -> "*";
            case "code" -> "`"; case "pre" -> "\n```\n\n";
            default -> escapeHtml(element.toString());
        };
    }
    private static String code(String value) {
        int max = 0, run = 0;
        for (char c : value.toCharArray()) { run = c == '`' ? run + 1 : 0; max = Math.max(max, run); }
        String fence = "`".repeat(max + 1);
        return fence + (value.startsWith("`") || value.endsWith("`") ? " " + value + " " : value) + fence;
    }
    private static String blockCode(String value) {
        int max = 0, run = 0;
        for (char c : value.toCharArray()) { run = c == '`' ? run + 1 : 0; max = Math.max(max, run); }
        String fence = "`".repeat(Math.max(3, max + 1));
        return "\n\n" + fence + "text\n" + value + (value.endsWith("\n") ? "" : "\n") + fence + "\n\n";
    }
    private static String escapeHtml(String value) { return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"); }
    private static Map<String, Object> map(Object... values) {
        Map<String, Object> result = new LinkedHashMap<>();
        for (int i = 0; i < values.length; i += 2) result.put(values[i].toString(), values[i + 1]);
        return result;
    }
    private static String json(Object value) {
        if (value == null) return "null";
        if (value instanceof String text) {
            StringBuilder out = new StringBuilder("\"");
            for (char c : text.toCharArray()) switch (c) {
                case '"' -> out.append("\\\""); case '\\' -> out.append("\\\\"); case '\n' -> out.append("\\n"); case '\r' -> out.append("\\r"); case '\t' -> out.append("\\t");
                default -> { if (c < 0x20 || Character.isSurrogate(c)) out.append(String.format("\\u%04x", (int) c)); else out.append(c); }
            }
            return out.append('"').toString();
        }
        if (value instanceof Number || value instanceof Boolean) return value.toString();
        if (value instanceof Map<?, ?> object) return object.entrySet().stream().map(e -> json(e.getKey().toString()) + ":" + json(e.getValue())).collect(Collectors.joining(",", "{", "}"));
        if (value instanceof Iterable<?> array) { List<String> parts = new ArrayList<>(); array.forEach(item -> parts.add(json(item))); return String.join(",", parts).transform(s -> "[" + s + "]"); }
        throw new IllegalArgumentException("Unsupported JSON value.");
    }
}
