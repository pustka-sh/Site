import { useEffect, useId, useState } from 'react';
import { usePrefersReducedMotion } from '../hooks/useMedia.js';

/*
 * Relay's routing at a glance. A packet travels from the client, through the
 * proxy, to the selected backend. Visitors can pick the destination; until they
 * do, it alternates on its own.
 */
const routes = {
  lobby: { label: 'LOBBY', path: 'M77 110H310V61H377', branch: 'M260 110h50V61h67' },
  backend: { label: 'BACKEND', path: 'M77 110H310V159H377', branch: 'M310 110v49h67' },
};

export default function Topology({ caption = 'ROUTING, AT A GLANCE / 01' }) {
  const [target, setTarget] = useState('lobby');
  const [manual, setManual] = useState(false);
  const reduced = usePrefersReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  useEffect(() => {
    if (manual || reduced) return;
    const t = setInterval(() => setTarget((v) => (v === 'lobby' ? 'backend' : 'lobby')), 3200);
    return () => clearInterval(t);
  }, [manual, reduced]);

  const pick = (id) => { setManual(true); setTarget(id); };
  const keyPick = (id) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(id); } };

  return (
    <div className="topology">
      <svg viewBox="0 0 460 220" role="img" aria-label={`Relay routes a Minecraft client to the ${routes[target].label.toLowerCase()} server`}>
        <defs>
          <pattern id={`tiny-grid-${uid}`} width="8" height="8" patternUnits="userSpaceOnUse"><path d="M8 0H0V8" fill="none" stroke="#ff2a2a" strokeWidth=".5" /></pattern>
          <filter id={`packet-glow-${uid}`} x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>
        <g fill="none" stroke="#85352f" strokeWidth="1">
          <path d="M77 110H190" className="flow" />
          {Object.entries(routes).map(([id, r]) => (
            <path key={id} d={r.branch} className={`flow ${target === id ? 'flow-active' : ''}`} />
          ))}
          <path d="M100 106l7 4-7 4m43-8 7 4-7 4m193-57 7 4-7 4m0 90 7 4-7 4" stroke="#ff2a2a" />
          <rect x="27" y="88" width="50" height="44" fill="#100707" />
          <path d="M38 100h28v17H38zM43 122h18" />
          <rect x="190" y="75" width="70" height="70" fill="#210b0a" stroke="#ff2a2a" className="relay-core" />
          <rect x="196" y="81" width="58" height="58" fill={`url(#tiny-grid-${uid})`} opacity=".3" />
          <path d="M213 95h24v30h-24zm0 13h24M225 95v30" stroke="#ff2a2a" />
        </g>
        {Object.entries(routes).map(([id, r]) => {
          const y = id === 'lobby' ? 40 : 138;
          const active = target === id;
          return (
            <g
              key={id}
              className={`topology-node ${active ? 'active' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={active}
              aria-label={`Route to ${r.label.toLowerCase()}`}
              onClick={() => pick(id)}
              onKeyDown={keyPick(id)}
            >
              <rect x="377" y={y} width="49" height="43" fill="#100707" stroke={active ? '#ff2a2a' : '#85352f'} />
              <path d={`M387 ${y + 11}h28m-28 10h28`} stroke={active ? '#ff2a2a' : '#85352f'} />
              <text x="402" y={id === 'lobby' ? 101 : 200} textAnchor="middle" fontFamily="JetBrains Mono,monospace" fontSize="8" fill={active ? '#ff2a2a' : '#ad928a'}>{r.label}</text>
            </g>
          );
        })}
        <g fill="#ad928a" fontFamily="JetBrains Mono,monospace" fontSize="8" textAnchor="middle">
          <text x="52" y="155">CLIENT</text>
          <text x="225" y="168" fill="#ff2a2a">RELAY</text>
        </g>
        {!reduced && (
          <g key={target}>
            <circle r="6" fill="#ff2a2a" filter={`url(#packet-glow-${uid})`} opacity=".8">
              <animateMotion dur="1.6s" repeatCount="indefinite" path={routes[target].path} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".6 0 .4 1" />
            </circle>
            <rect x="-2.5" y="-2.5" width="5" height="5" fill="#ffb000">
              <animateMotion dur="1.6s" repeatCount="indefinite" path={routes[target].path} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".6 0 .4 1" />
            </rect>
          </g>
        )}
      </svg>
      <span className="topology-caption">{caption}</span>
      <span className="topology-hint">{manual ? 'ROUTE PINNED' : 'CLICK A SERVER TO ROUTE'}</span>
    </div>
  );
}
