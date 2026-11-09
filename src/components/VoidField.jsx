import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../hooks/useMedia.js';

/**
 * A full-page canvas of slow embers and square "voxel dust" that drift upward
 * and lean toward the pointer, as if the void were breathing. Pauses when the
 * tab is hidden and stays off for people who prefer reduced motion.
 */
export default function VoidField({ intense = false }) {
  const canvasRef = useRef(null);
  const reduced = usePrefersReducedMotion();
  const intenseRef = useRef(intense);
  intenseRef.current = intense;

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let raf;
    let particles = [];
    const pointer = { x: -9999, y: -9999 };
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const colors = ['255,42,42', '168,22,26', '244,233,228', '255,176,0'];

    const spawn = (anywhere) => ({
      x: Math.random() * width,
      y: anywhere ? Math.random() * height : height + 10,
      size: Math.random() < 0.18 ? 2 + Math.random() * 2.5 : 0.6 + Math.random() * 1.2,
      speed: 0.08 + Math.random() * 0.32,
      drift: (Math.random() - 0.5) * 0.15,
      alpha: 0.12 + Math.random() * 0.45,
      color: colors[Math.random() < 0.7 ? 0 : Math.random() < 0.6 ? 1 : Math.random() < 0.7 ? 2 : 3],
      phase: Math.random() * Math.PI * 2,
      square: Math.random() < 0.35,
    });

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round(Math.min(110, (width * height) / 16000));
      particles = Array.from({ length: count }, () => spawn(true));
    };

    const onMove = (e) => { pointer.x = e.clientX; pointer.y = e.clientY; };
    const onLeave = () => { pointer.x = -9999; pointer.y = -9999; };

    let t = 0;
    const draw = () => {
      t += 1;
      const boost = intenseRef.current ? 3.2 : 1;
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        const dx = pointer.x - p.x;
        const dy = pointer.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 180) {
          const pull = (1 - dist / 180) * 0.6;
          p.x += (dx / dist) * pull;
          p.y += (dy / dist) * pull;
        }
        p.y -= p.speed * boost;
        p.x += p.drift + Math.sin(t * 0.01 + p.phase) * 0.12;
        if (p.y < -10 || p.x < -20 || p.x > width + 20) Object.assign(p, spawn(false));
        const flicker = 0.75 + Math.sin(t * 0.03 + p.phase) * 0.25;
        ctx.fillStyle = `rgba(${p.color},${p.alpha * flicker})`;
        if (p.square) {
          ctx.fillRect(p.x, p.y, p.size * 1.4, p.size * 1.4);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(draw);
    };

    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduced]);

  if (reduced) return null;
  return <canvas ref={canvasRef} className="void-field" aria-hidden="true" />;
}
