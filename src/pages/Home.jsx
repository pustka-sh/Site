import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import VoxelSpecimen from '../components/VoxelSpecimen.jsx';
import Marquee from '../components/Marquee.jsx';
import Magnetic from '../components/Magnetic.jsx';
import ScrambleText from '../components/ScrambleText.jsx';
import Reveal, { WordReveal } from '../components/Reveal.jsx';
import TiltCard from '../components/TiltCard.jsx';
import CountUp from '../components/CountUp.jsx';
import Terminal from '../components/Terminal.jsx';
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

const facts = [
  { value: 21, suffix: '+', label: 'JDK', note: 'Relay is built in Java and needs JDK 21 or newer.' },
  { value: 32768, suffix: ' B', label: 'CLIENT MESSAGE LIMIT', note: 'The size limit for each message on the client API, relay:api_v1.' },
  { value: 20, suffix: '/s', label: 'CLIENT MESSAGE RATE', note: 'The client API’s rate limit, in messages per second.' },
  { value: 3, suffix: '', label: 'INTEGRATION SURFACES', note: 'Backend messaging, the client mod protocol, and typed packets.' },
];

function Facts() {
  return (
    <section className="facts" aria-labelledby="facts-label">
      <Reveal className="facts-head">
        <p className="section-label" id="facts-label">RELAY / BY THE SPEC</p>
        <p className="facts-sub">Figures from the documentation, not from a marketing deck.</p>
      </Reveal>
      <div className="facts-grid">
        {facts.map((f, i) => (
          <Reveal key={f.label} delay={i * 0.08} className="fact">
            <div className="fact-value"><CountUp to={f.value} /><span>{f.suffix}</span></div>
            <p className="fact-label">{f.label}</p>
            <p className="fact-note">{f.note}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const surfaces = [
  { n: '01', title: 'Backend messaging', body: 'BungeeCord-compatible plugin messages on bungeecord:main and relay:main.', to: '/docs/backend', glyph: '⇄' },
  { n: '02', title: 'Client protocol', body: 'A negotiated, permission-checked conversation on relay:api_v1.', to: '/docs/client', glyph: '◇' },
  { n: '03', title: 'Typed packets', body: 'Shared registries and fingerprints for messages between backends.', to: '/docs/packets', glyph: '▤' },
  { n: '04', title: 'Dashboard API', body: 'HTTP and WebSocket routes for the network you run.', to: '/api', glyph: '◎' },
];

function Surfaces() {
  return (
    <section className="surfaces">
      <div className="section-heading">
        <div>
          <p className="section-label">02 / THE MOVING PARTS</p>
          <WordReveal text="Every seam, documented." />
        </div>
        <Link className="text-link arrow-link" to="/docs/relay">Start with the introduction <span>→</span></Link>
      </div>
      <div className="surface-grid">
        {surfaces.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.07}>
            <TiltCard className="surface-card">
              <Link to={s.to} className="surface-link">
                <span className="surface-n">{s.n}</span>
                <span className="surface-glyph" aria-hidden="true">{s.glyph}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <span className="surface-go">Read <span aria-hidden="true">→</span></span>
              </Link>
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Reading() {
  const rows = [
    { n: '01', title: 'Get Relay running', body: 'From the source to your first backend.', to: '/docs/quickstart' },
    { n: '02', title: 'Connect the pieces', body: 'Backend messages, client mods, typed packets.', to: '/docs/backend' },
    { n: '03', title: 'Read the API', body: 'The dashboard HTTP and WebSocket reference.', to: '/api' },
  ];
  return (
    <section className="reading-section">
      <div>
        <p className="section-label">03 / THE KNOWLEDGE</p>
        <WordReveal text="Less guessing. More building." />
        <Reveal as="p" delay={0.2}>The way in, the moving parts, and the contracts between them. Find the details that help you make something of your own.</Reveal>
        <Reveal delay={0.3}><Terminal /></Reveal>
      </div>
      <div className="reading-links">
        {rows.map((r, i) => (
          <Reveal key={r.n} delay={i * 0.08}>
            <Link className="reading-row" to={r.to}>
              <span>{r.n}</span>
              <div><h3>{r.title}</h3><p>{r.body}</p></div>
              <span className="row-arrow" aria-hidden="true">↗</span>
            </Link>
          </Reveal>
        ))}
        <Reveal delay={0.3} className="principles">
          <p className="section-label">HOW WE WORK</p>
          <ul>
            <li><b>Open source.</b> Built in the open, on GitHub.</li>
            <li><b>No tracking.</b> This site sets no cookies and calls no APIs.</li>
            <li><b>Honest docs.</b> Every guide links back to its upstream source.</li>
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

function Manifesto() {
  return (
    <section className="manifesto">
      <div className="void-symbol" aria-hidden="true"><RingLogo size={70} spin /></div>
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
      <div className="scope-strip">
        <Marquee items={['MODS', 'MODLOADERS', 'PROXIES', 'THE IN-BETWEEN']} note="A sandbox without an edge." />
      </div>
      <div className="container">
        <ProjectsSection />
        <Facts />
        <Surfaces />
        <Reading />
        <Manifesto />
      </div>
    </>
  );
}
