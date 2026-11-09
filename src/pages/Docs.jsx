import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import External from '../components/External.jsx';
import { Callout } from '../components/CodeBlock.jsx';
import { useToast } from '../components/Toast.jsx';
import NotFound from './NotFound.jsx';
import { docBodies, ApiChoices } from './docContent.jsx';
import { useRelayContent } from '../lib/useRelayContent.js';
import { toMarkdown } from '../lib/toMarkdown.js';
import { docGroups, docMeta, docNav, docNeighbours, docPath, docTitle, endpoints, SOURCE, ISSUES } from '../data/site.js';

const smooth = () => (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth');

function useScrollSpy(ids) {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join();
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
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}

function Endpoint({ e, index }) {
  const [open, setOpen] = useState(false);
  const post = e.method === 'POST';
  return (
    <motion.div layout className={`endpoint ${open ? 'open' : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.25, delay: index * 0.03 }}>
      <button className="endpoint-summary" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`method ${post ? 'post' : ''} ${e.method === 'WS' ? 'ws' : ''}`}>{e.method}</span>
        <code>{e.path}</code>
        <motion.span className="endpoint-toggle" animate={{ rotate: open ? 45 : 0 }} aria-hidden="true">+</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div className="endpoint-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
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
    const next = { ArrowRight: (i + 1) % tabs.length, ArrowLeft: (i - 1 + tabs.length) % tabs.length, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
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
      <div className="api-tabs" role="tablist" aria-label="Endpoint category" onKeyDown={onKeyDown} data-md-skip>
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

/** A synced upstream document, rendered and highlighted at sync time. */
function Upstream({ doc, data, label, only }) {
  return (
    <section className={`upstream ${only ? 'upstream-only' : ''}`} aria-labelledby={only ? undefined : 'full-reference'}>
      {!only && (
        <header className="reference-intro">
          <p className="part-kicker" data-md-skip>Part 2 · Full reference</p>
          <h2 id="full-reference">{label}</h2>
          <p className="reference-desc">The complete upstream document, kept in sync with Relay. The guide above is the short version.</p>
        </header>
      )}
      <dl className="reference-meta" data-md-skip>
        <div><dt>Source</dt><dd><External href={doc.source}>{doc.file} ↗</External></dd></div>
        <div><dt>Revision</dt><dd><External href={`${SOURCE}/commit/${data.commit}`}>{data.commit.slice(0, 7)}</External></dd></div>
        <div><dt>Synced</dt><dd>{data.syncedAt}</dd></div>
      </dl>
      <div className="upstream-body" dangerouslySetInnerHTML={{ __html: doc.html }} />
    </section>
  );
}

export default function Docs({ api = false }) {
  const { slug } = useParams();
  const key = api ? 'api' : slug;
  const meta = docMeta[key];
  const data = useRelayContent();
  const navigate = useNavigate();
  const toast = useToast();
  const articleRef = useRef(null);
  const bodyRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 26 });

  const upstreamDoc = meta?.upstream && data ? data[meta.upstream.kind === 'doc' ? 'docs' : 'readme'][meta.upstream.key] : null;
  // Two groups: the hand-written guide, then the synced reference with its own hierarchy.
  const tocGroups = useMemo(() => {
    const groups = [];
    if (meta?.toc.length) groups.push({ key: 'guide', label: 'Guide', items: meta.toc.map(([id, label]) => ({ id, label, level: 2 })) });
    if (meta?.upstream) {
      groups.push({
        key: 'reference',
        label: meta.upstream.only ? 'Reference' : 'Full reference',
        anchor: meta.upstream.only ? undefined : 'full-reference',
        pending: !upstreamDoc,
        items: (upstreamDoc?.toc || []).map(([id, label, level = 2]) => ({ id, label, level })),
      });
    }
    return groups;
  }, [meta, upstreamDoc]);
  const toc = tocGroups.flatMap((g) => g.items.map((i) => [i.id, i.label]));
  const active = useScrollSpy(toc.map(([id]) => id));
  const hasGuideAndReference = Boolean(meta?.toc.length && meta?.upstream && !meta.upstream.only);

  useEffect(() => setMenuOpen(false), [key]);

  if (!meta) return <NotFound />;
  const { previous, next } = docNeighbours(key);
  const Body = api ? ApiBody : docBodies[key];
  const jump = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: smooth(), block: 'start' });
    window.history.replaceState(null, '', `#${id}`);
  };

  // Links and copy buttons inside synced HTML are plain DOM; route them through React.
  const onArticleClick = async (e) => {
    const link = e.target.closest('a[data-internal]');
    if (link) {
      e.preventDefault();
      const [path, hash] = link.getAttribute('href').split('#');
      if (!path || path === window.location.pathname) {
        document.getElementById(hash)?.scrollIntoView({ behavior: smooth(), block: 'start' });
        window.history.replaceState(null, '', `#${hash}`);
      } else navigate(link.getAttribute('href'));
      return;
    }
    const copy = e.target.closest('button[data-copy]');
    if (copy) {
      try {
        await navigator.clipboard.writeText(copy.closest('.code-block').querySelector('pre').textContent);
        copy.textContent = '✓ Copied';
        toast('Copied to clipboard.');
        setTimeout(() => { copy.textContent = 'Copy'; }, 2000);
      } catch {
        toast('Select the code to copy it.');
      }
    }
  };

  const copyMarkdown = async () => {
    const md = toMarkdown(bodyRef.current, { title: meta.title, description: meta.description, url: window.location.href.split('#')[0] });
    try {
      await navigator.clipboard.writeText(md);
      toast('Page copied as Markdown.');
    } catch {
      toast('Clipboard unavailable here.');
    }
  };

  const sidebarLink = (id) => {
    const isActive = key === id;
    return (
      <Link key={id} to={docPath(id)} className={isActive ? 'active' : ''} aria-current={isActive ? 'page' : undefined}>
        {isActive && <motion.span layoutId="sidebar-active" className="sidebar-active" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
        <span className="sidebar-text">{docTitle(id)}</span>
      </Link>
    );
  };

  return (
    <div className={`docs-shell ${meta.wide ? 'docs-wide' : ''}`}>
      <button className="mobile-doc-nav" aria-expanded={menuOpen} aria-controls="docs-sidebar" onClick={() => setMenuOpen(!menuOpen)}>
        Relay / {docTitle(key)} <span>{menuOpen ? 'Close −' : 'Browse +'}</span>
      </button>
      <aside className={`docs-sidebar ${menuOpen ? 'open' : ''}`} id="docs-sidebar" aria-label="Documentation navigation">
        <div className="docs-project">Relay <span>proxy</span></div>
        {docGroups.map((g) => (
          <div key={g}>
            <p className="sidebar-label">{g}</p>
            {docNav.filter((d) => d.group === g).map((d) => sidebarLink(d.id))}
          </div>
        ))}
        <p className="sidebar-label">ELSEWHERE</p>
        <Link to="/changelog">Changelog</Link>
        <Link to="/help">Help & FAQ</Link>
        <External href={SOURCE}>Relay source ↗</External>
        <External href={ISSUES}>Issues & feedback ↗</External>
      </aside>
      <article className={`docs-content ${api ? 'api-intro' : ''}`} ref={articleRef} onClick={onArticleClick}>
        <div className="breadcrumbs">
          <Link to="/">pustka</Link><span>/</span><Link to="/docs/relay">Relay</Link><span>/</span>{api ? 'API' : docTitle(key)}
        </div>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>{meta.title}</motion.h1>
        <motion.p className="lead" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.08 }}>{meta.description}</motion.p>
        <motion.div className="doc-actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
          <button type="button" className="doc-action" onClick={copyMarkdown}>
            <svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.3" d="M5.5 4.5V2.5h8v9h-2M2.5 4.5h9v9h-9z" /></svg>
            Copy as Markdown
          </button>
          <External href={meta.source} className="doc-action">View on GitHub ↗</External>
        </motion.div>
        <motion.div ref={bodyRef} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.15 }}>
          {hasGuideAndReference && <p className="part-kicker part-guide" data-md-skip>Part 1 · Guide</p>}
          <Body />
          {meta.upstream && (upstreamDoc
            ? <Upstream doc={upstreamDoc} data={data} label={meta.upstream.label} only={meta.upstream.only} />
            : <div className="skeleton upstream-skeleton" aria-busy="true" />)}
        </motion.div>
        <div className="doc-source"><span>Continue at the source</span><External href={meta.source}>{meta.sourceLabel} ↗</External></div>
        <nav className="doc-pagination" aria-label="Adjacent documentation">
          {previous && <Link to={docPath(previous)}><span><small>PREVIOUS</small>← {docTitle(previous)}</span></Link>}
          {next && <Link to={docPath(next)} className="next"><span><small>NEXT</small>{docTitle(next)} →</span></Link>}
        </nav>
      </article>
      {!meta.wide && (
        <nav className="docs-toc" aria-label="On this page">
          <p>ON THIS PAGE</p>
          <div className="toc-track">
            <motion.span className="toc-progress" style={{ scaleY: progress }} aria-hidden="true" />
            {tocGroups.map((g) => (
              <div className={`toc-group toc-${g.key}`} key={g.key}>
                {tocGroups.length > 1 || g.key === 'reference' ? (
                  g.anchor
                    ? <a className="toc-group-label" href={`#${g.anchor}`} onClick={jump(g.anchor)}>{g.label}</a>
                    : <span className="toc-group-label">{g.label}</span>
                ) : null}
                {g.pending && <span className="toc-pending" aria-hidden="true" />}
                <ul>
                  {g.items.map((item) => (
                    <li key={item.id} className={`toc-level-${item.level}`}>
                      <a href={`#${item.id}`} className={active === item.id ? 'active' : ''} aria-current={active === item.id ? 'location' : undefined} onClick={jump(item.id)}>
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
