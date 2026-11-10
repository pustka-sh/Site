import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { displayDate, siteApi } from '../lib/siteApi.js';

const snapshotTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? displayDate(value) : new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'medium' }).format(date);
};

export default function Live() {
  const [state, setState] = useState({ loading: true, data: null, error: null, unconfigured: false });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    siteApi('/demo', { signal: controller.signal }).then((data) => setState({ loading: false, data, error: null, unconfigured: false })).catch((error) => { if (error.name !== 'AbortError') setState({ loading: false, data: null, error: error.message, unconfigured: error.code === 'NOT_CONFIGURED' }); });
    const timer = setTimeout(() => setReload((value) => value + 1), 30000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [reload]);
  const overview = state.data?.overview || {};
  const counts = [['Players online', overview.players ?? overview.playerCount ?? overview.onlinePlayers], ['Backends', overview.servers ?? overview.serverCount ?? overview.totalServers], ['Healthy backends', overview.serversUp ?? overview.healthyServers ?? overview.onlineServers], ['Groups', overview.groups ?? overview.groupCount]].filter(([, value]) => Number.isFinite(value));
  return <div className="container workshop-page live-page"><header className="page-intro"><p className="section-label">RELAY / LIVE NETWORK</p><h1>A window into the network.</h1><p>A read-only snapshot of a configured demo network. This view has no network controls and exposes no player identities.</p></header>{state.loading && <p className="service-message" role="status">Connecting to the demo…</p>}{state.error && <section className="honest-empty" role="status"><span aria-hidden="true">∅</span><h2>{state.unconfigured ? 'No demo is connected yet.' : 'The demo is unavailable.'}</h2><p>{state.error}</p><Link to="/docs/relay" className="text-link">Explore how Relay works →</Link></section>}{state.data && <>{state.data.stale && <p className="tool-error" role="status"><span className="status-badge status-warn">Cached snapshot</span> The demo could not be refreshed. Showing the last successful snapshot{state.data.updatedAt ? ` from ${snapshotTime(state.data.updatedAt)}` : ''}.</p>}<dl className="live-counts">{counts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="live-server-list"><div className="live-list-head"><h2>Backends</h2><span>Refreshes every 30 seconds</span></div>{(state.data.servers || []).map((server) => <article key={server.name}><span className={`status-badge ${server.online ? 'status-pass' : 'status-warn'}`}>{server.online ? 'Online' : 'Offline'}</span><h3>{server.name}</h3><span>{Number.isFinite(server.players) ? `${server.players} players` : 'Population unavailable'}</span><span>{Number.isFinite(server.latencyMs) ? `${Math.round(server.latencyMs)} ms` : '—'}</span></article>)}{!state.data.servers?.length && <p className="field-hint">No backends are included in this snapshot.</p>}</div>{state.data.updatedAt && <p className="data-timestamp">{state.data.stale ? 'Cached snapshot' : 'Snapshot'} · {snapshotTime(state.data.updatedAt)}</p>}</>}</div>;
}
