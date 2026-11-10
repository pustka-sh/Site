import { useEffect, useState } from 'react';
import External from './External.jsx';
import { githubUrl, siteApi, useCapabilities } from '../lib/siteApi.js';

export default function DocsFeedback({ page, title }) {
  const { capabilities } = useCapabilities();
  const [vote, setVote] = useState(null);
  const [voting, setVoting] = useState(false);
  const [voteError, setVoteError] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [issueTitle, setIssueTitle] = useState(`Documentation: ${title || 'Page feedback'}`.slice(0, 120));
  const [body, setBody] = useState('');
  const [website, setWebsite] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [issueError, setIssueError] = useState(null);
  const [issueUrl, setIssueUrl] = useState(null);

  useEffect(() => {
    if (!reportOpen || !capabilities?.issueReporting) return undefined;
    let active = true;
    let timer;
    setReady(false);
    setChallenge(null);
    siteApi('/issue-challenge').then((data) => {
      if (!active) return;
      setChallenge(data.challenge);
      const wait = Math.max(0, new Date(data.readyAt).getTime() - Date.now());
      timer = setTimeout(() => { if (active) setReady(true); }, Number.isFinite(wait) ? Math.min(wait, 60000) : 3500);
    }).catch((error) => { if (active) setIssueError(error.message); });
    return () => { active = false; clearTimeout(timer); };
  }, [reportOpen, capabilities?.issueReporting]);

  if (!capabilities?.feedback) return null;
  const sendVote = async (helpful) => {
    setVoting(true);
    setVoteError(null);
    try {
      await siteApi('/feedback', { method: 'POST', body: { page, helpful } });
      setVote(helpful);
    } catch (error) { setVoteError(error.message); }
    finally { setVoting(false); }
  };
  const report = async (event) => {
    event.preventDefault();
    if (!ready || !challenge) return;
    setSending(true);
    setIssueError(null);
    try {
      const result = await siteApi('/issues', { method: 'POST', body: { page, title: issueTitle.trim(), body: body.trim(), website, challenge } });
      setIssueUrl(githubUrl(result.url));
      setReportOpen(false);
      setBody('');
    } catch (error) { setIssueError(error.message); }
    finally { setSending(false); }
  };
  return (
    <section className="docs-feedback" aria-labelledby="feedback-title" data-md-skip>
      <div className="feedback-question"><h2 id="feedback-title">Did this page help?</h2><div className="feedback-votes"><button type="button" onClick={() => sendVote(true)} disabled={voting || vote !== null} aria-pressed={vote === true}>Yes</button><button type="button" onClick={() => sendVote(false)} disabled={voting || vote !== null} aria-pressed={vote === false}>Not yet</button></div></div>
      <div aria-live="polite">{vote !== null && <p className="feedback-thanks">Thanks. Your feedback has been recorded.</p>}{voteError && <p className="tool-error" role="alert">{voteError}</p>}</div>
      {capabilities.issueReporting && !issueUrl && <button type="button" className="text-link report-toggle" onClick={() => { setReportOpen((open) => !open); setIssueError(null); }} aria-expanded={reportOpen}>{reportOpen ? 'Close report −' : 'Report a documentation problem →'}</button>}
      {issueUrl && <p className="feedback-thanks">Your report was created. <External href={issueUrl}>View the GitHub issue ↗</External></p>}
      {reportOpen && <form className="feedback-report tool-form" onSubmit={report}>
        <p>Your report will be public on GitHub. Include the relevant steps and leave out passwords, forwarding secrets, or private logs.</p>
        <label htmlFor="feedback-issue-title">Issue title</label><input id="feedback-issue-title" value={issueTitle} onChange={(event) => setIssueTitle(event.target.value)} minLength={8} maxLength={120} required disabled={sending} />
        <label htmlFor="feedback-issue-body">What needs to change?</label><textarea id="feedback-issue-body" value={body} onChange={(event) => setBody(event.target.value)} placeholder="What were you trying to do, what happened, and which instruction needs attention?" minLength={20} maxLength={4000} rows={6} required disabled={sending} />
        <div className="feedback-honeypot" aria-hidden="true"><label>Website<input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" /></label></div>
        {issueError && <p className="tool-error" role="alert">{issueError}</p>}
        <button type="submit" className="button" disabled={!ready || !challenge || sending}>{sending ? 'Creating report…' : ready ? 'Create GitHub issue ↗' : 'Preparing report…'}</button>
      </form>}
    </section>
  );
}
