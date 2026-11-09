import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import Topology from './Topology.jsx';
import TiltCard from './TiltCard.jsx';
import Reveal, { WordReveal } from './Reveal.jsx';
import External from './External.jsx';
import ScrambleText from './ScrambleText.jsx';
import { ORG, SOURCE } from '../data/site.js';

function ProjectRegister() {
  return (
    <Reveal>
      <TiltCard className="project-register" max={3}>
        <div className="project-number">/01</div>
        <div className="project-copy">
          <p className="micro"><span className="live-dot" aria-hidden="true" /> NETWORK INFRASTRUCTURE · IN THE OPEN</p>
          <h3>Relay<span style={{ color: 'var(--red)' }}>.</span></h3>
          <p>A Minecraft server proxy, built in Java. Connect players, route between backends, and keep your network in view.</p>
          <div className="project-tags">
            {['Java', 'JDK 21+', 'Paper backends', 'MC 1.20.2–1.21.8'].map((t, i) => (
              <motion.span key={t} initial={{ opacity: 0, y: 6 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.06 }}>{t}</motion.span>
            ))}
          </div>
          <div className="project-links">
            <Link to="/docs/relay" className="arrow-link">Read the docs <span>→</span></Link>
            <Link to="/api" className="arrow-link">API reference <span>→</span></Link>
            <External href={SOURCE}>Source ↗</External>
          </div>
        </div>
        <Topology />
      </TiltCard>
    </Reveal>
  );
}

function Upcoming() {
  return (
    <Reveal className="project-register project-next" delay={0.1}>
      <div className="project-number">/02</div>
      <div className="project-copy">
        <p className="micro">NEXT SLOT</p>
        <h3 className="ghost-title"><ScrambleText text="∅ unannounced" /></h3>
        <p>The register has room for more. When something new is ready to share, it lands here — and on GitHub first.</p>
        <div className="project-links"><External href={ORG}>Watch the organization ↗</External></div>
      </div>
      <div className="next-visual" aria-hidden="true">
        {Array.from({ length: 24 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 0.37) % 3}s` }} />)}
      </div>
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
      <Upcoming />
      <p className="under-register">Built in the open. Follow the source as it takes shape.</p>
    </section>
  );
}
