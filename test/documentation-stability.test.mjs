import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDocumentationStability, documentationStabilitySchema } from '../scripts/lib/documentation-stability.mjs';

const type=name=>({id:name,qualifiedName:name,kind:'class'});
const member=owner=>({id:owner+'#read()',qualifiedName:owner+'.read',owner,kind:'method'});
const api={symbols:[type('dev.relay.BackendApi'),member('dev.relay.BackendApi'),type('dev.relay.BackendApi.Codes'),member('dev.relay.BackendApi.Codes'),type('dev.relay.BackendApiHandler'),member('dev.relay.BackendApiHandler')]};
const policy={default:'internal',rules:[{type:'dev.relay.BackendApi',level:'supported',note:'Documented wire constants only.'},{type:'dev.relay.BackendApi.Codes',level:'experimental',note:'New extension format.'}]};

test('stability uses exact type boundaries, nested overrides and owner identity',()=>{
  const result=applyDocumentationStability(api,policy);
  assert.deepEqual(result.symbols.map(symbol=>symbol.stability),['supported','supported','experimental','experimental','internal','internal']);
  assert.equal(result.symbols[1].stabilityNote,policy.rules[0].note);
  assert.equal(result.symbols[3].stabilityNote,policy.rules[1].note);
  assert.ok(!Object.hasOwn(result.symbols[4],'stabilityNote'));
  assert.ok(!Object.hasOwn(api.symbols[0],'stability'),'does not mutate extracted source artifact');
});

test('absent policy preserves old or already classified artifacts without adding defaults',()=>{
  assert.equal(applyDocumentationStability(api),api);
  const classified={symbols:[{...type('dev.relay.BackendApi'),stability:'experimental',stabilityNote:'Adapter authored note.'}]};
  assert.equal(applyDocumentationStability(classified),classified);
  const replaced=applyDocumentationStability(classified,{default:'internal',rules:[]});
  assert.equal(replaced.symbols[0].stability,'internal');
  assert.ok(!Object.hasOwn(replaced.symbols[0],'stabilityNote'),'an old note cannot contradict the new policy');
});

test('policy rejects ambiguous, misspelled, unsupported or overlong declarations',()=>{
  assert.equal(documentationStabilitySchema.safeParse({...policy,rules:[policy.rules[0],policy.rules[0]]}).success,false);
  assert.equal(documentationStabilitySchema.safeParse({default:'public',rules:[]}).success,false);
  assert.equal(documentationStabilitySchema.safeParse({...policy,rules:[{...policy.rules[0],type:'dev.relay.BackendApi#read()'}]}).success,false);
  assert.equal(documentationStabilitySchema.safeParse({...policy,rules:[{...policy.rules[0],note:'x'.repeat(1001)}]}).success,false);
  assert.throws(()=>applyDocumentationStability(api,{default:'internal',rules:[{...policy.rules[0],type:'dev.relay.BackendApI'}]}),/absent from this artifact/);
});
