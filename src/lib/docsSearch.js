import { useEffect, useState } from 'react';
import { siteApi } from './siteApi.js';

export function useDocumentationSearch({query='',project,version,limit=12,enabled=true}={}){
  const q=query.trim();
  const key=JSON.stringify([q,project||null,version||null,limit,enabled]);
  const [state,setState]=useState({key,loading:false,data:null,error:null});
  useEffect(()=>{
    if(!enabled||q.length<2){setState({key,loading:false,data:null,error:null});return;}
    const controller=new AbortController();let active=true;
    setState({key,loading:true,data:null,error:null});
    const timer=setTimeout(()=>{
      const params=new URLSearchParams({q,limit:String(limit)});
      if(project)params.set('project',project);if(project&&version)params.set('version',version);
      siteApi('/docs/search?'+params,{signal:controller.signal}).then(
        data=>{if(active)setState({key,loading:false,data,error:null});},
        error=>{if(active&&error.name!=='AbortError')setState({key,loading:false,data:null,error});},
      );
    },220);
    return()=>{active=false;clearTimeout(timer);controller.abort();};
  },[key]);
  return state.key===key?state:{loading:enabled&&q.length>=2,data:null,error:null};
}
