import { Link } from 'react-router-dom';
import Topology from '../components/Topology.jsx';
import CodeBlock, { Callout } from '../components/CodeBlock.jsx';
import External from '../components/External.jsx';
import ConfigBuilder from '../components/ConfigBuilder.jsx';
import Reveal from '../components/Reveal.jsx';
import { useRelayContent } from '../lib/useRelayContent.js';
import { SOURCE } from '../data/site.js';

const Table = ({ head, rows }) => (
  <div className="table-wrap">
    <table className="reference-table">
      <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i}>{c}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

const Choices = ({ items }) => (
  <div className="doc-choices">
    {items.map(([to, label]) => <Link key={to} to={to}><span>{label}</span><span aria-hidden="true">→</span></Link>)}
  </div>
);

export const docBodies = {
  relay: () => (
    <>
      <p>Relay is pustka’s Java Minecraft proxy. It sits between players and your Paper servers, handling the connections between them.</p>
      <h2 id="overview">A look inside</h2>
      <Topology />
      <p>Explore the project, then follow the setup guide or choose an integration below.</p>
      <Choices items={[['/docs/quickstart', 'Get Relay running'], ['/docs/backend', 'Talk to the proxy from a backend'], ['/docs/client', 'Connect a client mod'], ['/api', 'Explore the dashboard API']]} />
      <h2 id="requirements">Before you begin</h2>
      <p>You’ll need JDK 21+ and Paper backends. The repository lists support for Minecraft 1.20.2–1.21.8; check upstream for current compatibility.</p>
    </>
  ),
  quickstart: () => (
    <>
      <h2 id="build">01 / Start from source</h2>
      <p>Clone Relay and run its Gradle launcher. The initial launch creates <code>run/relay.toml</code> and a forwarding secret.</p>
      <CodeBlock code={'git clone https://github.com/pustka-sh/Relay.git\ncd Relay\n./gradlew run'} />
      <h2 id="backend">02 / Connect Paper</h2>
      <p>Keep backend ports private. Set <code>online-mode=false</code> in the backend’s <code>server.properties</code>. In <code>config/paper-global.yml</code>, enable Velocity forwarding, set its online-mode to true, and use the generated secret.</p>
      <Callout><strong>Keep the boundary intact.</strong> Relay handles authentication. A backend configured for proxy forwarding must not be reachable directly from the internet.</Callout>
      <h2 id="check">03 / Link and check</h2>
      <p>The optional helper uses Python 3.11+. Replace the example path with your Paper directory.</p>
      <CodeBlock code={'py relay.py link lobby /path/to/paper-server\npy relay.py doctor\npy relay.py run'} />
      <p>Use the upstream guide for complete configuration and platform-specific instructions.</p>
    </>
  ),
  backend: () => (
    <>
      <h2 id="channels">Channels</h2>
      <p>Relay accepts BungeeCord-compatible plugin messages on these channels:</p>
      <CodeBlock code={'bungeecord:main\nBungeeCord\nrelay:main'} label="plugin channels" lang="text" />
      <p>Enable the integration with <code>backend-api = true</code>. Messages begin with a sub-channel name and use Java UTF strings and big-endian primitives.</p>
      <h2 id="operations">Queries and actions</h2>
      <Table head={['Type', 'Examples']} rows={[['Read', 'GetServer, GetServers, PlayerCount, PlayerList'], ['Route', 'Connect, ConnectOther'], ['Interact', 'Message, MessageRaw, KickPlayer']]} />
      <h2 id="boundary">The trust boundary</h2>
      <p>Backend calls trust the server, rather than checking a player’s permissions. Keep backend ports private. These messages travel over player connections, so an empty backend cannot exchange them.</p>
      <Callout>Need the exact fields or a plugin example? The upstream reference documents the full wire contract.</Callout>
    </>
  ),
  client: () => (
    <>
      <h2 id="handshake">Start with a handshake</h2>
      <p>Enable <code>client-api = true</code> and communicate on <code>relay:api_v1</code>. The client sends <code>Hello</code> before making requests. Vanilla clients receive no unsolicited API messages.</p>
      <CodeBlock code={'channel   relay:api_v1\nversion   1\nencoding  VarInt message type + body'} label="protocol identity" lang="text" />
      <h2 id="messages">Serverbound messages</h2>
      <Table head={['ID', 'Message', 'Purpose']} rows={[['0x00', 'Hello', 'Negotiate version and identify the mod'], ['0x01', 'List Servers', 'Query available destinations'], ['0x02', 'Request Switch', 'Ask to move to another server']]} />
      <h2 id="permissions">Permissions still apply</h2>
      <p>Listing servers requires <code>relay.command.glist</code>; switching requires <code>relay.command.server</code>. Relay checks permissions on each action. Capabilities announced during negotiation help the interface, but do not authorize requests.</p>
      <Callout>Messages are limited to 32,768 bytes and 20 messages per second. See the wire reference for field layouts and replies.</Callout>
    </>
  ),
  packets: () => (
    <>
      <h2 id="registry">Agree on the registry</h2>
      <p><code>PacketFactory</code> builds on backend forwarding. Both ends share packet registrations; a registry fingerprint catches mismatched definitions. Serialization and deserialization must agree on field order.</p>
      <h2 id="delivery">Choose a destination</h2>
      <Table head={['Method', 'Use']} rows={[['send', 'Send to a backend'], ['sendToPlayer', 'Route through a player'], ['broadcast', 'Send across backends']]} />
      <p>Packets are limited to 32 KB and need a player connection at the sending and receiving backends. A successful local submission does not confirm remote delivery; implement a reply when you need an acknowledgement.</p>
      <h2 id="example">See it in practice</h2>
      <p>The <External href={`${SOURCE}/tree/main/examples/block-mirror`}>block-mirror example ↗</External> shows a working packet integration. Add registrations at the end and deploy matching definitions to both ends.</p>
    </>
  ),
};

const idsLabel = {
  live: ['Live-verified', 'Every id checked against a running Paper server.'],
  report: ['Packet report', 'Ids read from Mojang’s own generated packet report.'],
  bracketed: ['Bracketed', 'No packet report; ids sit between verified neighbours.'],
};

function Compatibility() {
  const data = useRelayContent();
  return (
    <>
      <p>Relay speaks one connection model: the configuration phase introduced in Minecraft 1.20.2. That makes 1.20.2 the floor, and every version above it shares a single server-switching implementation.</p>
      <h2 id="versions">Supported versions</h2>
      {!data ? <div className="skeleton" style={{ height: 380 }} /> : (
        <>
          <div className="table-wrap">
            <table className="reference-table compat-table">
              <thead><tr><th>Minecraft</th><th>Protocol</th><th>Packet ids</th><th>Join tested</th></tr></thead>
              <tbody>
                {data.versions.map((v, i) => (
                  <Reveal as="tr" key={v.protocol} delay={i * 0.04} y={8}>
                    <td><b>{v.versions.join(' – ')}</b></td>
                    <td><code>{v.protocol}</code></td>
                    <td><span className={`badge badge-${v.ids}`}>{idsLabel[v.ids][0]}</span></td>
                    <td>{v.joinTested.length ? <span className="badge badge-ok">✓ {v.joinTested.join(', ')}</span> : <span className="muted-dash">—</span>}</td>
                  </Reveal>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sync-note">Generated from <code>ProtocolVersion.java</code>, <code>docs/protocol-ids.md</code> and the README at Relay <External href={`${SOURCE}/commit/${data.commit}`}>{data.commit.slice(0, 7)} ↗</External>, synced {data.syncedAt}.</p>
        </>
      )}
      <h2 id="confidence">Reading the table</h2>
      <div className="legend-grid">
        {Object.entries(idsLabel).map(([k, [label, text]]) => (
          <div key={k}><span className={`badge badge-${k}`}>{label}</span><p>{text}</p></div>
        ))}
        <div><span className="badge badge-ok">✓ Join tested</span><p>The README’s status table reports a real client joining, playing and switching servers on that version.</p></div>
      </div>
      <Callout><strong>Read it alongside the caveats.</strong> The README’s “Before you trust it” section says only 1.20.2 has been exercised for real, with every other version’s ids still partly inference. A wrong play-state id degrades gracefully, and any id can be corrected from <code>relay.toml</code> without a rebuild. See <Link to="/docs/protocol-ids">Protocol IDs</Link>.</Callout>
      <h2 id="requirements">Requirements</h2>
      <Table head={['Component', 'Needs']} rows={[['Relay proxy', 'JDK 21+'], ['Relay plugin', 'Java 17, on Paper backends'], ['Backends', 'Paper with online-mode=false and modern forwarding'], ['relay.py helper', 'Python 3.11+, no dependencies']]} />
    </>
  );
}

function Configuration() {
  const data = useRelayContent();
  return (
    <>
      <p>Every option below is a real key from Relay’s <code>relay.default.toml</code>. Your generated files stay in your browser. Only settings you explicitly share are sent to the site, with the forwarding secret excluded.</p>
      <ConfigBuilder />
      <h2 id="default">The full default</h2>
      <p>The commented file Relay writes on first start, with every setting explained by its authors.</p>
      <details className="default-config">
        <summary>Show relay.default.toml</summary>
        {data ? <CodeBlock code={data.defaultConfig} label="relay.default.toml" lang="toml" download="relay.default.toml" /> : <div className="skeleton" style={{ height: 200 }} />}
      </details>
    </>
  );
}

docBodies.compatibility = Compatibility;
docBodies.configuration = Configuration;
docBodies['protocol-ids'] = () => null;

export const ApiChoices = () => (
  <Choices items={[['/docs/backend', 'Backend plugin messaging'], ['/docs/client', 'Client mod protocol'], ['/docs/packets', 'Typed server packets']]} />
);
