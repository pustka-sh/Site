import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync,mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const javaHome=process.env.JAVA_HOME;
const executable=name=>javaHome?path.join(javaHome,'bin',name+(process.platform==='win32'?'.exe':'')):name;
const run=(command,args,options={})=>execFileSync(executable(command),args,{encoding:'utf8',timeout:30000,windowsHide:true,...options});
const fixture=`package sample;
import java.io.IOException;
/** Routes {@link Router} with {@code weighted} selection &rarr; backend.
 * <p>See {@link #route(String)} and {@code a < b}.
 * External references remain readable: {@link java.util.List}, {@link UnknownLink}.
 * @param <T> the numeric route weight
 * @see #route(int)
 * @since 1.0
 */
public class Router<T extends Number> {
    /** The visible name. */ public static final String NAME = "router";
    /** Must stay private. */ private String forwardingSecret;
    /** Package internals. */ void internal() {}
    /** Creates a router. */ public Router() {}
    /** Routes a named player.
     * @param name player name, without an external request
     * @return whether the request was accepted
     * @throws IOException if the transport fails
     * @since 1.2
     */
    public boolean route(String name) throws IOException { return true; }
    /** Routes a player count. */ public boolean route(int count) { return true; }
    /** Protected extension point.
     * @param <V> the decoration type
     * @param input the incoming decoration
     */ protected <V extends CharSequence> V decorate(V input) { return input; }
    /** {@return the inline result} */ public String inlineReturn() { return "ok"; }
    /** A code example: <pre>{@code a < b
     * c > d}</pre> */ public void example() {}
    public void undocumented(String... values) {}
    /** Old entry point.
     * @deprecated use {@link #route(String)} instead
     */
    @Deprecated public void old() {}
    /** <script>alert("unsafe")</script> {@literal <tag>} */ public void escaped() {}
    /** @hidden */ public void hiddenMethod() {}
    /** @hidden */ public static class HiddenType { public void hiddenChild() {} }
    /** A nested public API. */ public static class Nested { public void visible() {} }
    /** A private nested type. */ private static class PrivateType { public void invisible() {} }
}
`;

test('Java doclet reads real compiler symbols, comments, overloads and source locations',t=>{
 const scratch=path.join(ROOT,'test','.scratch');mkdirSync(scratch,{recursive:true});
 const dir=mkdtempSync(path.join(scratch,'javadoc-'));
 t.after(()=>{if(!path.resolve(dir).startsWith(path.resolve(scratch)+path.sep))throw Error('Invalid scratch cleanup');rmSync(dir,{recursive:true,force:true});});
 const classes=path.join(dir,'doclet');const source=path.join(dir,'src','sample');mkdirSync(classes,{recursive:true});mkdirSync(source,{recursive:true});
 writeFileSync(path.join(source,'Router.java'),fixture);
 writeFileSync(path.join(source,'Pair.java'),'package sample; /** A record value. */ public record Pair<T>(T value) {}\n');
 writeFileSync(path.join(source,'Mode.java'),'package sample; /** Routing mode. */ public enum Mode { /** First mode. */ FIRST, SECOND }\n');
 writeFileSync(path.join(source,'Marker.java'),'package sample; /** Marks an extension. */ public @interface Marker { /** A label. */ String value(); }\n');
 run('javac',['--release','21','-d',classes,path.join(ROOT,'tools/javadoc/PustkaDoclet.java')]);
 const output=path.join(dir,'api.json');
 const args=['-quiet','-protected','-encoding','UTF-8','-doclet','sh.pustka.docs.PustkaDoclet','-docletpath',classes,'--source-root',dir,'--output',output,'-sourcepath',path.join(dir,'src'),'-subpackages','sample'];
 run('javadoc',args);
 const api=JSON.parse(readFileSync(output,'utf8'));
 assert.equal(api.schemaVersion,1);assert.equal(api.language,'java');assert.equal(api.generator,'pustka-javadoc/1');
 const find=id=>api.symbols.find(s=>s.id===id);
 assert.ok(find('sample.Router#route(java.lang.String)'));assert.ok(find('sample.Router#route(int)'));
 assert.ok(find('sample.Router#decorate(java.lang.CharSequence)'));
 assert.deepEqual(find('sample.Router#decorate(java.lang.CharSequence)').parameters.map(p=>p.name),['<V>','input']);
 assert.equal(find('sample.Router#decorate(java.lang.CharSequence)').parameters[0].description,'the decoration type');
 assert.ok(find('sample.Router#Router()'));
 assert.ok(find('sample.Router.Nested#visible()'));
 assert.ok(!api.symbols.some(s=>/forwardingSecret|#internal|PrivateType|hiddenMethod|HiddenType/.test(s.id)));
 const route=find('sample.Router#route(java.lang.String)');
 assert.equal(route.parameters[0].description,'player name, without an external request');
 assert.equal(route.returns.type,'boolean');assert.equal(route.returns.description,'whether the request was accepted');
 assert.equal(route.throws[0].type,'java.io.IOException');assert.equal(route.throws[0].description,'if the transport fails');
 assert.equal(route.since,'1.2');assert.equal(route.source.path,'src/sample/Router.java');
 assert.equal(route.source.line,fixture.slice(0,fixture.indexOf('public boolean route(String')).split('\n').length);
 assert.match(find('sample.Router').description,/javadoc:sample.Router%23route%28java.lang.String%29/);
 assert.match(find('sample.Router').description,/`a < b`/);
 assert.match(find('sample.Router').description,/See also:\n- \[#route\(int\)\]\(javadoc:sample.Router%23route%28int%29\)/);
 assert.match(find('sample.Router').description,/`java.util.List`, `UnknownLink`/);
 assert.equal(find('sample.Router').parameters[0].description,'the numeric route weight');
 assert.equal(find('sample.Router').summary,'Routes Router with weighted selection → backend.');
 assert.doesNotMatch(find('sample.Router').summary,/javadoc:|&rarr;|`|\[Router\]/);
 assert.equal(find('sample.Router#inlineReturn()').returns.description,'the inline result');
 assert.match(find('sample.Router#example()').description,/```text\na < b\n c > d\n```/);
 assert.equal(find('sample.Router#old()').deprecated,true);assert.match(find('sample.Router#old()').deprecation,/use/);
 assert.equal(find('sample.Router#undocumented(java.lang.String[])').description,'');
 assert.match(find('sample.Router#undocumented(java.lang.String[])').signature,/java.lang.String\.\.\. values/);
 assert.match(find('sample.Router#escaped()').description,/&lt;script&gt;/);
 assert.doesNotMatch(find('sample.Router#escaped()').description,/<script>/);
 assert.equal(find('sample.Pair').kind,'record');assert.match(find('sample.Pair').signature,/Pair<T>\(T value\)/);
 assert.equal(find('sample.Mode#FIRST').kind,'enum-constant');assert.equal(find('sample.Marker').kind,'annotation');
 const first=readFileSync(output,'utf8');run('javadoc',args);assert.equal(readFileSync(output,'utf8'),first,'same source produces stable JSON');
 const other=path.join(dir,'unrelated-root');mkdirSync(other);const badArgs=args.map(x=>x===dir?other:x);
 assert.throws(()=>run('javadoc',badArgs,{stdio:'pipe'}),/failed/);
 writeFileSync(path.join(source,'Broken.java'),'package sample; public class Broken { public MissingJavaSymbol broken(); }\n');
 assert.throws(()=>run('javadoc',args,{stdio:'pipe'}),/cannot find symbol/);
 assert.equal(readFileSync(output,'utf8'),first,'a missing class never replaces the last good export');
});
