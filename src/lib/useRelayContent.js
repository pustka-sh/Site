import { useEffect, useState } from 'react';

// The synced Relay content is large, so it is its own chunk, fetched once.
let cache = null;
let pending = null;
export const loadRelayContent = () => {
  if (cache) return Promise.resolve(cache);
  pending ||= import('../content/relay.json').then((m) => (cache = m.default));
  return pending;
};

export function useRelayContent() {
  const [data, setData] = useState(cache);
  useEffect(() => {
    if (!cache) loadRelayContent().then(setData);
  }, []);
  return data;
}
