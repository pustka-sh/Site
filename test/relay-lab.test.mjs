import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandshake, createLabTrace, encodeVarInt } from '../src/lib/relayLab.js';
import { LAB_VERSIONS } from '../src/data/relayLab.js';

function readVarInt(bytes,cursor) {
  let value=0,shift=0;
  while(true){const byte=bytes[cursor.offset++];assert.ok(byte!==undefined);value|=(byte&127)<<shift;if(!(byte&128))return value;shift+=7;assert.ok(shift<35);}
}

test('handshake contains the expected real frame bytes and excludes prefix from its declared length',()=>{
  const packet=createHandshake({protocol:764});
  assert.equal(packet.hex,'17 00 fc 05 10 70 6c 61 79 2e 65 78 61 6d 70 6c 65 2e 63 6f 6d 63 dd 02');
  assert.equal(packet.bytes[0],packet.bytes.length-1);
  const assembled=packet.fields.flatMap(field=>field.bytes);assert.deepEqual(assembled,[...packet.bytes]);
  for(let i=0;i<packet.fields.length;i++)assert.equal(packet.fields[i].start,packet.fields.slice(0,i).reduce((sum,field)=>sum+field.length,0));
});

test('independent decoding recovers UTF-8 string length, network-order port, login/status and every supported protocol',()=>{
  for(const {protocol}of LAB_VERSIONS)for(const nextState of [1,2]){
    const hostname='世界.example',port=65535;
    const {bytes}=createHandshake({protocol,hostname,port,nextState}),cursor={offset:0};
    const length=readVarInt(bytes,cursor);assert.equal(length,bytes.length-cursor.offset);
    assert.equal(readVarInt(bytes,cursor),0);assert.equal(readVarInt(bytes,cursor),protocol);
    const stringBytes=readVarInt(bytes,cursor);assert.equal(stringBytes,new TextEncoder().encode(hostname).length);
    assert.equal(new TextDecoder().decode(bytes.slice(cursor.offset,cursor.offset+stringBytes)),hostname);cursor.offset+=stringBytes;
    assert.equal((bytes[cursor.offset++]<<8)|bytes[cursor.offset++],port);
    assert.equal(readVarInt(bytes,cursor),nextState);assert.equal(cursor.offset,bytes.length);
  }
  const large=createHandshake({hostname:'a'.repeat(200)}),cursor={offset:0};
  const length=readVarInt(large.bytes,cursor);assert.equal(cursor.offset,2);assert.equal(length,large.bytes.length-2);
  assert.deepEqual(encodeVarInt(127),[127]);assert.deepEqual(encodeVarInt(128),[128,1]);
});

test('invalid protocol values, hostnames, ports and intents cannot silently produce a packet',()=>{
  for(const value of [-1,1.5,NaN,0x80000000])assert.throws(()=>encodeVarInt(value));
  for(const hostname of ['',null,'x'.repeat(256),'example\0host'])assert.throws(()=>createHandshake({hostname}));
  for(const port of [0,-1,65536,1.1])assert.throws(()=>createHandshake({port}));
  assert.throws(()=>createHandshake({nextState:3}));assert.throws(()=>createLabTrace({scenario:'made-up'}));
});

test('status queries are answered without authentication or backend selection, even for an unsupported version',()=>{
  const trace=createLabTrace({protocol:0,intent:'status',scenario:'unavailable'});
  assert.equal(trace.outcome,'status');assert.equal(trace.supported,false);assert.equal(trace.backend,null);assert.deepEqual(trace.attempts,[]);
  assert.deepEqual(trace.steps.map(step=>step.id),['handshake','status']);assert.equal(trace.packet.bytes.at(-1),1);
  const login=createLabTrace({protocol:0});assert.equal(login.outcome,'blocked');assert.equal(login.steps[0].status,'blocked');
  assert.ok(login.steps.slice(1).every(step=>step.status==='unreached'));assert.deepEqual(login.attempts,[]);
});

test('initial candidate fallback reaches the next backend and exhaustion never claims a completed join',()=>{
  const normal=createLabTrace();assert.equal(normal.backend,'lobby');assert.equal(normal.attempts.length,1);
  const fallback=createLabTrace({scenario:'fallback'});assert.equal(fallback.backend,'survival');assert.equal(fallback.outcome,'connected');
  assert.deepEqual(fallback.attempts,[{server:'lobby',result:'unreachable'},{server:'survival',result:'accepted'}]);
  const unavailable=createLabTrace({scenario:'unavailable'});assert.equal(unavailable.backend,null);assert.equal(unavailable.outcome,'blocked');
  assert.equal(unavailable.steps.find(step=>step.id==='routing').status,'blocked');assert.equal(unavailable.steps.at(-1).status,'unreached');
});

test('authentication and forwarding remain separate and cannot repair mismatched backend settings',()=>{
  for(const forwarding of ['modern','legacy','none'])for(const authentication of ['online','offline']){
    const working=createLabTrace({forwarding,authentication});assert.equal(working.outcome,'connected');
    assert.equal(working.packet.hex,createLabTrace().packet.hex,'client handshake does not carry backend forwarding mode or credentials');
    const mismatch=createLabTrace({forwarding,authentication,scenario:'mismatch'});assert.equal(mismatch.outcome,'blocked');assert.equal(mismatch.backend,null);
    assert.ok(mismatch.attempts.every(attempt=>attempt.result==='rejected'));assert.equal(mismatch.steps.find(step=>step.id==='forwarding').status,'blocked');
    assert.equal(mismatch.steps.find(step=>step.id==='play').status,'unreached');
    if(authentication==='offline')assert.match(working.steps.find(step=>step.id==='identity').description,/without checking account ownership/);
    if(forwarding==='modern')assert.ok(working.notes.some(note=>note.includes('matching secret')));
    if(forwarding==='legacy')assert.ok(working.notes.some(note=>note.includes('unsigned')));
    if(forwarding==='none')assert.ok(working.notes.some(note=>note.includes('backend sees')));
  }
});
