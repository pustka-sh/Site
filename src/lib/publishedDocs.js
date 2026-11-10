import { useEffect, useState } from 'react';
import { siteApi } from './siteApi.js';

export const docBase = (project, version) => `/docs/${encodeURIComponent(project)}/${encodeURIComponent(version)}`;
export const apiLink = (project, version, symbol) => `${docBase(project, version)}/api${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}`;
export const isType = (symbol) => ['class', 'interface', 'enum', 'record', 'annotation'].includes(symbol?.kind);

export function repositoryUrl(value) {
  if (typeof value !== 'string') return null;
  return /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(value) ? value.replace(/\/$/, '') : null;
}

export function sourceUrl(repository, commit, source) {
  const base = repositoryUrl(repository);
  if (!base || !/^[a-f0-9]{40}$/i.test(commit || '')) return null;
  if (!source?.path) return `${base}/tree/${commit}`;
  if (typeof source.path !== 'string') return null;
  const parts = source.path.split('/');
  if (source.path.startsWith('/') || source.path.includes('\\') || parts.some(part => !part || part === '.' || part === '..') || /[\u0000-\u001f]/.test(source.path)) return null;
  const line = Number.isSafeInteger(source.line) && source.line > 0 ? `#L${source.line}` : '';
  return `${base}/blob/${commit}/${parts.map(encodeURIComponent).join('/')}${line}`;
}

export function docsDate(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en', {dateStyle:'medium'}).format(date) : 'Not available';
}

let projectCache;
let projectPending;
let projectFetchedAt = 0;
export async function loadDocProjects() {
  if (projectCache && Date.now() - projectFetchedAt < 30000) return projectCache;
  if (!projectPending) {
    projectPending = siteApi('/docs/projects').then(data => {
      if (!Array.isArray(data.projects)) throw new Error('The documentation directory could not be read.');
      projectCache = data;
      projectFetchedAt = Date.now();
      return data;
    }).finally(() => {projectPending = null;});
  }
  return projectPending;
}

export function useDocProjects() {
  const [state, setState] = useState({loading:true, data:projectCache || null, error:null});
  useEffect(() => {
    let active = true;
    loadDocProjects().then(data => {if (active) setState({loading:false,data,error:null});}, error => {if (active) setState({loading:false,data:null,error});});
    return () => {active = false;};
  }, []);
  return state;
}

export function usePublishedResource(path) {
  const [state, setState] = useState({path,loading:true,data:null,error:null});
  useEffect(() => {
    if (!path) {setState({path,loading:false,data:null,error:null});return undefined;}
    let active = true;
    const controller = new AbortController();
    setState({path,loading:true,data:null,error:null});
    siteApi(path, {signal:controller.signal}).then(
      data => {if (active) setState({path,loading:false,data,error:null});},
      error => {if (active && error.name !== 'AbortError') setState({path,loading:false,data:null,error});},
    );
    return () => {active = false;controller.abort();};
  }, [path]);
  return state.path === path ? state : {loading:true,data:null,error:null};
}
