const slug=text=>String(text||'').toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu,'').trim().replace(/\s+/g,'-')||'section';

/** Reserve application sections first, then preserve every unique author anchor. */
export function assignReaderHeadingIds(headings,reservedIds=[]){
  const used=new Set(reservedIds.filter(Boolean)),assigned=new Array(headings.length),counts=new Map();
  for(const heading of headings)if(heading.sourceId)counts.set(heading.sourceId,(counts.get(heading.sourceId)||0)+1);
  const assign=(heading,index,preserve=false)=>{
    const stem=heading.sourceId||slug(heading.label);let id=stem,suffix=2;
    if(!preserve)while(used.has(id))id=`${stem}-${suffix++}`;
    used.add(id);assigned[index]={...heading,id};
  };
  // Fixed non-prose sections win even when an authored fragment appears earlier.
  headings.forEach((heading,index)=>{if(!heading.prose&&heading.sourceId)assign(heading,index);});
  // A generated suffix must not take an otherwise unique canonical guide anchor.
  headings.forEach((heading,index)=>{if(!assigned[index]&&heading.sourceId&&counts.get(heading.sourceId)===1&&!used.has(heading.sourceId))assign(heading,index,true);});
  headings.forEach((heading,index)=>{if(!assigned[index])assign(heading,index);});
  return assigned;
}

/** A comment's local #example link should follow its own renamed Example heading. */
export function readerFragmentHash(href,fragment,headings){
  if(typeof href!=='string'||!href.startsWith('#')||href==='#')return href;
  let sourceId;try{sourceId=decodeURIComponent(href.slice(1));}catch{return href;}
  const target=headings.find(heading=>heading.fragment===fragment&&heading.sourceId===sourceId);
  return target&&target.id!==sourceId?`#${encodeURIComponent(target.id)}`:href;
}
