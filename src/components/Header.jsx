import { useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import RingLogo from './RingLogo.jsx';
import { ORG } from '../data/site.js';

const links = [
  { to: '/projects', label: 'Projects', match: '/projects' },
  { to: '/docs/relay', label: 'Docs', match: '/docs' },
  { to: '/api', label: 'API', match: '/api' },
  { to: '/changelog', label: 'Changelog', match: '/changelog', extra: true },
  { to: '/help', label: 'Help', match: '/help', extra: true },
];

function ThemeToggle({ theme, onToggle }) {
  const light = theme === 'light';
  return (
    <button className="theme-toggle" type="button" onClick={onToggle} aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'} title={light ? 'Dark theme' : 'Light theme'}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.svg
          key={theme}
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"
          initial={{ rotate: -90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: 90, scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {light ? (
            <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
            </>
          )}
        </motion.svg>
      </AnimatePresence>
    </button>
  );
}

export default function Header({ onSearch, theme, onToggleTheme }) {
  const { pathname } = useLocation();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useMotionValueEvent(scrollY, 'change', (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 20);
    setHidden(y > 240 && y > prev + 2 && !document.querySelector('.docs-sidebar.open'));
    if (y < prev - 2) setHidden(false);
  });

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  return (
    <motion.header
      className={`site-header-wrap ${scrolled ? 'scrolled' : ''}`}
      animate={{ y: hidden ? '-100%' : '0%' }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="site-header">
        <Link className="wordmark" to="/" aria-label="pustka home">
          <RingLogo size={40} className="wordmark-ring" />
          <span>pustka<span className="domain">.sh</span></span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          {links.map((l) => {
            const active = pathname.startsWith(l.match);
            return (
              <NavLink key={l.to} to={l.to} aria-current={active ? 'page' : undefined} className={`${active ? 'active' : ''} ${l.extra ? 'nav-extra' : ''}`}>
                {l.label}
                {active && <motion.span layoutId="nav-underline" className="nav-underline" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              </NavLink>
            );
          })}
        </nav>
        <div className="header-actions">
          <button className="search-trigger" aria-label="Search documentation" onClick={onSearch}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" /><path d="m12 12 5 5" stroke="currentColor" /></svg>
            <span>Search</span>
            <kbd>{isMac ? '⌘ K' : 'Ctrl K'}</kbd>
          </button>
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <a className="github-link" href={ORG} target="_blank" rel="noopener noreferrer">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>
            GitHub <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </motion.header>
  );
}
