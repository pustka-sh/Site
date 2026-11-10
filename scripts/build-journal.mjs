#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {journal} from '../src/data/journal.js';
import {renderDocumentationMarkdown} from '../server/services/documentation.mjs';

const entries=[];
for(const entry of journal){
  if(!/^[a-z0-9-]+$/.test(entry.slug)||!/^[a-z0-9-]+\.md$/.test(entry.file))throw new Error('Invalid journal source.');
  const markdown=await readFile(new URL(`../src/content/journal/${entry.file}`,import.meta.url),'utf8');
  entries.push({...entry,markdown,html:renderDocumentationMarkdown(markdown)});
}
await writeFile(new URL('../src/content/journal.generated.json',import.meta.url),JSON.stringify(entries,null,2)+'\n');
console.log(`journal: ${entries.length} engineering notes rendered`);
