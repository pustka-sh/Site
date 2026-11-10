import { LAB_DEFAULTS, LAB_SAMPLE, LAB_SCENARIOS, LAB_VERSIONS } from '../data/relayLab.js';

export const hexByte = value => value.toString(16).padStart(2,'0');

export function encodeVarInt(value) {
  if(!Number.isInteger(value)||value<0||value>0x7fffffff)throw new RangeError('Use a non-negative 32-bit protocol value.');
  const bytes=[];
  do {let byte=value&0x7f;value>>>=7;if(value)byte|=0x80;bytes.push(byte);}while(value);
  return bytes;
}

/** A complete uncompressed, unencrypted serverbound handshake frame. */
export function createHandshake({protocol=LAB_DEFAULTS.protocol,hostname=LAB_SAMPLE.hostname,port=LAB_SAMPLE.port,nextState=2}={}) {
  encodeVarInt(protocol);
  if(typeof hostname!=='string'||!hostname.length||hostname.length>255||/[\u0000-\u001f\u007f]/.test(hostname))throw new TypeError('Use a hostname of 1–255 characters.');
  if(!Number.isInteger(port)||port<1||port>65535)throw new RangeError('Use a port between 1 and 65535.');
  if(![1,2].includes(nextState))throw new RangeError('A handshake enters status (1) or login (2).');
  const hostBytes=[...new TextEncoder().encode(hostname)];
  const parts=[
    {id:'packet-id',name:'Packet ID',type:'VarInt',value:'0x00',bytes:[0],description:'The serverbound handshake packet is registered as ID 0x00.'},
    {id:'protocol',name:'Protocol version',type:'VarInt',value:String(protocol),bytes:encodeVarInt(protocol),description:'The client advertises its protocol number. This is a VarInt, not a release name.'},
    {id:'host-length',name:'Hostname byte length',type:'VarInt',value:String(hostBytes.length),bytes:encodeVarInt(hostBytes.length),description:'The UTF-8 byte count comes before the hostname. It can differ from the character count.'},
    {id:'hostname',name:'Server address',type:'UTF-8',value:hostname,bytes:hostBytes,description:'The address the player chose. This client-to-proxy example contains no forwarding suffix.'},
    {id:'port',name:'Server port',type:'Unsigned short',value:String(port),bytes:[port>>>8,port&255],description:'Two bytes in network order: the most significant byte comes first.'},
    {id:'next-state',name:'Next state',type:'VarInt',value:nextState===2?'2 · Login':'1 · Status',bytes:encodeVarInt(nextState),description:'Login starts a join; status asks for a server-list response without logging in.'},
  ];
  const payload=parts.flatMap(field=>field.bytes);
  const prefix=encodeVarInt(payload.length);
  let cursor=0;
  const fields=[{id:'frame-length',name:'Frame length',type:'VarInt',value:String(payload.length),bytes:prefix,description:'Length of the packet ID and payload. The length prefix does not count itself.'},...parts].map(field=>{const result={...field,start:cursor,length:field.bytes.length};cursor+=field.bytes.length;return result;});
  const bytes=new Uint8Array([...prefix,...payload]);
  return {bytes,fields,payloadLength:payload.length,hex:[...bytes].map(hexByte).join(' ')};
}

const stage=(id,label,title,description,status='passed',extra={})=>({id,label,title,description,status,...extra});

/** Explicit teaching scenarios, not a substitute for a real connection test. */
export function createLabTrace(input={}) {
  const options={...LAB_DEFAULTS,...input};
  if(!Number.isInteger(options.protocol)||options.protocol<0||options.protocol>0x7fffffff)throw new RangeError('Invalid sample protocol.');
  if(!['login','status'].includes(options.intent)||!['online','offline'].includes(options.authentication)||!['modern','legacy','none'].includes(options.forwarding)||!LAB_SCENARIOS.some(s=>s.id===options.scenario))throw new TypeError('Unknown Relay Lab setting.');
  const supported=LAB_VERSIONS.some(version=>version.protocol===options.protocol);
  const packet=createHandshake({protocol:options.protocol,nextState:options.intent==='status'?1:2});
  const handshake=stage('handshake','Handshake','A version, an address, an intent.',`The sample client sends protocol ${options.protocol} to ${LAB_SAMPLE.hostname}:${LAB_SAMPLE.port}, then asks to enter ${options.intent} state.`);
  if(options.intent==='status')return {options,packet,supported,steps:[handshake,stage('status','Status reply','A ping ends at the proxy.',supported?'Relay can answer a server-list ping without authenticating or joining a backend.':'Relay answers status pings even for unsupported client versions, using its supported-version information.')],attempts:[],backend:null,outcome:'status',outcomeTitle:'Status answered. No player joined.',outcomeDetail:'No authentication, forwarding or backend join is part of this request. The reply itself is explained here, not serialized.',notes:[]};
  const identity=stage('identity','Identity',options.authentication==='online'?'Relay verifies the player.':'Relay derives an offline identity.',options.authentication==='online'?'The real proxy negotiates encryption and checks the player’s session with Mojang before creating an authenticated profile. This simulator assumes that check succeeds.':'The real proxy derives a profile from the supplied username without checking account ownership. Modern forwarding can sign that profile, but cannot make it an authenticated account.');
  const routing=stage('routing','Route','Walk the configured candidate order.','The sample try order is lobby, then survival. A failed attempt moves to the next candidate. This is an initial join, not a live failover test.');
  const forwarding=stage('forwarding','Forwarding',options.forwarding==='modern'?'Send a signed player profile.':options.forwarding==='legacy'?'Append the profile to the backend handshake.':'Connect without forwarding the profile.',options.forwarding==='modern'?'The backend asks on velocity:player_info. Relay replies with profile data and an HMAC-SHA256 signature using the shared secret. The backend must verify it.':options.forwarding==='legacy'?'Relay appends the address, UUID and properties to the backend hostname, separated by NUL characters. This format has no signature; backend access must be restricted.':'Relay does not supply a forwarding profile. In this sample the backend is configured without proxy forwarding and creates its own offline identity; the original address and UUID are not preserved.');
  const play=stage('play','Configuration → Play','The backend prepares the world.','After the backend’s login succeeds, the client and backend complete configuration before play traffic is relayed. These are multiple protocol exchanges, summarized as one stage.');
  const steps=[handshake,identity,routing,forwarding,play];
  if(!supported){
    steps[0]={...handshake,status:'blocked',title:'This version cannot log in.',description:`Protocol ${options.protocol} is outside this Relay revision’s supported list. The real proxy sends a login disconnect instead of authenticating or contacting a backend.`};
    for(let i=1;i<steps.length;i++)steps[i]={...steps[i],status:'unreached'};
    return {options,packet,supported,steps,attempts:[],backend:null,outcome:'blocked',outcomeTitle:'Unsupported client version.',outcomeDetail:'Choose a supported client version. A successful status ping does not establish that login is supported.',notes:[]};
  }
  const attempts=LAB_SAMPLE.candidates.map((server,index)=>({server,result:options.scenario==='unavailable'||(options.scenario==='fallback'&&index===0)?'unreachable':options.scenario==='mismatch'?'rejected':'accepted'}));
  const acceptedIndex=attempts.findIndex(attempt=>attempt.result==='accepted');
  const usedAttempts=acceptedIndex<0?attempts:attempts.slice(0,acceptedIndex+1);
  const backend=acceptedIndex<0?null:attempts[acceptedIndex].server;
  const notes=[options.authentication==='offline'?'Offline mode does not prove account ownership. It is shown to explain the distinction, not as a fix for authentication problems.':null,options.forwarding==='legacy'?'Legacy forwarding is unsigned. It requires matching Bungee-compatible backend settings and a backend port isolated from untrusted clients.':null,options.forwarding==='modern'?'For this sample, Paper uses online-mode=false in server.properties, modern forwarding enabled, a matching secret, and proxies.velocity.online-mode matching Relay’s authentication mode.':null,options.forwarding==='none'?'Without forwarding, Paper’s proxy forwarding must be disabled and its server.properties online-mode must be false. This changes the identity the backend sees.':null].filter(Boolean);
  if(options.scenario==='unavailable'){
    steps[2]={...routing,status:'blocked',title:'Neither candidate accepts a connection.',description:'Lobby and survival are both unreachable. Relay exhausts the candidate list and disconnects the player; it cannot create a working backend.'};steps[3]={...forwarding,status:'unreached'};steps[4]={...play,status:'unreached'};
    return {options,packet,supported,steps,attempts:usedAttempts,backend,outcome:'blocked',outcomeTitle:'No backend can take the player.',outcomeDetail:'Restore a reachable backend or correct its configured address. Changing forwarding does not repair an unreachable listener.',notes};
  }
  if(options.scenario==='mismatch'){
    steps[3]={...forwarding,status:'blocked',title:'The backend cannot accept this profile.',description:options.forwarding==='modern'?'Both sample backends require modern forwarding but hold a different secret. They cannot verify Relay’s signature. Each candidate rejects the join.':'Both sample backends require modern forwarding. This proxy mode does not provide the profile response they require, so neither accepts the join.'};steps[4]={...play,status:'unreached'};
    return {options,packet,supported,steps,attempts:usedAttempts,backend:null,outcome:'blocked',outcomeTitle:'Forwarding settings disagree.',outcomeDetail:'Configure both ends consistently. For modern forwarding, compare the secret and forwarded online-mode setting; disabling client authentication does not fix a shared-secret mismatch.',notes};
  }
  steps[2]={...routing,title:options.scenario==='fallback'?'Lobby fails. Survival answers.':'Lobby is the first accepting backend.',description:options.scenario==='fallback'?'The first sample connection fails before configuration is committed. Relay tries survival next and its backend login succeeds.':'The configured sample candidate list starts with lobby, which accepts the join. Survival remains a later option.'};
  return {options,packet,supported,steps,attempts:usedAttempts,backend,outcome:'connected',outcomeTitle:`The sample player reaches ${backend}.`,outcomeDetail:options.authentication==='online'?'An authenticated player profile is ready, the backend’s settings match this forwarding mode, and configuration can finish.':'The join completes in the sample, using an unverified offline identity. A completed join and a verified account are different facts.',notes};
}
