import { useId } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { docBase, useDocProjects } from '../lib/publishedDocs.js';

export default function DocsProjectSwitcher({currentProject = 'relay', currentVersion = '', compact = false}) {
  const {data} = useDocProjects();
  const navigate = useNavigate();
  const id = useId();
  const projects = data?.projects || [];
  const selected = projects.find(project => project.id === currentProject);
  const versions = selected?.versions || [];
  const chooseProject = (event) => {
    const project = projects.find(entry => entry.id === event.target.value);
    if (!project) return;
    const version = project.defaultVersion || project.versions?.[0]?.version;
    navigate(version ? docBase(project.id,version) : `/docs/projects#${encodeURIComponent(project.id)}`);
  };
  return <div className={`published-switcher ${compact ? 'compact' : ''}`}>
    {projects.length > 0 && <div className="published-select-fields">
      <label htmlFor={`${id}-project`}><span>Project</span><select id={`${id}-project`} value={selected?.id || ''} onChange={chooseProject}>
        {!selected && <option value="">Choose a project</option>}
        {projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select></label>
      {versions.length > 0 && <label htmlFor={`${id}-version`}><span>Version</span><select id={`${id}-version`} value={currentVersion} onChange={event => {if(event.target.value)navigate(docBase(currentProject,event.target.value));}}>
        {!currentVersion && <option value="">Current guide pages</option>}
        {currentVersion && !versions.some(entry=>entry.version===currentVersion) && <option value={currentVersion}>{currentVersion} · unavailable</option>}
        {versions.map(entry => <option key={entry.version} value={entry.version}>{entry.version}{entry.development || entry.version === 'main' ? ' · development' : ' · release'}</option>)}
      </select></label>}
    </div>}
    <Link className="published-directory-link" to="/docs/projects">Browse project docs <span aria-hidden="true">↗</span></Link>
  </div>;
}
