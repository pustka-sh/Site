import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import External from '../components/External.jsx';
import { Callout } from '../components/CodeBlock.jsx';
import NotFound from './NotFound.jsx';
import { docBodies, ApiChoices } from './docContent.jsx';
import { docMeta, docNav, endpoints, SOURCE } from '../data/site.js';

const scrollToId = (id) => {
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant', block: 'start' });
};

function useScrollSpy(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-90px 0px -60% 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}

function Endpoint({ e, index }) {
  const [open, setOpen] = useState(false);
  const post = e.method === 'POST';
  return (
    <motion.div
      layout
      className={`endpoint ${open ? 'open' : ''}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
    >
      <button className="endpoint-summary" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`method ${post ? 'post' : ''} ${e.method === 'WS' ? 'ws' : ''}`}>{e.method}</span>
        <code>{e.path}</code>
        <motion.span className="endpoint-toggle" animate={{ rotate: open ? 45 : 0 }} aria-hidden="true">+</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="endpoint-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="endpoint-inner">
              <p>{e.detail}</p>
              {e.query && <p>Query parameters: {e.query.map((q, i) => <span key={q}><code>{q}</code>{i < e.query.length - 1 ? ', ' : '.'}</span>)}</p>}
              <External href={`${SOURCE}#dashboard-api`} className="text-link">Full upstream contract ↗</External>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ApiBody() {
  const [filter, setFilter] = useState('all');
  const tabs = [['all', 'All routes'], ['read', 'Read'], ['actions', 'Actions']];
  const list = endpoints.filter((e) => filter === 'all' || (filter === 'actions' ? e.method === 'POST' : e.method !== 'POST'));
  const onKeyDown = (e) => {
    const i = tabs.findIndex(([id]) => id === filter);
    let next = null;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    setFilter(tabs[next][0]);
    document.getElementById(`api-tab-${tabs[next][0]}`)?.focus();
  };
  return (
    <>
      <h2 id="dashboard">Dashboard companion</h2>
      <p>These routes belong to a Relay dashboard running on your own network. They are not public endpoints on pustka.sh. The companion is disabled by default.</p>
      <Callout><strong>Access matters.</strong> Off-loopback use requires accounts. Mutating requests also check permissions and CSRF protection, and record an audit entry.</Callout>
      <h2 id="routes">Routes</h2>
      <div className="api-tabs" role="tablist" aria-label="Endpoint category" onKeyDown={onKeyDown}>
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" id={`api-tab-${id}`} aria-controls="endpoint-list" aria-selected={filter === id} tabIndex={filter === id ? 0 : -1} onClick={() => setFilter(id)}>
            {label}
            {filter === id && <motion.span layoutId="api-tab-underline" className="tab-underline" />}
          </button>
        ))}
      </div>
      <motion.div id="endpoint-list" role="tabpanel" aria-labelledby={`api-tab-${filter}`} layout>
        <AnimatePresence mode="popLayout">
          {list.map((e, i) => <Endpoint key={e.path} e={e} index={i} />)}
        </AnimatePresence>
      </motion.div>
      <h2 id="integrations">Looking for a wire protocol?</h2>
      <ApiChoices />
    </>
  );
}

export default function Docs({ api = false }) {
  const { slug } = useParams();
  const key = api ? 'api' : slug;
  const meta = docMeta[key];
  const [menuOpen, setMenuOpen] = useState(false);
  const active = useScrollSpy(meta ? meta.toc.map(([id]) => id) : []);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26 });

  useEffect(() => { if (meta) document.title = `${api ? 'Relay API' : meta.title} — pustka`; }, [meta, api]);
  useEffect(() => setMenuOpen(false), [key]);

  if (!meta) return <NotFound />;
  const navTitle = api ? 'API reference' : docNav.find((d) => d.id === key).title;
  const Body = api ? ApiBody : docBodies[key];
  const groups = ['START HERE', 'INTEGRATIONS'];
  const navTitleOf = (id) => docNav.find((d) => d.id === id)?.title;

  const sidebarLink = (to, label, isActive) => (
    <Link key={to} to={to} className={isActive ? 'active' : ''} aria-current={isActive ? 'page' : undefined}>
      {isActive && <motion.span layoutId="sidebar-active" className="sidebar-active" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
      <span className="sidebar-text">{label}</span>
    </Link>
  );

  return (
    <div className="docs-shell">
      <button className="mobile-doc-nav" aria-expanded={menuOpen} aria-controls="docs-sidebar" onClick={() => setMenuOpen(!menuOpen)}>
        Relay / {navTitle} <span>{menuOpen ? 'Close −' : 'Browse +'}</span>
      </button>
      <aside className={`docs-sidebar ${menuOpen ? 'open' : ''}`} id="docs-sidebar" aria-label="Documentation navigation">
        <div className="docs-project">Relay <span>proxy</span></div>
        {groups.map((g) => (
          <div key={g}>
            <p className="sidebar-label">{g}</p>
            {docNav.filter((d) => d.group === g).map((d) => sidebarLink(`/docs/${d.id}`, d.title, !api && key === d.id))}
            {g === 'INTEGRATIONS' && sidebarLink('/api', 'Dashboard API', api)}
          </div>
        ))}
        <p className="sidebar-label">ELSEWHERE</p>
        <External href={SOURCE}>Relay source ↗</External>
        <External href={`${SOURCE}/issues`}>Issues & feedback ↗</External>
      </aside>
      <article className={`docs-content ${api ? 'api-intro' : ''}`}>
        <div className="breadcrumbs">
          <Link to="/">pustka</Link><span>/</span><Link to="/docs/relay">Relay</Link><span>/</span>{api ? 'API' : navTitle}
        </div>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>{meta.title}</motion.h1>
        <motion.p className="lead" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.08 }}>{meta.description}</motion.p>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.15 }}>
          <Body />
        </motion.div>
        <div className="doc-source"><span>Continue at the source</span><External href={meta.source}>{meta.sourceLabel} ↗</External></div>
        {!api && (
          <nav className="doc-pagination" aria-label="Adjacent documentation">
            {meta.previous && <Link to={`/docs/${meta.previous}`}><span><small>PREVIOUS</small>← {navTitleOf(meta.previous)}</span></Link>}
            {meta.next && <Link to={`/docs/${meta.next}`} className="next"><span><small>NEXT</small>{navTitleOf(meta.next)} →</span></Link>}
          </nav>
        )}
      </article>
      <nav className="docs-toc" aria-label="On this page">
        <p>ON THIS PAGE</p>
        <div className="toc-track">
          <motion.span className="toc-progress" style={{ scaleY: progress }} aria-hidden="true" />
          {meta.toc.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={active === id ? 'active' : ''} onClick={(e) => { e.preventDefault(); scrollToId(id); }}>
              {label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
