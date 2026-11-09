import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import Reveal, { WordReveal } from '../components/Reveal.jsx';
import External from '../components/External.jsx';
import { useRelayContent } from '../lib/useRelayContent.js';
import { SOURCE } from '../data/site.js';

const monthName = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function Changelog() {
  const data = useRelayContent();
  const [query, setQuery] = useState('');
  const [showMerges, setShowMerges] = useState(false);

  const months = useMemo(() => {
    if (!data) return [];
    const q = query.toLowerCase().trim();
    const list = data.changelog.filter((c) => (showMerges || !c.merge) && (!q || c.subject.toLowerCase().includes(q) || c.short.startsWith(q)));
    const map = new Map();
    list.forEach((c) => {
      const ym = c.date.slice(0, 7);
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym).push(c);
    });
    return [...map.entries()];
  }, [data, query, showMerges]);

  return (
    <div className="container changelog-page">
      <header className="page-intro">
        <p className="section-label">RELAY / CHANGELOG</p>
        <WordReveal as="h1" text="Every change, in order." />
        <Reveal as="p" delay={0.2}>
          Straight from Relay’s commit history.
          {data && !data.tags.length && ' There are no tagged releases yet, so this is the history of main.'}
        </Reveal>
      </header>

      <div className="changelog-tools">
        <label className="changelog-search">
          <span aria-hidden="true">/</span>
          <input type="search" placeholder="Filter changes…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Filter changes" />
        </label>
        <label className="cb-toggle compact">
          <input type="checkbox" checked={showMerges} onChange={(e) => setShowMerges(e.target.checked)} />
          <span className="cb-switch" aria-hidden="true" />
          <span><b>Show merge commits</b></span>
        </label>
        {data && <span className="changelog-count">{data.changelog.length} commits · synced {data.syncedAt}</span>}
      </div>

      {!data && <div className="skeleton" style={{ height: 420 }} />}
      {data && !months.length && <p className="search-empty">Nothing matches “{query}”.</p>}

      <div className="timeline">
        {months.map(([ym, commits]) => (
          <section key={ym} className="timeline-month">
            <Reveal as="h2" className="timeline-label">{monthName(ym)}<span>{commits.length}</span></Reveal>
            <ol>
              {commits.map((c, i) => (
                <motion.li
                  key={c.hash}
                  className={c.merge ? 'merge' : ''}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: '0px 0px -8% 0px' }}
                  transition={{ duration: 0.45, delay: Math.min(i * 0.03, 0.3), ease: [0.22, 1, 0.36, 1] }}
                >
                  <span className="timeline-dot" aria-hidden="true" />
                  <time dateTime={c.date}>{c.date.slice(5)}</time>
                  <p>{c.subject}</p>
                  <External href={`${SOURCE}/commit/${c.hash}`} className="timeline-hash">{c.short}</External>
                </motion.li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
