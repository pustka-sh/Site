import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { searchIndex, docNav } from '../data/site.js';
import { loadDocProjects } from '../lib/publishedDocs.js';
import { useDocumentationSearch } from '../lib/docsSearch.js';

const kindLabel = { page: 'PAGE', project: 'PROJECT', doc: 'DOC', section: 'SECTION', endpoint: 'ROUTE', external: 'LINK', tool: 'TOOL', reference: 'REF', faq: 'FAQ', guide:'GUIDE',symbol:'API',journal:'NOTE' };

// Headings from the synced upstream docs, loaded the first time the palette opens.
const upstreamRoutes = { relay: '/docs/introduction', quickstart: '/docs/quickstart', api: '/api' };
let upstreamIndex = null;
async function loadUpstream() {
  if (upstreamIndex) return upstreamIndex;
  const { default: data } = await import('../content/relay.json');
  const entries = [];
  const add = (doc, to, pageTitle) => doc.toc.forEach(([anchor, label]) => entries.push({
    title: label, detail: `${pageTitle} / Full reference`, to, anchor, terms: `${label} ${pageTitle} reference upstream`, kind: 'reference',
  }));
  const addText = (doc, to, pageTitle) => entries.push({
    title: `${pageTitle} — full text`, detail: `Search inside ${doc.file}`, to, terms: doc.text, kind: 'reference', fulltext: true,
  });
  Object.entries(data.docs).forEach(([key, doc]) => {
    const t = docNav.find((d) => d.id === key)?.title || doc.title;
    add(doc, `/docs/${key}`, t);
    addText(doc, `/docs/${key}`, t);
  });
  Object.entries(data.readme).forEach(([key, doc]) => {
    const t = docNav.find((d) => d.id === key)?.title || 'README';
    add(doc, upstreamRoutes[key], t);
    addText(doc, upstreamRoutes[key], t);
  });
  const {default:journal}=await import('../content/journal.generated.json');
  entries.push(...journal.map(entry=>({title:`${entry.title} — full text`,detail:'Workshop journal',to:`/journal/${entry.slug}`,terms:entry.markdown,kind:'journal',fulltext:true})));
  upstreamIndex = entries;
  return entries;
}

// Lightweight fuzzy scoring: exact substring beats in-order characters; title beats terms.
function score(item, q) {
  if (!q) return 1;
  if (item.fulltext) return item.terms.toLowerCase().includes(q) ? 20 : 0;
  const title = item.title.toLowerCase();
  const hay = `${item.title} ${item.detail} ${item.terms}`.toLowerCase();
  if (title === q) return 1000;
  if (title.startsWith(q)) return 600;
  if (title.includes(q)) return 450;
  if (hay.includes(q)) return 250;
  const words = q.split(/\s+/);
  if (words.every((w) => hay.includes(w))) return 150;
  let i = 0;
  for (const c of title) if (c === q[i]) i += 1;
  return i === q.length ? 15 : 0;
}

function snippet(text, q) {
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return '';
  const start = Math.max(0, i - 40);
  return `${start ? '…' : ''}${text.slice(start, i + q.length + 60).trim()}…`;
}

export default function SearchPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const dialogRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [project,setProject]=useState(''),[version,setVersion]=useState(''),[projects,setProjects]=useState([]);
  const published=useDocumentationSearch({query,project,version,limit:14,enabled:open});
  const versions=projects.find(item=>item.id===project)?.versions||[];

  const [extra, setExtra] = useState([]);
  useEffect(() => { if (open) loadUpstream().then(setExtra).catch(() => {}); }, [open]);
  useEffect(()=>{
    if(!open)return;let active=true;
    loadDocProjects().then(data=>{if(active)setProjects(data.projects);}).catch(()=>{});
    const match=/^\/docs\/([a-z][a-z0-9-]*)\/(main|v?\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)(?:\/|$)/.exec(location.pathname);
    setProject(match?.[1]||(location.pathname==='/api'||location.pathname==='/docs/relay'||location.pathname==='/lab/relay'||docNav.some(item=>location.pathname===`/docs/${item.id}`)?'relay':''));
    setVersion(match?.[2]||'');
    return()=>{active=false;};
  },[open]);

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    const local = [...searchIndex, ...(q ? extra : [])]
      .filter(item=>!(project&&version&&['doc','section','reference','endpoint','faq'].includes(item.kind)))
      .filter(item=>!(project&&project!=='relay'&&item.to!=='/docs/projects'&&['doc','section','reference','endpoint','faq'].includes(item.kind)))
      .map((item) => ({ item, s: score(item, q) }))
      .filter((r) => r.s > 0);
    const remote=(published.data?.results||[]).map(item=>({item,s:item.score}));
    return [...remote,...local]
      .sort((a, b) => b.s - a.s)
      .slice(0, q ? 18 : 8)
      .map((r) => (r.item.fulltext ? { ...r.item, detail: snippet(r.item.terms, q) } : r.item));
  }, [query, extra, published.data, project, version]);

  useEffect(() => { setActive(0); }, [query,project,version]);
  useEffect(()=>setActive(value=>Math.min(value,Math.max(0,results.length-1))),[results.length]);
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const prev = document.activeElement;
    const overflow=document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame=requestAnimationFrame(() => inputRef.current?.focus());
    return () => {cancelAnimationFrame(frame); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (item) => {
    onClose();
    if (!item) return;
    if (item.href) return void window.open(item.href, '_blank', 'noopener');
    navigate(item.anchor ? `${item.to}#${item.anchor}` : item.to);
  };

  const onKeyDown = (e) => {
    if(e.key==='Escape'){e.preventDefault();onClose();return;}
    if(e.key==='Tab'){
      const elements=[...dialogRef.current.querySelectorAll('button:not([tabindex="-1"]):not([disabled]), input:not([disabled]), select:not([disabled])')];
      const index=elements.indexOf(document.activeElement),next=e.shiftKey?(index<=0?elements.length-1:index-1):(index+1)%elements.length;
      e.preventDefault();elements[next]?.focus();return;
    }
    if(e.target!==inputRef.current)return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, Math.max(0,results.length - 1))); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            ref={dialogRef}
            className="palette"
            role="dialog"
            aria-modal="true"
            aria-labelledby="palette-label"
            initial={{ opacity: 0, y: -18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            onKeyDown={onKeyDown}
          >
            <div className="palette-top">
              <span id="palette-label">Find your way.</span>
              <button className="close-search" onClick={onClose} aria-label="Close search">Esc</button>
            </div>
            <div className="search-input-wrap">
              <span aria-hidden="true">/</span>
              <input
                ref={inputRef}
                autoFocus
                type="search"
                placeholder="Projects, guides, classes, methods…"
                aria-label="Search pages, guides and API symbols"
                maxLength={120}
                autoComplete="off"
                spellCheck="false"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                role="combobox"
                aria-expanded="true"
                aria-controls="palette-results"
                aria-activedescendant={results[active] ? `palette-opt-${active}` : undefined}
              />
            </div>
            <div className="palette-scope">
              <label htmlFor="palette-project">Project<select id="palette-project" value={project} onChange={event=>{setProject(event.target.value);setVersion('');}}><option value="">All projects</option>{project&&!projects.some(item=>item.id===project)&&<option value={project}>{project}</option>}{projects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label htmlFor="palette-version">Documentation version<select id="palette-version" value={version} disabled={!project||!versions.length} onChange={event=>setVersion(event.target.value)}><option value="">{project?'Latest published':'Default per project'}</option>{version&&!versions.some(item=>item.version===version)&&<option value={version}>{version}</option>}{versions.map(item=><option key={item.version} value={item.version}>{item.version}{item.development?' · development':''}</option>)}</select></label>
            </div>
            <div className="palette-search-status" aria-live="polite">{published.loading?'Searching published documentation…':published.error?project&&version?'Published documentation is unavailable. Site navigation is still available.':'Published documentation is unavailable. Site pages and curated guides are still searchable.':query.trim().length===1?'Type another character to search published docs.':published.data?`${published.data.results.length}${published.data.truncated?'+':''} documentation ${published.data.results.length===1&&!published.data.truncated?'match':'matches'} · site navigation included`:'Search the workshop, guides, and source API.'}</div>
            <div className="search-results" id="palette-results" role="listbox" ref={listRef} aria-label="Results">
              {results.length ? (
                results.map((item, i) => (
                  <motion.button
                    type="button"
                    layout="position"
                    key={item.id||`${item.title}|${item.detail}|${item.anchor || ''}`}
                    tabIndex={-1}
                    id={`palette-opt-${i}`}
                    role="option"
                    aria-selected={i === active}
                    data-active={i === active}
                    className="search-result"
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(item)}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.2) }}
                  >
                    {i === active && <motion.span layoutId="palette-active" className="palette-active" transition={{ type: 'spring', stiffness: 600, damping: 40 }} />}
                    <span className="result-kind">{kindLabel[item.kind]}</span>
                    <span className="result-text">{item.title}<small>{item.detail}</small>{item.snippet&&<span className="result-snippet">{item.snippet}</span>}</span>
                    <span className="result-arrow" aria-hidden="true">{item.href ? '↗' : '→'}</span>
                  </motion.button>
                ))
              ) : (
                <p className="search-empty">No match for “{query}”. Try “Relay”, “client”, or “players”.</p>
              )}
            </div>
            <p className="search-hint"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Tab</kbd> for filters · <kbd>Esc</kbd> to close</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
