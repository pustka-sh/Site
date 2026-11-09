import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useToast } from './Toast.jsx';
import { highlight } from '../lib/highlight.js';

export default function CodeBlock({ code, label = 'terminal', lang = label === 'terminal' ? 'bash' : undefined, download }) {
  const html = useMemo(() => highlight(code, lang), [code, lang]);
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast('Copied to clipboard.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('Select the command to copy it.');
    }
  };
  return (
    <div className="code-block" data-lang={lang || label}>
      <div className="code-label">
        <span><i className="dots" aria-hidden="true"><b /><b /><b /></i>{label}</span>
        {download && (
          <button
            className="copy-button download-button"
            type="button"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
              const a = Object.assign(document.createElement('a'), { href: url, download });
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              toast(`Downloaded ${download}.`);
            }}
          >
            Download
          </button>
        )}
        <button className="copy-button" type="button" onClick={copy} aria-label={copied ? 'Copied' : `Copy ${label}`}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={copied ? 'y' : 'n'} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.15 }}>
              {copied ? '✓ Copied' : 'Copy'}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
      <pre><code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /></pre>
    </div>
  );
}

export function Callout({ children }) {
  return (
    <motion.aside
      className="callout"
      initial={{ opacity: 0, x: -12 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
    >
      <p>{children}</p>
    </motion.aside>
  );
}
