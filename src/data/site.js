export const SOURCE = 'https://github.com/pustka-sh/Relay';
export const ORG = 'https://github.com/pustka-sh';

export const docNav = [
  { id: 'relay', title: 'Introduction', group: 'START HERE' },
  { id: 'quickstart', title: 'Quick start', group: 'START HERE' },
  { id: 'backend', title: 'Backend API', group: 'INTEGRATIONS' },
  { id: 'client', title: 'Client API', group: 'INTEGRATIONS' },
  { id: 'packets', title: 'Typed packets', group: 'INTEGRATIONS' },
];

// Page metadata and in-page sections. Bodies live in src/pages/docContent.jsx.
export const docMeta = {
  relay: {
    title: 'Meet Relay.',
    description: 'One connection in. A network of possibilities.',
    source: SOURCE,
    sourceLabel: 'Relay repository',
    toc: [['overview', 'A look inside'], ['requirements', 'Before you begin']],
    next: 'quickstart',
  },
  quickstart: {
    title: 'From source to server.',
    description: 'Bring up Relay, connect a backend, and check your setup.',
    source: `${SOURCE}#quick-start`,
    sourceLabel: 'Complete setup guide',
    toc: [['build', 'Start from source'], ['backend', 'Connect Paper'], ['check', 'Link and check']],
    previous: 'relay',
    next: 'backend',
  },
  backend: {
    title: 'The backend connection.',
    description: 'Let server plugins talk to the proxy using a familiar messaging contract.',
    source: `${SOURCE}/blob/main/docs/backend-api.md`,
    sourceLabel: 'Backend wire reference',
    toc: [['channels', 'Channels'], ['operations', 'Queries and actions'], ['boundary', 'Trust boundary']],
    previous: 'quickstart',
    next: 'client',
  },
  client: {
    title: 'A conversation with the client.',
    description: 'A small, negotiated protocol for Minecraft client mods.',
    source: `${SOURCE}/blob/main/docs/client-api.md`,
    sourceLabel: 'Client wire reference',
    toc: [['handshake', 'Handshake'], ['messages', 'Messages'], ['permissions', 'Permissions']],
    previous: 'backend',
    next: 'packets',
  },
  packets: {
    title: 'Packets with a shared language.',
    description: 'Typed application messages between your backend plugins.',
    source: `${SOURCE}/blob/main/docs/server-packets.md`,
    sourceLabel: 'Typed packet reference',
    toc: [['registry', 'The registry'], ['delivery', 'Delivery'], ['example', 'Working example']],
    previous: 'client',
  },
  api: {
    title: 'The reference layer.',
    description: 'The interfaces between your ideas and the network.',
    source: `${SOURCE}#dashboard-api`,
    sourceLabel: 'Upstream dashboard API',
    toc: [['dashboard', 'Dashboard companion'], ['routes', 'Routes'], ['integrations', 'Other protocols']],
  },
};

export const endpoints = [
  { method: 'GET', path: '/api/overview', detail: 'Network totals and balancing mode.' },
  { method: 'GET', path: '/api/servers', detail: 'Backend health, latency, population, and resource readings.' },
  { method: 'GET', path: '/api/groups', detail: 'Backend groups and their totals.' },
  { method: 'GET', path: '/api/players', detail: 'A paginated view of players and their routes.', query: ['q', 'server', 'offset', 'limit'] },
  { method: 'WS', path: '/api/events', detail: 'A live stream of player and backend-health events.' },
  { method: 'GET', path: '/api/audit', detail: 'Recent network operations.' },
  { method: 'POST', path: '/api/actions/{drain,send,evacuate,kick}', detail: 'Permission-controlled network actions.' },
];

const docTitle = (id) => (id === 'api' ? 'Dashboard API' : docNav.find((d) => d.id === id).title);
export const docPath = (id) => (id === 'api' ? '/api' : `/docs/${id}`);

export const searchIndex = [
  { title: 'Home', detail: 'pustka / The workshop', to: '/', terms: 'home start workshop pustka', kind: 'page' },
  { title: 'Relay', detail: 'Project / Minecraft server proxy', to: '/projects', terms: 'java proxy projects register network infrastructure', kind: 'project' },
  ...[...docNav.map((d) => d.id), 'api'].flatMap((id) => [
    {
      title: docTitle(id),
      detail: id === 'api' ? 'Relay / HTTP & WebSocket routes' : 'Relay / Documentation',
      to: docPath(id),
      terms: `${docMeta[id].title} ${docMeta[id].description} ${id}`,
      kind: 'doc',
    },
    ...docMeta[id].toc.map(([anchor, label]) => ({
      title: label,
      detail: `${docTitle(id)} / Section`,
      to: docPath(id),
      anchor,
      terms: `${anchor} ${docTitle(id)}`,
      kind: 'section',
    })),
  ]),
  ...endpoints.map((e) => ({
    title: `${e.method} ${e.path}`,
    detail: `Dashboard API / ${e.detail}`,
    to: '/api',
    anchor: 'routes',
    terms: `endpoint route ${e.detail}`,
    kind: 'endpoint',
  })),
  { title: 'GitHub organization', detail: 'External / github.com/pustka-sh', href: ORG, terms: 'source code repositories github', kind: 'external' },
  { title: 'Report an issue', detail: 'External / Relay issues', href: `${SOURCE}/issues`, terms: 'bug feedback issue help', kind: 'external' },
];
