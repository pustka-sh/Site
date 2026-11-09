import { useCallback, useEffect, useState } from 'react';

const read = () => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

/** The site is dark by default; a visitor's choice is remembered on their device. */
export function useTheme() {
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 'light' ? '#f7f0eb' : '#080404');
    try { localStorage.setItem('pustka-theme', theme); } catch { /* storage unavailable */ }
  }, [theme]);
  const toggle = useCallback(() => {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
    setTimeout(() => root.classList.remove('theme-switching'), 450);
  }, []);
  return [theme, toggle];
}
