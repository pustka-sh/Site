import { validateDocumentationPackage } from './documentation.mjs';

const disclaimer = 'This compares published documentation, signatures and authored support policy. It does not establish binary, source or runtime compatibility. Review the changes and the project’s migration guidance before upgrading.';
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byId = (a, b) => a.id.localeCompare(b.id);
const summary = symbol => ({
  id:symbol.id, name:symbol.name, qualifiedName:symbol.qualifiedName,
  signature:symbol.signature, kind:symbol.kind,
  stability:symbol.stability || 'unclassified', stabilityNote:symbol.stabilityNote || '',
  source:{...symbol.source},
});
const structure = symbol => ({
  kind:symbol.kind, name:symbol.name, qualifiedName:symbol.qualifiedName, owner:symbol.owner,
  signature:symbol.signature,
  parameters:symbol.parameters.map(({name,type}) => ({name,type})),
  returns:symbol.returns?.type ?? null,
  throws:symbol.throws.map(({type}) => type),
});
const comments = symbol => ({
  summary:symbol.summary, description:symbol.description,
  parameters:symbol.parameters.map(({description}) => description),
  returns:symbol.returns?.description ?? '',
  throws:symbol.throws.map(({description}) => description),
  since:symbol.since, deprecation:symbol.deprecation,
});

/** A deterministic documentation comparison, never a compiler or compatibility verdict. */
export function compareDocumentationPackages(before, after) {
  const from = validateDocumentationPackage(before), to = validateDocumentationPackage(after);
  if (from.project.id !== to.project.id || from.project.repository !== to.project.repository) {
    throw Object.assign(new Error('Documentation comparisons require the same project and repository.'), {status:400, code:'DOCS_COMPARE_PROJECT_MISMATCH', expose:true});
  }
  const oldSymbols = new Map(from.api.symbols.map(symbol => [symbol.id,symbol]));
  const newSymbols = new Map(to.api.symbols.map(symbol => [symbol.id,symbol]));
  const added = [], removed = [], changed = [];
  for (const symbol of to.api.symbols) {
    const previous = oldSymbols.get(symbol.id);
    if (!previous) {added.push(summary(symbol));continue;}
    const changes = [];
    const oldStructure = structure(previous), newStructure = structure(symbol);
    for (const key of Object.keys(oldStructure)) if (!equal(oldStructure[key],newStructure[key])) changes.push(key);
    const structural = changes.length > 0;
    if (!equal(comments(previous),comments(symbol))) changes.push('documentation');
    if (previous.deprecated !== symbol.deprecated) changes.push('deprecated');
    if (previous.stability !== symbol.stability) changes.push('stability');
    if ((previous.stabilityNote || '') !== (symbol.stabilityNote || '')) changes.push('stabilityNote');
    if (changes.length) changed.push({id:symbol.id,before:summary(previous),after:summary(symbol),changes,reviewRequired:structural || changes.some(change => ['deprecated','stability','stabilityNote'].includes(change))});
  }
  for (const symbol of from.api.symbols) if (!newSymbols.has(symbol.id)) removed.push(summary(symbol));
  added.sort(byId);removed.sort(byId);changed.sort(byId);
  const oldPages = new Map(from.pages.map(page => [page.slug,page]));
  const newPages = new Map(to.pages.map(page => [page.slug,page]));
  const guideChanges = [];
  for (const page of to.pages) {
    const previous = oldPages.get(page.slug);
    if (!previous) guideChanges.push({slug:page.slug,title:page.title,kind:'added'});
    else if (['title','markdown','sourcePath'].some(key => previous[key] !== page[key])) guideChanges.push({slug:page.slug,title:page.title,kind:'changed'});
  }
  for (const page of from.pages) if (!newPages.has(page.slug)) guideChanges.push({slug:page.slug,title:page.title,kind:'removed'});
  guideChanges.sort((a,b) => a.slug.localeCompare(b.slug));
  return {
    project:{...to.project},
    from:{version:from.version,commit:from.source.commit},to:{version:to.version,commit:to.source.commit},
    summary:{added:added.length,removed:removed.length,changed:changed.length,documentationOnly:changed.filter(item => !item.reviewRequired).length,policyChanged:changed.filter(item => item.changes.some(change => ['stability','stabilityNote'].includes(change))).length},
    added,removed,changed,guideChanges,disclaimer,
  };
}
