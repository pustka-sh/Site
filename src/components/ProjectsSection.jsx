import { Link } from 'react-router-dom';
import Topology from './Topology.jsx';
import Reveal, { WordReveal } from './Reveal.jsx';
import External from './External.jsx';
import { ORG, SOURCE } from '../data/site.js';
import ProjectStats from './ProjectStats.jsx';

// Compact facts about Relay; the details live on the linked reference pages.
const meta = [
  ['Runtime', 'Java · JDK 21+', null],
  ['Minecraft', '1.20.2 – 1.21.8', '/docs/compatibility'],
  ['Backends', 'Paper, modern forwarding', '/docs/quickstart'],
  ['Integrations', 'Backend · Client · Packets · Dashboard', '/docs/backend'],
];

function ProjectRegister() {
  return (
    <Reveal>
      <article className="project-register">
        <div className="project-number">/01</div>
        <div className="project-copy">
          <p className="micro"><span className="live-dot" aria-hidden="true" /> NETWORK INFRASTRUCTURE · IN THE OPEN</p>
          <h3>Relay<span style={{ color: 'var(--red)' }}>.</span></h3>
          <p>A Minecraft server proxy, built in Java. Connect players, route between backends, and keep your network in view.</p>
          <dl className="project-meta">
            {meta.map(([term, value, to]) => (
              <div key={term}>
                <dt>{term}</dt>
                <dd>{to ? <Link to={to}>{value}</Link> : value}</dd>
              </div>
            ))}
          </dl>
          <ProjectStats />
          <div className="project-links">
            <Link to="/docs/relay" className="arrow-link">Read the docs <span>→</span></Link>
            <Link to="/docs/configuration" className="arrow-link">Build a config <span>→</span></Link>
            <External href={SOURCE}>Source ↗</External>
          </div>
        </div>
        <Topology />
      </article>
    </Reveal>
  );
}

export function ProjectsSection({ showHeading = true }) {
  return (
    <section className="projects-section" id="projects">
      {showHeading && (
        <div className="section-heading">
          <div>
            <p className="section-label">01 / THE WORK</p>
            <WordReveal text="Out of the void." />
          </div>
          <External href={ORG} className="text-link">All repositories ↗</External>
        </div>
      )}
      <ProjectRegister />
      <p className="register-note">
        <span aria-hidden="true">∅</span>
        The register has room for more. New projects land here, and on GitHub first.
        <External href={ORG}>Watch the organization ↗</External>
      </p>
    </section>
  );
}
