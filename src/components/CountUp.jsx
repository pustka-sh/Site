import { useEffect, useRef, useState } from 'react';
import { animate, useInView } from 'motion/react';

/** Counts to a real figure once visible. */
export default function CountUp({ to, duration = 1.6, format = (n) => Math.round(n).toLocaleString('en-US') }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setValue(to);
    const controls = animate(0, to, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setValue });
    return () => controls.stop();
  }, [inView, to, duration]);
  return <span ref={ref} aria-label={format(to)}>{format(value)}</span>;
}
