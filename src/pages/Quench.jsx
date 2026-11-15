import { Link } from 'react-router-dom';
import Reveal, { WordReveal } from '../components/Reveal.jsx';
import External from '../components/External.jsx';

export default function Quench() {
  return (
    <div className="container quench-page">
      <header className="page-intro">
        <Link className="text-link" to="/projects">← All projects</Link>
        <p className="section-label">QUENCH / A PUSTKA PROJECT / IN DEVELOPMENT</p>
        <WordReveal as="h1" text="Push Minecraft further." />
        <p>Quench is a performance-focused Minecraft mod loader. Built around one goal: pushing Minecraft to its optimization limits.</p>
        <div className="project-links">
          <a className="button" href="#performance">Explore the performance notes <span aria-hidden="true">↓</span></a>
          <a className="text-link" href="#status">Development status →</a>
        </div>
      </header>
      <Reveal>
        <section className="quench-section" id="performance" aria-labelledby="performance-title">
          <div>
            <p className="section-label">01 / PERFORMANCE</p>
            <h2 id="performance-title">An early signal.<br />A benchmark still to prove.</h2>
          </div>
          <div>
            <p>The developer reports approximately 20% improvements over Fabric across multiple metrics in early testing. These are preliminary findings, not a universal speed guarantee.</p>
            <p>A public benchmark dataset and reproducible methodology are not available on this page yet. Results need to be reported separately by metric, with the hardware, versions, workloads, and test conditions alongside them.</p>
            <p>Startup time, frame rate, memory usage, and server tick time measure different things. A single percentage cannot describe every Minecraft setup.</p>
          </div>
        </section>
      </Reveal>
      <Reveal>
        <section className="quench-section" id="status" aria-labelledby="status-title">
          <div>
            <p className="section-label">02 / DEVELOPMENT</p>
            <h2 id="status-title">Taking shape.</h2>
          </div>
          <dl className="quench-status">
            <div><dt>Availability</dt><dd>In development. A public download and installation guide are not listed here yet.</dd></div>
            <div><dt>Compatibility</dt><dd>Supported Minecraft versions and mod compatibility are still to be documented here. Existing Fabric mods should not be assumed to work unchanged.</dd></div>
            <div><dt>Benchmarks</dt><dd>Early developer-reported results. Published measurements and independent reproduction remain the next steps for substantiating the performance claim.</dd></div>
          </dl>
        </section>
      </Reveal>
      <section className="quench-section" aria-labelledby="resources-title">
        <div>
          <p className="section-label">03 / THE WORKSHOP</p>
          <h2 id="resources-title">Built at pustka.</h2>
        </div>
        <div>
          <p>Quench is part of the same workshop as Relay. Explore the other projects and the infrastructure behind our Java work.</p>
          <div className="project-links">
            <Link className="arrow-link" to="/projects">Explore the projects <span>→</span></Link>
            <External href="https://maven.pustka.sh">Pustka Maven ↗</External>
          </div>
          <p className="quench-resource-note">The Maven repository is shared Pustka infrastructure; this link does not imply that Quench artifacts are available.</p>
        </div>
      </section>
    </div>
  );
}
