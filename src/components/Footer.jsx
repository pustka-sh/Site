import { Link } from 'react-router-dom';
import RingLogo from './RingLogo.jsx';
import { ORG, SOURCE } from '../data/site.js';

export default function Footer() {
  return (
    <footer className="site-footer-wrap">
      <div className="footer-giant" aria-hidden="true">pustka</div>
      <div className="site-footer">
        <div className="footer-brand">
          <Link className="footer-name" to="/"><RingLogo size={26} glow={false} /> pustka<span>.sh</span></Link>
          <p>From nothing, something.</p>
        </div>
        <nav className="footer-cols" aria-label="Footer navigation">
          <div className="footer-links">
            <span className="footer-head">WORKSHOP</span>
            <Link to="/projects">Projects</Link>
            <Link to="/docs/projects">Documentation</Link>
            <Link to="/journal">Workshop journal</Link>
            <Link to="/changelog">Changelog</Link>
          </div>
          <div className="footer-links">
            <span className="footer-head">RELAY</span>
            <Link to="/docs/relay">Relay docs home</Link>
            <Link to="/api">Dashboard API</Link>
            <Link to="/lab/relay">Relay Lab</Link>
            <Link to="/docs/configuration">Config builder</Link>
          </div>
          <div className="footer-links">
            <span className="footer-head">TOOLS & SUPPORT</span>
            <Link to="/tools">Workshop tools</Link>
            <Link to="/releases">Releases</Link>
            <Link to="/live">Live network</Link>
            <Link to="/help">Help</Link>
          </div>
          <div className="footer-links">
            <span className="footer-head">ELSEWHERE</span>
            <a href={ORG} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
            <a href={SOURCE} target="_blank" rel="noopener noreferrer">Relay source ↗</a>
            <a href={`${SOURCE}/issues`} target="_blank" rel="noopener noreferrer">Issues & feedback ↗</a>
            <a href="/feed.xml">RSS feed</a>
          </div>
        </nav>
        <div className="footer-note">
          <span className="footer-copyright">© 2026 pustka contributors. All rights reserved. <a href="/license.txt">License</a></span>
          <span className="footer-disclaimer">Independent Minecraft software. Not affiliated with Mojang or Microsoft.</span>
          <span className="footer-secret">↑↑↓↓←→←→ B A</span>
        </div>
      </div>
    </footer>
  );
}
