import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LAB_DEFAULTS, LAB_SAMPLE, LAB_SCENARIOS, LAB_SOURCES, LAB_VERSIONS, RELAY_LAB_REVISION } from '../data/relayLab.js';
import { createLabTrace, hexByte } from '../lib/relayLab.js';

const sourceFor = {handshake:'handshake',status:'intent',identity:'identity',routing:'routing',forwarding:'forwarding',play:'forwarding'};
const statusText = {passed:'On the sample path',blocked:'Connection stops here',unreached:'Not reached'};

function SourceLink({source}) {
  return <a href={source.href} target="_blank" rel="noopener noreferrer">{source.label} <span aria-hidden="true">↗</span></a>;
}

function NetworkDrawing({trace,step}) {
  const pastIdentity=step>=1&&trace.options.intent==='login'&&trace.supported;
  const atBackend=step>=2&&pastIdentity;
  return <div className="relay-lab-network" role="img" aria-label={`Sample network: ${LAB_SAMPLE.player} connects to ${LAB_SAMPLE.proxy}. ${trace.outcomeTitle}`}>
    <div className={`lab-network-node lab-client ${step===0?'is-current':''}`}><span className="lab-node-icon" aria-hidden="true">▧</span><span><small>PLAYER</small><strong>{LAB_SAMPLE.player}</strong><code>{trace.options.protocol}</code></span></div>
    <div className={`lab-wire ${step<=1?'is-current':''}`} aria-hidden="true"><i/><span>01</span></div>
    <div className={`lab-network-node lab-proxy ${!atBackend?'is-current':''}`}><span className="lab-node-icon" aria-hidden="true">∅</span><span><small>PROXY</small><strong>{LAB_SAMPLE.proxy}</strong><code>{trace.options.intent==='status'?'status only':trace.options.authentication==='online'?'online-mode':'offline-mode'}</code></span></div>
    <div className={`lab-wire ${atBackend?'is-current':''}`} aria-hidden="true"><i/><span>02</span></div>
    <div className="lab-backend-stack">{LAB_SAMPLE.candidates.map(server=>{
      const attempt=trace.attempts.find(item=>item.server===server);
      const state=atBackend&&attempt?attempt.result:'waiting';
      return <div className={`lab-network-node lab-backend ${state==='accepted'?'is-current':''} ${['unreachable','rejected'].includes(state)?'is-rejected':''}`} key={server}><span className="lab-node-icon" aria-hidden="true">◇</span><span><small>BACKEND</small><strong>{server}</strong><code>{state==='waiting'?'waiting':state==='accepted'?'accepts join':state==='rejected'?'rejects profile':'unreachable'}</code></span></div>;
    })}</div>
  </div>;
}

function PacketInspector({packet}) {
  const [selected,setSelected]=useState('protocol');
  const [copied,setCopied]=useState(false);
  const [copyError,setCopyError]=useState(false);
  useEffect(()=>{setCopied(false);setCopyError(false);},[packet.hex]);
  const field=packet.fields.find(item=>item.id===selected)||packet.fields[0];
  const copy=async()=>{try{await navigator.clipboard.writeText(packet.hex);setCopied(true);setCopyError(false);}catch{setCopied(false);setCopyError(true);}};
  return <details className="relay-lab-packet" open>
    <summary><span><span className="lab-eyebrow">WIRE STUDY / 0x00</span><strong>Inside the first packet.</strong></span><span className="lab-packet-size">{packet.bytes.length} bytes <span aria-hidden="true">⌄</span></span></summary>
    <div className="lab-packet-body"><p>This is a byte-accurate, uncompressed client-to-proxy handshake for the settings above. Select a field to see where it lives. Authentication and later exchanges are explained, not serialized.</p>
      <div className="lab-byte-toolbar"><span>HEX / NETWORK ORDER</span><button type="button" onClick={copy}>{copied?'Copied ✓':'Copy bytes'}</button><span className="sr-only" role="status">{copied?'Handshake bytes copied.':copyError?'Clipboard is unavailable. The full byte sequence is shown below.':''}</span></div>
      {copyError&&<p role="status">Clipboard unavailable. Select the hex bytes below to copy them manually.</p>}
      <div className="lab-byte-stream" aria-label="Handshake fields in byte order">{packet.fields.map(item=><button key={item.id} type="button" className={selected===item.id?'is-selected':''} aria-pressed={selected===item.id} aria-controls="lab-selected-field" aria-label={`${item.name}: ${item.bytes.map(hexByte).join(' ')}`} onClick={()=>setSelected(item.id)}><span>{item.bytes.map(hexByte).join(' ')}</span><small>{item.name}</small></button>)}</div>
      <div className="lab-selected-field" id="lab-selected-field" aria-live="polite"><div><span className="lab-eyebrow">SELECTED FIELD</span><h3>{field.name}</h3><p>{field.description}</p></div><dl><div><dt>Value</dt><dd>{field.value}</dd></div><div><dt>Encoding</dt><dd>{field.type}</dd></div><div><dt>Offset</dt><dd>{field.start}</dd></div><div><dt>Bytes</dt><dd>{field.length}</dd></div></dl></div>
      <p className="lab-packet-note">The frame-length prefix excludes its own bytes. The handshake contains neither an account password nor a forwarding secret.</p><SourceLink source={LAB_SOURCES.handshake}/>
    </div>
  </details>;
}

export default function RelayLab() {
  const [options,setOptions]=useState({...LAB_DEFAULTS});
  const [active,setActive]=useState(0);
  const trace=createLabTrace(options);
  const index=Math.min(active,trace.steps.length-1),step=trace.steps[index];
  const change=(name,value)=>{setOptions(previous=>({...previous,[name]:value}));setActive(0);};
  useEffect(()=>{document.title='Relay Lab — pustka';},[]);
  return <div className="container relay-lab">
    <header className="lab-intro"><div><p className="section-label">THE WORKSHOP / RELAY LAB</p><h1>One connection.<br/><span>Every decision.</span></h1><p>Follow a sample player from the first packet to a world. Change a setting, interrupt a route, and inspect what happens along the way.</p></div><div className="lab-spec-label"><span className="lab-spec-cross" aria-hidden="true">+</span><span>LOCAL SIMULATION</span><strong>No server connection is made.</strong><small>Behavior reviewed against Relay <a href={`https://github.com/pustka-sh/Relay/commit/${RELAY_LAB_REVISION}`} target="_blank" rel="noopener noreferrer">{RELAY_LAB_REVISION.slice(0,7)} ↗</a></small></div></header>
    <div className="lab-workspace">
      <aside className="lab-controls" aria-label="Sample connection settings"><div className="lab-control-heading"><span className="lab-eyebrow">01 / SET THE CONDITIONS</span><button type="button" onClick={()=>{setOptions({...LAB_DEFAULTS});setActive(0);}}>Reset ↺</button></div>
        <label htmlFor="lab-protocol">Minecraft client<select id="lab-protocol" value={options.protocol} onChange={event=>change('protocol',Number(event.target.value))}>{LAB_VERSIONS.map(version=><option key={version.protocol} value={version.protocol}>{version.label} · {version.protocol}</option>)}<option value="0">Unsupported protocol · 0</option></select></label>
        <label htmlFor="lab-intent">Connection intent<select id="lab-intent" value={options.intent} onChange={event=>change('intent',event.target.value)}><option value="login">Join the network</option><option value="status">Server-list ping</option></select></label>
        <label htmlFor="lab-authentication">Client authentication<select id="lab-authentication" value={options.authentication} disabled={options.intent==='status'} onChange={event=>change('authentication',event.target.value)}><option value="online">Online · verify account</option><option value="offline">Offline · unverified identity</option></select></label>
        <label htmlFor="lab-forwarding">Backend forwarding<select id="lab-forwarding" value={options.forwarding} disabled={options.intent==='status'} onChange={event=>change('forwarding',event.target.value)}><option value="modern">Modern · signed profile</option><option value="legacy">Legacy · unsigned profile</option><option value="none">None · backend identity</option></select></label>
        <p className="lab-setting-hint">Authentication establishes the player’s identity. Forwarding decides what the backend receives. They are separate choices.</p>
        <fieldset className="lab-scenarios" disabled={options.intent==='status'}><legend>Try a different outcome</legend>{LAB_SCENARIOS.map(scenario=><label className={options.scenario===scenario.id?'is-selected':''} key={scenario.id}><input type="radio" name="lab-scenario" checked={options.scenario===scenario.id} onChange={()=>change('scenario',scenario.id)} value={scenario.id}/><span><strong>{scenario.label}</strong><small>{scenario.hint}</small></span></label>)}</fieldset>
        {options.intent==='status'&&<p className="lab-setting-hint">A status ping does not authenticate, choose a backend, or forward a player profile.</p>}
        <Link className="lab-guide-link" to="/docs/compatibility">Version support has caveats ↗</Link>
      </aside>
      <section className="lab-trace" aria-labelledby="lab-trace-title"><div className="lab-trace-heading"><div><p className="lab-eyebrow">02 / FOLLOW THE CONNECTION</p><h2 id="lab-trace-title">A route through the void.</h2></div><span className="lab-stage-count">{String(index+1).padStart(2,'0')} / {String(trace.steps.length).padStart(2,'0')}</span></div>
        <NetworkDrawing trace={trace} step={index}/>
        <ol className="lab-stage-list" style={{gridTemplateColumns:`repeat(${trace.steps.length},minmax(0,1fr))`}} aria-label="Connection stages">{trace.steps.map((item,i)=><li key={item.id}><button type="button" className={`${i===index?'is-current':''} ${i<index?'is-past':''} ${item.status==='blocked'?'has-stop':''}`} aria-current={i===index?'step':undefined} onClick={()=>setActive(i)}><span>{String(i+1).padStart(2,'0')}</span><strong>{item.label}</strong>{item.status==='blocked'&&<span className="lab-stage-stop" aria-label="Connection stops at this stage">!</span>}</button></li>)}</ol>
        <div className={`lab-stage-detail ${step.status}`} aria-live="polite" aria-atomic="true"><div className="lab-stage-status"><span className="lab-eyebrow">{step.id==='handshake'?'EXACT PACKET + EXPLANATION':'ILLUSTRATIVE PROTOCOL STAGE'}</span><span>{statusText[step.status]}</span></div><h3>{step.title}</h3>{step.status==='unreached'?<><p>The connection stops at an earlier stage in this scenario. This exchange does not happen.</p><details className="lab-unreached-explanation"><summary>What this stage would do</summary><p>{step.description}</p></details></>:<p>{step.description}</p>}<div className="lab-stage-source"><SourceLink source={LAB_SOURCES[sourceFor[step.id]]}/>{step.id==='forwarding'&&options.forwarding!=='none'&&<SourceLink source={LAB_SOURCES[options.forwarding]}/>}</div></div>
        <div className="lab-step-controls"><button type="button" onClick={()=>setActive(value=>Math.max(0,value-1))} disabled={index===0}>← Previous stage</button><span>Explore each exchange</span><button type="button" onClick={()=>setActive(value=>Math.min(trace.steps.length-1,value+1))} disabled={index===trace.steps.length-1}>Next stage →</button></div>
        <div className={`lab-outcome ${trace.outcome}`} role="status"><span className="lab-outcome-mark" aria-hidden="true">{trace.outcome==='blocked'?'×':trace.outcome==='status'?'↩':'↳'}</span><div><p className="lab-eyebrow">EXPECTED RESULT</p><h3>{trace.outcomeTitle}</h3><p>{trace.outcomeDetail}</p>{trace.attempts.length>0&&<ol className="lab-attempts" aria-label="Sample backend attempts">{trace.attempts.map(attempt=><li key={attempt.server}><strong>{attempt.server}</strong><span>{attempt.result==='accepted'?'accepts join':attempt.result==='rejected'?'profile rejected':'unreachable'}</span></li>)}</ol>}</div></div>
      </section>
    </div>
    <PacketInspector packet={trace.packet}/>
    <section className="lab-lessons" aria-labelledby="lab-lessons-title"><div><p className="lab-eyebrow">03 / TAKE IT TO YOUR NETWORK</p><h2 id="lab-lessons-title">The settings must agree.</h2><p>The lab uses an ordered, two-backend example and assumes valid player credentials in online mode. It does not reproduce every packet, encryption exchange, group-balancing strategy, or failure mode.</p></div><div>{trace.notes.length>0?<ul>{trace.notes.map(note=><li key={note}>{note}</li>)}</ul>:<p>A ping can succeed without a supported login. Test the join path separately when checking a real setup.</p>}<div className="lab-next-links"><Link to="/docs/quickstart">Set up Relay →</Link><Link to="/tools#setup-check">Compare your configuration →</Link><Link to="/docs/relay">Explore the documentation →</Link></div></div></section>
  </div>;
}
