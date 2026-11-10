import { useEffect, useRef, useState } from 'react';
import { highlight } from '../lib/highlight.js';
import { useToast } from './Toast.jsx';
import { assignReaderHeadingIds, readerFragmentHash } from '../lib/readerHeadings.js';
import '../styles/docs-reading.css';

const normalized = text => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();

/** Adds reading controls only to the already-sanitized document fragment. */
export function usePublishedProse(rootRef, html, title) {
  const toast=useToast();
  useEffect(()=>{
    const root=rootRef.current;
    if(!root)return;
    const first=root.querySelector('h1,h2');
    if(title&&first&&root.firstElementChild===first&&normalized(first.textContent)===normalized(title)){
      // Retain the original Markdown heading's anchor at the start of its body.
      if(first.id)root.id=first.id;
      first.remove();
    }
    root.querySelectorAll('pre > code').forEach((code,index)=>{
      const pre=code.parentElement;
      if(pre.closest('.published-code-block'))return;
      const text=code.textContent;
      const language=[...code.classList].find(name=>name.startsWith('language-'))?.slice(9)||'text';
      code.classList.add('hljs');
      code.innerHTML=highlight(text,language);
      const wrapper=document.createElement('div');wrapper.className='published-code-block';
      const toolbar=document.createElement('div');toolbar.className='published-code-toolbar';
      const label=document.createElement('span');label.textContent=language;
      const button=document.createElement('button');button.type='button';button.textContent='Copy';button.setAttribute('aria-label',`Copy ${language} code block ${index+1}`);
      button.addEventListener('click',async()=>{
        try{await navigator.clipboard.writeText(text);toast('Code copied to clipboard.');}
        catch{toast('Select the code to copy it.');}
      });
      toolbar.append(label,button);pre.before(wrapper);wrapper.append(toolbar,pre);
    });
  },[rootRef,html,title,toast]);
}

export function useReaderOutline(articleRef, revision) {
  const [headings,setHeadings]=useState([]);
  const [active,setActive]=useState('');
  const signature=useRef('');
  useEffect(()=>{
    const article=articleRef.current;
    if(!article)return;
    signature.current='';
    let frame;
    const collect=()=>{
      const elements=[...article.querySelectorAll('h2,h3,h4,h5,h6')].filter(heading=>!heading.closest('[data-outline-skip]'));
      const headingElements=new Set(elements),fragments=[...article.querySelectorAll('.published-prose')];
      const reserved=[...document.querySelectorAll('[id]')].filter(element=>!headingElements.has(element)).map(element=>element.id);
      const models=elements.map(heading=>{
        const label=[...heading.childNodes].filter(node=>node.nodeType!==1||!node.classList.contains('published-heading-link')).map(node=>node.textContent).join('').trim();
        if(!heading.hasAttribute('data-reader-original-id'))heading.setAttribute('data-reader-original-id',heading.id||'');
        const fragment=fragments.indexOf(heading.closest('.published-prose'));
        return {sourceId:heading.getAttribute('data-reader-original-id'),label,level:Number(heading.tagName.slice(1)),fragment,prose:fragment>=0};
      });
      const assigned=assignReaderHeadingIds(models,reserved);
      const entries=assigned.map((model,index)=>{
        const heading=elements[index];heading.id=model.id;
        let link=heading.querySelector('.published-heading-link');
        if(!link){
          link=document.createElement('a');link.className='published-heading-link';link.textContent='#';heading.append(link);
        }
        link.setAttribute('href',`#${encodeURIComponent(model.id)}`);link.setAttribute('aria-label',`Link to ${model.label}`);
        return {id:model.id,label:model.label,level:model.level};
      });
      fragments.forEach((fragment,index)=>{
        fragment.querySelectorAll('a[href^="#"]:not(.published-heading-link)').forEach(link=>{
          if(!link.hasAttribute('data-reader-original-href'))link.setAttribute('data-reader-original-href',link.getAttribute('href'));
          link.setAttribute('href',readerFragmentHash(link.getAttribute('data-reader-original-href'),index,assigned));
        });
      });
      const next=JSON.stringify(entries);
      if(signature.current!==next){signature.current=next;setHeadings(entries);}
    };
    const queue=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(collect);};
    collect();
    const observer=new MutationObserver(queue);observer.observe(article,{childList:true,subtree:true});
    return()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[articleRef,revision]);
  useEffect(()=>{
    const elements=headings.map(heading=>document.getElementById(heading.id)).filter(Boolean);
    const update=()=>{let current=elements[0]?.id||'';for(const heading of elements){if(heading.getBoundingClientRect().top<=140)current=heading.id;else break;}setActive(current);};
    update();window.addEventListener('scroll',update,{passive:true});
    return()=>window.removeEventListener('scroll',update);
  },[headings]);
  return {headings,active};
}

export function ReaderOutline({headings,active}) {
  const body=<nav aria-label="On this page"><ul>{headings.map(heading=><li key={heading.id} className={`outline-level-${heading.level}`}><a href={`#${encodeURIComponent(heading.id)}`} aria-current={active===heading.id?'location':undefined}>{heading.label}</a></li>)}</ul></nav>;
  if(!headings.length)return null;
  return <aside className="published-outline"><div className="published-outline-desktop"><p>ON THIS PAGE</p>{body}</div><details className="published-outline-mobile"><summary>On this page <span>{headings.length} sections</span></summary>{body}</details></aside>;
}

export function MarkdownActions({markdown,filename}) {
  const toast=useToast();
  const copy=async()=>{try{await navigator.clipboard.writeText(markdown);toast('Original Markdown copied.');}catch{toast('Use Download Markdown to save this guide.');}};
  const download=()=>{
    const url=URL.createObjectURL(new Blob([markdown],{type:'text/markdown;charset=utf-8'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <div className="published-reading-actions" data-outline-skip><button type="button" onClick={copy}>Copy Markdown</button><button type="button" onClick={download}>Download Markdown ↓</button></div>;
}
