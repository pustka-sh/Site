import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiLink, docBase, sourceUrl, useDocProjects, usePublishedResource } from '../lib/publishedDocs.js';

const external={target:'_blank',rel:'noopener noreferrer'};
const policy=value=>({supported:'Supported',experimental:'Experimental',internal:'Internal',unclassified:'Unclassified'}[value] || 'Unclassified');
const changeLabel=value=>({signature:'Signature',parameters:'Parameter names / types',returns:'Return type',throws:'Declared exceptions',documentation:'Source comments',deprecated:'Deprecation status',stability:'Support policy',stabilityNote:'Support policy note',kind:'Declaration kind',name:'Name',qualifiedName:'Qualified name',owner:'Owner'}[value] || value);

function Revision({project,snapshot,label}) {
  const href=sourceUrl(project.repository,snapshot.commit);
  return <div className="docs-compare-revision"><span>{label}</span><Link to={docBase(project.id,snapshot.version)}>{snapshot.version}</Link>{href&&<a href={href} {...external} title={snapshot.commit}><code>{snapshot.commit.slice(0,12)}</code> ↗</a>}</div>;
}

function SymbolLinks({project,snapshot,symbol}) {
  const source=sourceUrl(project.repository,snapshot.commit,symbol.source);
  return <div className="docs-compare-symbol-links"><Link to={apiLink(project.id,snapshot.version,symbol.id)}>API in {snapshot.version} →</Link>{source&&<a href={source} {...external}>Exact source ↗</a>}</div>;
}

function SymbolGroup({title,items,project,snapshot}) {
  const [limit,setLimit]=useState(40);
  useEffect(()=>setLimit(40),[items]);
  return <section className="docs-compare-section"><h2>{title} <span>{items.length}</span></h2>{!items.length?<p className="docs-compare-muted">None in this comparison.</p>:<ul className="docs-compare-symbols">{items.slice(0,limit).map(symbol=><li key={symbol.id}><div className="docs-compare-symbol-heading"><h3>{symbol.qualifiedName || symbol.name}</h3><span className={`docs-compare-policy ${symbol.stability}`}>{policy(symbol.stability)}</span></div><pre><code>{symbol.signature}</code></pre>{symbol.stabilityNote&&<p>{symbol.stabilityNote}</p>}<SymbolLinks project={project} snapshot={snapshot} symbol={symbol}/></li>)}</ul>}{items.length>limit&&<button className="docs-compare-more" onClick={()=>setLimit(value=>value+40)}>Show more ({items.length-limit} remaining)</button>}</section>;
}

function ChangedSymbols({items,project,from,to}) {
  const [limit,setLimit]=useState(40);
  useEffect(()=>setLimit(40),[items]);
  return <section className="docs-compare-section"><h2>Changed symbols <span>{items.length}</span></h2>{!items.length?<p className="docs-compare-muted">No shared symbol declarations, comments or policies changed.</p>:<ul className="docs-compare-symbols">{items.slice(0,limit).map(item=><li key={item.id}><div className="docs-compare-symbol-heading"><h3>{item.after.qualifiedName || item.after.name}</h3><span className="docs-compare-review">{item.reviewRequired?'Review required':'Comments only'}</span></div><p className="docs-compare-change-labels">{item.changes.map(changeLabel).join(' · ')}</p><div className="docs-compare-pair">{[{symbol:item.before,snapshot:from,label:'Before'},{symbol:item.after,snapshot:to,label:'After'}].map(({symbol,snapshot,label})=><div key={label}><p className="docs-compare-side-label">{label} / {snapshot.version}</p><pre><code>{symbol.signature}</code></pre><p className="docs-compare-muted">{policy(symbol.stability)}{symbol.stabilityNote?` · ${symbol.stabilityNote}`:''}</p><SymbolLinks project={project} snapshot={snapshot} symbol={symbol}/></div>)}</div></li>)}</ul>}{items.length>limit&&<button className="docs-compare-more" onClick={()=>setLimit(value=>value+40)}>Show more ({items.length-limit} remaining)</button>}</section>;
}

function ComparisonResults({data,target}) {
  const migration=target.data?.pages?.find(page=>page.slug==='migration');
  return <><div className="docs-compare-revisions"><Revision project={data.project} snapshot={data.from} label="Before"/><Revision project={data.project} snapshot={data.to} label="After"/></div><aside className="docs-compare-notice"><p>{data.disclaimer}</p>{migration?<Link to={`${docBase(data.project.id,data.to.version)}/migration`}>Read {data.to.version} migration guidance →</Link>:<p className="docs-compare-muted">{target.loading?'Checking the target package for migration guidance…':target.error?'Migration guidance could not be checked. Open the target documentation to review its guides.':'No migration guide is included in the selected target package.'}</p>}</aside><dl className="docs-compare-counts">{[['Added',data.summary.added],['Removed',data.summary.removed],['Changed',data.summary.changed],['Comments only',data.summary.documentationOnly],['Policy changes',data.summary.policyChanged]].map(([label,count])=><div key={label}><dt>{label}</dt><dd>{count}</dd></div>)}</dl><ChangedSymbols items={data.changed} project={data.project} from={data.from} to={data.to}/><SymbolGroup title="Added symbols" items={data.added} project={data.project} snapshot={data.to}/><SymbolGroup title="Removed symbols" items={data.removed} project={data.project} snapshot={data.from}/><section className="docs-compare-section"><h2>Guide changes <span>{data.guideChanges.length}</span></h2>{data.guideChanges.length?<ul className="docs-compare-guides">{data.guideChanges.map(guide=><li key={guide.slug}><span>{guide.kind}</span><Link to={`${docBase(data.project.id,guide.kind==='removed'?data.from.version:data.to.version)}/${encodeURIComponent(guide.slug)}`}>{guide.title} →</Link></li>)}</ul>:<p className="docs-compare-muted">No guides were added, removed or edited.</p>}</section></>;
}

export default function DocumentationCompare() {
  const {project:projectId}=useParams();
  const [params,setParams]=useSearchParams();
  const directory=useDocProjects();
  const project=directory.data?.projects?.find(item=>item.id===projectId);
  const versions=project?.versions || [];
  const from=params.get('from') ?? versions[1]?.version ?? '';
  const to=params.get('to') ?? versions[0]?.version ?? '';
  const validFrom=versions.some(item=>item.version===from),validTo=versions.some(item=>item.version===to);
  const canCompare=versions.length>=2&&validFrom&&validTo&&from!==to;
  const query=canCompare?`/docs/${encodeURIComponent(projectId)}/compare?${new URLSearchParams({from,to})}`:null;
  const comparison=usePublishedResource(query);
  const target=usePublishedResource(canCompare?`/docs/${encodeURIComponent(projectId)}/${encodeURIComponent(to)}`:null);
  useEffect(()=>{document.title=`${project?.name || 'Project'} documentation comparison — pustka`;},[project?.name]);
  const select=(key,value)=>setParams({from,to,[key]:value});
  return <div className="container docs-compare"><header className="page-intro"><p className="section-label">DOCUMENTATION / BETWEEN REVISIONS</p><h1>Read what changed.</h1><p>Compare the guides, API declarations and support policies in two real published {project?.name || 'project'} packages.</p><Link className="text-link" to={versions[0]?docBase(projectId,versions[0].version):'/docs/projects'}>← {project?.name || 'Project'} documentation</Link></header>
    {directory.loading&&<p role="status">Loading published versions…</p>}
    {directory.error&&<p role="alert">{directory.error.message || 'The documentation directory could not be loaded.'}</p>}
    {!directory.loading&&!directory.error&&!project&&<section className="docs-compare-empty"><span aria-hidden="true">∅</span><h2>This project has no published documentation.</h2><Link to="/docs/projects">Browse project docs →</Link></section>}
    {project&&versions.length<2&&<section className="docs-compare-empty"><span aria-hidden="true">∅</span><h2>Two published versions make a comparison.</h2><p>{versions.length===1?`${project.name} currently has one published package: ${versions[0].version}. A comparison will be available when another version is published.`:`${project.name} has no published packages yet. Comparisons will appear after two versions have been published.`}</p>{versions[0]?<Link to={docBase(projectId,versions[0].version)}>Read {versions[0].version} documentation →</Link>:<Link to="/docs/projects">Browse project docs →</Link>}</section>}
    {versions.length>=2&&<><form className="docs-compare-selectors" onSubmit={event=>event.preventDefault()}><div><label htmlFor="docs-compare-from">Before</label><select id="docs-compare-from" value={validFrom?from:''} onChange={event=>select('from',event.target.value)}><option value="" disabled>Choose a published version</option>{versions.map(version=><option key={version.version} value={version.version}>{version.version}{version.development?' · development':''}</option>)}</select></div><span aria-hidden="true">→</span><div><label htmlFor="docs-compare-to">After</label><select id="docs-compare-to" value={validTo?to:''} onChange={event=>select('to',event.target.value)}><option value="" disabled>Choose a published version</option>{versions.map(version=><option key={version.version} value={version.version}>{version.version}{version.development?' · development':''}</option>)}</select></div><button type="button" onClick={()=>setParams({from:to,to:from})} disabled={!validFrom||!validTo}>Swap ↔</button></form>{(!validFrom||!validTo)&&<p role="alert">Choose two published versions. A version in this URL is not available.</p>}{validFrom&&validTo&&from===to&&<p role="status">Choose different versions to see what changed.</p>}{canCompare&&comparison.loading&&<p role="status">Comparing published packages…</p>}{canCompare&&comparison.error&&<p role="alert">{comparison.error.message || 'These documentation packages could not be compared.'}</p>}{canCompare&&comparison.data&&<ComparisonResults data={comparison.data} target={target}/>}</>}
  </div>;
}
