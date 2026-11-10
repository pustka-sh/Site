import { z } from 'zod';

const level=z.enum(['supported','experimental','internal']);
const typeName=z.string().max(1500).regex(/^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/);
export const documentationStabilitySchema=z.object({
  default:level,
  rules:z.array(z.object({type:typeName,level,note:z.string().min(1).max(1000)}).strict()).max(500),
}).strict().superRefine((policy,context)=>{
  const seen=new Set();
  policy.rules.forEach((rule,index)=>{
    if(seen.has(rule.type))context.addIssue({code:'custom',path:['rules',index,'type'],message:'Each API type may have only one stability rule.'});
    seen.add(rule.type);
  });
});

const typeKinds=new Set(['class','interface','enum','record','annotation']);

/** Apply an explicit project policy; visibility alone never implies support. */
export function applyDocumentationStability(api,policy){
  if(!policy)return api;
  const parsed=documentationStabilitySchema.parse(policy);
  const types=new Set(api.symbols.filter(symbol=>typeKinds.has(symbol.kind)).map(symbol=>symbol.qualifiedName));
  for(const rule of parsed.rules){
    if(!types.has(rule.type))throw Object.assign(new Error(`The API stability rule names a type absent from this artifact: ${rule.type}`),{code:'DOCS_PACKAGING_FAILED',expose:true});
  }
  const rules=[...parsed.rules].sort((a,b)=>b.type.length-a.type.length);
  return {...api,symbols:api.symbols.map(symbol=>{
    const type=typeKinds.has(symbol.kind)?symbol.qualifiedName:symbol.owner;
    const rule=rules.find(candidate=>type===candidate.type||type?.startsWith(candidate.type+'.'));
    const {stability:previousLevel,stabilityNote:previousNote,...rest}=symbol;
    return {...rest,stability:rule?.level??parsed.default,...(rule?{stabilityNote:rule.note}:{})};
  })};
}
