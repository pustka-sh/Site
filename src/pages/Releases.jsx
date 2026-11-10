import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import External from '../components/External.jsx';
import { displayDate, githubUrl, siteApi } from '../lib/siteApi.js';

const sizeLabel = (bytes) => Number.isFinite(bytes) ? bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB` : '';
const safeAssetUrl = (value) => {
  try { const url = new URL(value, location.origin); return url.protocol === 'https:' || url.origin === location.origin ? url.href : null; } catch { return null; }
};

export default function Releases() {
  const [params] = useSearchParams();
  const project = params.get('project') || 'relay';
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, data: null, error: null });
    siteApi(`/releases?project=${encodeURIComponent(project)}`, { signal: controller.signal }).then((data) => setState({ loading: false, data, error: null })).catch((error) => { if (error.name !== 'AbortError') setState({ loading: false, data: null, error: error.message }); });
    return () => controller.abort();
  }, [project]);
  return <div className="container releases-page workshop-page"><header className="page-intro"><p className="section-label">RELEASE REGISTER / {project}</p><h1>Something you can run.</h1><p>Published builds and available SHA-256 checksums, pulled from the project’s GitHub releases.</p></header>{state.loading && <p className="service-message" role="status">Looking up published releases…</p>}{state.error && <p className="tool-error" role="alert">{state.error}</p>}{state.data && !state.data.releases?.length && <section className="honest-empty"><span aria-hidden="true">∅</span><h2>No tagged releases yet.</h2><p>When this project publishes a release, its files will appear here. There is no download to claim before it exists.</p><External href="https://github.com/pustka-sh/Relay">Follow development on GitHub ↗</External></section>}<div className="release-register">{(state.data?.releases || []).map((release) => <article className="release-entry" key={release.id}><div className="release-meta"><time dateTime={release.publishedAt}>{displayDate(release.publishedAt)}</time><span className={`status-badge ${release.prerelease ? 'status-warn' : 'status-pass'}`}>{release.prerelease ? 'Pre-release' : 'Release'}</span></div><div className="release-main"><h2>{release.name || release.tag}</h2><p className="release-tag">{release.tag}</p>{githubUrl(release.url) && <External href={release.url} className="text-link">Release notes ↗</External>}<ul className="release-assets">{(release.assets || []).map((asset) => <li key={asset.id}><div className="asset-title"><strong>{asset.name}</strong><span>{sizeLabel(asset.size)}</span>{safeAssetUrl(asset.url) && <a href={safeAssetUrl(asset.url)} className="text-link" target="_blank" rel="noopener noreferrer">Download ↗</a>}</div><div className="asset-checksum"><span>SHA-256</span>{/^[a-f0-9]{64}$/i.test(asset.sha256 || '') ? <code>{asset.sha256}</code> : <span>Not published for this asset.</span>}</div></li>)}</ul>{!release.assets?.length && <p className="field-hint">This release has no attached build files. Check the upstream release notes for instructions.</p>}</div></article>)}</div>{state.data?.updatedAt && <p className="data-timestamp">{state.data.stale ? 'Showing cached data · ' : 'Updated · '}{displayDate(state.data.updatedAt)}</p>}</div>;
}
