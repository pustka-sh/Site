import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import SearchPalette from './components/SearchPalette.jsx';
import VoidField from './components/VoidField.jsx';
import CursorGlow from './components/CursorGlow.jsx';
import ScrollProgress from './components/ScrollProgress.jsx';
import BackToTop from './components/BackToTop.jsx';
import IntroLoader from './components/IntroLoader.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import Home from './pages/Home.jsx';
import { useKonami } from './hooks/useKonami.js';
import { useTheme } from './hooks/useTheme.js';
import { pages } from './data/site.js';
import { SharedConfig } from './components/ConfigBuilder.jsx';

// Everything but the home page loads on demand, so the first visit downloads less.
const Projects = lazy(() => import('./pages/Projects.jsx'));
const Docs = lazy(() => import('./pages/Docs.jsx'));
const Changelog = lazy(() => import('./pages/Changelog.jsx'));
const Help = lazy(() => import('./pages/Help.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));
const Tools = lazy(() => import('./pages/Tools.jsx'));
const Releases = lazy(() => import('./pages/Releases.jsx'));
const Live = lazy(() => import('./pages/Live.jsx'));
const PublishedDocs = lazy(() => import('./pages/PublishedDocs.jsx'));
const DocsProjects = lazy(() => import('./pages/PublishedDocs.jsx').then(module=>({default:module.DocsProjects})));
const DocsHome = lazy(() => import('./pages/DocsHome.jsx'));
const RelayLab = lazy(() => import('./pages/RelayLab.jsx'));
const Journal = lazy(() => import('./pages/Journal.jsx'));
const DocumentationCompare = lazy(() => import('./pages/DocumentationCompare.jsx'));

function RelayDocumentationHome(){
  const {hash}=useLocation();
  const legacy=hash.startsWith('#ref-')||['#overview','#requirements','#full-reference'].includes(hash);
  return legacy?<Navigate to={`/docs/introduction${hash}`} replace/>:<DocsHome/>;
}

function Page({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -12, filter: 'blur(4px)' }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <Suspense fallback={<div className="page-loading" aria-busy="true" />}>{children}</Suspense>
    </motion.div>
  );
}

function VoidModeNotice({ active }) {
  const toast = useToast();
  const previous = useRef(active);
  useEffect(() => {
    if (previous.current === active) return;
    previous.current = active;
    toast(active ? 'Void mode engaged. ∅' : 'Back to the surface.');
  }, [active, toast]);
  return null;
}

/** Scrolls to the top on navigation, or to the #section a link names once it has rendered. */
function ScrollManager() {
  const { pathname, hash, key } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      return;
    }
    const id = decodeURIComponent(hash.slice(1));
    let tries = 0;
    const attempt = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      else if (tries++ < 80) setTimeout(attempt, 50);
    };
    setTimeout(attempt, 60);
  }, [pathname, hash, key]);
  return null;
}

export default function App() {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const voidMode = useKonami();
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const page = pages.find((p) => p.path === path);
    if (page) document.title = page.title;
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e) => {
      const typing = e.target.closest?.('input, textarea, select, [contenteditable]');
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((open) => !open);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('void-mode', voidMode);
  }, [voidMode]);

  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <VoidModeNotice active={voidMode} />
        <ScrollManager />
        <IntroLoader />
        <VoidField intense={voidMode} />
        <CursorGlow />
        <ScrollProgress />
        <a href="#content" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('content')?.focus(); }}>Skip to content</a>
        <Header onSearch={() => setSearchOpen(true)} theme={theme} onToggleTheme={toggleTheme} />
        <main id="content" tabIndex={-1}>
          <AnimatePresence mode="wait" initial={false}>
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<Page><Home /></Page>} />
              <Route path="/projects" element={<Page><Projects /></Page>} />
              <Route path="/changelog" element={<Page><Changelog /></Page>} />
              <Route path="/journal" element={<Page><Journal /></Page>} />
              <Route path="/journal/:slug" element={<Page><Journal /></Page>} />
              <Route path="/help" element={<Page><Help /></Page>} />
              <Route path="/tools" element={<Page><Tools /></Page>} />
              <Route path="/releases" element={<Page><Releases /></Page>} />
              <Route path="/live" element={<Page><Live /></Page>} />
              <Route path="/lab/relay" element={<Page><RelayLab /></Page>} />
              <Route path="/c/:id" element={<Page><SharedConfig /></Page>} />
              <Route path="/docs" element={<Navigate to="/docs/projects" replace />} />
              <Route path="/docs/projects" element={<Page><DocsProjects /></Page>} />
              <Route path="/docs/relay" element={<Page><RelayDocumentationHome /></Page>} />
              <Route path="/docs/:project/compare" element={<Page><DocumentationCompare /></Page>} />
              <Route path="/docs/:project/:version" element={<Page><PublishedDocs /></Page>} />
              <Route path="/docs/:project/:version/:slug" element={<Page><PublishedDocs /></Page>} />
              <Route path="/docs/api" element={<Navigate to="/api" replace />} />
              <Route path="/docs/:slug" element={<Page><Docs /></Page>} />
              <Route path="/api" element={<Page><Docs api /></Page>} />
              <Route path="*" element={<Page><NotFound /></Page>} />
            </Routes>
          </AnimatePresence>
        </main>
        <Footer />
        <BackToTop />
        <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      </ToastProvider>
    </MotionConfig>
  );
}
