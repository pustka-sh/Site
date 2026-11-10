import { marked } from 'marked';
import GithubSlugger from 'github-slugger';

const compact=value=>String(value||'').replace(/\s+/g,' ').trim();
const lower=value=>compact(value).normalize('NFKC').toLowerCase();
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',mdash:'—',ndash:'–',rarr:'→',larr:'←',hellip:'…',sect:'§'};
function decode(value){return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(whole,key)=>{
  if(key[0]!=='#')return entities[key]??whole;
  const code=key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1));
  return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):whole;
});}
function tokenText(tokens){return tokens.map(token=>{
  if(token.type==='space')return ' ';
  if(token.type==='list')return token.items.map(item=>tokenText(item.tokens)).join(' ');
  if(token.type==='table')return [...token.header,...token.rows.flat()].map(cell=>tokenText(cell.tokens||[])).join(' ');
  if(token.tokens)return tokenText(token.tokens);
  if(token.type==='html')return (token.text||'').replace(/<[^>]*>/g,' ');
  return token.text||'';
}).join(' ');}
export function documentationText(markdown){return compact(decode(tokenText(marked.lexer(String(markdown||'')))));}

export function buildDocumentationSearchIndex(data){
  const {project,version}=data,base=`/docs/${encodeURIComponent(project.id)}/${encodeURIComponent(version)}`;
  const entries=[];
  for(const page of data.pages){
    const sections=[],slugger=new GithubSlugger();let section=null;
    for(const token of marked.lexer(page.markdown)){
      if(token.type==='heading'){
        section={title:documentationText(token.text),anchor:slugger.slug(token.text),body:''};sections.push(section);
      }else if(section)section.body+=' '+tokenText([token]);
    }
    entries.push({id:`${project.id}/${version}/guide/${page.slug}`,title:page.title,name:page.title,detail:`${project.name} / ${version} / Guide`,body:documentationText(page.markdown),sections:sections.map(item=>({...item,body:compact(decode(item.body))})),to:`${base}/${encodeURIComponent(page.slug)}`,kind:'guide',project:project.id,version});
  }
  for(const symbol of data.api.symbols){
    const body=documentationText([symbol.summary,symbol.description,...symbol.parameters.map(item=>item.description),symbol.returns?.description,...symbol.throws.map(item=>item.description),symbol.deprecation].filter(Boolean).join('\n\n'));
    entries.push({id:`${project.id}/${version}/symbol/${symbol.id}`,title:symbol.qualifiedName||symbol.name,name:symbol.name,signature:symbol.signature,detail:`${project.name} / ${version} / ${symbol.kind.replaceAll('-',' ')}`,body,to:`${base}/api?symbol=${encodeURIComponent(symbol.id)}`,kind:'symbol',symbolKind:symbol.kind,project:project.id,version});
  }
  return entries.map(entry=>({...entry,searchTitle:lower(entry.title),searchName:lower(entry.name),searchSignature:lower(entry.signature),searchBody:lower(entry.body)}));
}
function score(entry,q,words){
  if(entry.searchName===q)return 1000;
  if(entry.searchTitle===q)return 990;
  if(entry.searchName.startsWith(q))return 850;
  if(entry.searchTitle.startsWith(q))return 800;
  if(entry.searchName.includes(q))return 750;
  if(entry.searchTitle.includes(q))return 700;
  if(entry.searchSignature.includes(q))return 600;
  if(words.every(word=>(entry.searchTitle+' '+entry.searchSignature).includes(word)))return 550;
  if(entry.searchBody.includes(q))return 300;
  return words.every(word=>(entry.searchTitle+' '+entry.searchSignature+' '+entry.searchBody).includes(word))?200:0;
}
function snippet(body,q,words){
  const text=compact(body);let position=text.toLowerCase().indexOf(q);
  if(position<0)position=words.map(word=>text.toLowerCase().indexOf(word)).filter(index=>index>=0).sort((a,b)=>a-b)[0]??0;
  const start=Math.max(0,position-55),end=Math.min(text.length,start+190);
  return (start?'…':'')+text.slice(start,end).trim()+(end<text.length?'…':'');
}
export function searchDocumentationIndex(entries,query,limit=20){
  const q=lower(query),words=q.split(' ').filter(Boolean);
  if(q.length<2||!words.length)return [];
  return entries.map(entry=>({entry,score:score(entry,q,words)})).filter(result=>result.score>0)
    .sort((a,b)=>b.score-a.score||a.entry.title.localeCompare(b.entry.title)||a.entry.id.localeCompare(b.entry.id))
    .slice(0,limit).map(({entry,score:rank})=>{
      const section=entry.sections?.find(item=>lower(item.title+' '+item.body).includes(q));
      const to=entry.to+(section&&rank<=300?`#${encodeURIComponent(section.anchor)}`:'');
      return {id:entry.id,title:entry.title,detail:entry.detail,snippet:snippet(section?.body||entry.body, q,words),to,kind:entry.kind,project:entry.project,version:entry.version,score:rank,...(entry.symbolKind?{symbolKind:entry.symbolKind}:{})};
    });
}
