import { useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';
import { usePrefersReducedMotion } from '../hooks/useMedia.js';

/*
 * Types out the real quick-start commands. Comments describe what the upstream
 * guide says each step does; no output is invented.
 */
const script = [
  { kind: 'comment', text: '# 01 / clone and launch with Gradle' },
  { kind: 'cmd', text: 'git clone https://github.com/pustka-sh/Relay.git' },
  { kind: 'cmd', text: 'cd Relay' },
  { kind: 'cmd', text: './gradlew run' },
  { kind: 'comment', text: '# first launch creates run/relay.toml + a forwarding secret' },
  { kind: 'comment', text: '# 02 / link a Paper backend and check the setup' },
  { kind: 'cmd', text: 'py relay.py link lobby /path/to/paper-server' },
  { kind: 'cmd', text: 'py relay.py doctor' },
  { kind: 'cmd', text: 'py relay.py run' },
];

export default function Terminal() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -20% 0px' });
  const reduced = usePrefersReducedMotion();
  const [lines, setLines] = useState(reduced ? script.map((l) => l.text) : []);
  const [done, setDone] = useState(reduced);

  useEffect(() => {
    if (!inView || reduced) return;
    let line = 0;
    let char = 0;
    let timer;
    const tick = () => {
      if (line >= script.length) return setDone(true);
      const current = script[line];
      const at = line;
      if (current.kind === 'comment') {
        setLines((prev) => [...prev.slice(0, at), current.text]);
        line += 1;
        char = 0;
        timer = setTimeout(tick, 260);
        return;
      }
      char += 1;
      const typed = current.text.slice(0, char);
      setLines((prev) => [...prev.slice(0, at), typed]);
      if (char >= current.text.length) {
        line += 1;
        char = 0;
        timer = setTimeout(tick, 380);
      } else {
        timer = setTimeout(tick, 18 + Math.random() * 40);
      }
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [inView, reduced]);

  return (
    <div className="terminal" ref={ref}>
      <div className="terminal-bar">
        <i className="dots" aria-hidden="true"><b /><b /><b /></i>
        <span>~/relay — quick start</span>
        <span className="terminal-status">{done ? 'READY' : 'RUNNING'}</span>
      </div>
      <pre aria-label="Relay quick start commands">
        {lines.map((text, i) => (
          <div key={i} className={script[i].kind === 'comment' ? 't-comment' : 't-cmd'}>
            {script[i].kind === 'cmd' && <span className="t-prompt">$ </span>}
            {text}
            {i === lines.length - 1 && !done && <span className="caret" aria-hidden="true" />}
          </div>
        ))}
        {done && <div className="t-cmd"><span className="t-prompt">$ </span><span className="caret" aria-hidden="true" /></div>}
      </pre>
    </div>
  );
}
