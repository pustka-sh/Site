import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { displayDate, githubUrl, siteApi, useCapabilities } from '../lib/siteApi.js';
import External from '../components/External.jsx';

const failure = (error) => error.message || 'The check could not be completed. Please try again.';

function ServiceMessage({ error, loading }) {
  return <p className="service-message" role="status">{loading ? 'Connecting to the workshop…' : error?.message || 'This tool needs the workshop backend to be available.'}</p>;
}

function ServerChecker({ available }) {
  const [address, setAddress] = useState('');
  const [state, setState] = useState({ loading: false, result: null, error: null });
  const run = async (event) => {
    event.preventDefault();
    setState({ loading: true, result: null, error: null });
    try {
      const result = await siteApi('/server-check', { method: 'POST', body: { address: address.trim() } });
      setState({ loading: false, result, error: null });
    } catch (error) { setState({ loading: false, result: null, error: failure(error) }); }
  };
  const result = state.result;
  const icon = typeof result?.icon === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]{1,100000}$/.test(result.icon) ? result.icon : null;
  return (
    <section className="workshop-tool" id="server-check" aria-labelledby="server-check-title">
      <div className="tool-intro"><p className="section-label">01 / SERVER CHECKER</p><h2 id="server-check-title">Is your world listening?</h2><p>Ping a public Minecraft Java server and compare its reported version with Relay’s compatibility data.</p></div>
      <div className="tool-workspace">
        <form onSubmit={run} className="tool-form">
          <label htmlFor="minecraft-address">Minecraft server address</label>
          <div className="tool-input-action"><input id="minecraft-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="play.example.com" maxLength={260} autoComplete="off" spellCheck="false" required disabled={!available || state.loading} /><button type="submit" className="button" disabled={!available || state.loading}>{state.loading ? 'Checking…' : 'Check server →'}</button></div>
          <p className="field-hint">A public hostname or IP, with an optional port. Private network addresses cannot be checked.</p>
        </form>
        <div className="tool-result" aria-live="polite" aria-busy={state.loading}>
          {state.loading && <p className="tool-loading">Sending a Minecraft status request…</p>}
          {state.error && <p className="tool-error" role="alert">{state.error}</p>}
          {result && <>
            <div className="server-result-head">{icon && <img src={icon} width="64" height="64" alt="Server icon" />}<div><span className={`status-badge ${result.online ? 'status-pass' : 'status-warn'}`}>{result.online ? 'Online' : 'Unreachable'}</span><h3>{result.address || address}</h3></div></div>
            {result.online && <>
              <p className="server-motd">{result.motd || 'No message of the day.'}</p>
              <dl className="result-facts"><div><dt>Version</dt><dd>{result.version?.name || 'Not reported'}</dd></div><div><dt>Protocol</dt><dd>{result.version?.protocol ?? '—'}</dd></div><div><dt>Players</dt><dd>{result.players?.online ?? '—'} / {result.players?.max ?? '—'}</dd></div><div><dt>Latency</dt><dd>{Number.isFinite(result.latencyMs) ? `${Math.round(result.latencyMs)} ms` : '—'}</dd></div></dl>
              <div className="compatibility-result"><span className={`status-badge ${result.compatibility?.supported === true ? 'status-pass' : 'status-warn'}`}>{result.compatibility?.supported === true ? 'Listed by Relay' : result.compatibility?.supported === false ? 'Outside Relay’s listed range' : 'Compatibility unknown'}</span><p>{result.compatibility?.note || 'The server response identifies a protocol; it does not verify the full join and switching path.'}</p><Link className="text-link" to="/docs/compatibility">Read the compatibility details →</Link></div>
            </>}
          </>}
          {!state.loading && !state.error && !result && <p className="tool-empty">The response will appear here. A status ping does not join the server or log in.</p>}
        </div>
      </div>
    </section>
  );
}

function SetupChecker({ available }) {
  const [files, setFiles] = useState({ relayToml: '', paperYaml: '', serverProperties: '' });
  const [state, setState] = useState({ loading: false, result: null, error: null });
  const setFile = (name) => (event) => setFiles((previous) => ({ ...previous, [name]: event.target.value }));
  const run = async (event) => {
    event.preventDefault();
    setState({ loading: true, result: null, error: null });
    try {
      if (Object.values(files).some((value) => new TextEncoder().encode(value).byteLength > 24576)) throw new Error('Each configuration file must be no larger than 24 KiB.');
      const result = await siteApi('/setup-check', { method: 'POST', body: files });
      setState({ loading: false, result, error: null });
    } catch (error) { setState({ loading: false, result: null, error: failure(error) }); }
  };
  return (
    <section className="workshop-tool" id="setup-check" aria-labelledby="setup-check-title">
      <div className="tool-intro"><p className="section-label">02 / SETUP CHECKER</p><h2 id="setup-check-title">Find the mismatch.</h2><p>Compare one Relay config with one Paper backend. Check forwarding, authentication, and PROXY protocol settings before starting the network.</p><p className="privacy-note">Files are processed for this check and are not saved. The report does not repeat your forwarding secret. Maximum 24 KiB per file.</p></div>
      <div className="tool-workspace">
        <form className="tool-form setup-form" onSubmit={run}>
          {[['relayToml', 'relay.toml', 'bind = "0.0.0.0:25565"\nforwarding-mode = "modern"\n…'], ['paperYaml', 'config/paper-global.yml', 'proxies:\n  velocity:\n    enabled: true\n    …'], ['serverProperties', 'server.properties', 'online-mode=false\n…']].map(([key, label, placeholder]) => <label key={key} className="setup-file"><span>{label}</span><textarea value={files[key]} onChange={setFile(key)} placeholder={placeholder} rows={7} maxLength={24576} autoComplete="off" spellCheck="false" required disabled={!available || state.loading} /></label>)}
          <div className="tool-form-actions"><button className="button" type="submit" disabled={!available || state.loading}>{state.loading ? 'Comparing…' : 'Check setup →'}</button><button type="button" className="text-link" onClick={() => { setFiles({ relayToml: '', paperYaml: '', serverProperties: '' }); setState({ loading: false, result: null, error: null }); }} disabled={state.loading}>Clear files</button></div>
        </form>
        <div className="setup-report" aria-live="polite" aria-busy={state.loading}>
          {state.error && <p className="tool-error" role="alert">{state.error}</p>}
          {state.result && <><h3>{state.result.ok ? 'The checked settings agree.' : 'There are settings to review.'}</h3>{typeof state.result.summary === 'string' && <p>{state.result.summary}</p>}<ol className="setup-checks">{(state.result.checks || []).map((check) => <li key={check.id} className={`check-${check.status}`}><span className={`status-badge status-${check.status}`}>{check.status === 'pass' ? 'Pass' : check.status === 'fail' ? 'Mismatch' : 'Review'}</span><div><h4>{check.title}</h4><p>{check.detail}</p></div></li>)}</ol><p className="field-hint">This compares the pasted settings. Run <code>py relay.py doctor --live</code> to check a running network.</p></>}
        </div>
      </div>
    </section>
  );
}

export function ProjectRegistry() {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    siteApi('/projects', { signal: controller.signal }).then((data) => setState({ loading: false, data, error: null })).catch((error) => { if (error.name !== 'AbortError') setState({ loading: false, data: null, error: error.message }); });
    return () => controller.abort();
  }, []);
  return <section className="registry-section" id="registry" aria-labelledby="registry-title"><div className="section-heading"><div><p className="section-label">03 / PROJECT REGISTRY</p><h2 id="registry-title">The workshop, in the open.</h2></div></div><p className="registry-intro">Project details are fetched through the site and cached briefly. Your browser does not call the GitHub API.</p>{state.data?.notice && <p className="service-message" role="status">{state.data.notice}</p>}{state.loading && <p className="service-message" role="status">Loading project details…</p>}{state.error && <p className="tool-error">{state.error} <External href="https://github.com/pustka-sh">Browse the organization ↗</External></p>}<div className="registry-list">{(state.data?.projects || []).map((project) => <article key={project.id} className="registry-project"><div><p className="micro">{project.category || 'Minecraft software'}</p><h3>{project.name}</h3><p>{project.description}</p><div className="registry-links">{githubUrl(project.repository) && <External href={project.repository}>Source ↗</External>}{project.id === 'relay' && <Link to="/docs/relay">Docs →</Link>}<Link to={`/releases?project=${encodeURIComponent(project.id)}`}>Releases →</Link></div></div><dl className="result-facts"><div><dt>Stars</dt><dd>{project.stats?.stars ?? '—'}</dd></div><div><dt>Open issues</dt><dd>{project.stats?.openIssues ?? '—'}</dd></div><div><dt>Latest change</dt><dd>{project.stats?.lastCommitAt ? displayDate(project.stats.lastCommitAt) : 'Not available'}</dd></div><div><dt>Latest release</dt><dd>{project.latestRelease?.tag || (project.stats ? 'None published' : 'Not available')}</dd></div></dl></article>)}</div>{state.data?.updatedAt && <p className="data-timestamp">{state.data.stale ? 'Showing cached data · ' : 'Updated · '}{displayDate(state.data.updatedAt)}</p>}</section>;
}

export default function Tools() {
  const { loading, capabilities, error } = useCapabilities();
  return <div className="container workshop-page"><header className="page-intro"><p className="section-label">THE WORKBENCH</p><h1>Check the pieces.<br />Build with confidence.</h1><p>A public server ping, a config comparison, and a view into the projects behind pustka.</p><nav className="tool-jump-links" aria-label="Workbench sections"><a href="#server-check">Server checker ↓</a><a href="#setup-check">Setup checker ↓</a><a href="#registry">Project registry ↓</a></nav></header>{!capabilities && <ServiceMessage loading={loading} error={error} />}<ServerChecker available={Boolean(capabilities?.serverChecker)} /><SetupChecker available={Boolean(capabilities?.setupChecker)} /><ProjectRegistry /></div>;
}
