// Shared by the React app and by scripts/postbuild.mjs (plain Node), so keep it JSX-free.
export const SITE = 'https://pustka.sh';
export const SOURCE = 'https://github.com/pustka-sh/Relay';
export const ORG = 'https://github.com/pustka-sh';
export const ISSUES = `${SOURCE}/issues`;

export const docGroups = ['START HERE', 'INTEGRATIONS', 'TOOLS & REFERENCE'];

// Reading order. Previous/next links and the sidebar both follow it.
export const docNav = [
  { id: 'introduction', title: 'Introduction', group: 'START HERE' },
  { id: 'quickstart', title: 'Quick start', group: 'START HERE' },
  { id: 'compatibility', title: 'Compatibility', group: 'START HERE' },
  { id: 'backend', title: 'Backend API', group: 'INTEGRATIONS' },
  { id: 'client', title: 'Client API', group: 'INTEGRATIONS' },
  { id: 'packets', title: 'Typed packets', group: 'INTEGRATIONS' },
  { id: 'api', title: 'Dashboard API', group: 'INTEGRATIONS' },
  { id: 'configuration', title: 'Config builder', group: 'TOOLS & REFERENCE' },
  { id: 'protocol-ids', title: 'Protocol IDs', group: 'TOOLS & REFERENCE' },
];

export const docPath = (id) => (id === 'api' ? '/api' : `/docs/${id}`);
export const docTitle = (id) => docNav.find((d) => d.id === id)?.title;
export const docNeighbours = (id) => {
  const i = docNav.findIndex((d) => d.id === id);
  return { previous: docNav[i - 1]?.id, next: docNav[i + 1]?.id };
};

/*
 * Page metadata. `toc` lists the hand-written sections; pages with `upstream`
 * also render that synced document (or README sections) as a full reference
 * below, and its headings are appended to the table of contents.
 */
export const docMeta = {
  relay: {
    title: 'Meet Relay.',
    description: 'One connection in. A network of possibilities.',
    source: SOURCE,
    sourceLabel: 'Relay repository',
    toc: [['overview', 'A look inside'], ['requirements', 'Before you begin']],
    upstream: { kind: 'readme', key: 'relay', label: 'From the README' },
  },
  quickstart: {
    title: 'From source to server.',
    description: 'Bring up Relay, connect a backend, and check your setup.',
    source: `${SOURCE}#quick-start`,
    sourceLabel: 'Complete setup guide',
    toc: [['build', 'Start from source'], ['backend', 'Connect Paper'], ['check', 'Link and check']],
    upstream: { kind: 'readme', key: 'quickstart', label: 'Full setup guide' },
  },
  compatibility: {
    title: 'What it runs with.',
    description: 'Minecraft versions, protocol numbers, and how sure each one is.',
    source: `${SOURCE}/blob/main/docs/protocol-ids.md`,
    sourceLabel: 'Protocol IDs reference',
    toc: [['versions', 'Supported versions'], ['confidence', 'Reading the table'], ['requirements', 'Requirements']],
  },
  backend: {
    title: 'The backend connection.',
    description: 'Let server plugins talk to the proxy using a familiar messaging contract.',
    source: `${SOURCE}/blob/main/docs/backend-api.md`,
    sourceLabel: 'Backend wire reference',
    toc: [['channels', 'Channels'], ['operations', 'Queries and actions'], ['boundary', 'Trust boundary']],
    upstream: { kind: 'doc', key: 'backend', label: 'Full wire reference' },
  },
  client: {
    title: 'A conversation with the client.',
    description: 'A small, negotiated protocol for Minecraft client mods.',
    source: `${SOURCE}/blob/main/docs/client-api.md`,
    sourceLabel: 'Client wire reference',
    toc: [['handshake', 'Handshake'], ['messages', 'Messages'], ['permissions', 'Permissions']],
    upstream: { kind: 'doc', key: 'client', label: 'Full wire reference' },
  },
  packets: {
    title: 'Packets with a shared language.',
    description: 'Typed application messages between your backend plugins.',
    source: `${SOURCE}/blob/main/docs/server-packets.md`,
    sourceLabel: 'Typed packet reference',
    toc: [['registry', 'The registry'], ['delivery', 'Delivery'], ['example', 'Working example']],
    upstream: { kind: 'doc', key: 'packets', label: 'Full reference' },
  },
  api: {
    title: 'The reference layer.',
    description: 'The interfaces between your ideas and the network.',
    source: `${SOURCE}#dashboard-api`,
    sourceLabel: 'Upstream dashboard API',
    toc: [['dashboard', 'Dashboard companion'], ['routes', 'Routes'], ['integrations', 'Other protocols']],
    upstream: { kind: 'readme', key: 'api', label: 'From the README' },
  },
  configuration: {
    title: 'Build a relay.toml.',
    description: 'Pick your settings, copy a working config, and the matching Paper files.',
    source: `${SOURCE}/blob/main/proxy/src/main/resources/relay.default.toml`,
    sourceLabel: 'Default relay.toml',
    toc: [['builder', 'The builder'], ['output', 'Your files'], ['default', 'The full default']],
    wide: true,
  },
  'protocol-ids': {
    title: 'Protocol IDs.',
    description: 'The packet ids Relay depends on, per Minecraft protocol version.',
    source: `${SOURCE}/blob/main/docs/protocol-ids.md`,
    sourceLabel: 'Protocol IDs on GitHub',
    toc: [],
    upstream: { kind: 'doc', key: 'protocol-ids', label: 'Reference', only: true },
  },
};

docMeta.introduction = docMeta.relay;

export const endpoints = [
  { method: 'GET', path: '/api/overview', detail: 'Players, uptime, backend and group counts, and the balance strategy.' },
  { method: 'GET', path: '/api/servers', detail: 'Each backend: address, group, health, latency, version, player count, and a load object with TPS, MSPT, heap and CPU.' },
  { method: 'GET', path: '/api/groups', detail: 'Each group, its members, and its total.' },
  { method: 'GET', path: '/api/players', detail: 'One page of who is online, with each player’s backend and full network route.', query: ['q', 'server', 'offset', 'limit'] },
  { method: 'WS', path: '/api/events', detail: 'One socket carrying every event type: connects, disconnects, switches, and backend health changes.' },
  { method: 'GET', path: '/api/audit', detail: 'Who did what, newest first.' },
  { method: 'POST', path: '/api/actions/{drain,send,evacuate,kick}', detail: 'Permission-checked, CSRF-checked network actions, each written to the audit log — refusals included.' },
];

// Every route that gets its own HTML file at build time (titles, descriptions, sitemap).
export const pages = [
  { path: '/', title: 'pustka — Minecraft. From the void.', description: 'pustka — a workshop for Minecraft software. Explore our projects, read the documentation, and build with our APIs.' },
  { path: '/projects', title: 'Projects — pustka', description: 'The pustka project register: Relay, a Minecraft server proxy built in Java, and what comes next.' },
  { path: '/docs/projects', title: 'Documentation — pustka', description: 'Project documentation, versioned Markdown guides, and Java API references published from source.' },
  { path: '/docs/relay', title: 'Relay documentation — pustka', description: 'Start with Relay, choose a documentation version, and explore guides, Java APIs and the dashboard reference.' },
  { path: '/lab/relay', title: 'Relay Lab — pustka', description: 'Follow a sample Minecraft connection through its handshake, authentication, routing and backend forwarding.' },
  { path: '/changelog', title: 'Changelog — pustka', description: 'Every change to Relay, straight from its commit history.' },
  { path: '/help', title: 'Help — pustka', description: 'Get help with Relay: diagnose a setup, report an issue, contribute, and common questions.' },
  { path: '/tools', title: 'Workshop tools — pustka', description: 'Check a public Minecraft server, compare Relay and Paper settings, and explore the pustka project registry.' },
  { path: '/releases', title: 'Releases — pustka', description: 'Published pustka releases, downloads, and available SHA-256 checksums from GitHub.' },
  { path: '/live', title: 'Live network — pustka', description: 'A read-only look at the configured Relay demo network.' },
  ...docNav.map((d) => ({
    path: docPath(d.id),
    title: `${d.id === 'api' ? 'Relay API' : docMeta[d.id].title.replace(/\.$/, '')} — pustka`,
    description: docMeta[d.id].description,
  })),
];

export const searchIndex = [
  { title:'Relay Lab', detail:'Interactive / Follow a Minecraft connection',to:'/lab/relay',terms:'lab handshake packets bytes routing forwarding authentication simulation minecraft learn',kind:'tool'},
  { title:'Relay documentation',detail:'Project home / Getting started, guides and APIs',to:'/docs/relay',terms:'relay documentation home guide java api dashboard version',kind:'doc'},
  { title: 'Project documentation', detail: 'Versioned guides and source API reference', to:'/docs/projects', terms:'documentation projects versions releases java javadoc source markdown latex math', kind:'doc' },
  { title: 'Home', detail: 'pustka / The workshop', to: '/', terms: 'home start workshop pustka', kind: 'page' },
  { title: 'Relay', detail: 'Project / Minecraft server proxy', to: '/projects', terms: 'java proxy projects register network infrastructure roadmap status phases', kind: 'project' },
  { title: 'Changelog', detail: 'Relay / Commit history', to: '/changelog', terms: 'changes history commits releases what is new', kind: 'page' },
  { title: 'Help', detail: 'Support, issues, contributing, FAQ', to: '/help', terms: 'help support bug issue report contribute faq question doctor', kind: 'page' },
  { title: 'Server checker', detail: 'Workshop / Public Minecraft server status', to: '/tools', anchor: 'server-check', terms: 'ping motd players status java minecraft compatibility', kind: 'tool' },
  { title: 'Setup checker', detail: 'Workshop / Compare Relay and Paper configs', to: '/tools', anchor: 'setup-check', terms: 'doctor secret forwarding proxy protocol mismatch configuration', kind: 'tool' },
  { title: 'Releases', detail: 'Downloads and published checksums', to: '/releases', terms: 'releases downloads checksum sha256 jar version', kind: 'page' },
  { title: 'Live network', detail: 'Read-only Relay demo', to: '/live', terms: 'demo network live health servers dashboard', kind: 'page' },
  ...docNav.flatMap((d) => [
    {
      title: d.title,
      detail: d.id === 'api' ? 'Relay / HTTP & WebSocket routes' : `Relay / ${d.group.toLowerCase()}`,
      to: docPath(d.id),
      terms: `${docMeta[d.id].title} ${docMeta[d.id].description} ${d.id}`,
      kind: d.id === 'configuration' ? 'tool' : 'doc',
    },
    ...docMeta[d.id].toc.map(([anchor, label]) => ({
      title: label, detail: `${d.title} / Section`, to: docPath(d.id), anchor, terms: `${anchor} ${d.title}`, kind: 'section',
    })),
  ]),
  ...endpoints.map((e) => ({
    title: `${e.method} ${e.path}`, detail: `Dashboard API / ${e.detail}`, to: '/api', anchor: 'routes', terms: `endpoint route ${e.detail}`, kind: 'endpoint',
  })),
  { title: 'GitHub organization', detail: 'External / github.com/pustka-sh', href: ORG, terms: 'source code repositories github', kind: 'external' },
  { title: 'Report an issue', detail: 'External / Relay issues', href: ISSUES, terms: 'bug feedback issue help', kind: 'external' },
];

// Answers paraphrase Relay's README; each links to where it says so.
export const faq = [
  { id: 'bedrock', q: 'Can Bedrock players join through Relay?', a: 'Yes, through Geyser. Geyser runs as an ordinary backend entry; Relay does not speak Bedrock itself, exactly as it works behind Velocity today.', to: '/docs/quickstart#ref-configuring-backends' },
  { id: 'velocity', q: 'Do backends already set up for Velocity need changes?', a: 'No. Relay’s modern forwarding is wire-compatible with Velocity’s, so backends configured for Velocity need no change.', to: '/docs/quickstart#ref-configuring-backends' },
  { id: 'bungee-plugins', q: 'Will my BungeeCord network plugins work?', a: 'The backend API is BungeeCord-compatible plugin messaging on bungeecord:main, so existing network plugins are designed to work unchanged.', to: '/docs/backend' },
  { id: 'old-versions', q: 'Can players join on versions older than 1.20.2?', a: 'No. 1.20.2 introduced the configuration phase, and every version from there shares one connection model. Supporting older ones would mean carrying a second switching implementation forever.', to: '/docs/compatibility' },
  { id: 'inventory', q: 'Do players keep their inventory between servers?', a: 'Relay moves connections, not game state. Inventory and game state across backends is a backend-database problem, deliberately out of scope.', to: '/docs/relay#ref-design-notes' },
  { id: 'plugins', q: 'Can I write plugins that run inside the proxy?', a: 'Not yet. The in-proxy plugin system is phase 3 of the plan and has not started. Backend plugins can already talk to the proxy through the backend API.', to: '/docs/relay#ref-status' },
  { id: 'dashboard-exposed', q: 'Is the dashboard safe to expose?', a: 'It is off by default and binds to loopback. Off loopback it requires accounts, or refuses to start, and every action is permission-checked and audited. Relay warns when bound anywhere but loopback.', to: '/api#ref-dashboard-api' },
  { id: 'docker', q: 'Can I run Relay in Docker?', a: 'Yes: docker compose up -d --build. Config, logs and the forwarding secret live in ./data, and the compose file publishes 25577 so it can run beside an existing proxy.', to: '/docs/quickstart#ref-docker' },
  { id: 'restart', q: 'What happens to players when a backend restarts?', a: 'With fallback-on-backend-loss on (the default), they move to the next server in the try list instead of leaving the network. Draining takes a backend out of rotation before a planned restart.', to: '/docs/configuration' },
];

searchIndex.push(...faq.map((f) => ({ title: f.q, detail: 'Help / FAQ', to: '/help', anchor: `faq-${f.id}`, terms: `faq question ${f.a}`, kind: 'faq' })));
