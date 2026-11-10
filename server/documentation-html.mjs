const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

/** Keep shared links and search engines on the actual documentation URL. */
export function documentationHtml(template, {title,description,url}) {
  let html = template.replace(/<title>[^<]*<\/title>/,()=>`<title>${escape(title)}</title>`);
  for (const [prefix,value] of [
    ['<meta name="description" content="',description],
    ['<meta property="og:title" content="',title],
    ['<meta property="og:description" content="',description],
    ['<meta property="og:url" content="',url],
    ['<link rel="canonical" href="',url],
  ]) {
    const start = html.indexOf(prefix);
    if (start < 0) continue;
    const contentStart=start+prefix.length, end=html.indexOf('"',contentStart);
    if(end>=0)html=html.slice(0,contentStart)+escape(value)+html.slice(end);
  }
  return html;
}
