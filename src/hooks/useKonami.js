import { useEffect, useState } from 'react';

const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

/** A small secret: the classic code toggles "void mode". */
export function useKonami() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    let index = 0;
    const onKey = (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      index = key === sequence[index] ? index + 1 : key === sequence[0] ? 1 : 0;
      if (index === sequence.length) {
        index = 0;
        setActive((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return active;
}
