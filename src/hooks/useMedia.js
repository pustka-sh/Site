import { useEffect, useState } from 'react';

export function useMedia(query) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

export const useFinePointer = () => useMedia('(hover: hover) and (pointer: fine)');
export const usePrefersReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)');
