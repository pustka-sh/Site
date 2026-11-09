import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import CodeBlock from './CodeBlock.jsx';
import { useMedia } from '../hooks/useMedia.js';

/*
 * Builds relay.toml from the keys in Relay's own relay.default.toml, plus the
 * matching backend files. Everything happens in the browser: the forwarding
 * secret is generated locally and never sent anywhere.
 */

const balances = [
  ['least-players', 'Fewest players first. The default.'],
  ['round-robin', 'Each join takes the next member in turn.'],
  ['random', 'Cheap, stateless, even enough over many joins.'],
  ['resource-aware', 'Least loaded first, from TPS, tick time and heap the Relay plugin reports.'],
  ['weighted', 'Fewest players per unit of weight, for unequal machines.'],
  ['first-available', 'Configured order, always. Later members only catch failures.'],
];

const forwardingModes = [
  ['modern', 'Velocity-style, HMAC signed. Backends share the secret.'],
  ['legacy', 'BungeeCord-style, unsigned. Only safe when backend ports are unreachable from outside.'],
  ['none', 'No forwarding. Local testing only.'],
];

const newSecret = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

const tomlString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
const tomlKey = (k) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : tomlString(k));
const groupOf = (name) => name.replace(/[-_]\d+$/, '');
const validAddress = (a) => /^[^\s:]+:\d{1,5}$/.test(a.trim());

const initial = () => ({
  bind: '0.0.0.0:25565',
  motd: '<gradient:#ff2a2a:#ffb000><bold>My Network</bold></gradient>\n<gray>Powered by Relay',
  maxPlayers: 100,
  onlineMode: true,
  showOnlineCount: true,
  forwardingMode: 'modern',
  secret: newSecret(),
  secretInFile: false,
  servers: [
    { name: 'lobby', address: '127.0.0.1:25566', weight: 1 },
    { name: 'survival-01', address: '127.0.0.1:25567', weight: 1 },
    { name: 'survival-02', address: '127.0.0.1:25568', weight: 1 },
  ],
  tryList: 'lobby, survival',
  balance: 'least-players',
  clientApi: true,
  backendApi: true,
  fallback: true,
  interceptCommands: true,
  compressionThreshold: 256,
  compressionLevel: 3,
  proxyProtocolSend: false,
  proxyProtocolReceive: false,
  dashboard: false,
  dashboardPort: 8080,
  admin: '',
  forcedHosts: [],
});

function buildToml(c) {
  const L = [];
  const servers = c.servers.filter((s) => s.name.trim());
  const tryList = c.tryList.split(',').map((s) => s.trim()).filter(Boolean);
  L.push('# relay.toml — generated at pustka.sh/docs/configuration');
  L.push('# Top-level settings first: TOML reads any bare key after a [table] header as part of that table.');
  L.push('');
  L.push('# ---- network');
  L.push(`bind = ${tomlString(c.bind)}`);
  L.push(`motd = ${tomlString(c.motd)}`);
  L.push(`max-players = ${Number(c.maxPlayers) || 0}`);
  L.push(`show-online-count = ${c.showOnlineCount}`);
  L.push(`online-mode = ${c.onlineMode}`);
  L.push('');
  L.push('# ---- forwarding');
  L.push(`forwarding-mode = ${tomlString(c.forwardingMode)}`);
  if (c.forwardingMode !== 'none') {
    if (c.secretInFile) L.push('forwarding-secret-file = "forwarding.secret"');
    else L.push(`forwarding-secret = ${tomlString(c.secret)}`);
  }
  L.push('');
  L.push('# ---- routing');
  L.push(`try = [${tryList.map(tomlString).join(', ')}]`);
  L.push(`balance = ${tomlString(c.balance)}`);
  L.push(`fallback-on-backend-loss = ${c.fallback}`);
  L.push(`intercept-commands = ${c.interceptCommands}`);
  L.push('');
  L.push('# ---- apis');
  L.push(`client-api = ${c.clientApi}`);
  L.push(`backend-api = ${c.backendApi}`);
  L.push('');
  L.push('# ---- tuning');
  L.push(`compression-threshold = ${Number(c.compressionThreshold)}`);
  L.push(`compression-level = ${Number(c.compressionLevel)}`);
  L.push(`proxy-protocol-send = ${c.proxyProtocolSend}`);
  L.push(`proxy-protocol-receive = ${c.proxyProtocolReceive}`);
  if (c.dashboard) {
    L.push('');
    L.push('[control]');
    L.push('enabled = true');
    L.push('bind = "127.0.0.1:25580"');
    L.push('');
    L.push('[companions.dashboard]');
    L.push('command = ["java", "-jar", "companions/relay-dashboard.jar"]');
    L.push('');
    L.push('[companions.dashboard.environment]');
    L.push(`RELAY_DASHBOARD_PORT = ${tomlString(String(c.dashboardPort))}`);
  }
  L.push('');
  L.push('[servers]');
  servers.forEach((s) => {
    L.push(c.balance === 'weighted' && Number(s.weight) !== 1
      ? `${tomlKey(s.name.trim())} = { address = ${tomlString(s.address.trim())}, weight = ${Number(s.weight) || 1} }`
      : `${tomlKey(s.name.trim())} = ${tomlString(s.address.trim())}`);
  });
  const hosts = c.forcedHosts.filter((h) => h.host.trim() && h.server.trim());
  if (hosts.length) {
    L.push('');
    L.push('[forced-hosts]');
    hosts.forEach((h) => L.push(`${tomlString(h.host.trim())} = [${tomlString(h.server.trim())}]`));
  }
  L.push('');
  L.push('[permissions]');
  L.push('default = ["relay.command.server", "relay.command.glist"]');
  if (c.admin.trim()) L.push(`${tomlString(c.admin.trim())} = ["relay.*"]`);
  return `${L.join('\n')}\n`;
}

function buildPaper(c) {
  const lines = ['# config/paper-global.yml — merge into the existing file on every backend', 'proxies:'];
  if (c.forwardingMode === 'modern') {
    lines.push('  velocity:', '    enabled: true', '    online-mode: true', `    secret: '${c.secretInFile ? '<contents of forwarding.secret>' : c.secret}'`);
  }
  lines.push(`  proxy-protocol: ${c.proxyProtocolSend}`);
  return `${lines.join('\n')}\n`;
}

function buildProperties(c) {
  const lines = ['# server.properties — on every backend', '# The proxy has already authenticated the player.', 'online-mode=false'];
  if (c.forwardingMode === 'legacy') lines.push('', '# Legacy forwarding also needs, in spigot.yml:', '#   settings:', '#     bungeecord: true');
  return `${lines.join('\n')}\n`;
}

function warnings(c) {
  const w = [];
  const names = c.servers.map((s) => s.name.trim()).filter(Boolean);
  const groups = new Set(names.map(groupOf));
  const destinations = new Set([...names, ...groups]);
  if (!names.length) w.push(['error', 'Add at least one backend under [servers].']);
  c.servers.forEach((s) => {
    if (s.name.trim() && !validAddress(s.address)) w.push(['error', `“${s.name}” needs an address like 127.0.0.1:25566.`]);
  });
  const dupes = names.filter((n, i) => names.indexOf(n) !== i);
  if (dupes.length) w.push(['error', `Duplicate server name: ${[...new Set(dupes)].join(', ')}.`]);
  c.tryList.split(',').map((s) => s.trim()).filter(Boolean).forEach((t) => {
    if (!destinations.has(t)) w.push(['error', `“${t}” in try is not a server or group.`]);
  });
  if (!validAddress(c.bind)) w.push(['error', 'bind should look like 0.0.0.0:25565.']);
  if (!c.onlineMode) w.push(['warn', 'online-mode is off: anyone can log in as anyone.']);
  if (c.forwardingMode === 'legacy') w.push(['warn', 'Legacy forwarding is unsigned. Keep backend ports unreachable from outside your network.']);
  if (c.forwardingMode === 'none') w.push(['warn', 'No forwarding: for local testing only.']);
  if (c.proxyProtocolReceive) w.push(['warn', 'proxy-protocol-receive trusts the header completely. Only enable it when the bind port is reachable solely by your upstream proxy.']);
  if (c.balance === 'resource-aware') w.push(['info', 'resource-aware needs the Relay plugin on each backend to report load.']);
  if (c.dashboard) w.push(['info', 'The dashboard binds to loopback. Off loopback it requires accounts, or refuses to start.']);
  const grouped = [...groups].filter((g) => names.filter((n) => groupOf(n) === g && n !== g).length > 1);
  if (grouped.length) w.push(['info', `Numbered backends form groups automatically: ${grouped.join(', ')}.`]);
  return w;
}

const Toggle = ({ label, hint, checked, onChange }) => (
  <label className="cb-toggle">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="cb-switch" aria-hidden="true" />
    <span><b>{label}</b>{hint && <small>{hint}</small>}</span>
  </label>
);

const Field = ({ label, hint, children }) => (
  <label className="cb-field">
    <span className="cb-label">{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>
);

export default function ConfigBuilder() {
  const [c, setC] = useState(initial);
  const [tab, setTab] = useState('relay.toml');
  const set = (key) => (value) => setC((prev) => ({ ...prev, [key]: value }));
  const setServer = (i, key, value) => setC((prev) => ({ ...prev, servers: prev.servers.map((s, j) => (j === i ? { ...s, [key]: value } : s)) }));
  const setHost = (i, key, value) => setC((prev) => ({ ...prev, forcedHosts: prev.forcedHosts.map((h, j) => (j === i ? { ...h, [key]: value } : h)) }));

  const files = useMemo(() => ({
    'relay.toml': { code: buildToml(c), lang: 'toml' },
    'paper-global.yml': { code: buildPaper(c), lang: 'yaml' },
    'server.properties': { code: buildProperties(c), lang: 'properties' },
    ...(c.secretInFile && c.forwardingMode !== 'none' ? { 'forwarding.secret': { code: `${c.secret}\n`, lang: 'text' } } : {}),
  }), [c]);
  const notes = useMemo(() => warnings(c), [c]);
  const activeTab = files[tab] ? tab : 'relay.toml';

  // Where the form and output stack (tablets and phones), a sticky switcher
  // swaps between them instead of making people scroll past the whole form.
  // Both views stay mounted, so values and the chosen file survive switching.
  const stacked = useMedia('(max-width: 1100px)');
  const [view, setView] = useState('settings');
  const rootRef = useRef(null);
  const errors = notes.filter((n) => n[0] === 'error').length;
  const warns = notes.filter((n) => n[0] === 'warn').length;
  const status = errors
    ? { kind: 'error', icon: '✕', text: `${errors} ${errors === 1 ? 'error' : 'errors'}` }
    : warns
      ? { kind: 'warn', icon: '!', text: `Valid · ${warns} ${warns === 1 ? 'warning' : 'warnings'}` }
      : { kind: 'ok', icon: '✓', text: 'Valid' };
  const show = (next) => {
    setView(next);
    const top = rootRef.current?.getBoundingClientRect().top ?? 0;
    const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 0;
    if (top < headerH) {
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: window.scrollY + top - headerH - 8, behavior: smooth ? 'smooth' : 'instant' });
    }
  };
  const views = [['settings', 'Settings'], ['files', 'Generated files']];
  const onViewKey = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const next = view === 'settings' ? 'files' : 'settings';
    const target = e.key === 'Home' ? 'settings' : e.key === 'End' ? 'files' : next;
    show(target);
    document.getElementById(`cb-view-${target}`)?.focus();
  };
  const panelId = (id) => (id === 'files' ? 'output' : 'cb-panel-settings');
  const panel = (id) => (stacked ? { role: 'tabpanel', id: panelId(id), 'aria-labelledby': `cb-view-${id}`, hidden: view !== id } : {});

  return (
    <div className={`config-builder ${stacked ? 'is-stacked' : ''}`} id="builder" ref={rootRef}>
      {stacked && (
        <div className="cb-switcher" data-md-skip>
          <div className="cb-switcher-tabs" role="tablist" aria-label="Config builder view" onKeyDown={onViewKey}>
            {views.map(([id, label]) => (
              <button
                key={id}
                id={`cb-view-${id}`}
                type="button"
                role="tab"
                aria-selected={view === id}
                aria-controls={panelId(id)}
                tabIndex={view === id ? 0 : -1}
                onClick={() => show(id)}
              >
                {view === id && <motion.span layoutId="cb-view-pill" className="cb-view-pill" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <span>{id === 'files' ? <><span className="cb-view-long">Generated files</span><span className="cb-view-short">Files</span><small> · {activeTab}</small></> : label}</span>
              </button>
            ))}
          </div>
          <button type="button" className={`cb-status cb-status-${status.kind}`} onClick={() => show('files')} aria-label={`Validation: ${status.text}. Show details`}>
            <span aria-hidden="true">{status.icon}</span> <span className="cb-status-text">{status.text}</span>
          </button>
        </div>
      )}
      <form className="cb-form" onSubmit={(e) => e.preventDefault()} data-md-skip {...panel('settings')}>
        <fieldset>
          <legend>01 / Network</legend>
          <div className="cb-row">
            <Field label="bind" hint="Where players connect."><input value={c.bind} onChange={(e) => set('bind')(e.target.value)} spellCheck="false" /></Field>
            <Field label="max-players"><input type="number" min="0" value={c.maxPlayers} onChange={(e) => set('maxPlayers')(e.target.value)} /></Field>
          </div>
          <Field label="motd" hint="MiniMessage formatting. Use a new line for the second row.">
            <textarea rows="3" value={c.motd} onChange={(e) => set('motd')(e.target.value)} spellCheck="false" />
          </Field>
          <Toggle label="online-mode" hint="Authenticate players against Mojang." checked={c.onlineMode} onChange={set('onlineMode')} />
          <Toggle label="show-online-count" hint="Real player count and a name sample in the server list." checked={c.showOnlineCount} onChange={set('showOnlineCount')} />
        </fieldset>

        <fieldset>
          <legend>02 / Forwarding</legend>
          <div className="cb-segmented" role="radiogroup" aria-label="forwarding-mode">
            {forwardingModes.map(([id]) => (
              <button key={id} type="button" role="radio" aria-checked={c.forwardingMode === id} onClick={() => set('forwardingMode')(id)}>
                {c.forwardingMode === id && <motion.span layoutId="cb-fwd" className="cb-seg-pill" />}
                <span>{id}</span>
              </button>
            ))}
          </div>
          <p className="cb-note">{forwardingModes.find((m) => m[0] === c.forwardingMode)[1]}</p>
          {c.forwardingMode !== 'none' && (
            <>
              <Field label="forwarding-secret" hint="Generated in your browser. It never leaves this page.">
                <span className="cb-inline">
                  <input value={c.secret} onChange={(e) => set('secret')(e.target.value)} spellCheck="false" />
                  <button type="button" className="cb-small" onClick={() => set('secret')(newSecret())}>Regenerate</button>
                </span>
              </Field>
              <Toggle label="Keep the secret in its own file" hint="forwarding-secret-file, so relay.toml can live in git." checked={c.secretInFile} onChange={set('secretInFile')} />
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>03 / Backends</legend>
          <div className="cb-servers">
            <AnimatePresence initial={false}>
              {c.servers.map((s, i) => (
                <motion.div key={i} className="cb-server" layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
                  <input aria-label="Server name" placeholder="name" value={s.name} onChange={(e) => setServer(i, 'name', e.target.value)} spellCheck="false" />
                  <input aria-label="Address" placeholder="127.0.0.1:25566" value={s.address} onChange={(e) => setServer(i, 'address', e.target.value)} spellCheck="false" />
                  {c.balance === 'weighted' && <input aria-label="Weight" type="number" min="1" className="cb-weight" value={s.weight} onChange={(e) => setServer(i, 'weight', e.target.value)} />}
                  <button type="button" className="cb-remove" aria-label={`Remove ${s.name || 'server'}`} onClick={() => setC((p) => ({ ...p, servers: p.servers.filter((_, j) => j !== i) }))}>×</button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          <button type="button" className="cb-add" onClick={() => setC((p) => ({ ...p, servers: [...p.servers, { name: '', address: '127.0.0.1:', weight: 1 }] }))}>+ Add backend</button>
          <Field label="try" hint="Where players land on join, in order. Comma-separated servers or groups.">
            <input value={c.tryList} onChange={(e) => set('tryList')(e.target.value)} spellCheck="false" />
          </Field>
          <Field label="balance" hint={balances.find((b) => b[0] === c.balance)[1]}>
            <select value={c.balance} onChange={(e) => set('balance')(e.target.value)}>
              {balances.map(([id]) => <option key={id} value={id}>{id}</option>)}
            </select>
          </Field>
          <Toggle label="fallback-on-backend-loss" hint="Move players to the next server when theirs goes away." checked={c.fallback} onChange={set('fallback')} />
        </fieldset>

        <fieldset>
          <legend>04 / Features</legend>
          <Toggle label="client-api" hint="Client mods can talk to the proxy on relay:api_v1." checked={c.clientApi} onChange={set('clientApi')} />
          <Toggle label="backend-api" hint="BungeeCord-compatible plugin messaging for backend plugins." checked={c.backendApi} onChange={set('backendApi')} />
          <Toggle label="intercept-commands" hint="Relay claims /server, /glist, /find and /send." checked={c.interceptCommands} onChange={set('interceptCommands')} />
          <Toggle label="Dashboard companion" hint="Adds [control] and [companions.dashboard]." checked={c.dashboard} onChange={set('dashboard')} />
          {c.dashboard && (
            <Field label="RELAY_DASHBOARD_PORT"><input type="number" value={c.dashboardPort} onChange={(e) => set('dashboardPort')(e.target.value)} /></Field>
          )}
          <Field label="Admin player" hint="Optional. Granted relay.* by username or UUID.">
            <input placeholder="yourname" value={c.admin} onChange={(e) => set('admin')(e.target.value)} spellCheck="false" />
          </Field>
        </fieldset>

        <details className="cb-advanced">
          <summary>Advanced: compression, PROXY protocol, forced hosts</summary>
          <div className="cb-row">
            <Field label="compression-threshold" hint="-1 disables."><input type="number" value={c.compressionThreshold} onChange={(e) => set('compressionThreshold')(e.target.value)} /></Field>
            <Field label="compression-level" hint="0–9, or -1. Relay defaults to 3.">
              <input type="number" min="-1" max="9" value={c.compressionLevel} onChange={(e) => set('compressionLevel')(e.target.value)} />
            </Field>
          </div>
          <Toggle label="proxy-protocol-send" hint="Backends run with proxies.proxy-protocol: true." checked={c.proxyProtocolSend} onChange={set('proxyProtocolSend')} />
          <Toggle label="proxy-protocol-receive" hint="Something like HAProxy sits in front of Relay." checked={c.proxyProtocolReceive} onChange={set('proxyProtocolReceive')} />
          <p className="cb-label">forced-hosts</p>
          {c.forcedHosts.map((h, i) => (
            <div className="cb-server" key={i}>
              <input aria-label="Hostname" placeholder="survival.example.com" value={h.host} onChange={(e) => setHost(i, 'host', e.target.value)} spellCheck="false" />
              <input aria-label="Server" placeholder="survival" value={h.server} onChange={(e) => setHost(i, 'server', e.target.value)} spellCheck="false" />
              <button type="button" className="cb-remove" aria-label="Remove forced host" onClick={() => setC((p) => ({ ...p, forcedHosts: p.forcedHosts.filter((_, j) => j !== i) }))}>×</button>
            </div>
          ))}
          <button type="button" className="cb-add" onClick={() => setC((p) => ({ ...p, forcedHosts: [...p.forcedHosts, { host: '', server: '' }] }))}>+ Add forced host</button>
        </details>
        <button type="button" className="cb-reset" onClick={() => setC(initial())}>Reset to defaults</button>
      </form>

      <div className="cb-output" id="output" {...panel('files')}>
        <ul className="cb-warnings" aria-live="polite">
          <AnimatePresence initial={false}>
            {notes.map(([level, text]) => (
              <motion.li key={text} className={`cb-${level}`} layout initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>{text}</motion.li>
            ))}
          </AnimatePresence>
          {!errors && <li className="cb-ok">Looks valid. Relay validates again on start.</li>}
        </ul>
        <div className="api-tabs cb-tabs" role="tablist" aria-label="Generated files">
          {Object.keys(files).map((name) => (
            <button key={name} role="tab" aria-selected={activeTab === name} onClick={() => setTab(name)}>
              {name}
              {activeTab === name && <motion.span layoutId="cb-tab" className="tab-underline" />}
            </button>
          ))}
        </div>
        <CodeBlock code={files[activeTab].code} label={activeTab} lang={files[activeTab].lang} download={activeTab} />
      </div>
    </div>
  );
}
