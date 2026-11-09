import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useFinePointer, usePrefersReducedMotion } from '../hooks/useMedia.js';

/*
 * An original, code-drawn voxel study: a cutaway of terrain with a void at its
 * centre. Blocks rise out of the dark on load, the terrain swells toward the
 * pointer, and the whole study can be viewed solid, as a wireframe, or exploded.
 * Brand marks are used separately, unmodified.
 */

const project = (x, y, z) => [310 + (x - y) * 24, 318 + (x + y) * 12 - z * 25];
const pts = (arr) => arr.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');

const palette = {
  hot: ['#ff3a32', '#a91a1b', '#6b1114'],
  bone: ['#ae8175', '#62413c', '#402724'],
  edge: ['#8b2827', '#501516', '#2c0d0e'],
  dark: ['#432424', '#281313', '#1b0c0d'],
};

function buildBlocks() {
  const blocks = [];
  for (let x = -4; x <= 3; x++) {
    for (let y = -4; y <= 3; y++) {
      if (x >= -1 && x <= 1 && y >= -1 && y <= 1) continue;
      if ((x === -4 && y >= 2) || (y === 3 && x >= 2) || (x === 3 && y <= -3)) continue;
      const hash = Math.abs((x * 71 + y * 47 + x * y * 13) % 17);
      const h = 2 + (hash > 10 ? 1 : 0) + (x === -3 && y === -2 ? 1 : 0);
      for (let z = 0; z < h; z++) {
        const inner = (x === -2 && y >= -1 && y <= 1) || (y === -2 && x >= -1 && x <= 1);
        const tint = z === h - 1 ? (inner ? 'hot' : hash > 13 ? 'bone' : 'edge') : 'dark';
        blocks.push({ x, y, z, tint, order: x + y + z * 0.001 });
      }
    }
  }
  // Detached pieces continue the grid and drift above it.
  blocks.push(
    { x: 4, y: 2, z: 2, tint: 'hot', order: 6, floating: true },
    { x: -4, y: 4, z: 1, tint: 'edge', order: 0, floating: true },
    { x: 1, y: -5, z: 4, tint: 'bone', order: -4, floating: true },
    { x: 3, y: 4, z: 0, tint: 'edge', order: 7, floating: true },
  );
  blocks.sort((a, b) => a.order - b.order || a.z - b.z);
  return blocks.map((b, i) => {
    const { x, y, z } = b;
    const faces = {
      top: pts([project(x, y, z + 1), project(x + 1, y, z + 1), project(x + 1, y + 1, z + 1), project(x, y + 1, z + 1)]),
      left: pts([project(x, y + 1, z + 1), project(x + 1, y + 1, z + 1), project(x + 1, y + 1, z), project(x, y + 1, z)]),
      right: pts([project(x + 1, y, z + 1), project(x + 1, y + 1, z + 1), project(x + 1, y + 1, z), project(x + 1, y, z)]),
    };
    const [cx, cy] = project(x + 0.5, y + 0.5, z + 1);
    // Exploded view: push blocks away from the void along x/y and upward by height.
    const [ex, ey] = project(x * 1.55 + 0.5, y * 1.55 + 0.5, z * 1.7 + 1);
    return { ...b, i, faces, cx, cy, explode: [ex - cx, ey - cy] };
  });
}

const floorLines = (() => {
  let d = '';
  for (let i = -7; i <= 7; i++) {
    const a = project(-7, i, -1), b = project(7, i, -1), c = project(i, -7, -1), e = project(i, 7, -1);
    d += `M${a}L${b}M${c}L${e}`;
  }
  return d;
})();

const holeFloor = pts([project(-1, -1, 0), project(2, -1, 0), project(2, 2, 0), project(-1, 2, 0)]);
const [holeX, holeY] = project(0.5, 0.5, 0);

export default function VoxelSpecimen() {
  const [mode, setMode] = useState('solid');
  const blocks = useMemo(buildBlocks, []);
  const svgRef = useRef(null);
  const voxelRefs = useRef([]);
  const fine = useFinePointer();
  const reduced = usePrefersReducedMotion();
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // Gentle 3D parallax of the whole figure.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-1, 1], [-7, 7]), { stiffness: 120, damping: 20 });
  const rotateX = useSpring(useTransform(py, [-1, 1], [6, -6]), { stiffness: 120, damping: 20 });

  const pointer = useRef(null);
  const raf = useRef();

  const applyOffsets = () => {
    const exploded = modeRef.current === 'exploded';
    const p = pointer.current;
    blocks.forEach((b, idx) => {
      const el = voxelRefs.current[idx];
      if (!el) return;
      let lift = 0;
      if (p && !reduced) {
        const d = Math.hypot(p.x - b.cx, (p.y - b.cy) * 1.6);
        lift = Math.max(0, 1 - d / 120) ** 2 * 26;
      }
      const ox = exploded ? b.explode[0] : 0;
      const oy = (exploded ? b.explode[1] : 0) - lift;
      el.style.translate = `${ox.toFixed(1)}px ${oy.toFixed(1)}px`;
    });
  };

  useEffect(applyOffsets, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerMove = (e) => {
    if (!fine) return;
    const svg = svgRef.current;
    const r = svg.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width) * 2 - 1);
    py.set(((e.clientY - r.top) / r.height) * 2 - 1);
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    pointer.current = { x: pt.x, y: pt.y };
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(applyOffsets);
  };
  const onPointerLeave = () => {
    px.set(0);
    py.set(0);
    pointer.current = null;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(applyOffsets);
  };

  const wire = mode === 'wire';
  const modes = [['solid', 'Solid'], ['wire', 'Wireframe'], ['exploded', 'Exploded']];

  return (
    <figure className={`specimen mode-${mode}`} aria-label="An original isometric voxel study with a void at its center">
      <div className="specimen-top"><span>VOID STUDY / 001</span><span>NOTHING → SOMETHING</span></div>
      <motion.div className="specimen-stage" style={fine && !reduced ? { rotateX, rotateY, transformPerspective: 1200 } : undefined}>
        <svg
          ref={svgRef}
          className="specimen-canvas"
          viewBox="0 0 620 560"
          aria-hidden="true"
          onPointerMove={onPointerMove}
          onPointerLeave={onPointerLeave}
        >
          <defs>
            <radialGradient id="voidGlow"><stop offset="0" stopColor="#ff2a2a" stopOpacity=".16" /><stop offset="1" stopColor="#ff2a2a" stopOpacity="0" /></radialGradient>
            <radialGradient id="holeGlow"><stop offset="0" stopColor="#ff2a2a" stopOpacity=".9" /><stop offset=".55" stopColor="#a8161a" stopOpacity=".35" /><stop offset="1" stopColor="#080404" stopOpacity="0" /></radialGradient>
            <pattern id="scan" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 1H6" stroke="#080404" strokeOpacity=".18" strokeWidth="2" /></pattern>
            <linearGradient id="sweep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff2a2a" stopOpacity="0" /><stop offset=".5" stopColor="#ff2a2a" stopOpacity=".22" /><stop offset="1" stopColor="#ff2a2a" stopOpacity="0" /></linearGradient>
          </defs>
          <ellipse className="void-glow" cx="310" cy="340" rx="220" ry="115" fill="url(#voidGlow)" />
          <path className="floor-grid" d={floorLines} stroke="#3f1919" strokeWidth=".55" opacity=".65" />
          <path d="M310 166V456M42 318H578" stroke="#702024" strokeDasharray="2 6" strokeWidth=".7" opacity=".5" className="axis-lines" />
          <polygon points={holeFloor} fill="#050202" stroke="#5a1a1a" strokeWidth=".75" />
          <ellipse className="hole-pulse" cx={holeX} cy={holeY} rx="62" ry="31" fill="url(#holeGlow)" />
          <g className="hole-motes">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <rect key={i} x={holeX - 26 + i * 10} y={holeY - 4} width="3" height="3" fill={i % 3 === 0 ? '#ffb000' : '#ff2a2a'} style={{ animationDelay: `${i * 0.55}s` }} />
            ))}
          </g>
          {blocks.map((b, idx) => {
            const c = palette[b.tint];
            const group = (
              <g
                key={idx}
                ref={(el) => { voxelRefs.current[idx] = el; }}
                className="voxel"
                style={{ animationDelay: `${0.25 + idx * 0.008 + b.z * 0.05}s` }}
              >
                <polygon points={b.faces.left} style={{ fill: wire ? '#080404' : c[1], stroke: wire ? '#7b2528' : '#6a2525' }} strokeWidth=".75" />
                <polygon points={b.faces.right} style={{ fill: wire ? '#080404' : c[2], stroke: wire ? '#7b2528' : '#6a2525' }} strokeWidth=".75" />
                <polygon className="voxel-top" points={b.faces.top} style={{ fill: wire ? '#110706' : c[0], stroke: wire ? '#bd3a35' : '#6a2525' }} strokeWidth=".75" />
              </g>
            );
            return b.floating ? (
              <g key={idx} className="voxel-float" style={{ animationDelay: `${idx % 4 * -1.3}s` }}>{group}</g>
            ) : group;
          })}
          <path d="M70 200h75l43 42M488 350h57v38" fill="none" stroke="#93534b" strokeWidth=".7" className="callout-lines" />
          <circle className="ping" cx="188" cy="242" r="2" fill="#ff2a2a" />
          <circle className="ping" cx="488" cy="350" r="2" fill="#ff2a2a" style={{ animationDelay: '1.2s' }} />
          <g fill="#b3978e" fontSize="8" fontFamily="JetBrains Mono,monospace" letterSpacing="1">
            <text x="70" y="186">THE SURFACE</text>
            <text x="486" y="408">THE UNKNOWN</text>
            <text x="264" y="492" fill="#855e57">X +  /  Z −</text>
          </g>
          <path d="M22 132v-13h13M584 132v-13h-13M22 485v13h13M584 485v13h-13" stroke="#73302b" fill="none" className="corner-marks" />
          <rect x="90" y="150" width="440" height="290" fill="url(#scan)" pointerEvents="none" />
          <rect className="scan-sweep" x="22" y="119" width="576" height="60" fill="url(#sweep)" pointerEvents="none" />
        </svg>
      </motion.div>
      <figcaption className="specimen-controls">
        <span>A WORLD IS ONLY THE BEGINNING.</span>
        <div className="control-buttons" role="group" aria-label="Illustration view">
          {modes.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>
              {mode === id && <motion.span layoutId="specimen-mode" className="mode-pill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
              <span className="mode-label">{label}</span>
            </button>
          ))}
        </div>
      </figcaption>
    </figure>
  );
}
