import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import VoxelSpecimen from '../components/VoxelSpecimen.jsx';
import Magnetic from '../components/Magnetic.jsx';
import ScrambleText from '../components/ScrambleText.jsx';
import Reveal, { WordReveal } from '../components/Reveal.jsx';
import RingLogo from '../components/RingLogo.jsx';
import External from '../components/External.jsx';
import { ProjectsSection } from '../components/ProjectsSection.jsx';
import { ORG } from '../data/site.js';

const ease = [0.22, 1, 0.36, 1];

function Hero() {
  const lines = [<>Minecraft.</>, <>From the</>, <span className="red glitch" data-text="void.">void.</span>];
  return (
    <section className="hero">
      <div className="hero-copy">
        <motion.div className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <span className="signal" />
          <ScrambleText text="AN INDEPENDENT MINECRAFT WORKSHOP" />
        </motion.div>
        <h1 aria-label="Minecraft. From the void.">
          {lines.map((line, i) => (
            <span className="line-mask" key={i} aria-hidden="true">
              <motion.span
                className="line"
                initial={{ y: '105%', rotate: 2 }}
                animate={{ y: '0%', rotate: 0 }}
                transition={{ duration: 0.9, delay: 0.15 + i * 0.12, ease }}
              >
                {line}
              </motion.span>
            </span>
          ))}
        </h1>
        <motion.p className="hero-description" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 0.7, ease }}>
          <strong>Mods, loaders, proxies, and the ideas in between.</strong>
          <br />A small corner of the internet for building beneath the surface. Welcome to pustka.
        </motion.p>
        <motion.div className="hero-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.75, duration: 0.7, ease }}>
          <Magnetic>
            <Link className="button" to="/projects">Explore the projects <span className="button-arrow">↗</span></Link>
          </Magnetic>
          <Link className="text-link arrow-link" to="/docs/relay">Read the docs <span>→</span></Link>
        </motion.div>
        <motion.p className="hero-footnote" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
          pustka <span style={{ color: 'var(--red)' }}>/</span> Polish, noun. Emptiness. The void.
        </motion.p>
      </div>
      <motion.div className="hero-visual" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.1, ease }}>
        <VoxelSpecimen />
      </motion.div>
      <motion.div className="scroll-cue" aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.6 }}>
        <span>SCROLL</span><i />
      </motion.div>
    </section>
  );
}

const docIndex = [
  {
    label: 'Start here',
    links: [
      ['/docs/relay', 'Introduction', 'What Relay is and how it routes players.'],
      ['/docs/quickstart', 'Quick start', 'From the source to your first backend.'],
      ['/docs/compatibility', 'Compatibility', 'Minecraft versions, and how sure each one is.'],
    ],
  },
  {
    label: 'Integrate',
    links: [
      ['/docs/backend', 'Backend API', 'BungeeCord-compatible plugin messaging.'],
      ['/docs/client', 'Client API', 'A negotiated protocol for client mods.'],
      ['/docs/packets', 'Typed packets', 'Typed messages between backends.'],
      ['/api', 'Dashboard API', 'HTTP and WebSocket routes for your network.'],
    ],
  },
  {
    label: 'Tools & reference',
    links: [
      ['/docs/configuration', 'Config builder', 'Generate relay.toml and the Paper files.'],
      ['/docs/protocol-ids', 'Protocol IDs', 'Packet ids for every protocol version.'],
      ['/changelog', 'Changelog', 'Every change, from the commit history.'],
      ['/help', 'Help', 'Diagnose a setup, report an issue, FAQ.'],
    ],
  },
];

function DocsIndex() {
  return (
    <section className="docs-index" aria-labelledby="docs-index-title">
      <div className="section-heading">
        <div>
          <p className="section-label">02 / THE DOCUMENTATION</p>
          <h2 id="docs-index-title">Less guessing. More building.</h2>
        </div>
        <p className="docs-index-sub">Short guides first, with the full upstream reference behind each one.</p>
      </div>
      <Reveal className="docs-index-grid">
        {docIndex.map((col) => (
          <div key={col.label} className="docs-index-col">
            <h3>{col.label}</h3>
            <ul>
              {col.links.map(([to, title, body]) => (
                <li key={to}>
                  <Link to={to}>
                    <span className="docs-index-title">{title}<span className="docs-index-arrow" aria-hidden="true">→</span></span>
                    <span className="docs-index-body">{body}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

function Manifesto() {
  return (
    <section className="manifesto">
      <div className="void-symbol" aria-hidden="true"><RingLogo size={70} /></div>
      <div>
        <WordReveal text="There’s room for your kind of strange." />
        <Reveal as="p" delay={0.25}>A mod that changes one thing. A loader that tries another way. A piece of infrastructure nobody has built yet. It starts somewhere.</Reveal>
      </div>
      <Magnetic>
        <External href={ORG} className="button button-ghost">Find us on GitHub <span className="button-arrow">↗</span></External>
      </Magnetic>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <div className="container"><Hero /></div>
      <div className="container">
        <ProjectsSection />
        <DocsIndex />
        <Manifesto />
      </div>
    </>
  );
}
