import { readFileSync } from 'node:fs';

const DEFAULT_PROJECTS = JSON.parse(readFileSync(new URL('../projects.json', import.meta.url), 'utf8'));
const API = 'https://api.github.com';
const ISO = (now) => new Date(now()).toISOString();

export function serviceError(message, status = 503, code = 'UPSTREAM_UNAVAILABLE') {
  return Object.assign(new Error(message), { status, code, expose: true });
}

/** Bounded JSON reader shared with the fixed-upstream dashboard adapter. */
export async function readJsonResponse(response, limit = 2 * 1024 * 1024) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > limit) throw serviceError('The upstream response was too large.');
  if (!response.body) throw serviceError('The upstream returned an empty response.');
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > limit) throw serviceError('The upstream response was too large.');
      chunks.push(Buffer.from(chunk));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    await response.body.cancel?.().catch(() => {});
    if (error.code === 'UPSTREAM_UNAVAILABLE') throw error;
    throw serviceError('The upstream returned an invalid response.');
  }
}

function safeText(value, limit = 240) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, limit) : '';
}
function publicGithubUrl(value, fallback, hosts = ['github.com']) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && hosts.includes(url.hostname) && !url.username && !url.password ? url.href : fallback;
  } catch { return fallback; }
}
function nonnegative(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }
function validDate(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null; }

export function validateProjects(projects) {
  if (!Array.isArray(projects) || !projects.length || projects.length > 25) throw new Error('Project registry must contain between 1 and 25 projects.');
  const ids = new Set();
  return projects.map((project) => {
    const match = /^https:\/\/github\.com\/([a-z\d](?:[a-z\d-]{0,38}))\/([a-z\d_.-]{1,100})\/?$/i.exec(project.repository || '');
    if (!/^[a-z][a-z\d-]{0,39}$/.test(project.id || '') || ids.has(project.id) || !match || match[2] === '.' || match[2] === '..') throw new Error('Project registry contains an invalid project.');
    ids.add(project.id);
    return {
      id: project.id,
      name: safeText(project.name, 80) || match[2],
      description: safeText(project.description, 320),
      category: safeText(project.category, 80),
      repository: `https://github.com/${match[1]}/${match[2]}`,
      slug: `${match[1]}/${match[2]}`,
    };
  });
}

/** All requests are derived from the operator-owned project registry, never visitor URLs. */
export function createGithubService({ token = '', fetchImpl = fetch, now = Date.now, projects = DEFAULT_PROJECTS, cacheMs = 300_000, failureBackoffMs = 30_000, timeoutMs = 7_000 } = {}) {
  const registry = validateProjects(projects);
  const cache = new Map();
  // Keys are bounded by the fixed registry plus the aggregate project snapshot.
  // A failed refresh must not turn every visitor into another upstream retry.
  const failures = new Map();
  const pending = new Map();
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'pustka-site',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  async function request(path, allow404 = false) {
    try {
      const response = await fetchImpl(`${API}${path}`, { headers, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
      if (allow404 && response.status === 404) return null;
      if (!response.ok) throw serviceError('GitHub is temporarily unavailable. Please try again later.');
      return await readJsonResponse(response);
    } catch { throw serviceError('GitHub is temporarily unavailable. Please try again later.'); }
  }
  async function cached(key, load) {
    const old = cache.get(key);
    if (old && now() - old.at < cacheMs) return { ...old.value, stale: false };
    const failure = failures.get(key);
    if (failure && now() - failure.at < failureBackoffMs) {
      if (old) return { ...old.value, stale: true };
      throw failure.error;
    }
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      try {
        const value = { ...(await load()), updatedAt: ISO(now) };
        cache.set(key, { at: now(), value });
        failures.delete(key);
        return { ...value, stale: false };
      } catch (error) {
        failures.set(key, { at: now(), error });
        if (old) return { ...old.value, stale: true };
        throw error;
      } finally { pending.delete(key); }
    })();
    pending.set(key, task);
    return task;
  }
  const findProject = (id) => {
    const p = registry.find((project) => project.id === id);
    if (!p) throw serviceError('Project not found.', 404, 'PROJECT_NOT_FOUND');
    return p;
  };
  function mapRelease(release, project) {
    const tag = safeText(release.tag_name, 200);
    const fallbackUrl = `${project.repository}/releases/tag/${encodeURIComponent(tag)}`;
    return {
      id: nonnegative(release.id), tag,
      name: safeText(release.name, 200) || tag,
      publishedAt: validDate(release.published_at),
      url: publicGithubUrl(release.html_url, fallbackUrl),
      prerelease: release.prerelease === true,
      assets: (Array.isArray(release.assets) ? release.assets : []).slice(0, 100).map((asset) => {
        const digest = /^sha256:([a-f\d]{64})$/i.exec(asset.digest || '');
        return {
          id: nonnegative(asset.id), name: safeText(asset.name, 200), size: nonnegative(asset.size),
          url: publicGithubUrl(asset.browser_download_url, null),
          sha256: digest ? digest[1].toLowerCase() : null,
        };
      }).filter((asset) => asset.id && asset.name && asset.url),
    };
  }
  function getReleases(projectId = 'relay') {
    const project = findProject(projectId);
    return cached(`releases:${project.id}`, async () => {
      const payload = await request(`/repos/${project.slug}/releases?per_page=30`);
      if (!Array.isArray(payload)) throw serviceError('GitHub returned an invalid release list.');
      return { releases: payload.filter((release) => !release.draft).map((release) => mapRelease(release, project)) };
    });
  }
  function getProjects() {
    return cached('projects', async () => {
      const projects = await Promise.all(registry.map(async (project) => {
        const [repo, commits, issues, releaseResult] = await Promise.all([
          request(`/repos/${project.slug}`),
          request(`/repos/${project.slug}/commits?per_page=1`),
          request(`/search/issues?q=${encodeURIComponent(`repo:${project.slug} is:issue is:open`)}&per_page=1`),
          getReleases(project.id),
        ]);
        if (!repo || !Array.isArray(commits) || !issues || typeof issues.total_count !== 'number') throw serviceError('GitHub returned incomplete project data.');
        const { slug, ...publicProject } = project;
        const commit = commits[0];
        return {
          ...publicProject,
          stats: {
            stars: nonnegative(repo.stargazers_count),
            openIssues: nonnegative(issues.total_count),
            lastCommitAt: validDate(commit?.commit?.committer?.date || commit?.commit?.author?.date),
            lastCommitUrl: commit ? publicGithubUrl(commit.html_url, `${project.repository}/commits`) : null,
          },
          latestRelease: releaseResult.releases.find((release) => !release.prerelease) || null,
        };
      }));
      return { projects };
    });
  }
  return { getProjects, getReleases, registry: registry.map(({ slug, ...project }) => project) };
}
