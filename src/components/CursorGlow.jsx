import { useEffect, useRef } from 'react';
import { useFinePointer, usePrefersReducedMotion } from '../hooks/useMedia.js';

/** A soft red light that trails the pointer across the page. */
export default function CursorGlow() {
  const ref = useRef(null);
  const fine = useFinePointer();
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!fine || reduced) return;
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 3;
    let tx = x;
    let ty = y;
    let raf;
    const onMove = (e) => { tx = e.clientX; ty = e.clientY; ref.current?.classList.add('on'); };
    const tick = () => {
      x += (tx - x) * 0.12;
      y += (ty - y) * 0.12;
      if (ref.current) ref.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', onMove); };
  }, [fine, reduced]);

  if (!fine || reduced) return null;
  return <div ref={ref} className="cursor-glow" aria-hidden="true" />;
}
