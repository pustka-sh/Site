import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import RingLogo from './RingLogo.jsx';

/** A brief, once-per-session intro where the mark draws itself out of the void. */
export default function IntroLoader() {
  const [show, setShow] = useState(() => {
    try {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
      return !sessionStorage.getItem('pustka-intro');
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!show) return;
    try { sessionStorage.setItem('pustka-intro', '1'); } catch { /* storage unavailable */ }
    const t = setTimeout(() => setShow(false), 1750);
    const skip = () => setShow(false);
    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('pointerdown', skip, { once: true });
    return () => { clearTimeout(t); window.removeEventListener('keydown', skip); window.removeEventListener('pointerdown', skip); };
  }, [show]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="intro"
          aria-hidden="true"
          exit={{ clipPath: 'circle(0% at 50% 50%)', opacity: 0.6 }}
          initial={{ clipPath: 'circle(150% at 50% 50%)' }}
          transition={{ duration: 0.75, ease: [0.76, 0, 0.24, 1] }}
        >
          <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}>
            <RingLogo size={120} draw />
          </motion.div>
          <motion.p initial={{ opacity: 0, letterSpacing: '0.6em' }} animate={{ opacity: 1, letterSpacing: '0.3em' }} transition={{ delay: 0.6, duration: 0.9 }}>
            FROM NOTHING, SOMETHING
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
