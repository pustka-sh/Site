import { useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { usePrefersReducedMotion } from '../hooks/useMedia.js';

const glyphs = '█▓▒░/\\<>_-=+*#∅01';

/** Decodes text from noise when it enters the viewport, and again on hover. */
export default function ScrambleText({ text, className, as: Tag = 'span', speed = 28, hover = true }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const reduced = usePrefersReducedMotion();
  const [output, setOutput] = useState(text);
  const frame = useRef();

  const run = () => {
    if (reduced) return setOutput(text);
    cancelAnimationFrame(frame.current);
    let tick = 0;
    let last = 0;
    const step = (t) => {
      if (t - last > speed) {
        last = t;
        tick += 1;
        const revealed = Math.floor(tick / 1.6);
        setOutput(
          text
            .split('')
            .map((c, i) => (i < revealed || c === ' ' ? c : glyphs[Math.floor(Math.random() * glyphs.length)]))
            .join(''),
        );
        if (revealed >= text.length) return;
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    if (inView) run();
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, text]);

  return (
    <Tag ref={ref} className={className} aria-label={text} onMouseEnter={hover ? run : undefined}>
      <span aria-hidden="true">{output}</span>
    </Tag>
  );
}
