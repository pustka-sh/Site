import { useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useFinePointer } from '../hooks/useMedia.js';

/** A card that tilts in 3D toward the pointer and carries a spotlight under it. */
export default function TiltCard({ children, className = '', max = 8, as = 'div', ...rest }) {
  const ref = useRef(null);
  const fine = useFinePointer();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 200, damping: 20 });
  const sy = useSpring(py, { stiffness: 200, damping: 20 });
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const lx = useTransform(px, (v) => `${v * 100}%`);
  const ly = useTransform(py, (v) => `${v * 100}%`);
  const spotlight = useMotionTemplate`radial-gradient(420px circle at ${lx} ${ly}, rgba(255,42,42,.14), transparent 45%)`;
  const Tag = motion[as];

  const onMove = (e) => {
    if (!fine) return;
    const r = ref.current.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const reset = () => { px.set(0.5); py.set(0.5); };

  return (
    <Tag
      ref={ref}
      className={`tilt-card ${className}`}
      style={fine ? { rotateX, rotateY, transformPerspective: 900 } : undefined}
      onPointerMove={onMove}
      onPointerLeave={reset}
      {...rest}
    >
      {fine && <motion.span className="tilt-spotlight" style={{ background: spotlight }} aria-hidden="true" />}
      {children}
    </Tag>
  );
}
