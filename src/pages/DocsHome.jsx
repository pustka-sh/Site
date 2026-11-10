import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiLink, docBase, docsDate, useDocProjects, usePublishedResource } from '../lib/publishedDocs.js';
import { SOURCE } from '../data/site.js';
import '../styles/docs-reading.css';

const routes=[
  {number:'01',id:'start',title:'Bring up a network.',description:'Build Relay, connect a Paper backend, and check the settings before joining.',links:[['/docs/quickstart','Quick start'],['/docs/configuration','Build a configuration'],['/tools#setup-check','Check your setup']]},
  {number:'02',id:'guides',title:'Understand the connections.',description:'Learn how backends, client mods, and typed application packets communicate.',links:[['/docs/backend','Backend plugin messaging'],['/docs/client','Client mod protocol'],['/docs/packets','Typed server packets']]},
  {number:'03',id:'dashboard',title:'Read the dashboard API.',description:'HTTP routes and the live event stream served by your own Relay dashboard.',links:[['/api','Dashboard HTTP & WebSocket API'],['/docs/compatibility','Minecraft compatibility'],['/docs/protocol-ids','Protocol IDs']]},
];

export default function DocsHome(){
  const {loading,data,error}=useDocProjects();
  const project=data?.projects?.find(project=>project.id==='relay');
  const [selected,setSelected]=useState('');
  const version=project?.versions?.some(entry=>entry.version===selected)?selected:project?.defaultVersion;
  const snapshot=project?.versions?.find(entry=>entry.version===version);
  const packageState=usePublishedResource(version?`/docs/relay/${encodeURIComponent(version)}`:null);
  const manifest=packageState.data;
  useEffect(()=>{document.title='Relay documentation — pustka';},[]);
  return <div className="container docs-project-home">
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/docs/projects">Documentation</Link><span>/</span><span>Relay</span></nav>
    <header className="docs-home-header"><div><p className="section-label">RELAY / THE DOCUMENTATION</p><h1>A way through<br/>the network.</h1><p>Start a server, understand the protocols, and build on Relay. The guides and source reference meet here.</p><div className="docs-home-actions"><Link className="button" to="/docs/quickstart">Start with Relay →</Link><Link className="text-link" to="/lab/relay">Follow a connection in Relay Lab →</Link></div></div><div className="docs-home-schematic" aria-label="A client connects through Relay to a backend"><span>PLAYER</span><i aria-hidden="true">↓</i><strong>RELAY<span>one connection in</span></strong><i aria-hidden="true">↓</i><div><span>LOBBY</span><span>SURVIVAL</span><span>MINIGAMES</span></div></div></header>
    <section className="docs-home-reference" aria-labelledby="docs-home-reference-title"><div><p className="section-label">SOURCE / YOUR VERSION</p><h2 id="docs-home-reference-title">Read against the code you run.</h2><p>Published packages pair the project’s own guides with Java declarations and comments from one exact revision.</p>{loading&&<p role="status">Checking published versions…</p>}{error&&<p className="docs-home-notice" role="status">Published versions are unavailable right now. The current setup and integration guides below remain available.</p>}{!loading&&!error&&!version&&<p className="docs-home-notice" role="status">Relay has not published a versioned package yet. Start with the current guides below; source references appear here after publication.</p>}</div>
      <div className="docs-home-version-panel">{version?<><label htmlFor="docs-home-version">Documentation version</label><select id="docs-home-version" value={version} onChange={event=>setSelected(event.target.value)}>{project.versions.map(entry=><option value={entry.version} key={entry.version}>{entry.version}{entry.development?' · development':' · release'}</option>)}</select><p className={version==='main'?'docs-home-development':'docs-home-release'}>{version==='main'?'Development snapshot · follows ongoing work':'Preserved release documentation'}</p><dl><div><dt>Source</dt><dd><a href={`${SOURCE}/commit/${snapshot.commit}`} target="_blank" rel="noopener noreferrer"><code>{snapshot.commit.slice(0,7)}</code> ↗</a></dd></div><div><dt>Published</dt><dd>{docsDate(snapshot.publishedAt)}</dd></div></dl><div className="docs-home-version-links"><Link to={docBase('relay',version)}>Guides & version overview →</Link><Link to={apiLink('relay',version)}>Java source API →</Link></div>{packageState.error&&<p role="status">The selected package could not be loaded. Try another version.</p>}{manifest&&<small>{manifest.pages?.length||0} guides · {manifest.api?.symbols?.length||0} source symbols</small>}</>:<><span className="docs-home-reference-mark" aria-hidden="true">∅</span><p>Guides now.<br/>Versioned reference when published.</p><a href={SOURCE} target="_blank" rel="noopener noreferrer">Explore Relay’s source ↗</a></>}</div>
    </section>
    <div className="docs-home-chapters">{routes.map(route=><section key={route.id} aria-labelledby={`docs-home-${route.id}`}><span className="docs-home-chapter-number">/{route.number}</span><div><h2 id={`docs-home-${route.id}`}>{route.title}</h2><p>{route.description}</p><ul>{route.links.map(([to,label])=><li key={to}><Link to={to}>{label}<span aria-hidden="true">→</span></Link></li>)}</ul></div></section>)}</div>
    <section className="docs-home-next"><div><p className="section-label">A CLOSER LOOK</p><h2>One player. Every step.</h2><p>Walk through a sample connection and inspect the handshake’s fields and bytes in the browser.</p></div><Link className="button" to="/lab/relay">Open Relay Lab →</Link></section>
    <div className="docs-home-footer"><Link to="/docs/introduction">Meet Relay →</Link><Link to="/help">Help & troubleshooting →</Link><Link to="/docs/projects">All projects →</Link></div>
  </div>;
}
