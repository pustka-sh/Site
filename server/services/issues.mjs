import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const invalid = message => Object.assign(new Error(message), {status: 400, code: 'INVALID_REPORT', expose:true});
export function createIssueService({token = '', repository = 'pustka-sh/Relay', enabled = false, fetchImpl = fetch, now = Date.now, challengeSecret = randomBytes(32)} = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid issue repository.');
  const used = new Map();
  const mac = value => createHmac('sha256', challengeSecret).update(value).digest('base64url');
  const active = !!(enabled && token);
  return {
    enabled: active,
    challenge(ip) {
      if (!active) throw Object.assign(new Error('Issue reporting is not configured.'), {status: 503, code: 'NOT_CONFIGURED'});
      const issued = now(), nonce = randomBytes(16).toString('base64url');
      const body = Buffer.from(JSON.stringify({issued, nonce})).toString('base64url');
      return {challenge: `${body}.${mac(`${body}:${ip}`)}`, readyAt: new Date(issued + 3000).toISOString(), expiresAt: new Date(issued + 600000).toISOString()};
    },
    async report({page, title, body, website = '', challenge}, ip) {
      if (!active) throw Object.assign(new Error('Issue reporting is not configured.'), {status: 503, code: 'NOT_CONFIGURED'});
      if (website || typeof challenge !== 'string' || challenge.length > 512) throw invalid('Please reload the report form and try again.');
      const [payload, signature, extra] = challenge.split('.');
      const expected = mac(`${payload}:${ip}`);
      if (extra || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw invalid('Please reload the report form and try again.');
      let data;
      try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw invalid('Please reload the report form.'); }
      const elapsed = now() - data.issued;
      if (!Number.isFinite(elapsed) || elapsed < 3000 || elapsed > 600000 || used.has(data.nonce)) throw invalid(elapsed < 3000 ? 'Please wait a moment before submitting.' : 'This report form has expired. Reopen it to try again.');
      for (const [nonce, expiry] of used) if (expiry < now()) used.delete(nonce);
      if (used.size > 10000) throw Object.assign(new Error('Reporting is temporarily busy.'), {status: 503, code: 'REPORT_CAPACITY'});
      used.set(data.nonce, now() + 600000);
      // Visitor reports are plain text. Neutralize notification syntax and HTML.
      const clean = value => value.replaceAll('@', '＠').replaceAll('<', '‹').replaceAll('>', '›');
      let response;
      try {
        response = await fetchImpl(`https://api.github.com/repos/${repository}/issues`, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
          headers: {'Accept':'application/vnd.github+json','Authorization':`Bearer ${token}`,'User-Agent':'pustka-site','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},
          body: JSON.stringify({title: `[Docs] ${clean(title)}`, body: `Anonymous website report\n\nPage: ${page}\n\n${clean(body)}`}),
        });
        if (!response.ok) throw new Error('upstream');
        const result = await response.json();
        if (typeof result.html_url !== 'string' || !result.html_url.startsWith(`https://github.com/${repository}/issues/`)) throw new Error('upstream');
        return {url: result.html_url};
      } catch {
        throw Object.assign(new Error('The report could not be filed. Please use the GitHub issue link instead.'), {status: 502, code: 'REPORT_UNAVAILABLE'});
      }
    },
  };
}
