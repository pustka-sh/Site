import { useEffect, useState } from 'react';

export class SiteApiError extends Error {
  constructor(message, status = 0, code = 'UNAVAILABLE') {
    super(message);
    this.name = 'SiteApiError';
    this.status = status;
    this.code = code;
  }
}

/** Only same-origin site endpoints are used by the browser. */
export async function siteApi(path, { method = 'GET', body, signal } = {}) {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid site API path.');
  let response;
  try {
    response = await fetch(`/api/site${path}`, {
      method,
      credentials: 'same-origin',
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new SiteApiError('The workshop service could not be reached. Please try again shortly.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new SiteApiError('This feature is available when the site is running with its backend.', response.status);
  }
  let data;
  try { data = await response.json(); } catch { throw new SiteApiError('The workshop service returned an unreadable response.', response.status); }
  if (!response.ok) {
    throw new SiteApiError(data?.error?.message || 'The request could not be completed.', response.status, data?.error?.code || 'REQUEST_FAILED');
  }
  return data;
}

let capabilitiesPromise;
let capabilitiesFetchedAt = 0;
export function getCapabilities() {
  if (!capabilitiesPromise || Date.now() - capabilitiesFetchedAt > 30000) {
    capabilitiesFetchedAt = Date.now();
    capabilitiesPromise = siteApi('/capabilities');
  }
  return capabilitiesPromise;
}

export function useCapabilities() {
  const [state, setState] = useState({ loading: true, capabilities: null, error: null });
  useEffect(() => {
    let active = true;
    getCapabilities().then(
      (capabilities) => { if (active) setState({ loading: false, capabilities, error: null }); },
      (error) => { if (active) setState({ loading: false, capabilities: null, error }); },
    );
    return () => { active = false; };
  }, []);
  return state;
}

export function displayDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(date);
}

export function githubUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.href : null;
  } catch { return null; }
}
