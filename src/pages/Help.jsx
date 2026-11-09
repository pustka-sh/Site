import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import Reveal, { WordReveal } from '../components/Reveal.jsx';
import TiltCard from '../components/TiltCard.jsx';
import CodeBlock from '../components/CodeBlock.jsx';
import External from '../components/External.jsx';
import Magnetic from '../components/Magnetic.jsx';
import { faq, ISSUES, SOURCE } from '../data/site.js';

function Question({ item }) {
  const [open, setOpen] = useState(() => window.location.hash === `#faq-${item.id}`);
  return (
    <div className={`faq-item ${open ? 'open' : ''}`} id={`faq-${item.id}`}>
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{item.q}</span>
        <motion.span className="endpoint-toggle" animate={{ rotate: open ? 45 : 0 }} aria-hidden="true">+</motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="faq-answer">
            <p>{item.a} <Link to={item.to} className="arrow-link">Read more <span>→</span></Link></p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const checklist = [
  ['Relay version', <>The commit you built: <code>git rev-parse --short HEAD</code></>],
  ['Minecraft and Paper versions', 'For the client and every backend involved.'],
  ['What doctor says', <>The output of <code>py relay.py doctor --live</code>.</>],
  ['Your relay.toml', <>With <code>forwarding-secret</code> removed. Never post the secret.</>],
  ['The log lines', <>Each session has a short <code>routeId</code> that ties its log lines together.</>],
  ['What you expected', 'And what happened instead, step by step.'],
];

export default function Help() {
  return (
    <div className="container help-page">
      <header className="page-intro">
        <p className="section-label">HELP</p>
        <WordReveal as="h1" text="Stuck? Start here." />
        <Reveal as="p" delay={0.2}>Most Relay problems are a config mismatch that fails silently. Find it first, then ask with everything someone needs to help.</Reveal>
      </header>

      <section className="help-section" aria-labelledby="diagnose">
        <div className="help-copy">
          <p className="section-label">01 / DIAGNOSE</p>
          <h2 id="diagnose">Before blaming the code, run doctor.</h2>
          <p>It cross-checks Relay’s config against each backend’s Paper config: a forwarding secret that differs by one character (compared by hash, so neither is printed), a PROXY protocol setting on one side only, a backend left in online mode.</p>
          <p><code>--live</code> checks the running stack instead: a real ping, the control channel, the dashboard, backend health, and whether each backend’s Relay plugin matches the current build.</p>
        </div>
        <Reveal delay={0.1}>
          <CodeBlock code={'py relay.py link lobby /path/to/paper-server\npy relay.py doctor\npy relay.py doctor --live'} />
        </Reveal>
      </section>

      <section className="help-section" aria-labelledby="report">
        <div className="help-copy">
          <p className="section-label">02 / REPORT</p>
          <h2 id="report">Open an issue with the details.</h2>
          <p>Relay’s issue tracker on GitHub is the place for bugs, questions and ideas. A good report gets a faster answer.</p>
          <Magnetic><External href={`${ISSUES}/new`} className="button">Open an issue <span className="button-arrow">↗</span></External></Magnetic>
        </div>
        <ul className="checklist">
          {checklist.map(([title, body], i) => (
            <Reveal as="li" key={title} delay={i * 0.06}>
              <span className="check" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <div><b>{title}</b><p>{body}</p></div>
            </Reveal>
          ))}
        </ul>
      </section>

      <section className="help-section" aria-labelledby="contribute">
        <div className="help-copy">
          <p className="section-label">03 / CONTRIBUTE</p>
          <h2 id="contribute">Build it, test it, send it.</h2>
          <p>Relay is open source. The README and <External href={`${SOURCE}/blob/main/relay-proxy-dashboard-spec.md`}>the design spec ↗</External> explain why things are the way they are; the tests cover the wire format, codecs, config and forwarding.</p>
        </div>
        <div className="contribute-grid">
          <Reveal><CodeBlock code={'git clone https://github.com/pustka-sh/Relay.git\ncd Relay\n./gradlew build\n./gradlew test'} /></Reveal>
          <TiltCard className="surface-card help-card" max={5}>
            <External href={SOURCE} className="surface-link">
              <span className="surface-n">GITHUB</span>
              <span className="surface-glyph" aria-hidden="true">⑂</span>
              <h3>Fork it on GitHub</h3>
              <p>Changes land through pull requests on the Relay repository.</p>
              <span className="surface-go">pustka-sh/Relay <span aria-hidden="true">↗</span></span>
            </External>
          </TiltCard>
        </div>
      </section>

      <section className="help-section faq" aria-labelledby="faq">
        <div className="help-copy">
          <p className="section-label">04 / QUESTIONS</p>
          <h2 id="faq">Asked before.</h2>
          <p>Answers drawn from Relay’s README. Each links to the full explanation.</p>
        </div>
        <div className="faq-list">
          {faq.map((item, i) => <Reveal key={item.id} delay={i * 0.04} y={12}><Question item={item} /></Reveal>)}
        </div>
      </section>
    </div>
  );
}
