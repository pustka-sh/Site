import { useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';

export default function BackToTop() {
  const { scrollY } = useScroll();
  const [visible, setVisible] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setVisible(y > 900));
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          className="back-to-top"
          aria-label="Back to top"
          initial={{ opacity: 0, y: 16, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.8 }}
          whileHover={{ y: -3 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => window.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'instant' })}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 12V2M2.5 6.5 7 2l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
