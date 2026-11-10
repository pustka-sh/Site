import { useEffect, useState } from 'react';

// Prefer the backend's latest successful snapshot; a static build remains usable.
let cache = null;
let pending = null;
export const loadRelayContent = () => {
  if (cache) return Promise.resolve(cache);
  pending ||= fetch('/api/site/content', {headers:{Accept:'application/json'}, signal:AbortSignal.timeout(5000)})
    .then(async response => {
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Static deployment');
      const data = await response.json();
      if (!Array.isArray(data.versions) || !data.docs || !data.readme) throw new Error('Invalid content snapshot');
      return data;
    })
    .catch(() => import('../content/relay.json').then(m => m.default))
    .then(data => (cache = data));
  return pending;
};

export function useRelayContent() {
  const [data, setData] = useState(cache);
  useEffect(() => {
    if (!cache) loadRelayContent().then(setData);
  }, []);
  return data;
}
