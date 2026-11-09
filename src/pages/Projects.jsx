import { motion } from 'motion/react';
import Reveal, { WordReveal } from '../components/Reveal.jsx';
import External from '../components/External.jsx';
import { ProjectsSection } from '../components/ProjectsSection.jsx';
import { useRelayContent } from '../lib/useRelayContent.js';
import { SOURCE } from '../data/site.js';

const statusLabel = { working: 'WORKING', partial: 'IN PART', planned: 'NOT STARTED' };

function Roadmap() {
  const data = useRelayContent();
  if (!data?.phases?.length) return null;
  const done = data.phases.filter((p) => p.status === 'working').length;
  return (
    <section className="roadmap" aria-label="Relay roadmap">
      <div className="section-heading">
        <div>
          <p className="section-label">RELAY / ROADMAP</p>
          <WordReveal as="h2" text="Where Relay is." />
        </div>
        <External href={`${SOURCE}#status`} className="text-link">Status in the README ↗</External>
      </div>
      <div className="roadmap-track">
        <motion.span
          className="roadmap-fill"
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: done / data.phases.length }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden="true"
        />
      </div>
      <ol className="roadmap-phases">
        {data.phases.map((p, i) => (
          <Reveal as="li" key={p.n} delay={i * 0.08} className={`phase phase-${p.status}`}>
            <span className="phase-n">{String(p.n).padStart(2, '0')}</span>
            <h3>{p.name}</h3>
            <span className={`badge badge-${p.status}`}>{statusLabel[p.status]}</span>
            <p className="phase-scope">{p.scope}</p>
            <p className="phase-state">{p.state}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

export default function Projects() {
  return (
    <div className="container projects-page">
      <header className="page-intro">
        <p className="section-label">THE PROJECT REGISTER</p>
        <WordReveal as="h1" text="Built here. Open to everyone." />
        <Reveal as="p" delay={0.2}>A workshop for Minecraft mods, loaders, proxies, and tools. Start with the software taking shape in the open.</Reveal>
      </header>
      <ProjectsSection showHeading={false} />
      <Roadmap />
    </div>
  );
}
