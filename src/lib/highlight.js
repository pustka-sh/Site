// Only the grammars the docs use, so the highlighter stays small.
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import ini from 'highlight.js/lib/languages/ini';
import yaml from 'highlight.js/lib/languages/yaml';
import java from 'highlight.js/lib/languages/java';
import json from 'highlight.js/lib/languages/json';
import properties from 'highlight.js/lib/languages/properties';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('java', java);
hljs.registerLanguage('json', json);
hljs.registerLanguage('properties', properties);

const alias = { toml: 'ini', sh: 'bash', shell: 'bash', terminal: 'bash', yml: 'yaml' };
const escape = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

export function highlight(code, lang) {
  const l = alias[lang] || lang;
  if (!l || !hljs.getLanguage(l)) return escape(code);
  return hljs.highlight(code, { language: l }).value;
}
