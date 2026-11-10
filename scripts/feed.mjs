import { readFileSync, writeFileSync } from 'node:fs';
import { renderRss } from '../server/services/content-sync.mjs';
const content = JSON.parse(readFileSync(new URL('../src/content/relay.json', import.meta.url), 'utf8'));
writeFileSync(new URL('../dist/feed.xml', import.meta.url), renderRss(content, {origin:'https://pustka.sh'}));
console.log('Generated Relay RSS feed.');
