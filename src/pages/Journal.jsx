import {useEffect,useRef} from 'react';
import {Link,useParams} from 'react-router-dom';
import entries from '../content/journal.generated.json';
import {ReaderOutline,usePublishedProse,useReaderOutline} from '../components/PublishedReaderTools.jsx';
import NotFound from './NotFound.jsx';
import '../styles/journal.css';
import '../styles/docs-reading.css';

const date=value=>new Date(`${value}T12:00:00Z`).toLocaleDateString('en',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});

export default function Journal(){
  const {slug}=useParams();
  const entry=entries.find(item=>item.slug===slug);
  const prose=useRef(null),article=useRef(null);
  usePublishedProse(prose,entry?.html,entry?.title);
  const outline=useReaderOutline(article,slug||'journal');
  useEffect(()=>{document.title=entry?`${entry.title} — pustka journal`:'Workshop journal — pustka';},[entry]);
  if(slug&&!entry)return <NotFound/>;
  if(entry)return <div className="container journal-reading"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/journal">Workshop journal</Link><span>/</span><span>Note {entry.number}</span></nav><div className="journal-reading-grid"><article ref={article} className="docs-content journal-article"><header><p className="section-label">{entry.category} / {entry.number}</p><h1>{entry.title}</h1><p className="lead">{entry.description}</p><p className="journal-date">Engineering note · Published <time dateTime={entry.published}>{date(entry.published)}</time></p></header><div ref={prose} className="published-prose" dangerouslySetInnerHTML={{__html:entry.html}}/><footer><Link to="/journal">← All workshop notes</Link><Link to="/docs/projects">Read the documentation →</Link></footer></article><ReaderOutline {...outline}/></div></div>;
  return <div className="container journal-home"><header className="journal-intro"><div><p className="section-label">PUSTKA / WORKSHOP JOURNAL</p><h1>Notes from<br/><span>the workbench.</span></h1><p>The decisions, boundaries, and small details behind the software. Follow the reasoning back to the code.</p></div><div className="journal-index-mark" aria-hidden="true"><span>FIELD NOTES</span><strong>∅ / {String(entries.length).padStart(2,'0')}</strong><small>IMPLEMENTATION · PROTOCOLS · TOOLS</small></div></header><div className="journal-list">{entries.map(item=><article key={item.slug}><span className="journal-number">/{item.number}</span><div><p className="section-label">{item.category}</p><h2><Link to={`/journal/${item.slug}`}>{item.title}<span aria-hidden="true">↗</span></Link></h2><p>{item.description}</p><time dateTime={item.published}>{date(item.published)}</time></div></article>)}</div><p className="journal-endnote">Engineering notes explain the implementation at a cited revision. For setup instructions, use the <Link to="/docs/relay">Relay documentation →</Link></p></div>;
}
