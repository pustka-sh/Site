import { useEffect, useState } from 'react';
import { displayDate, githubUrl, siteApi, useCapabilities } from '../lib/siteApi.js';

export default function ProjectStats({project = 'relay'}) {
  const {capabilities} = useCapabilities();
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!capabilities?.backend) return undefined;
    let active = true;
    siteApi('/projects').then(value => {if (active) setData(value);}).catch(() => {});
    return () => {active = false;};
  }, [capabilities?.backend]);
  const entry = data?.projects?.find(p => p.id === project);
  if (!entry?.stats) return null;
  const {stats} = entry;
  return <div className="project-live-stats" aria-label="Cached GitHub project information">
    <span>{stats.stars ?? '—'} stars</span><span>{stats.openIssues ?? '—'} open issues</span>
    {stats.lastCommitAt && <a href={githubUrl(stats.lastCommitUrl) || entry.repository} target="_blank" rel="noopener noreferrer">Updated {displayDate(stats.lastCommitAt)} ↗</a>}
    <small>{data.stale ? 'Last cached GitHub snapshot' : 'From GitHub · cached'}</small>
  </div>;
}
