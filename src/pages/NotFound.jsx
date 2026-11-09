import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import RingLogo from '../components/RingLogo.jsx';

export default function NotFound() {
  return (
    <div className="container page-intro not-found">
      <motion.div className="nf-ring" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 120, damping: 14 }} aria-hidden="true">
        <RingLogo size={160} spin draw />
      </motion.div>
      <p className="section-label">404 / THE ACTUAL VOID</p>
      <h1 className="glitch" data-text="Nothing here. Yet.">Nothing here. Yet.</h1>
      <p>That path doesn’t lead to a page. Press <kbd>/</kbd> to search, or head back.</p>
      <Link className="button" to="/">Back to the workshop →</Link>
    </div>
  );
}
