import { Link } from 'react-router-dom';
import RingLogo from './RingLogo.jsx';
import { ORG, SOURCE } from '../data/site.js';

export default function Footer() {
  return (
    <footer className="site-footer-wrap">
      <div className="footer-giant" aria-hidden="true">pustka</div>
      <div className="site-footer">
        <div>
          <Link className="footer-name" to="/"><RingLogo size={26} spin glow={false} /> pustka<span>.sh</span></Link>
          <p>From nothing, something.</p>
        </div>
        <div className="footer-cols">
          <div className="footer-links">
            <span className="footer-head">WORKSHOP</span>
            <Link to="/projects">Projects</Link>
            <Link to="/docs/relay">Documentation</Link>
            <Link to="/api">API reference</Link>
            <Link to="/docs/configuration">Config builder</Link>
            <Link to="/changelog">Changelog</Link>
            <Link to="/help">Help</Link>
          </div>
          <div className="footer-links">
            <span className="footer-head">ELSEWHERE</span>
            <a href={ORG} target="_blank" rel="noopener noreferrer">GitHub ↗</a>
            <a href={SOURCE} target="_blank" rel="noopener noreferrer">Relay source ↗</a>
            <a href={`${SOURCE}/issues`} target="_blank" rel="noopener noreferrer">Issues & feedback ↗</a>
          </div>
        </div>
        <div className="footer-note">
          Independent Minecraft software.<br />Not affiliated with Mojang or Microsoft.<br />
          <span className="footer-secret">↑↑↓↓←→←→ B A</span>
        </div>
      </div>
    </footer>
  );
}
