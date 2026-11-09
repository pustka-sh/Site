/*
 * Turns a rendered docs article back into Markdown, for "Copy as Markdown".
 * Handles what the docs actually contain: headings, paragraphs, lists, tables,
 * code blocks, callouts and inline formatting. Interactive widgets are skipped.
 */
const SKIP = new Set(['BUTTON', 'svg', 'SCRIPT', 'STYLE', 'NAV', 'INPUT', 'SELECT', 'TEXTAREA', 'FORM']);

function inline(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent.replace(/\s+/g, ' ');
  if (node.nodeType !== Node.ELEMENT_NODE || SKIP.has(node.tagName) || node.dataset.mdSkip !== undefined) return '';
  const inner = () => [...node.childNodes].map(inline).join('');
  switch (node.tagName) {
    case 'CODE': return `\`${node.textContent}\``;
    case 'STRONG': case 'B': return `**${inner().trim()}**`;
    case 'EM': case 'I': return node.classList.contains('dots') ? '' : `*${inner().trim()}*`;
    case 'A': {
      const href = node.getAttribute('href') || '';
      const abs = href.startsWith('/') || href.startsWith('#') ? new URL(href, window.location.href).href : href;
      return `[${inner().trim()}](${abs})`;
    }
    case 'BR': return '  \n';
    default: return inner();
  }
}

function block(node, out) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (node.textContent.trim()) out.push(node.textContent.trim());
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || SKIP.has(node.tagName) || node.dataset.mdSkip !== undefined) return;
  const tag = node.tagName;
  if (/^H[1-6]$/.test(tag)) return void out.push(`${'#'.repeat(Number(tag[1]))} ${inline(node).trim()}`);
  if (tag === 'P') return void out.push(inline(node).trim());
  if (node.classList.contains('code-block')) {
    const lang = node.dataset.lang || '';
    return void out.push(`\`\`\`${lang === 'terminal' || lang === 'text' ? (lang === 'terminal' ? 'bash' : '') : lang}\n${node.querySelector('pre').textContent.replace(/\n$/, '')}\n\`\`\``);
  }
  if (tag === 'PRE') return void out.push(`\`\`\`\n${node.textContent.replace(/\n$/, '')}\n\`\`\``);
  if (tag === 'ASIDE') return void out.push(`> ${inline(node).trim()}`);
  if (tag === 'UL' || tag === 'OL') {
    return void out.push([...node.children].map((li, i) => `${tag === 'OL' ? `${i + 1}.` : '-'} ${inline(li).trim()}`).join('\n'));
  }
  if (tag === 'TABLE') {
    const rows = [...node.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => inline(c).trim().replace(/\|/g, '\\|')));
    if (!rows.length) return;
    const head = `| ${rows[0].join(' | ')} |\n|${rows[0].map(() => '---').join('|')}|`;
    return void out.push([head, ...rows.slice(1).map((r) => `| ${r.join(' | ')} |`)].join('\n'));
  }
  if (tag === 'HR') return void out.push('---');
  [...node.childNodes].forEach((child) => block(child, out));
}

export function toMarkdown(root, { title, description, url } = {}) {
  const out = [];
  if (title) out.push(`# ${title}`);
  if (description) out.push(`*${description}*`);
  [...root.childNodes].forEach((n) => block(n, out));
  if (url) out.push(`---\nSource: ${url}`);
  return `${out.filter(Boolean).join('\n\n')}\n`;
}
