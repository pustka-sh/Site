import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { searchIndex } from '../data/site.js';

const kindLabel = { page: 'PAGE', project: 'PROJECT', doc: 'DOC', section: 'SECTION', endpoint: 'ROUTE', external: 'LINK' };

// Lightweight fuzzy scoring: exact substring beats in-order characters; title beats terms.
function score(item, q) {
  if (!q) return 1;
  const title = item.title.toLowerCase();
  const hay = `${item.title} ${item.detail} ${item.terms}`.toLowerCase();
  if (title.startsWith(q)) return 100;
  if (title.includes(q)) return 80;
  if (hay.includes(q)) return 50;
  const words = q.split(/\s+/);
  if (words.every((w) => hay.includes(w))) return 35;
  let i = 0;
  for (const c of title) if (c === q[i]) i += 1;
  return i === q.length ? 15 : 0;
}

export default function SearchPalette({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    return searchIndex
      .map((item) => ({ item, s: score(item, q) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, q ? 12 : 8)
      .map((r) => r.item);
  }, [query]);

  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const prev = document.activeElement;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => { document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (item) => {
    onClose();
    if (!item) return;
    if (item.href) return void window.open(item.href, '_blank', 'noopener');
    navigate(item.to);
    if (item.anchor) setTimeout(() => document.getElementById(item.anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 550);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(results[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'Tab') { e.preventDefault(); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
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
                placeholder="Projects, docs, sections, routes…"
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
            <div className="search-results" id="palette-results" role="listbox" ref={listRef} aria-label="Results">
              {results.length ? (
                results.map((item, i) => (
                  <motion.button
                    type="button"
                    layout="position"
                    key={item.title + item.detail}
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
                    <span className="result-text">{item.title}<small>{item.detail}</small></span>
                    <span className="result-arrow" aria-hidden="true">{item.href ? '↗' : '→'}</span>
                  </motion.button>
                ))
              ) : (
                <p className="search-empty">No match for “{query}”. Try “Relay”, “client”, or “players”.</p>
              )}
            </div>
            <p className="search-hint"><kbd>↑</kbd><kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
