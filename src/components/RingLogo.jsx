import { useId } from 'react';
import { motion } from 'motion/react';

/**
 * The supplied pustka mark, drawn with the exact brand geometry so each arc can
 * be animated. `draw` strokes it in. The mark is never rotated (brand rule).
 */
const arcs = [
  { color: '#F4E9E4', rotate: -150 },
  { color: '#FF2A2A', rotate: -30 },
  { color: '#A8161A', rotate: 90 },
];

export default function RingLogo({ size = 42, draw = false, glow = true, className = '' }) {
  const filterId = `ring-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg className={`ring-logo ${className}`} width={size} height={size} viewBox="0 0 360 360" aria-hidden="true">
      {glow && (
        <defs>
          <filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="7" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
      )}
      {/* Shown only in light mode: the brand mark always sits on Void. */}
      <rect className="ring-backing" width="360" height="360" fill="#080404" />
      <g className="ring-content">
      <g filter={glow ? `url(#${filterId})` : undefined}>
        <g className="ring-arcs">
          {arcs.map((arc, i) => (
            <motion.circle
              key={arc.color}
              cx="180" cy="180" r="118" fill="none" stroke={arc.color} strokeWidth="40" strokeLinecap="round"
              transform={`rotate(${arc.rotate} 180 180)`}
              initial={draw ? { strokeDasharray: '0 741.4' } : false}
              animate={{ strokeDasharray: '180 561.4' }}
              transition={{ duration: 0.9, delay: draw ? 0.15 + i * 0.18 : 0, ease: [0.65, 0, 0.35, 1] }}
            />
          ))}
        </g>
        <motion.line
          x1="92" y1="268" x2="268" y2="92" stroke="#FFB000" strokeWidth="40" strokeLinecap="round"
          initial={draw ? { pathLength: 0, opacity: 0 } : false}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: draw ? 0.8 : 0, ease: [0.65, 0, 0.35, 1] }}
        />
      </g>
      </g>
    </svg>
  );
}
