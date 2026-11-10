#!/usr/bin/env node
/*
 * Pulls Relay's documentation, default configuration, supported versions and
 * commit history into src/content/relay.json.
 *
 *   npm run sync                       # clones github.com/pustka-sh/relay
 *   RELAY_DIR=../relay npm run sync    # uses a local checkout instead
 *
 * The output is committed, so building the site never needs the network and a
 * review of the diff shows exactly what changed upstream. Markdown is rendered
 * and syntax-highlighted here rather than in the browser, so visitors download
 * finished HTML. Raw HTML inside the markdown is escaped, not trusted.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync, realpathSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import GithubSlugger, { slug as slugOf } from 'github-slugger';
import hljs from 'highlight.js';

const REPO = 'https://github.com/pustka-sh/relay';
const BLOB = 'https://github.com/pustka-sh/Relay/blob/main';
const TREE = 'https://github.com/pustka-sh/Relay/tree/main';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// Runtime sync writes into the persistent data volume, never the image's source tree.
const out = process.env.OUTPUT_PATH ? resolve(process.env.OUTPUT_PATH) : join(root, 'src/content/relay.json');

// Upstream markdown files that have a page of their own on this site.
const docRoutes = {
  'docs/backend-api.md': '/docs/backend',
  'docs/client-api.md': '/docs/client',
  'docs/server-packets.md': '/docs/packets',
  'docs/protocol-ids.md': '/docs/protocol-ids',
};

// README sections pulled into site pages, by heading text.
const readmeSections = {
  relay: ['Status', 'What works', 'Before you trust it', 'Design notes'],
  quickstart: ['Requirements', 'Quick start', 'Quick start (Gradle directly)', 'Configuring backends', 'Server groups', 'Docker', 'Testing'],
  api: ['Dashboard API', 'Network routes'],
};

const readmePageRoute = { relay: '/docs/relay', quickstart: '/docs/quickstart', api: '/api' };
const readmeAnchorRoute = Object.fromEntries(
  Object.entries(readmeSections).flatMap(([page, names]) => names.map((n) => [slugOf(n), readmePageRoute[page]])),
);

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30_000 });

let dir = process.env.RELAY_DIR;
let temp = null;
if (!dir) {
  temp = mkdtempSync(join(tmpdir(), 'relay-sync-'));
  dir = join(temp, 'relay');
  console.log(`Cloning ${REPO} …`);
  execFileSync('git', ['-c', 'core.hooksPath=/dev/null', 'clone', '--quiet', '--single-branch', '--branch', 'main', REPO, dir], { stdio: 'inherit', timeout: 90_000, env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1', GIT_TERMINAL_PROMPT: '0' } });
}

try {
  const checkout = realpathSync(dir);
  const read = (p) => {
    const file = realpathSync(join(checkout, p));
    if (!file.startsWith(checkout + sep) || statSync(file).size > 4 * 1024 * 1024) throw new Error('An upstream documentation file is invalid.');
    return readFileSync(file, 'utf8');
  };
  const commit = git(dir, 'rev-parse', 'HEAD').trim();

  /* ---------- markdown ---------- */
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const langAlias = { toml: 'ini', properties: 'properties', yml: 'yaml', sh: 'bash', shell: 'bash', console: 'bash' };
  const highlight = (code, lang) => {
    const l = langAlias[lang] || lang;
    if (l && hljs.getLanguage(l)) return hljs.highlight(code, { language: l }).value;
    return escapeHtml(code);
  };

  function render(markdown, file, prefix = 'ref-') {
    const slugger = new GithubSlugger();
    const toc = [];
    const fileDir = posix.dirname(file);
    const resolveLink = (href) => {
      if (!href) return { href: '#' };
      // Upstream Markdown is content, not permission to execute a URL scheme.
      if (/^[a-z][a-z\d+.-]*:/i.test(href)) return /^https?:\/\//i.test(href) ? { href, external: true } : { href: '#' };
      if (href.startsWith('//')) return { href: '#' };
      if (href.startsWith('#')) {
        if (file !== 'README.md') return { href: `#${prefix}${href.slice(1)}` };
        const route = readmeAnchorRoute[href.slice(1)];
        return route ? { href: `${route}#${prefix}${href.slice(1)}` } : { href: `${BLOB}/README.md${href}`, external: true };
      }
      const [path, hash] = href.split('#');
      const target = posix.normalize(posix.join(fileDir, path));
      if (docRoutes[target]) return { href: docRoutes[target] + (hash ? `#ref-${hash}` : '') };
      if (target === 'README.md' && hash && readmeAnchorRoute[hash]) return { href: `${readmeAnchorRoute[hash]}#ref-${hash}` };
      if (target === 'README.md') return { href: `${BLOB}/README.md${hash ? `#${hash}` : ''}`, external: true };
      const isDir = !/\.[a-z0-9]+$/i.test(target);
      return { href: `${isDir ? TREE : BLOB}/${target}${hash ? `#${hash}` : ''}`, external: true };
    };
    const marked = new Marked({
      gfm: true,
      renderer: {
        heading({ tokens, depth }) {
          const html = this.parser.parseInline(tokens);
          const plain = html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
          const id = prefix + slugger.slug(plain);
          if (depth === 2 || depth === 3) toc.push([id, plain, depth]); // [anchor, text, upstream heading level]
          const level = Math.min(depth + 1, 4); // page h1 is the site's own title
          return `<h${level} id="${id}">${html}</h${level}>\n`;
        },
        code({ text, lang }) {
          const label = lang || 'text';
          return `<div class="code-block" data-lang="${escapeHtml(label)}"><div class="code-label"><span><i class="dots" aria-hidden="true"><b></b><b></b><b></b></i>${escapeHtml(label)}</span><button class="copy-button" type="button" data-copy>Copy</button></div><pre><code class="hljs">${highlight(text, lang)}</code></pre></div>\n`;
        },
        link({ href, title, tokens }) {
          const r = resolveLink(href);
          const text = this.parser.parseInline(tokens);
          const t = title ? ` title="${escapeHtml(title)}"` : '';
          return r.external
            ? `<a href="${escapeHtml(r.href)}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`
            : `<a href="${escapeHtml(r.href)}"${t} data-internal>${text}</a>`;
        },
        html({ text }) { return escapeHtml(text); },
        image({ href, text }) { return `<a href="${escapeHtml(resolveLink(href).href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text || 'image')}</a>`; },
      },
    });
    let html = marked.parse(markdown);
    html = html.replace(/<table>/g, '<div class="table-wrap"><table class="reference-table">').replace(/<\/table>/g, '</table></div>');
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
    return { html, toc, text };
  }

  // Split a markdown document into { heading: body } at its "## " headings.
  function sections(markdown) {
    const map = {};
    let current = null;
    for (const line of markdown.split('\n')) {
      const m = /^## (.+)$/.exec(line);
      if (m) { current = m[1].trim(); map[current] = []; continue; }
      if (current) map[current].push(line);
    }
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.join('\n')]));
  }

  const docs = {};
  for (const [file, route] of Object.entries(docRoutes)) {
    const md = read(file).replace(/^# .+\n/, ''); // the page supplies its own title
    const title = /^# (.+)$/m.exec(read(file))?.[1] || file;
    docs[route.split('/').pop()] = { title, file, source: `${BLOB}/${file}`, markdown: md, ...render(md, file) };
  }

  const readme = read('README.md');
  const readmeMap = sections(readme);
  const readmeDocs = {};
  for (const [page, names] of Object.entries(readmeSections)) {
    const md = names.filter((n) => readmeMap[n] !== undefined).map((n) => `## ${n}\n${readmeMap[n]}`).join('\n');
    readmeDocs[page] = { title: 'README', file: 'README.md', source: `${BLOB}/README.md`, markdown: md, ...render(md, 'README.md') };
  }

  /* ---------- roadmap (README status table) ---------- */
  const phases = (readmeMap.Status || '').split('\n')
    .filter((l) => /^\|\s*\d+\./.test(l))
    .map((l) => {
      const [phase, scope, state] = l.split('|').slice(1, 4).map((c) => c.trim());
      const [, n, name] = /^(\d+)\.\s*(.+)$/.exec(phase);
      const plain = state.replace(/\*\*/g, '').replace(/`/g, '');
      const status = /^working/i.test(plain) ? 'working' : /not started/i.test(plain) && !/exist/i.test(plain) ? 'planned' : 'partial';
      return { n: Number(n), name, scope: scope.replace(/`/g, ''), state: plain, status };
    });

  /* ---------- versions ---------- */
  const enumSrc = read('proxy/src/main/java/dev/relay/protocol/ProtocolVersion.java');
  const protocolDoc = read('docs/protocol-ids.md');
  const bracketed = new Set((protocolDoc.match(/\| (\d{3})† /g) || []).map((s) => Number(s.match(/\d{3}/)[0])));
  const live = new Set((protocolDoc.match(/(\d{3}) was confirmed against a\s+live/g) || []).map((s) => Number(s.slice(0, 3))));
  const joinMatch = /verified on ([\d.,\s]+(?:and [\d.]+)?)/.exec(readme);
  const joinTested = new Set(joinMatch ? joinMatch[1].split(/,|\band\b/).map((s) => s.trim()).filter(Boolean) : []);
  const versions = [...enumSrc.matchAll(/MINECRAFT_\w+\((\d+),\s*([^)]*)\)/g)].map((m) => {
    const protocol = Number(m[1]);
    const names = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
    return {
      protocol,
      versions: names,
      ids: live.has(protocol) ? 'live' : bracketed.has(protocol) ? 'bracketed' : 'report',
      joinTested: names.filter((n) => joinTested.has(n)),
    };
  });

  /* ---------- history ---------- */
  const SEP = '\x1f';
  const log = git(dir, 'log', '-n', '500', '--date=short', `--pretty=format:%H${SEP}%h${SEP}%ad${SEP}%P${SEP}%s`).trim().split('\n');
  const changelog = log.map((line) => {
    const [hash, short, date, parents, subject] = line.split(SEP);
    return { hash, short, date, subject, merge: parents.trim().split(' ').length > 1 };
  });
  const tags = git(dir, 'tag', '--list', '--sort=-creatordate').trim().split('\n').filter(Boolean);

  const data = {
    syncedAt: new Date().toISOString().slice(0, 10),
    commit,
    repo: 'https://github.com/pustka-sh/Relay',
    docs,
    readme: readmeDocs,
    versions,
    phases,
    changelog,
    tags,
    defaultConfig: read('proxy/src/main/resources/relay.default.toml'),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(data, null, 1)}\n`);
  console.log(`Wrote ${posix.relative(root, out)} — Relay ${commit.slice(0, 7)}, ${changelog.length} commits, ${versions.length} protocol versions.`);
} finally {
  if (temp && existsSync(temp)) {
    const target = resolve(temp);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('relay-sync-')) throw new Error('Refusing to remove an unexpected temporary path.');
    rmSync(target, { recursive: true, force: true });
  }
}
