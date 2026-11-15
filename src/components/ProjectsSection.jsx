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
        <div className="project-number">/02</div>
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
      <Reveal>
        <article className="project-register quench-register">
          <div className="project-number">/01</div>
          <div className="project-copy">
            <p className="micro">MINECRAFT MOD LOADER · IN DEVELOPMENT</p>
            <h3>Quench<span style={{ color: 'var(--red)' }}>.</span></h3>
            <p>A performance-focused mod loader built to push Minecraft further. Less overhead is the goal. Measurement is how we get there.</p>
            <dl className="project-meta">
              <div><dt>Focus</dt><dd>Minecraft performance</dd></div>
              <div><dt>Status</dt><dd>In development</dd></div>
            </dl>
            <div className="project-links">
              <Link to="/projects/quench" className="arrow-link">Meet Quench <span>→</span></Link>
              <Link to="/projects/quench#performance" className="arrow-link">Performance notes <span>→</span></Link>
            </div>
          </div>
          <aside className="quench-note">
            <p className="section-label">THE DIRECTION</p>
            <h4>Push further.<br />Measure everything.</h4>
            <p>Early testing suggests improvements over Fabric. Explore the findings and what still needs validation.</p>
          </aside>
        </article>
      </Reveal>
      <ProjectRegister />
      <p className="register-note">
        <span aria-hidden="true">∅</span>
        The register has room for more. New projects land here, and on GitHub first.
        <External href={ORG}>Watch the organization ↗</External>
      </p>
    </section>
  );
}
