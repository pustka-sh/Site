import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import DocsProjectSwitcher from '../components/DocsProjectSwitcher.jsx';
import { apiLink, docBase, docsDate, isType, repositoryUrl, sourceUrl, useDocProjects, usePublishedResource } from '../lib/publishedDocs.js';

const kindLabel = kind => String(kind || 'symbol').replaceAll('-', ' ');
const symbolSearch = (symbol, query) => `${symbol.name} ${symbol.qualifiedName} ${symbol.signature} ${symbol.summary}`.toLowerCase().includes(query.trim().toLowerCase());
const externalProps = {target:'_blank',rel:'noopener noreferrer'};

function EmptyState({error, title, children}) {
  return <section className="published-empty" role="status"><span className="published-empty-mark" aria-hidden="true">∅</span><h2>{title || (error?.status === 404 ? 'This documentation is not published yet.' : 'Documentation is unavailable.')}</h2>{error?.message && <p>{error.message}</p>}{children || <Link className="text-link" to="/docs/projects">Browse project docs →</Link>}</section>;
}

export function DocsProjects() {
  const {loading,data,error} = useDocProjects();
  useEffect(() => {document.title='Project documentation — pustka';},[]);
  return <div className="container published-directory"><header className="page-intro"><p className="section-label">DOCUMENTATION / THE PROJECTS</p><h1>Words beside the code.</h1><p>Guides and API references published from each project’s own source. Choose a project and the version you are building against.</p></header>
    {loading && <p className="published-loading" role="status">Loading the documentation directory…</p>}
    {error && <EmptyState error={error}><Link className="text-link" to="/docs/relay">Read the current Relay guides →</Link></EmptyState>}
    {data && !data.projects.length && <EmptyState title="The first package is on its way."><p>Versioned guides and source-authored API references appear here after a project publishes its first documentation package.</p><Link className="text-link" to="/docs/relay">Read the current Relay guides →</Link></EmptyState>}
    <div className="published-project-list">{(data?.projects || []).map((project,index) => <article id={project.id} className="published-project" key={project.id}><span className="published-project-number">/{String(index+1).padStart(2,'0')}</span><div><h2>{project.name}</h2><p>{project.versions?.length ? `${project.versions.length} published ${project.versions.length === 1 ? 'version' : 'versions'}. Every snapshot points to its exact source revision.` : 'No versioned package has been published yet.'}</p><div className="published-version-links">{(project.versions || []).map(version => <Link to={docBase(project.id,version.version)} key={version.version}><strong>{version.version}</strong><span>{version.development || version.version==='main' ? 'Development' : 'Release'}</span><code>{version.commit?.slice(0,7)}</code></Link>)}</div><div className="published-project-links">{project.id==='relay' && <Link to="/docs/relay">Current Relay guides →</Link>}{repositoryUrl(project.repository) && <a href={project.repository} {...externalProps}>Source repository ↗</a>}</div></div></article>)}</div>
  </div>;
}

function PublishedHtml({html, fallback, project, version, className = ''}) {
  const navigate = useNavigate();
  const onClick = (event) => {
    if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)return;
    const anchor=event.target.closest('a');
    if(!anchor)return;
    const symbol=anchor.getAttribute('data-doc-symbol');
    if(symbol){event.preventDefault();navigate(apiLink(project,version,symbol));return;}
    const href=anchor.getAttribute('href');
    if(!href)return;
    if(href.startsWith('?symbol=')){event.preventDefault();navigate(`${docBase(project,version)}/api${href}`);return;}
    if(href.startsWith('#'))return;
    try{const target=new URL(href,window.location.href);if(target.origin===window.location.origin&&target.pathname.startsWith('/docs/')){event.preventDefault();navigate(target.pathname+target.search+target.hash);}}catch{/* A malformed inert link is left to the browser. */}
  };
  return typeof html==='string' && html.trim() ? <div className={`published-prose ${className}`} onClick={onClick} dangerouslySetInnerHTML={{__html:html}} /> : fallback ? <p className={`published-prose ${className}`}>{fallback}</p> : null;
}

function Revision({manifest, source}) {
  const href=sourceUrl(manifest.project?.repository,manifest.source?.commit,source);
  return <div className="published-revision"><span className={`published-channel ${manifest.version==='main'?'development':'release'}`}>{manifest.version==='main'?'Development documentation':'Released documentation'}</span><code>{manifest.version}</code><span title={manifest.source?.commit}>Source {manifest.source?.commit?.slice(0,7) || 'revision unavailable'}</span>{href && <a href={href} {...externalProps}>{source?.path ? `${source.path}${source.line?`:${source.line}`:''}` : 'View this revision'} ↗</a>}</div>;
}

function PackageOverview({manifest}) {
  const {project,version}=manifest;
  const symbols=manifest.api?.symbols || [];
  const types=symbols.filter(isType);
  return <><h1>{project.name}, documented.</h1><p className="lead">Guides and API references from the same source revision.</p><Revision manifest={manifest}/>
    <div className="published-snapshot-facts"><span><strong>{manifest.pages?.length || 0}</strong> guides</span><span><strong>{types.length}</strong> API types</span><span><strong>{symbols.length}</strong> symbols</span><span>Generated {docsDate(manifest.generatedAt)}</span></div>
    <h2 id="package-guides">Start with a guide</h2><div className="published-guide-list">{(manifest.pages || []).map(page=><Link key={page.slug} to={`${docBase(project.id,version)}/${encodeURIComponent(page.slug)}`}><span>{page.title}<small>{page.sourcePath}</small></span><span aria-hidden="true">→</span></Link>)}</div>{!manifest.pages?.length && <p>No guides are included in this package.</p>}
    <h2 id="package-api">Explore the API</h2><p>Browse the public types and members extracted from the project’s source. Comments, signatures, and source links stay tied to this version.</p><Link className="button" to={apiLink(project.id,version)}>Browse API reference →</Link>
  </>;
}

function ApiIndex({manifest}) {
  const location=useLocation();
  const incomingQuery=new URLSearchParams(location.search).get('q') || '';
  const [query,setQuery]=useState(incomingQuery);
  const [limit,setLimit]=useState(60);
  useEffect(()=>{setQuery(incomingQuery);setLimit(60);},[incomingQuery]);
  const navigate=useNavigate();
  const symbols=manifest.api?.symbols || [];
  const filtered=useMemo(()=>symbols.filter(symbol=>symbolSearch(symbol,query)),[symbols,query]);
  const results=query.trim()?filtered:filtered.filter(isType);
  return <><h1>The source, explained.</h1><p className="lead">{manifest.project.name} / {manifest.api?.language || 'Source'} API reference</p><Revision manifest={manifest}/><form className="published-search" role="search" onSubmit={event=>{event.preventDefault();if(results[0])navigate(apiLink(manifest.project.id,manifest.version,results[0].id));}}><label htmlFor="published-api-search">Find a type or member</label><div><input id="published-api-search" type="search" value={query} onChange={event=>{setQuery(event.target.value);setLimit(60);}} placeholder="Class, method, or signature…" autoComplete="off" spellCheck="false"/><button type="submit">Open first result →</button></div></form><p className="published-search-count" role="status">{results.length} {query.trim()?'matching symbols':'types'}{!query.trim()?' · Search to include methods and fields':''}</p><div className="published-symbol-list">{results.slice(0,limit).map(symbol=><Link key={symbol.id} to={apiLink(manifest.project.id,manifest.version,symbol.id)}><span className="published-kind">{kindLabel(symbol.kind)}</span><span><strong>{symbol.qualifiedName || symbol.name}</strong><code>{symbol.signature}</code>{symbol.summary&&<small>{symbol.summary}</small>}</span>{symbol.deprecated&&<span className="published-deprecated">Deprecated</span>}<span aria-hidden="true">→</span></Link>)}</div>{!results.length&&<p className="published-empty-search">{symbols.length?'No symbols match that search.':'This package does not contain an API reference.'}</p>}{results.length>limit&&<button className="published-load-more" type="button" onClick={()=>setLimit(value=>value+60)}>Show more results ({results.length-limit} remaining)</button>}</>;
}

function ApiSymbol({manifest, id}) {
  const state=usePublishedResource(`/docs/${encodeURIComponent(manifest.project.id)}/${encodeURIComponent(manifest.version)}/api?symbol=${encodeURIComponent(id)}`);
  const symbol=state.data?.symbol;
  const project=manifest.project.id, version=manifest.version;
  const members=useMemo(()=>symbol?(manifest.api?.symbols || []).filter(entry=>entry.id!==symbol.id&&(entry.owner===symbol.qualifiedName||entry.owner===symbol.id)):[],[manifest.api?.symbols,symbol]);
  const owner=(manifest.api?.symbols || []).find(entry=>entry.id===symbol?.owner||entry.qualifiedName===symbol?.owner);
  if(state.loading)return <p className="published-loading" role="status">Loading source documentation…</p>;
  if(state.error)return <EmptyState error={state.error} title={state.error.status===404?'That symbol is not in this version.':undefined}><Link className="text-link" to={apiLink(project,version)}>Browse this API →</Link></EmptyState>;
  if(!symbol)return null;
  const htmlProps={project,version};
  return <><p className="published-symbol-kind">{kindLabel(symbol.kind)}{symbol.deprecated&&<span className="published-deprecated">Deprecated</span>}</p><h1 className="published-symbol-title">{symbol.name}</h1><p className="published-qualified-name">{symbol.qualifiedName}</p>{owner&&<Link className="published-owner" to={apiLink(project,version,owner.id)}>In {owner.qualifiedName || owner.name} →</Link>}<Revision manifest={manifest} source={symbol.source}/><pre className="published-signature"><code>{symbol.signature}</code></pre>
    {symbol.deprecated&&<aside className="published-deprecation"><strong>Deprecated API</strong><PublishedHtml html={symbol.deprecationHtml} fallback={symbol.deprecation || 'This symbol is marked deprecated in its source.'} {...htmlProps}/></aside>}
    {symbol.description||symbol.summary ? <PublishedHtml html={symbol.descriptionHtml || symbol.summaryHtml} fallback={symbol.description || symbol.summary} {...htmlProps}/> : <p className="published-undocumented">No description has been written for this symbol in the source yet. Its signature and location are still available.</p>}
    {!!symbol.parameters?.length&&<><h2>Parameters</h2><div className="table-wrap"><table className="reference-table published-parameter-table"><thead><tr><th>Name / type</th><th>Description</th></tr></thead><tbody>{symbol.parameters.map((parameter,index)=><tr key={`${parameter.name}-${index}`}><td><code>{parameter.name}</code><small>{parameter.type}</small></td><td><PublishedHtml html={parameter.descriptionHtml} fallback={parameter.description || 'Not documented in the source.'} {...htmlProps}/></td></tr>)}</tbody></table></div></>}
    {symbol.returns&&symbol.returns.type!=='void'&&<><h2>Returns</h2><p><code>{symbol.returns.type}</code></p><PublishedHtml html={symbol.returns.descriptionHtml} fallback={symbol.returns.description || 'No return description is provided in the source.'} {...htmlProps}/></>}
    {!!symbol.throws?.length&&<><h2>Throws</h2>{symbol.throws.map((exception,index)=><div className="published-exception" key={`${exception.type}-${index}`}><code>{exception.type}</code><PublishedHtml html={exception.descriptionHtml} fallback={exception.description || 'Not documented in the source.'} {...htmlProps}/></div>)}</>}
    {symbol.since&&<p className="published-since">Since <code>{symbol.since}</code></p>}
    {members.length>0&&<><h2>Members</h2><div className="published-member-list">{members.map(member=><Link to={apiLink(project,version,member.id)} key={member.id}><span className="published-kind">{kindLabel(member.kind)}</span><code>{member.signature}</code><span aria-hidden="true">→</span></Link>)}</div></>}
  </>;
}

function Guide({manifest, slug}) {
  const state=usePublishedResource(`/docs/${encodeURIComponent(manifest.project.id)}/${encodeURIComponent(manifest.version)}/pages/${encodeURIComponent(slug)}`);
  const page=state.data?.page;
  if(state.loading)return <p className="published-loading" role="status">Loading the guide…</p>;
  if(state.error)return <EmptyState error={state.error} title={state.error.status===404?'That guide is not in this version.':undefined}/>;
  if(!page)return null;
  return <><h1>{page.title}</h1><Revision manifest={manifest} source={{path:page.sourcePath}}/><PublishedHtml html={page.html} fallback={page.markdown} project={manifest.project.id} version={manifest.version}/></>;
}

function PackageSearch({manifest}) {
  const [query,setQuery]=useState('');
  const navigate=useNavigate();
  const symbols=manifest.api?.symbols || [];
  const matches=query.trim()?[
    ...(manifest.pages || []).filter(page=>`${page.title} ${page.slug}`.toLowerCase().includes(query.trim().toLowerCase())).map(page=>({id:page.slug,label:page.title,kind:'Guide',to:`${docBase(manifest.project.id,manifest.version)}/${encodeURIComponent(page.slug)}`})),
    ...symbols.filter(symbol=>symbolSearch(symbol,query)).map(symbol=>({id:symbol.id,label:symbol.qualifiedName || symbol.name,kind:kindLabel(symbol.kind),to:apiLink(manifest.project.id,manifest.version,symbol.id)})),
  ]:[];
  return <form className="published-package-search" role="search" aria-label="Search this documentation version" onSubmit={event=>{event.preventDefault();if(matches[0]){navigate(matches[0].to);setQuery('');}}}><label htmlFor="published-package-search">Search this version</label><input id="published-package-search" type="search" placeholder="Guides, types, members…" value={query} onChange={event=>setQuery(event.target.value)} autoComplete="off"/>{query.trim()&&<div className="published-package-results" role="region" aria-label="Version search results"><p role="status">{matches.length} {matches.length===1?'match':'matches'} · Enter opens the first</p>{matches.slice(0,20).map(match=><Link key={`${match.kind}-${match.id}`} to={match.to} onClick={()=>setQuery('')}><small>{match.kind}</small><span>{match.label}</span></Link>)}{matches.length>20&&<Link to={`${apiLink(manifest.project.id,manifest.version)}?q=${encodeURIComponent(query)}`} onClick={()=>setQuery('')}>Search the full API index →</Link>}</div>}</form>;
}

export default function PublishedDocs() {
  const {project,version,slug}=useParams();
  const location=useLocation();
  const state=usePublishedResource(`/docs/${encodeURIComponent(project || '')}/${encodeURIComponent(version || '')}`);
  const manifest=state.data;
  const selectedSymbol=new URLSearchParams(location.search).get('symbol');
  const [navOpen,setNavOpen]=useState(false);
  useEffect(()=>{setNavOpen(false);},[location.pathname,location.search]);
  useEffect(()=>{
    if(!manifest?.project)return;
    const symbol=selectedSymbol?manifest.api?.symbols?.find(entry=>entry.id===selectedSymbol):null;
    const label=symbol?.qualifiedName||manifest.pages?.find(page=>page.slug===slug)?.title||(slug==='api'?'API reference':'Documentation');
    document.title=`${label} · ${manifest.project.name} ${manifest.version} — pustka`;
  },[manifest,slug,selectedSymbol]);
  if(state.loading)return <div className="container published-status-page"><p className="published-loading" role="status">Loading this documentation version…</p></div>;
  if(state.error || !manifest?.project)return <div className="container published-status-page"><p className="section-label">DOCUMENTATION / {project}</p><EmptyState error={state.error}/></div>;
  const base=docBase(project,version);
  return <div className="published-docs-shell"><button type="button" className="published-mobile-nav" aria-expanded={navOpen} aria-controls="published-docs-nav" onClick={()=>setNavOpen(value=>!value)}>{manifest.project.name} / {version}<span>{navOpen?'Close −':'Browse +'}</span></button><aside id="published-docs-nav" className={`published-docs-sidebar ${navOpen?'open':''}`} aria-label="Versioned documentation navigation"><DocsProjectSwitcher currentProject={project} currentVersion={version}/><PackageSearch manifest={manifest}/><p className="sidebar-label">THIS VERSION</p><Link className={!slug?'active':''} aria-current={!slug?'page':undefined} to={base}>Overview</Link><p className="sidebar-label">GUIDES</p>{(manifest.pages || []).map(page=><Link className={slug===page.slug?'active':''} aria-current={slug===page.slug?'page':undefined} key={page.slug} to={`${base}/${encodeURIComponent(page.slug)}`}>{page.title}</Link>)}{!manifest.pages?.length&&<p className="published-nav-empty">No guides in this package.</p>}<p className="sidebar-label">REFERENCE</p><Link className={slug==='api'?'active':''} aria-current={slug==='api'?'page':undefined} to={apiLink(project,version)}>API reference <span>{manifest.api?.symbols?.length || 0}</span></Link><Link to="/docs/projects">All project documentation ↗</Link></aside><article className="docs-content published-docs-content"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/docs/projects">Docs</Link><span>/</span><Link to={base}>{manifest.project.name}</Link><span>/</span><span>{version}</span>{slug&&<><span>/</span><span>{slug==='api'?'API':manifest.pages?.find(page=>page.slug===slug)?.title || slug}</span></>}</nav>{!slug?<PackageOverview manifest={manifest}/>:slug==='api'?selectedSymbol?<ApiSymbol key={selectedSymbol} manifest={manifest} id={selectedSymbol}/>:<ApiIndex manifest={manifest}/>:<Guide key={slug} manifest={manifest} slug={slug}/>}<div className="published-package-footer"><Link to={base}>← {manifest.project.name} {version}</Link><span>{version==='main'?'Development snapshots can change.':'This release documentation is preserved.'}</span></div></article></div>;
}
